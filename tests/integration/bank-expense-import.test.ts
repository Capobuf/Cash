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

describe('XLSX bancario nativo e archivio v9', () => {
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

  it('importa esclusivamente Uscite < 0 e ignora zero e valori positivi prima di validare data e descrizione', () => {
    const { book, sheet } = workbook();
    for (const amount of [0, '0,00', '-0,00', 25, '34,90', '+1.234,50']) {
      sheet.addRow(['', 'non data', '100,00', amount, '', { formula: '1+1' }, '']);
    }
    sheet.addRow(['', '01/01/2026', '100,00', '-34,90', 'Uscita', '', 'Autorizzato']);
    expect(parseBankExpenseWorkbook(book)).toEqual({ ok: true, value: { ignoredIncome: 6, rows: [{ date: '2026-01-01', description: 'Uscita', amount: '34.90' }] } });
  });

  it.each([
    ['data', '31/02/2026', '-5', 'Testo'], ['importo', '01/01/2026', 'abc', 'Testo'],
    ['descrizione', '01/01/2026', '-5', '  '],
    ['precisione', '01/01/2026', -0.001, 'Testo'], ['formula', '01/01/2026', { formula: '1+1', result: 2 }, 'Testo'],
  ])('fallisce integralmente su uscita con %s non valida', (_kind, date, amount, description) => {
    const { book, sheet } = workbook();
    sheet.addRow(['', '01/01/2026', '', '-1', 'Valida', '', '']);
    sheet.addRow(['', date, '', amount, description, '', '']);
    expect(parseBankExpenseWorkbook(book)).toMatchObject({ ok: false, error: { code: 'SOURCE_INVALID', message: expect.stringContaining('riga 5') } });
  });

  it('rifiuta struttura mancante anche se un altro foglio è valido e gestisce calendario 1904', () => {
    const { book, sheet } = workbook(); book.properties.date1904 = true;
    sheet.addRow(['', 0, '', '-1.25', 'Inizio', '', '']);
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
    const legacy: Record<string, unknown> = { ...document, schemaVersion: 5 }; delete legacy.bankExpenses; delete legacy.bankExpenseCategories; delete legacy.bankExpenseRules;
    const path = join(await directory(), 'cash.json'); const bytes = JSON.stringify(legacy, null, 2); await writeFile(path, bytes);
    expect(await openArchive(path)).toMatchObject({ ok: false, error: { code: 'MIGRATION_REQUIRED' } });
    expect(await previewMigration(path)).toMatchObject({ ok: true, value: { fromVersion: 5, toVersion: 10, blockers: [] } });
    const migrated = await migrateArchive(path); if (!migrated.ok) throw new Error(migrated.error.message);
    expect(migrated.value.document).toEqual({ ...document, bankExpenseCategories: migrated.value.document!.bankExpenseCategories });
    expect(migrated.value.document!.bankExpenseCategories).toMatchObject([{ name: 'Imposte P.IVA', systemRole: 'vat_taxes' }]); expect(await readFile(backupPathFor(path), 'utf8')).toBe(bytes);
    const updated = structuredClone(migrated.value.document!); const category = { ...meta(), name: 'Software' };
    updated.bankExpenseCategories.push(category); updated.bankExpenses.push({ ...meta(), date: '2026-01-01', description: 'Licenza', amount: '25.00', categoryIds: [category.id] });
    updated.bankExpenseRules.push({ ...meta(), matchText: 'licenza', categoryId: category.id });
    const saved = await saveArchive(path, updated, migrated.value.token); expect(saved.ok).toBe(true);
    expect(await openArchive(path)).toMatchObject({ ok: true, value: { document: { bankExpenses: updated.bankExpenses, bankExpenseCategories: updated.bankExpenseCategories, bankExpenseRules: updated.bankExpenseRules, financialSnapshot: document.financialSnapshot, revision: 2 } } });
    expect(await saveArchive(path, updated, migrated.value.token)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('gli archivi con schema futuro restano in sola lettura', async () => {
    const path = join(await directory(), 'future.json');
    await writeFile(path, JSON.stringify({ ...createEmptyDocument(), schemaVersion: 99 }));
    expect(await openArchive(path)).toMatchObject({ ok: true, value: { readOnly: true, headerOnly: true } });
    expect((await createArchive(join(await directory(), 'empty.json'), createEmptyDocument())).ok).toBe(true);
  });

  it('apre lo schema corrente con raccolte bancarie assenti senza riscriverlo e le salva con backup dei byte originali', async () => {
    const document = createEmptyDocument();
    document.bankExpenseCategories.push({ ...meta(), name: 'Esistente' });
    const legacy: Record<string, unknown> = { ...document };
    delete legacy.bankExpenses; delete legacy.bankExpenseRules;
    const path = join(await directory(), 'partial-v6.json');
    const bytes = JSON.stringify(legacy, null, 2); await writeFile(path, bytes);
    const opened = await openArchive(path); if (!opened.ok) throw new Error(opened.error.message);
    expect(opened.value.document).toEqual(document);
    expect(await readFile(path, 'utf8')).toBe(bytes);
    const saved = await saveArchive(path, opened.value.document!, opened.value.token);
    expect(saved.ok).toBe(true);
    expect(await readFile(backupPathFor(path), 'utf8')).toBe(bytes);
    expect(await openArchive(path)).toMatchObject({ ok: true, value: { document: { bankExpenses: [], bankExpenseRules: [], bankExpenseCategories: document.bankExpenseCategories } } });
  });

  it('conserva categorie singole legacy come manuali e persiste solo il modello canonico', async () => {
    const document = createEmptyDocument();
    const category = { ...meta(), name: 'Software' };
    document.bankExpenseCategories.push(category);
    const rows = [
      { ...meta(), date: '2026-01-01', description: 'Con categoria', amount: '10.00', categoryId: category.id },
      { ...meta(), date: '2026-01-02', description: 'Senza categoria', amount: '20.00' },
    ];
    const path = join(await directory(), 'legacy-categories.json');
    await writeFile(path, JSON.stringify({ ...document, bankExpenses: rows, bankExpenseRules: undefined }));
    const opened = await openArchive(path); if (!opened.ok) throw new Error(opened.error.message);
    expect(opened.value.document?.bankExpenses.map(row => row.categoryIds)).toEqual([[category.id], []]);
    expect(opened.value.document?.bankExpenses[0]).not.toHaveProperty('categoryId');
    expect((await saveArchive(path, opened.value.document!, opened.value.token)).ok).toBe(true);
    const persisted = JSON.parse(await readFile(path, 'utf8'));
    expect(persisted.bankExpenses[0]).toEqual({ ...rows[0], categoryId: undefined, categoryIds: [category.id] });
    expect(persisted.bankExpenseRules).toEqual([]);
  });
});
