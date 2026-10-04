import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createEmptyDocument,
  createFiscalPreset2026,
  meta,
} from '../../src/domain/model';
import {
  backupPathFor,
  createArchive,
  migrateArchive,
  openArchive,
  previewMigration,
  restoreBackup,
  saveArchive,
} from '../../src/native/persistence';
import { isBankExpenseExcluded } from '../../src/domain/bank-expenses';

function fixture() {
  const doc = createEmptyDocument();
  const category = { ...meta(), name: 'Servizi' };
  doc.bankExpenseCategories.push(category);
  doc.profiles = [createFiscalPreset2026()];
  doc.fiscalPaymentOverrides = [{ year: 2026, total: '500.00' }];
  doc.bankExpenses = [
    {
      ...meta(),
      date: '2026-10-04',
      description: 'Rinnovo',
      amount: '1234.56',
      categoryIds: [category.id],
    },
  ];
  doc.bankExpenseRules = [
    { ...meta(), matchText: 'rinnovo', categoryId: category.id },
  ];
  doc.financialSnapshot = {
    source: 'fatture_in_cloud' as const,
    company: { id: '1', name: 'Studio' },
    acquiredAt: '2026-10-04T00:00:00Z',
    issuedDocuments: [],
    receivedDocuments: [],
  };
  return doc;
}

describe('migrazione e persistenza delle esclusioni nello schema 11', () => {
  it('richiede migrazione esplicita 10 → 11, conserva backup e dati senza introdurre esclusioni', async () => {
    const document = fixture();
    const legacy = { ...document, schemaVersion: 10 };
    const path = join(
      await mkdtemp(join(tmpdir(), 'cash-schema11-')),
      'Cash.json',
    );
    const bytes = JSON.stringify(legacy, null, 2);
    await writeFile(path, bytes);
    expect(await openArchive(path)).toMatchObject({
      ok: false,
      error: { code: 'MIGRATION_REQUIRED' },
    });
    const preview = await previewMigration(path);
    expect(preview).toMatchObject({
      ok: true,
      value: { fromVersion: 10, toVersion: 11, blockers: [] },
    });
    if (!preview.ok) throw new Error(preview.error.message);
    expect(preview.value.changes).toEqual([
      expect.stringContaining('non esclude automaticamente'),
    ]);
    expect(await readFile(path, 'utf8')).toBe(bytes);
    const migrated = await migrateArchive(path);
    if (!migrated.ok) throw new Error(migrated.error.message);
    expect(migrated.value.document).toEqual(document);
    expect(await readFile(backupPathFor(path), 'utf8')).toBe(bytes);
    expect(await openArchive(path)).toEqual(migrated);
    expect(
      migrated.value.document!.bankExpenses.every(
        (row) =>
          !isBankExpenseExcluded(
            row,
            document.bankExpenseCategories,
            document.bankExpenseRules,
          ),
      ),
    ).toBe(true);
    expect(migrated.value.document!.bankExpenses[0]).not.toHaveProperty(
      'excludedFromCalculations',
    );
    expect(
      migrated.value.document!.bankExpenseCategories.every(
        (category) => !Object.hasOwn(category, 'excludedFromCalculations'),
      ),
    ).toBe(true);
  });

  it('conserva flag diretti e categorie in salvataggio, riapertura e ripristino del backup', async () => {
    const doc = fixture();
    doc.bankExpenses[0]!.excludedFromCalculations = true;
    doc.bankExpenseCategories[1]!.excludedFromCalculations = true;
    const path = join(
      await mkdtemp(join(tmpdir(), 'cash-exclusions-')),
      'Cash.json',
    );
    const created = await createArchive(path, doc);
    if (!created.ok) throw new Error(created.error.message);
    const reopened = await openArchive(path);
    expect(reopened).toMatchObject({ ok: true, value: { document: doc } });
    const changed = structuredClone(doc);
    changed.bankExpenses[0]!.excludedFromCalculations = false;
    changed.bankExpenseCategories[1]!.excludedFromCalculations = false;
    const saved = await saveArchive(path, changed, created.value.token);
    if (!saved.ok) throw new Error(saved.error.message);
    expect(await openArchive(path)).toEqual(saved);
    expect(
      saved.value.document!.bankExpenses[0]!.excludedFromCalculations,
    ).toBe(false);
    expect(
      saved.value.document!.bankExpenseCategories[1]!.excludedFromCalculations,
    ).toBe(false);
    const restored = await restoreBackup(path, saved.value.token);
    if (!restored.ok) throw new Error(restored.error.message);
    expect(
      restored.value.document!.bankExpenses[0]!.excludedFromCalculations,
    ).toBe(true);
    expect(
      restored.value.document!.bankExpenseCategories[1]!
        .excludedFromCalculations,
    ).toBe(true);
    expect(await openArchive(path)).toEqual(restored);
  });
});
