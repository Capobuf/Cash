import ExcelJS from 'exceljs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseBankExpenseCsv,
  readBankExpenseFile,
} from '../../src/native/bank-expense-import';
import { deduplicateBankExpenses } from '../../src/domain/bank-expenses';

const headers =
  'Tipo,Prodotto,Data di inizio,Data di completamento,Descrizione,Importo,Costo,Valuta,State,Saldo';
const payment = [
  'Pagamento con carta',
  'Attuale',
  '2026-06-29 19:39:54',
  '2026-06-30 13:27:28',
  'Negozio',
  '-57.03',
  '0',
  'EUR',
  'COMPLETATO',
  '935.98',
];
function csvRow(changes: Record<number, string> = {}) {
  return payment
    .map((value, index) => `"${(changes[index] ?? value).replace(/"/g, '""')}"`)
    .join(',');
}
const dirs: string[] = [];
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), 'cash-csv-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('Importazione CSV bancario', () => {
  it('legge il formato fornito includendo commissioni e movimenti in sospeso, senza modificare il file', async () => {
    const text = [
      headers,
      'Ricarica,Attuale,2026-06-25 16:54:38,2026-06-25 16:54:39,Pagamento da Cliente,1000,0,EUR,COMPLETATO,1000',
      'Addebita,Attuale,2026-06-25 16:57:28,2026-06-25 16:57:28,Commissione per la consegna della carta,0,6.99,EUR,COMPLETATO,993.01',
      payment.join(','),
      'Pagamento con carta,Attuale,2026-10-01 13:30:49,,Panificio,-4.4,0,EUR,In sospeso,',
      csvRow({ 4: 'Pagamento con commissione', 5: '-10', 6: '0.15' }),
    ].join('\r\n');
    const path = join(await directory(), 'movimenti.CSV');
    await writeFile(path, '\uFEFF' + text);
    expect(await readBankExpenseFile(path)).toEqual({
      ok: true,
      value: {
        ignoredIncome: 1,
        rows: [
          {
            date: '2026-06-25',
            description: 'Commissione per la consegna della carta',
            amount: '6.99',
          },
          { date: '2026-06-30', description: 'Negozio', amount: '57.03' },
          { date: '2026-10-01', description: 'Panificio', amount: '4.40' },
          {
            date: '2026-06-30',
            description: 'Pagamento con commissione',
            amount: '10.15',
          },
        ],
      },
    });
    expect(await readFile(path, 'utf8')).toBe('\uFEFF' + text);
  });

  it('gestisce virgolette, virgole, Unicode, campi multilinea e righe vuote', async () => {
    const result = await parseBankExpenseCsv(
      `${headers}\n\n${csvRow({ 4: '  Caffè, "Centro"\n Roma  ', 3: '2026-07-01 5:42:32' })}\n\n`,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        ignoredIncome: 0,
        rows: [
          {
            date: '2026-07-01',
            description: 'Caffè, "Centro" Roma',
            amount: '57.03',
          },
        ],
      },
    });
  });

  it('ignora accrediti netti e zeri senza validarne date e descrizioni', async () => {
    const text = [
      headers,
      ...['1000', '0', '-0'].map((amount) =>
        csvRow({ 3: 'data errata', 4: '', 5: amount }),
      ),
      csvRow({ 3: '', 4: '', 5: '10', 6: '1' }),
    ].join('\n');
    expect(await parseBankExpenseCsv(text)).toEqual({
      ok: true,
      value: { ignoredIncome: 2, rows: [] },
    });
  });

  it.each([
    ['data impossibile', { 3: '2026-02-30 12:00:00' }],
    ['ora impossibile', { 3: '2026-06-30 24:00:00' }],
    ['data mancante', { 2: '', 3: '' }],
    ['importo', { 5: 'abc' }],
    ['precisione', { 5: '-1.234' }],
    ['separatore decimale', { 5: '-1,25' }],
    ['importo mancante', { 5: '' }],
    ['costo', { 6: 'abc' }],
    ['costo negativo', { 6: '-1' }],
    ['descrizione', { 4: '  ' }],
    ['valuta', { 7: 'USD' }],
  ])('annulla tutto per %s non valida', async (_label, changes) => {
    expect(
      await parseBankExpenseCsv(`${headers}\n${csvRow()}\n${csvRow(changes)}`),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'SOURCE_INVALID',
        message: expect.stringContaining('riga 3'),
      },
    });
  });

  it.each([
    '',
    'Descrizione,Importo\nNegozio,-1',
    headers.replace('Saldo', 'Importo'),
    `${headers}\n${csvRow()},extra`,
    `${headers}\n${payment.slice(0, -1).join(',')}`,
    `${headers}\n"campo non chiuso`,
  ])('rifiuta strutture CSV non valide', async (text) => {
    expect(await parseBankExpenseCsv(text)).toMatchObject({
      ok: false,
      error: { code: 'SOURCE_INVALID' },
    });
  });

  it('accetta intestazioni riordinate e file con sole intestazioni', async () => {
    expect(await parseBankExpenseCsv(headers)).toEqual({
      ok: true,
      value: { rows: [], ignoredIncome: 0 },
    });
    const result = await parseBankExpenseCsv(
      `${headers.split(',').reverse().join(',')}\n${[...payment].reverse().join(',')}`,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { rows: [{ description: 'Negozio', amount: '57.03' }] },
    });
  });

  it('riutilizza la deduplica esistente anche per la reimportazione', async () => {
    const parsed = await parseBankExpenseCsv(
      `${headers}\n${csvRow()}\n${csvRow()}`,
    );
    if (!parsed.ok) throw new Error(parsed.error.message);
    const first = deduplicateBankExpenses([], parsed.value.rows);
    expect(first.added).toHaveLength(1);
    expect(first.duplicates).toBe(1);
    expect(deduplicateBankExpenses(first.added, parsed.value.rows)).toEqual({
      added: [],
      duplicates: 2,
    });
  });

  it('mantiene il supporto XLSX nel lettore comune e rifiuta file inaccessibili o estensioni diverse', async () => {
    const dir = await directory();
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Movimenti');
    sheet.addRow([
      'Data_Operazione',
      'Data_Valuta',
      'Entrate',
      'Uscite',
      'Descrizione',
      'Descrizione_Completa',
      'Stato',
    ]);
    sheet.addRow([
      '',
      '30/06/2026',
      '',
      -57.03,
      'Negozio',
      '',
      'Contabilizzato',
    ]);
    const path = join(dir, 'movimenti.xlsx');
    await book.xlsx.writeFile(path);
    expect(await readBankExpenseFile(path)).toMatchObject({
      ok: true,
      value: {
        rows: [{ date: '2026-06-30', description: 'Negozio', amount: '57.03' }],
      },
    });
    expect((await readBankExpenseFile(join(dir, 'missing.csv'))).ok).toBe(
      false,
    );
    expect((await readBankExpenseFile(join(dir, 'movimenti.txt'))).ok).toBe(
      false,
    );
  });
});
