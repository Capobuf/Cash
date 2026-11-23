import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { normalizeBankDescription } from '../domain/bank-expenses';
import { bankExpenseRowSchema } from '../domain/schema';
import {
  err,
  ok,
  type BankExpenseImport,
  type BankExpensePreview,
  type BankImportConfig,
  type BankRowOutcome,
  type Result,
} from '../domain/model';

interface Sheet {
  sheet: ExcelJS.Worksheet;
  date1904: boolean;
  /** CSV rows must have as many fields as the header. */
  csv: boolean;
}

const blank = (value: unknown) =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '');

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('richText' in value)
      return value.richText.map((part) => part.text).join('');
    if ('hyperlink' in value) return value.text;
    // Do not trust cached formula results or evaluate workbook formulas.
    throw new Error('Cella con formula o valore non supportato.');
  }
  return value;
}

const hhmm = (hours: number, minutes: number) =>
  `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

function expenseMoment(
  value: unknown,
  date1904: boolean,
): { date: string; time?: string } {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Data non valida.');
    const hours = value.getUTCHours();
    const minutes = value.getUTCMinutes();
    // Midnight is how date-only cells arrive: no time to show.
    return {
      date: value.toISOString().slice(0, 10),
      ...(hours || minutes || value.getUTCSeconds()
        ? { time: hhmm(hours, minutes) }
        : {}),
    };
  }
  if (typeof value === 'number') {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (!date1904 && Math.floor(value) === 60)
    )
      throw new Error('Data non valida.');
    // Excel's 1900 calendar contains a fictitious leap day; 1904 workbooks use another epoch.
    const days = Math.floor(value);
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
    const seconds = Math.round((value - days) * 86400);
    return expenseMoment(
      new Date(
        epoch +
          (days - (!date1904 && days > 60 ? 1 : 0)) * 86400000 +
          seconds * 1000,
      ),
      date1904,
    );
  }
  if (typeof value !== 'string')
    throw new Error('Data del movimento assente o non valida.');
  const text = value.trim();
  const italian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (italian)
    return {
      date: `${italian[3]}-${italian[2]!.padStart(2, '0')}-${italian[1]!.padStart(2, '0')}`,
    };
  // Keep the bank's calendar date without applying the computer's timezone.
  const withTime = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(
    text,
  );
  if (withTime && Number(withTime[2]) > 23)
    throw new Error('Data del movimento assente o non valida.');
  return withTime
    ? {
        date: withTime[1]!,
        time: hhmm(Number(withTime[2]), Number(withTime[3])),
      }
    : { date: text };
}

// A dedicated time column: text H:MM[:SS], or an Excel time cell.
function timeOf(value: unknown): string | undefined {
  if (blank(value)) return undefined;
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return hhmm(value.getUTCHours(), value.getUTCMinutes());
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    const seconds = Math.round((value - Math.floor(value)) * 86400) % 86400;
    return hhmm(Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60));
  }
  const match =
    typeof value === 'string' &&
    /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim());
  if (!match || Number(match[1]) > 23) throw new Error('Ora non valida.');
  return hhmm(Number(match[1]), Number(match[2]));
}

function amountOf(
  value: unknown,
  decimal: BankImportConfig['decimal'],
  column: string,
): Decimal {
  let text: string;
  if (typeof value === 'number' && Number.isFinite(value)) text = String(value);
  else if (typeof value === 'string') {
    text = value.trim();
    // Italian decimals and grouping, or a plain dot decimal, without ambiguous coercion.
    if (
      decimal === ',' &&
      /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)
    )
      text = text.replace(/\./g, '').replace(',', '.');
    else if (
      !(
        decimal === ',' ? /^[+-]?\d+\.\d{1,2}$/ : /^[+-]?\d+(?:\.\d{1,2})?$/
      ).test(text)
    )
      throw new Error(`${column}: importo non valido (massimo due decimali).`);
  } else throw new Error(`${column}: importo non valido.`);
  const amount = new Decimal(text);
  if (!amount.isFinite()) throw new Error(`${column}: importo non valido.`);
  return amount;
}

// Only booked movements are imported: pending ones change date or description
// when the bank books them, so they would be imported twice.
function keepBooked(
  result: BankExpenseImport,
  row: BankExpenseImport['rows'][number],
  state: unknown,
  booked: string[] | undefined,
): boolean {
  if (!booked || (typeof state === 'string' && booked.includes(state.trim()))) {
    result.rows.push(row);
    return true;
  }
  result.skippedPending++;
  if (!result.pendingFrom || row.date < result.pendingFrom)
    result.pendingFrom = row.date;
  return false;
}

function parseSheet(
  { sheet, date1904, csv }: Sheet,
  config: BankImportConfig,
  outcomes?: BankRowOutcome[],
): Result<BankExpenseImport> {
  let header: ExcelJS.Row | undefined;
  sheet.eachRow((row) => {
    if (header) return;
    const labels = new Set<string>();
    row.eachCell((cell) => void labels.add(cell.text.trim()));
    if (config.headers.every((label) => labels.has(label))) header = row;
  });
  if (!header)
    return err({
      code: 'SOURCE_INVALID',
      message: 'Intestazione bancaria non trovata nel primo foglio.',
      details: [`Colonne richieste: ${config.headers.join(', ')}.`],
    });
  const columns = new Map<string, number>();
  const repeated = new Set<string>();
  header.eachCell((cell, column) => {
    const label = cell.text.trim();
    if (columns.has(label)) repeated.add(label);
    else columns.set(label, column);
  });
  const ambiguous = config.headers.filter((label) => repeated.has(label));
  if (ambiguous.length)
    return err({
      code: 'SOURCE_INVALID',
      message: 'Intestazione bancaria con colonne ripetute.',
      details: [`Colonne ripetute: ${ambiguous.join(', ')}.`],
    });
  const result: BankExpenseImport = {
    rows: [],
    ignoredIncome: 0,
    skippedPending: 0,
  };
  for (let index = header.number + 1; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    if (
      !row.hasValues ||
      (row.values instanceof Array && row.values.every((value) => blank(value)))
    )
      continue;
    const raw = (column: string) => row.getCell(columns.get(column)!).value;
    const value = (column: string) => cellValue(raw(column));
    const pick = (column: string, fallback?: string) => {
      const first = value(column);
      return blank(first) && fallback ? value(fallback) : first;
    };
    try {
      if (csv && row.cellCount !== header.cellCount)
        throw new Error('Numero di colonne diverso dall’intestazione.');
      let debit: Decimal;
      // Income rows are outside scope; their dates and descriptions are deliberately not parsed.
      if (config.amount.kind === 'debit') {
        const { debit: column, credit } = config.amount;
        const outflow = blank(raw(column))
          ? undefined
          : amountOf(value(column), config.decimal, column);
        if (!outflow?.lt(0)) {
          if (credit && !blank(raw(credit))) {
            result.ignoredIncome++;
            outcomes?.push({ row: index, kind: 'income' });
          }
          continue;
        }
        debit = outflow.neg();
      } else {
        const { amount: column, fee: feeColumn } = config.amount;
        const amount = amountOf(value(column), config.decimal, column);
        const fee = feeColumn
          ? amountOf(value(feeColumn), config.decimal, feeColumn)
          : new Decimal(0);
        if (fee.lt(0))
          throw new Error(
            `${feeColumn}: la commissione non può essere negativa.`,
          );
        debit = fee.minus(amount);
        if (debit.lte(0)) {
          if (amount.gt(0)) {
            result.ignoredIncome++;
            outcomes?.push({ row: index, kind: 'income' });
          }
          continue;
        }
      }
      if (debit.decimalPlaces() > 2)
        throw new Error('Importo: massimo due decimali.');
      if (config.currency) {
        const currency = value(config.currency.column);
        if (
          typeof currency !== 'string' ||
          currency.trim() !== config.currency.value
        )
          throw new Error(
            `Valuta non supportata: sono ammesse solo uscite in ${config.currency.value}.`,
          );
      }
      const description = pick(config.description, config.descriptionFallback);
      if (typeof description !== 'string')
        throw new Error('Descrizione assente o non valida.');
      const moment = expenseMoment(
        pick(config.date, config.dateFallback),
        date1904,
      );
      const time = config.time ? timeOf(value(config.time)) : moment.time;
      const parsed = bankExpenseRowSchema.safeParse({
        date: moment.date,
        description: normalizeBankDescription(description),
        amount: debit.toFixed(2),
        ...(time ? { time } : {}),
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; '),
        );
      const booked = keepBooked(
        result,
        parsed.data,
        config.status && value(config.status.column),
        config.status?.booked,
      );
      outcomes?.push({
        row: index,
        kind: booked ? 'expense' : 'pending',
        expense: parsed.data,
      });
    } catch (cause) {
      return err({
        code: 'SOURCE_INVALID',
        message: `Importazione annullata: uscita non valida alla riga ${index}.`,
        action:
          'Correggi il file e ripeti l’importazione. Nessun movimento è stato importato.',
        details: [cause instanceof Error ? cause.message : String(cause)],
      });
    }
  }
  return ok(result);
}

function workbookSheet(workbook: ExcelJS.Workbook): Result<Sheet> {
  const sheet = workbook.worksheets[0];
  return sheet
    ? ok({ sheet, date1904: Boolean(workbook.properties.date1904), csv: false })
    : err({
        code: 'SOURCE_INVALID',
        message: 'Il file XLSX non contiene fogli.',
      });
}

async function csvSheet(text: string): Promise<Result<Sheet>> {
  try {
    // Reuse ExcelJS's CSV parser for quoted commas, escaped quotes, BOM and multiline fields.
    // Keep all cells as text: dates and monetary values must not be coerced by ExcelJS.
    const sheet = await new ExcelJS.Workbook().csv.read(Readable.from([text]), {
      map: (value) => value,
    });
    return ok({ sheet, date1904: false, csv: true });
  } catch {
    return err({
      code: 'SOURCE_INVALID',
      message: 'Impossibile leggere il CSV: struttura o virgolette non valide.',
    });
  }
}

async function readSheet(path: string): Promise<Result<Sheet>> {
  const extension = extname(path).toLowerCase();
  if (extension === '.xlsx') {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(path);
      return workbookSheet(workbook);
    } catch {
      return err({
        code: 'SOURCE_INVALID',
        message: 'Impossibile leggere il file XLSX.',
        action:
          'Verifica che il file sia accessibile e sia un XLSX valido non protetto da password.',
      });
    }
  }
  if (extension !== '.csv')
    return err({
      code: 'SOURCE_INVALID',
      message: 'Seleziona un file XLSX o CSV.',
    });
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return err({
      code: 'SOURCE_INVALID',
      message: 'Impossibile leggere il file CSV.',
      action:
        'Verifica che il file sia accessibile e sia un CSV valido in UTF-8.',
    });
  }
  return csvSheet(text);
}

export function parseBankExpenseWorkbook(
  workbook: ExcelJS.Workbook,
  config: BankImportConfig,
): Result<BankExpenseImport> {
  const sheet = workbookSheet(workbook);
  return sheet.ok ? parseSheet(sheet.value, config) : sheet;
}

export async function parseBankExpenseCsv(
  text: string,
  config: BankImportConfig,
): Promise<Result<BankExpenseImport>> {
  const sheet = await csvSheet(text);
  return sheet.ok ? parseSheet(sheet.value, config) : sheet;
}

export async function readBankExpenseFile(
  path: string,
  config: BankImportConfig,
): Promise<Result<BankExpenseImport>> {
  const sheet = await readSheet(path);
  return sheet.ok ? parseSheet(sheet.value, config) : sheet;
}

/** The import of a sample file, plus what happens to each of its rows. */
export async function previewBankExpenseFile(
  path: string,
  config: BankImportConfig,
): Promise<Result<BankExpensePreview>> {
  const sheet = await readSheet(path);
  if (!sheet.ok) return sheet;
  const outcomes: BankRowOutcome[] = [];
  const result = parseSheet(sheet.value, config, outcomes);
  return result.ok ? ok({ ...result.value, outcomes }) : result;
}

/** A sample file's rows as text, at index row number − 1 (empty rows are []). */
export async function readBankSampleRows(
  path: string,
): Promise<Result<string[][]>> {
  const sheet = await readSheet(path);
  if (!sheet.ok) return sheet;
  const rows: string[][] = [];
  sheet.value.sheet.eachRow((row, number) => {
    const cells: string[] = [];
    row.eachCell((cell, column) => {
      const value = cell.value;
      if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        cells[column - 1] = cell.text.trim();
        return;
      }
      // cell.text would show the date in the computer's timezone (01:00 for a plain day).
      const { date, time } = expenseMoment(value, false);
      const [year, month, day] = date.split('-');
      cells[column - 1] = `${day}/${month}/${year}${time ? ` ${time}` : ''}`;
    });
    rows[number - 1] = Array.from(cells, (cell) => cell ?? '');
  });
  return ok(Array.from(rows, (cells) => cells ?? []));
}
