import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyDocument, createFiscalPreset2026, meta, ok, type FicFinancialSnapshot } from '../../src/domain/model';
import { parseDocument } from '../../src/domain/schema';
import { disableFic } from '../../src/domain/integration';
import { removeFicLinkAtomically } from '../../src/native/fic-link';
import { backupPathFor, createArchive, migrateArchive, openArchive, previewMigration, restoreBackup, saveArchive } from '../../src/native/persistence';

const snapshot: FicFinancialSnapshot = { source: 'fatture_in_cloud', company: { id: '1', name: 'Studio' }, acquiredAt: '2026-09-30T10:00:00Z',
  issuedDocuments: [{ id: '10', type: 'invoice', date: '2026-01-01', amountGross: '100.00', payments: [{ id: '20', amount: '100.00', status: 'paid', paidDate: '2026-02-01' }] }], receivedDocuments: [] };

describe('archivio finanziario v6', () => {
  it('apre snapshot preesistenti senza entityId e conserva gli ID opzionali al salvataggio e riapertura', async () => {
    const document = createEmptyDocument(); document.financialSnapshot = structuredClone(snapshot);
    expect(parseDocument(document).financialSnapshot).toEqual(snapshot);
    document.financialSnapshot.issuedDocuments[0]!.entityId = '42';
    document.financialSnapshot.receivedDocuments.push({ id: '1', entityId: '73', entityName: 'Fornitore', type: 'expense', date: '2026-01-01', amountGross: '10.00', payments: [] });
    const dir = await mkdtemp(join(tmpdir(), 'cash-entity-id-')); const path = join(dir, 'Cash.json');
    const created = await createArchive(path, document); if (!created.ok) throw new Error(created.error.message);
    expect(await openArchive(path)).toMatchObject({ ok: true, value: { document: { schemaVersion: 6, financialSnapshot: document.financialSnapshot } } });
  });

  it('migra v4 senza blocker né perdita di profili, costi, sedi, default e trasferte', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cash-financial-')); const path = join(dir, 'v4.json');
    const document = createEmptyDocument(); document.schemaVersion = 4;
    const site = { ...meta(), name: 'Studio' }; document.sites.push(site); document.settings.defaultDepartureSiteId = site.id;
    document.profiles.push(createFiscalPreset2026());
    document.businessCosts.push({ ...meta(), category: 'Software', description: 'Suite', monthlyAmount: '10.00' });
    document.quotes.push({ ...meta(), date: '2026-09-01', snapshotRevision: 0, exportAttempts: [], items: [{ ...meta(), name: 'Lavoro', variantGroups: [], variantSelections: [], subItems: [{ ...meta(), kind: 'travel', description: 'Visita', roundTrip: true, occurrences: 1, departure: { sourceId: site.id, name: site.name } }] }] });
    await writeFile(path, JSON.stringify(document));
    expect(await previewMigration(path)).toMatchObject({ ok: true, value: { fromVersion: 4, toVersion: 6, blockers: [] } });
    const migrated = await migrateArchive(path); expect(migrated.ok).toBe(true);
    if (!migrated.ok) throw new Error(migrated.error.message);
    expect(migrated.value.document).toEqual({ ...document, schemaVersion: 6 });
    expect(migrated.value.document).not.toHaveProperty('financialSnapshot');
    expect(JSON.parse(await readFile(backupPathFor(path), 'utf8'))).toEqual(document);
  });

  it('migra anche v3 non ambiguo fino a v6', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cash-financial-')); const path = join(dir, 'v3.json');
    await writeFile(path, JSON.stringify({ ...createEmptyDocument(), schemaVersion: 3, localClients: [] }));
    expect(await migrateArchive(path)).toMatchObject({ ok: true, value: { document: { schemaVersion: 6 } } });
  });

  it('salva, riapre, conserva offline/rimozione e ripristina lo snapshot tramite backup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cash-financial-')); const path = join(dir, 'Cash.json');
    const document = createEmptyDocument(); document.financialSnapshot = snapshot;
    document.settings.fic = { enabled: true, company: { id: '1', name: 'Studio' }, product: { id: '2', name: 'Consulenza' } };
    const created = await createArchive(path, document); if (!created.ok) throw new Error(created.error.message);
    const changed = structuredClone(document); changed.settings = disableFic(changed.settings);
    const saved = await saveArchive(path, changed, created.value.token); if (!saved.ok) throw new Error(saved.error.message);
    expect(await openArchive(path)).toMatchObject({ ok: true, value: { document: { financialSnapshot: snapshot } } });
    const removed = await removeFicLinkAtomically({ path, document: saved.value.document!, concurrencyToken: saved.value.token }, {
      verify: vi.fn(), hasToken: async () => ok(true), readToken: async () => ok('token'), writeToken: async () => ok(undefined), deleteToken: async () => ok(undefined), save: saveArchive,
    });
    if (!removed.ok) throw new Error(removed.error.message);
    expect(removed.value.document?.financialSnapshot).toEqual(snapshot);
    expect(removed.value.document?.settings.fic).toEqual({ enabled: false });
    const restored = await restoreBackup(path, removed.value.token);
    expect(restored).toMatchObject({ ok: true, value: { document: { financialSnapshot: snapshot } } });
    const invalid = structuredClone(document); delete invalid.financialSnapshot!.issuedDocuments[0]!.payments[0]!.paidDate;
    expect(() => parseDocument(invalid)).toThrow();
  });
});
