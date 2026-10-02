import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { normalizeBankDescription } from '../domain/bank-expenses';
import { bankExpenseRowSchema } from '../domain/schema';
import { err, ok, type BankExpenseImport, type Result } from '../domain/model';

const headers = [
  'Data_Operazione',
  'Data_Valuta',
  'Entrate',
  'Uscite',
  'Descrizione',
  'Descrizione_Completa',
  'Stato',
] as const;
type Header = (typeof headers)[number];
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

function expenseDate(value: unknown, date1904: boolean): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime()))
      throw new Error('Data_Valuta non valida.');
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (!date1904 && Math.floor(value) === 60)
    )
      throw new Error('Data_Valuta non valida.');
    // Excel's 1900 calendar contains a fictitious leap day; 1904 workbooks use another epoch.
    const days = Math.floor(value);
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
    return expenseDate(
      new Date(epoch + (days - (!date1904 && days > 60 ? 1 : 0)) * 86400000),
      date1904,
    );
  }
  if (typeof value !== 'string')
    throw new Error('Data_Valuta assente o non valida.');
  const text = value.trim();
  const italian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  return italian
    ? `${italian[3]}-${italian[2]!.padStart(2, '0')}-${italian[1]!.padStart(2, '0')}`
    : text;
}

function expenseAmount(value: unknown): string | undefined {
  let text: string;
  if (typeof value === 'number' && Number.isFinite(value)) text = String(value);
  else if (typeof value === 'string') {
    text = value.trim();
    // Italian decimals and grouping, or a plain dot decimal, without ambiguous coercion.
    if (/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text))
      text = text.replace(/\./g, '').replace(',', '.');
    else if (!/^[+-]?\d+\.\d{1,2}$/.test(text))
      throw new Error('Uscite: importo non valido.');
  } else throw new Error('Uscite: importo non valido.');
  const amount = new Decimal(text);
  if (!amount.isFinite()) throw new Error('Uscite: importo non valido.');
  if (amount.gte(0)) return undefined;
  if (amount.decimalPlaces() > 2)
    throw new Error('Uscite: massimo due decimali.');
  return amount.abs().toFixed(2);
}

export function parseBankExpenseWorkbook(
  workbook: ExcelJS.Workbook,
): Result<BankExpenseImport> {
  const sheet = workbook.worksheets[0];
  if (!sheet)
    return err({
      code: 'SOURCE_INVALID',
      message: 'Il file XLSX non contiene fogli.',
    });
  let columns: Map<Header, number> | undefined;
  let headerRow = 0;
  sheet.eachRow((row, index) => {
    if (columns) return;
    const found = new Map<Header, number>();
    row.eachCell((cell, column) => {
      const label = cell.text.trim();
      if (headers.includes(label as Header)) found.set(label as Header, column);
    });
    if (headers.every((header) => found.has(header))) {
      columns = found;
      headerRow = index;
    }
  });
  if (!columns)
    return err({
      code: 'SOURCE_INVALID',
      message: 'Intestazione bancaria non trovata nel primo foglio.',
      details: [`Colonne richieste: ${headers.join(', ')}.`],
    });
  const result: BankExpenseImport = { rows: [], ignoredIncome: 0 };
  for (let index = headerRow + 1; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    const raw = (header: Header) => row.getCell(columns!.get(header)!).value;
    // Income rows are outside scope; their dates and descriptions are deliberately not parsed.
    if (blank(raw('Uscite'))) {
      if (!blank(raw('Entrate'))) result.ignoredIncome++;
      continue;
    }
    try {
      const amount = expenseAmount(cellValue(raw('Uscite')));
      if (amount === undefined) {
        if (!blank(raw('Entrate'))) result.ignoredIncome++;
        continue;
      }
      const full = cellValue(raw('Descrizione_Completa'));
      const description = blank(full) ? cellValue(raw('Descrizione')) : full;
      if (typeof description !== 'string')
        throw new Error('Descrizione assente o non valida.');
      const parsed = bankExpenseRowSchema.safeParse({
        date: expenseDate(
          cellValue(raw('Data_Valuta')),
          Boolean(workbook.properties.date1904),
        ),
        description: normalizeBankDescription(description),
        amount,
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; '),
        );
      result.rows.push(parsed.data);
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

export async function readBankExpenseXlsx(
  path: string,
): Promise<Result<BankExpenseImport>> {
  if (extname(path).toLowerCase() !== '.xlsx')
    return err({ code: 'SOURCE_INVALID', message: 'Seleziona un file XLSX.' });
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    return parseBankExpenseWorkbook(workbook);
  } catch {
    return err({
      code: 'SOURCE_INVALID',
      message: 'Impossibile leggere il file XLSX.',
      action:
        'Verifica che il file sia accessibile e sia un XLSX valido non protetto da password.',
    });
  }
}

const csvHeaders = [
  'Tipo',
  'Prodotto',
  'Data di inizio',
  'Data di completamento',
  'Descrizione',
  'Importo',
  'Costo',
  'Valuta',
  'State',
  'Saldo',
] as const;
type CsvHeader = (typeof csvHeaders)[number];

function csvAmount(text: string, column: string): Decimal {
  // This export uses dot decimals, without thousands separators.
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(text))
    throw new Error(`${column}: importo non valido (massimo due decimali).`);
  return new Decimal(text);
}

function csvDate(text: string): string {
  // Preserve the bank's calendar date without applying the computer's timezone.
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(
    text,
  );
  if (!match || Number(match[2]) > 23)
    throw new Error('Data del movimento assente o non valida.');
  return match[1]!;
}

export async function parseBankExpenseCsv(
  text: string,
): Promise<Result<BankExpenseImport>> {
  let sheet: ExcelJS.Worksheet;
  try {
    // Reuse ExcelJS's CSV parser for quoted commas, escaped quotes, BOM and multiline fields.
    // Keep all cells as text: dates and monetary values must not be coerced by ExcelJS.
    sheet = await new ExcelJS.Workbook().csv.read(Readable.from([text]), {
      map: (value) => value,
    });
  } catch {
    return err({
      code: 'SOURCE_INVALID',
      message: 'Impossibile leggere il CSV: struttura o virgolette non valide.',
    });
  }
  const columns = new Map<CsvHeader, number>();
  const header = sheet.getRow(1);
  header.eachCell((cell, index) => {
    const label = cell.text.trim();
    if (csvHeaders.includes(label as CsvHeader))
      columns.set(label as CsvHeader, index);
  });
  if (
    columns.size !== csvHeaders.length ||
    header.cellCount !== csvHeaders.length
  ) {
    return err({
      code: 'SOURCE_INVALID',
      message: 'Intestazione CSV bancaria non valida.',
      details: [`Colonne richieste: ${csvHeaders.join(', ')}.`],
    });
  }
  const result: BankExpenseImport = { rows: [], ignoredIncome: 0 };
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    if (
      !row.hasValues ||
      (row.values instanceof Array && row.values.every((value) => blank(value)))
    )
      continue;
    const raw = (column: CsvHeader) =>
      row.getCell(columns.get(column)!).text.trim();
    try {
      if (row.cellCount !== header.cellCount)
        throw new Error('Numero di colonne diverso dall’intestazione.');
      const amount = csvAmount(raw('Importo'), 'Importo');
      const fee = csvAmount(raw('Costo'), 'Costo');
      if (fee.lt(0))
        throw new Error('Costo: la commissione non può essere negativa.');
      const debit = fee.minus(amount);
      if (debit.lte(0)) {
        if (amount.gt(0)) result.ignoredIncome++;
        continue;
      }
      if (raw('Valuta') !== 'EUR')
        throw new Error(
          'Valuta non supportata: sono ammesse solo uscite in EUR.',
        );
      const parsed = bankExpenseRowSchema.safeParse({
        date: csvDate(raw('Data di completamento') || raw('Data di inizio')),
        description: normalizeBankDescription(raw('Descrizione')),
        amount: debit.toFixed(2),
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; '),
        );
      result.rows.push(parsed.data);
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

export async function readBankExpenseFile(
  path: string,
): Promise<Result<BankExpenseImport>> {
  const extension = extname(path).toLowerCase();
  if (extension === '.xlsx') return readBankExpenseXlsx(path);
  if (extension !== '.csv')
    return err({
      code: 'SOURCE_INVALID',
      message: 'Seleziona un file XLSX o CSV.',
    });
  try {
    return await parseBankExpenseCsv(await readFile(path, 'utf8'));
  } catch {
    return err({
      code: 'SOURCE_INVALID',
      message: 'Impossibile leggere il file CSV.',
      action:
        'Verifica che il file sia accessibile e sia un CSV valido in UTF-8.',
    });
  }
}
