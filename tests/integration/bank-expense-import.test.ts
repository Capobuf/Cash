import ExcelJS from 'exceljs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseBankExpenseWorkbook, readBankExpenseXlsx } from '../../src/native/bank-expense-import';
import { createEmptyDocument, meta } from '../../src/domain/model';
import { backupPathFor, createArchive, migrateArchive, openArchive, previewMigration, saveArchive } from '../../src/native/persistence';

const headers = ['Data_Operazione', 'Data_Valuta', 'Entrate', 'Uscite', 'Descrizione', 'Descrizione_Completa', 'Stato'];
function workbook() {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Movimenti');
  sheet.addRow(['Export conto']); sheet.addRow([]); sheet.addRow(headers);
  return { book, sheet };
}
const dirs: string[] = [];
async function directory() { const dir = await mkdtemp(join(tmpdir(), 'cash-bank-')); dirs.push(dir); return dir; }
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

describe('XLSX bancario nativo e archivio v6', () => {
  it('legge un vero XLSX con preambolo, date Excel/testo, descrizioni complete/fallback, stati diversi e primo foglio', async () => {
    const { book, sheet } = workbook();
    sheet.addRow(['01/01/2027', '31/12/2026', '', '-1.234,50', 'Breve', '  Testo  completo\n banca  ', 'Autorizzato']);
    sheet.addRow(['non usata', new Date('2025-02-01T00:00:00Z'), '', -11.54, ' Fallback ', '   ', 'Contabilizzato']);
    sheet.getCell('B5').numFmt = 'dd/mm/yyyy';
    sheet.addRow(['', 46295, '', '-34,9', 'Seriale', '', 'Altro']);
    sheet.addRow(['data errata', 'non data', '150,00', '', '', '', '']);
    book.addWorksheet('Da ignorare').addRow(['non valido']);
    const path = join(await directory(), 'export.xlsx'); await book.xlsx.writeFile(path);
    expect(await readBankExpenseXlsx(path)).toEqual({ ok: true, value: { ignoredIncome: 1, rows: [
      { date: '2026-12-31', amount: '1234.50', description: 'Testo completo banca' },
      { date: '2025-02-01', amount: '11.54', description: 'Fallback' },
      { date: '2026-09-30', amount: '34.90', description: 'Seriale' },
    ] } });
  });

  it.each([
    ['data', '31/02/2026', '-5', 'Testo'], ['importo', '01/01/2026', 'abc', 'Testo'],
    ['zero', '01/01/2026', 0, 'Testo'], ['descrizione', '01/01/2026', '-5', '  '],
    ['precisione', '01/01/2026', -0.001, 'Testo'], ['formula', '01/01/2026', { formula: '1+1', result: 2 }, 'Testo'],
  ])('fallisce integralmente su uscita con %s non valida', (_kind, date, amount, description) => {
    const { book, sheet } = workbook();
    sheet.addRow(['', '01/01/2026', '', '-1', 'Valida', '', '']);
    sheet.addRow(['', date, '', amount, description, '', '']);
    expect(parseBankExpenseWorkbook(book)).toMatchObject({ ok: false, error: { code: 'SOURCE_INVALID', message: expect.stringContaining('riga 5') } });
  });

  it('rifiuta struttura mancante anche se un altro foglio è valido e gestisce calendario 1904', () => {
    const { book, sheet } = workbook(); book.properties.date1904 = true;
    sheet.addRow(['', 0, '', '1.25', 'Inizio', '', '']);
    expect(parseBankExpenseWorkbook(book)).toMatchObject({ ok: true, value: { rows: [{ date: '1904-01-01', amount: '1.25' }] } });
    sheet.getCell('A3').value = 'Altro';
    book.addWorksheet('Secondo').addRow(headers);
    expect(parseBankExpenseWorkbook(book).ok).toBe(false);
  });

  it('rifiuta file corrotti e non XLSX senza scriverli', async () => {
    const path = join(await directory(), 'invalid.xlsx'); await writeFile(path, 'invalid');
    expect((await readBankExpenseXlsx(path)).ok).toBe(false);
    expect(await readFile(path, 'utf8')).toBe('invalid');
    expect((await readBankExpenseXlsx(path + '.csv')).ok).toBe(false);
  });

  it('migra v5 con backup byte per byte, conserva integralmente FIC e salva categorie e movimenti', async () => {
    const document = createEmptyDocument();
    document.financialSnapshot = { source: 'fatture_in_cloud', company: { id: '1', name: 'Studio' }, acquiredAt: new Date().toISOString(),
      issuedDocuments: [{ id: '1', type: 'invoice', date: '2026-01-01', amountGross: '100.00', payments: [{ amount: '100.00', status: 'paid', paidDate: '2026-02-01' }] }], receivedDocuments: [], pendingReceivedDocuments: [] };
    const legacy: Record<string, unknown> = { ...document, schemaVersion: 5 }; delete legacy.bankExpenses; delete legacy.bankExpenseCategories;
    const path = join(await directory(), 'cash.json'); const bytes = JSON.stringify(legacy, null, 2); await writeFile(path, bytes);
    expect(await openArchive(path)).toMatchObject({ ok: false, error: { code: 'MIGRATION_REQUIRED' } });
    expect(await previewMigration(path)).toMatchObject({ ok: true, value: { fromVersion: 5, toVersion: 6, blockers: [] } });
    const migrated = await migrateArchive(path); if (!migrated.ok) throw new Error(migrated.error.message);
    expect(migrated.value.document).toEqual(document); expect(await readFile(backupPathFor(path), 'utf8')).toBe(bytes);
    const updated = structuredClone(migrated.value.document!); const category = { ...meta(), name: 'Software' };
    updated.bankExpenseCategories.push(category); updated.bankExpenses.push({ ...meta(), date: '2026-01-01', description: 'Licenza', amount: '25.00', categoryId: category.id });
    const saved = await saveArchive(path, updated, migrated.value.token); expect(saved.ok).toBe(true);
    expect(await openArchive(path)).toMatchObject({ ok: true, value: { document: { bankExpenses: updated.bankExpenses, bankExpenseCategories: updated.bankExpenseCategories, financialSnapshot: document.financialSnapshot, revision: 2 } } });
    expect(await saveArchive(path, updated, migrated.value.token)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('gli archivi con schema futuro restano in sola lettura', async () => {
    const path = join(await directory(), 'future.json');
    await writeFile(path, JSON.stringify({ ...createEmptyDocument(), schemaVersion: 7 }));
    expect(await openArchive(path)).toMatchObject({ ok: true, value: { readOnly: true, headerOnly: true } });
    expect((await createArchive(join(await directory(), 'empty.json'), createEmptyDocument())).ok).toBe(true);
  });
});
