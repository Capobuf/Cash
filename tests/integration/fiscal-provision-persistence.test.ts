import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument, meta } from '../../src/domain/model';
import { parseDocument } from '../../src/domain/schema';
import { bankCategoryDeletionBlocker } from '../../src/domain/bank-expenses';
import { backupPathFor, migrateArchive, openArchive, previewMigration, saveArchive } from '../../src/native/persistence';

describe('migrazione fiscale v8', () => {
  it.each([6, 7])('migra v%s senza perdere dati o convertire una categoria utente omonima', async version => {
    const document = createEmptyDocument();
    const category = { ...meta(), name: 'Imposte P.IVA' };
    document.bankExpenseCategories = [category];
    document.bankExpenseRules = [{ ...meta(), matchText: 'F24', categoryId: category.id }];
    document.bankExpenses = [{ ...meta(), description: 'F24', date: '2026-06-01', amount: '6000.00', categoryIds: [category.id] }];
    document.financialSnapshot = { source: 'fatture_in_cloud', acquiredAt: new Date().toISOString(), company: { id: '1', name: 'Studio' },
      issuedDocuments: [{ id: '1', type: 'invoice', date: '2026-01-01', amountGross: '1042.00', payments: [{ amount: '1042.00', status: 'paid', paidDate: '2026-02-01' }] }], receivedDocuments: [] };
    const bankBalance = { amount: '34000.00', date: '2026-10-01' };
    const legacy = { ...document, schemaVersion: version, financialProvisions: version === 7
      ? [{ year: 2026, covered: '4000.00', additions: [{ description: 'Bollo', amount: '180.00' }], bankBalance }] : undefined };
    const path = join(await mkdtemp(join(tmpdir(), 'cash-fiscal-')), 'Cash.json');
    const bytes = JSON.stringify(legacy, null, 2);
    await writeFile(path, bytes);
    expect(await openArchive(path)).toMatchObject({ ok: false, error: { code: 'MIGRATION_REQUIRED' } });
    expect(await previewMigration(path)).toMatchObject({ ok: true, value: { fromVersion: version, toVersion: 8, blockers: [] } });
    expect(await readFile(path, 'utf8')).toBe(bytes);
    const migrated = await migrateArchive(path); if (!migrated.ok) throw new Error(JSON.stringify(migrated.error));
    const doc = migrated.value.document!;
    expect(doc).toMatchObject({ bankExpenses: document.bankExpenses, bankExpenseRules: document.bankExpenseRules, financialSnapshot: document.financialSnapshot });
    expect(doc.bankExpenseCategories[0]).toEqual(category);
    expect(doc.bankExpenseCategories).toHaveLength(2);
    const system = doc.bankExpenseCategories[1]!;
    expect(system).toMatchObject({ name: 'Imposte P.IVA', systemRole: 'vat_taxes' });
    expect(bankCategoryDeletionBlocker(doc.bankExpenseCategories, [], system.id)).toContain('sistema');
    expect(doc.financialProvisions).toEqual(version === 7 ? [{ year: 2026, bankBalance }] : []);
    expect(await readFile(backupPathFor(path), 'utf8')).toBe(bytes);
    system.name = 'Tributi rinominati';
    const saved = await saveArchive(path, doc, migrated.value.token); if (!saved.ok) throw new Error(JSON.stringify(saved.error));
    expect(await openArchive(path)).toMatchObject({ ok: true, value: { document: saved.value.document } });
    expect((await migrateArchive(path)).ok).toBe(false);
    const reopened = await openArchive(path); if (!reopened.ok) throw new Error(reopened.error.message);
    expect(reopened.value.document!.bankExpenseCategories.filter(entry => entry.systemRole === 'vat_taxes')).toEqual([system]);
    expect(await readFile(path, 'utf8')).not.toMatch(/"covered"|"additions"/);
  });

  it('preserva una identità di sistema già presente senza duplicarla', async () => {
    const document = createEmptyDocument(); document.bankExpenseCategories[0]!.name = 'Rinominata';
    const path = join(await mkdtemp(join(tmpdir(), 'cash-fiscal-')), 'Cash.json');
    await writeFile(path, JSON.stringify({ ...document, schemaVersion: 7 }));
    expect(await migrateArchive(path)).toMatchObject({ ok: true, value: { document } });
  });

  it('rimuove i campi fiscali legacy e valida soltanto saldo e anno', () => {
    const doc = createEmptyDocument();
    expect(parseDocument({ ...doc, financialProvisions: [{ year: 2026, covered: '4000.00', additions: [] }] }).financialProvisions).toEqual([{ year: 2026 }]);
    for (const bankBalance of [
      { amount: 'NaN', date: '2026-01-01' }, { amount: '1.001', date: '2026-01-01' },
      { amount: '100.00', date: '2026-02-30' },
    ]) expect(() => parseDocument({ ...doc, financialProvisions: [{ year: 2026, bankBalance }] })).toThrow();
    expect(() => parseDocument({ ...doc, financialProvisions: [{ year: 2026 }, { year: 2026 }] })).toThrow();
    expect(parseDocument({ ...doc, financialProvisions: [{ year: 2026, bankBalance: { amount: '-1.00', date: '2026-01-01' } }] }).financialProvisions[0]!.bankBalance!.amount).toBe('-1.00');
  });
});
