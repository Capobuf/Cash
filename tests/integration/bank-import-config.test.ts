import ExcelJS from 'exceljs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseBankExpenseCsv,
  parseBankExpenseWorkbook,
  readBankExpenseFile,
  previewBankExpenseFile,
  readBankSampleRows,
} from '../../src/native/bank-expense-import';
import {
  bankImportConfigFromDraft,
  bankImportDraft,
  bankImportPresetName,
  bankImportPresets,
} from '../../src/domain/bank-accounts';
import { bankImportConfigSchema } from '../../src/domain/schema';
import type { BankImportConfig } from '../../src/domain/model';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const custom: BankImportConfig = {
  headers: ['Data', 'Causale', 'Dettaglio', 'Importo', 'Esito', 'Divisa'],
  date: 'Data',
  description: 'Dettaglio',
  descriptionFallback: 'Causale',
  amount: { kind: 'signed', amount: 'Importo' },
  decimal: ',',
  status: { column: 'Esito', booked: ['Eseguito', 'Contabilizzato'] },
  currency: { column: 'Divisa', value: 'EUR' },
};

function customBook() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Lista');
  sheet.addRow(['Conto 123']);
  sheet.addRow(custom.headers);
  sheet.addRow([
    '02/11/2026',
    'POS',
    'Bar Centrale',
    '-3,50',
    'Eseguito',
    'EUR',
  ]);
  sheet.addRow([
    '03/11/2026',
    'Bonifico',
    '',
    '-1.200,00',
    'Contabilizzato',
    'EUR',
  ]);
  sheet.addRow([
    '04/11/2026',
    'POS',
    'Libreria',
    '-12',
    'In lavorazione',
    'EUR',
  ]);
  sheet.addRow(['05/11/2026', 'Stipendio', '', '2.000,00', 'Eseguito', 'EUR']);
  return { book, sheet };
}

describe('regole di importazione configurabili', () => {
  it('legge un formato nuovo: ripiego descrizione, più valori contabilizzati, entrate e attese', () => {
    expect(parseBankExpenseWorkbook(customBook().book, custom)).toEqual({
      ok: true,
      value: {
        rows: [
          { date: '2026-11-02', description: 'Bar Centrale', amount: '3.50' },
          { date: '2026-11-03', description: 'Bonifico', amount: '1200.00' },
        ],
        ignoredIncome: 1,
        skippedPending: 1,
        pendingFrom: '2026-11-04',
      },
    });
  });

  it('annulla tutto per valuta diversa, colonna ripetuta o intestazione di un’altra banca', async () => {
    const { book, sheet } = customBook();
    sheet.addRow(['06/11/2026', 'POS', 'Hotel', '-80', 'Eseguito', 'USD']);
    expect(parseBankExpenseWorkbook(book, custom)).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('riga 7') },
    });
    expect(
      await parseBankExpenseCsv('Data,Importo,Importo\n01/11/2026,-1,-1', {
        ...custom,
        headers: ['Data', 'Importo'],
        description: 'Data',
        descriptionFallback: undefined,
        status: undefined,
        currency: undefined,
      }),
    ).toMatchObject({
      ok: false,
      error: { message: 'Intestazione bancaria con colonne ripetute.' },
    });
    expect(
      parseBankExpenseWorkbook(customBook().book, bankImportPresets.Fineco),
    ).toMatchObject({ ok: false, error: { code: 'SOURCE_INVALID' } });
  });

  it('senza stato e commissione importa tutte le uscite con importo a punto', async () => {
    const config: BankImportConfig = {
      headers: ['Quando', 'Cosa', 'Euro'],
      date: 'Quando',
      description: 'Cosa',
      amount: { kind: 'signed', amount: 'Euro' },
      decimal: '.',
    };
    expect(
      await parseBankExpenseCsv(
        'Quando,Cosa,Euro\n2026-11-01,Treno,-9.90\n2026-11-02,Rimborso,4',
        config,
      ),
    ).toEqual({
      ok: true,
      value: {
        rows: [{ date: '2026-11-01', description: 'Treno', amount: '9.90' }],
        ignoredIncome: 1,
        skippedPending: 0,
      },
    });
  });

  it('il file di prova dà le intestazioni e l’anteprima con le colonne scelte', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cash-sample-'));
    dirs.push(dir);
    const path = join(dir, 'prova.xlsx');
    await customBook().book.xlsx.writeFile(path);
    const rows = await readBankSampleRows(path);
    if (!rows.ok) throw new Error(rows.error.message);
    expect(rows.value[0]).toEqual(['Conto 123']);
    expect(rows.value[1]).toEqual(custom.headers);
    const draft = {
      ...bankImportDraft(),
      headers: rows.value[1]!,
      date: 'Data',
      description: 'Dettaglio',
      descriptionFallback: 'Causale',
      kind: 'signed' as const,
      amount: 'Importo',
      status: 'Esito',
      booked: ['Eseguito'],
    };
    const config = bankImportConfigFromDraft(draft);
    expect(config).toBeDefined();
    expect(await readBankExpenseFile(path, config!)).toMatchObject({
      ok: true,
      value: { ignoredIncome: 1, skippedPending: 2 },
    });
    expect(bankImportConfigFromDraft({ ...draft, booked: [] })).toBeUndefined();
    expect(
      bankImportConfigFromDraft({ ...draft, amount: 'Assente' }),
    ).toBeUndefined();
    expect(bankImportConfigFromDraft({ ...draft, date: '' })).toBeUndefined();
  });

  it('i preset tornano identici dal modulo e vengono riconosciuti per nome', () => {
    for (const [name, preset] of Object.entries(bankImportPresets)) {
      expect(bankImportConfigFromDraft(bankImportDraft(preset))).toEqual(
        preset,
      );
      expect(bankImportPresetName(preset)).toBe(name);
    }
    expect(bankImportPresetName(undefined)).toBeUndefined();
    expect(bankImportPresetName(custom)).toBe('Personalizzato');
    expect(
      bankImportConfigSchema.safeParse({ ...custom, formula: true }).success,
    ).toBe(false);
  });

  it('legge l’ora HH:MM dalla cella della data o da una colonna a parte', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Lista');
    sheet.addRow(['Data', 'Ora', 'Testo', 'Importo']);
    sheet.addRow([new Date('2026-11-02T09:41:30Z'), '', 'Cella con ora', -1]);
    sheet.addRow([46328.5, '', 'Seriale con ora', -2]);
    sheet.addRow([new Date('2026-11-04T00:00:00Z'), '', 'Solo data', -3]);
    const config: BankImportConfig = {
      headers: ['Data', 'Ora', 'Testo', 'Importo'],
      date: 'Data',
      description: 'Testo',
      amount: { kind: 'signed', amount: 'Importo' },
      decimal: ',',
    };
    const parsed = parseBankExpenseWorkbook(book, config);
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(parsed.value.rows.map((row) => [row.date, row.time])).toEqual([
      ['2026-11-02', '09:41'],
      ['2026-11-02', '12:00'],
      ['2026-11-04', undefined],
    ]);
    const csv = [
      'Giorno,Ora,Testo,Euro',
      '02/11/2026,7:05:59,Treno,-9.90',
    ].join('\n');
    const withColumn = await parseBankExpenseCsv(csv, {
      ...config,
      headers: ['Giorno', 'Ora', 'Testo', 'Euro'],
      date: 'Giorno',
      time: 'Ora',
      amount: { kind: 'signed', amount: 'Euro' },
      decimal: '.',
    });
    expect(withColumn).toMatchObject({
      ok: true,
      value: { rows: [{ date: '2026-11-02', time: '07:05' }] },
    });
    expect(
      await parseBankExpenseCsv(csv.replace('7:05:59', '25:00'), {
        ...config,
        headers: ['Giorno', 'Ora', 'Testo', 'Euro'],
        date: 'Giorno',
        time: 'Ora',
        amount: { kind: 'signed', amount: 'Euro' },
        decimal: '.',
      }),
    ).toMatchObject({ ok: false });
  });

  it('l’anteprima dice cosa succede a ogni riga del file di prova', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cash-preview-'));
    dirs.push(dir);
    const path = join(dir, 'prova.xlsx');
    const { book, sheet } = customBook();
    sheet.addRow([]);
    sheet.addRow([
      '07/11/2026',
      'POS',
      'Bar Centrale',
      '-3,50',
      'Eseguito',
      'EUR',
    ]);
    await book.xlsx.writeFile(path);
    const preview = await previewBankExpenseFile(path, custom);
    if (!preview.ok) throw new Error(preview.error.message);
    expect(preview.value.outcomes.map(({ row, kind }) => [row, kind])).toEqual([
      [3, 'expense'],
      [4, 'expense'],
      [5, 'pending'],
      [6, 'income'],
      [8, 'expense'],
    ]);
    const rows = await readBankSampleRows(path);
    if (!rows.ok) throw new Error(rows.error.message);
    // Index = row number − 1, so outcomes line up with the sample table.
    expect(rows.value[6]).toEqual([]);
    expect(rows.value[7]![2]).toBe('Bar Centrale');
  });

  it('nel file di prova le date Excel restano il giorno del file, senza fuso orario', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cash-sample-dates-'));
    dirs.push(dir);
    const path = join(dir, 'date.xlsx');
    const book = new ExcelJS.Workbook();
    book
      .addWorksheet('Lista')
      .addRow([
        new Date('2026-11-05T00:00:00Z'),
        new Date('2026-11-02T09:41:30Z'),
      ]);
    await book.xlsx.writeFile(path);
    expect(await readBankSampleRows(path)).toEqual({
      ok: true,
      value: [['05/11/2026', '02/11/2026 09:41']],
    });
  });
});
