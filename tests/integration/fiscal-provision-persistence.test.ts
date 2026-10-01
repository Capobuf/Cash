import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument, meta } from '../../src/domain/model';
import { parseDocument } from '../../src/domain/schema';
import { backupPathFor, migrateArchive, openArchive, previewMigration, saveArchive } from '../../src/native/persistence';

describe('previsione fiscale e migrazione v6 → v7', () => {
  it('conserva movimenti, regole, categorie e snapshot, poi salva/riapre integrazioni e copertura', async () => {
    const document = createEmptyDocument();
    const category = { ...meta(), name: 'Fiscali' };
    document.bankExpenseCategories = [category];
    document.bankExpenseRules = [{ ...meta(), matchText: 'F24', categoryId: category.id }];
    document.bankExpenses = [{ ...meta(), description: 'F24', date: '2026-06-01', amount: '6000.00', categoryIds: [category.id] }];
    document.financialSnapshot = { source: 'fatture_in_cloud', acquiredAt: new Date().toISOString(), company: { id: '1', name: 'Studio' }, issuedDocuments: [], receivedDocuments: [] };
    const { financialProvisions: _provisions, ...legacy } = document;
    const path = join(await mkdtemp(join(tmpdir(), 'cash-fiscal-')), 'Cash.json');
    const bytes = JSON.stringify({ ...legacy, schemaVersion: 6 }, null, 2);
    await writeFile(path, bytes);
    expect(await openArchive(path)).toMatchObject({ ok: false, error: { code: 'MIGRATION_REQUIRED' } });
    expect(await previewMigration(path)).toMatchObject({ ok: true, value: { fromVersion: 6, toVersion: 7, blockers: [] } });
    expect(await readFile(path, 'utf8')).toBe(bytes);
    const migrated = await migrateArchive(path); if (!migrated.ok) throw new Error(migrated.error.message);
    expect(migrated.value.document).toEqual(document);
    expect(await readFile(backupPathFor(path), 'utf8')).toBe(bytes);
    document.financialProvisions = [{ year: 2026, covered: '4000.00', additions: [
      { description: 'Acconto futuro', amount: '2500.00' }, { description: 'Bollo', amount: '180.00' },
    ], bankBalance: { amount: '34000.00', date: '2026-10-01' } }];
    const saved = await saveArchive(path, document, migrated.value.token); if (!saved.ok) throw new Error(saved.error.message);
    expect(await openArchive(path)).toMatchObject({ ok: true, value: { document: { financialProvisions: document.financialProvisions, bankExpenses: document.bankExpenses } } });
    const changed = structuredClone(saved.value.document!);
    changed.financialProvisions[0]!.additions[0] = { description: 'Acconto aggiornato', amount: '2600.00' };
    changed.financialProvisions[0]!.additions.splice(1, 1);
    expect((await saveArchive(path, changed, saved.value.token)).ok).toBe(true);
    expect(await openArchive(path)).toMatchObject({ ok: true, value: { document: { financialProvisions: changed.financialProvisions } } });
  });

  it('default sicuri e validazione senza accettare coperture negative o anni duplicati', () => {
    const doc = createEmptyDocument();
    expect(parseDocument({ ...doc, financialProvisions: undefined }).financialProvisions).toEqual([]);
    expect(parseDocument({ ...doc, financialProvisions: [{ year: 2026 }] }).financialProvisions).toEqual([{ year: 2026, covered: '0.00', additions: [] }]);
    for (const provision of [
      { year: 2026, covered: '-1.00' }, { year: 2026, covered: 'NaN' }, { year: 2026, covered: '1.001' },
      { year: 2026, additions: [{ description: '', amount: '1.00' }] },
      { year: 2026, additions: [{ description: 'Bollo', amount: '-1.00' }] },
      { year: 2026, bankBalance: { amount: '100.00', date: '2026-02-30' } },
    ]) expect(() => parseDocument({ ...doc, financialProvisions: [provision] })).toThrow();
    expect(() => parseDocument({ ...doc, financialProvisions: [{ year: 2026 }, { year: 2026 }] })).toThrow();
  });
});
