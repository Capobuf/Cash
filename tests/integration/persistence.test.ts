import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  createFiscalPreset2026,
  meta,
  type Result,
} from '../../src/domain/model';
import {
  backupPathFor,
  createArchive,
  importJsonArchive,
  closeAllArchives,
  closeArchive,
  inspectArchive,
  openArchive,
  restoreBackup,
  saveArchive,
  saveRecoveryCopy,
} from '../../src/native/persistence';
import { previewMigration } from '../../src/native/legacy-import';
import { runSchemaMigrations } from '../../src/native/sqlite-migrations';
import { comprehensiveDocument } from '../fixtures/sqlite-document';

function unwrap<T>(result: Result<T>): T {
  if (!result.ok)
    throw new Error(
      `${result.error.message} ${result.error.details?.join('; ')}`,
    );
  return result.value;
}
const dirs: string[] = [];
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), 'cash-persistence-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  vi.restoreAllMocks();
  closeAllArchives();
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});

describe('importazione JSON read-only', () => {
  it.each(Array.from({ length: 11 }, (_, index) => index + 1))(
    'importa schema %s senza alterare originale o backup',
    async (schemaVersion) => {
      const dir = await directory();
      const source = join(dir, 'Cash.json');
      const destination = join(dir, 'Cash.sqlite');
      const document = createEmptyDocument();
      document.revision = 42;
      const legacy = { ...document, schemaVersion };
      const bytes = JSON.stringify(legacy, null, 2);
      const oldBackup = join(dir, 'Cash.backup.json');
      await writeFile(source, bytes);
      await writeFile(oldBackup, 'preexisting backup');
      expect(await openArchive(source)).toMatchObject({
        ok: false,
        error: { code: 'MIGRATION_REQUIRED' },
      });
      expect(unwrap(await previewMigration(source)).blockers).toEqual([]);
      const imported = unwrap(await importJsonArchive(source, destination));
      expect(imported.document).toMatchObject({
        documentId: document.documentId,
        revision: 42,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      });
      expect(await readFile(source, 'utf8')).toBe(bytes);
      expect(await readFile(oldBackup, 'utf8')).toBe('preexisting backup');
      const saved = unwrap(
        await saveArchive(destination, imported.document!, imported.token),
      );
      expect(saved.token.revision).toBe(43);
      expect(await importJsonArchive(source, destination)).toMatchObject({
        ok: false,
        error: { code: 'CONFLICT' },
      });
      closeArchive(destination);
      expect(unwrap(await openArchive(destination)).document).toEqual(
        saved.document,
      );
    },
  );

  it('verifica il round-trip integrale di optional, decimali, snapshot, varianti, esportazioni e relazioni', async () => {
    const dir = await directory();
    const source = join(dir, 'source.json');
    const destination = join(dir, 'Cash.sqlite');
    const document = comprehensiveDocument();
    const bytes = JSON.stringify(document);
    await writeFile(source, bytes);
    const imported = unwrap(await importJsonArchive(source, destination));
    expect(imported.document).toEqual(document);
    closeArchive(destination);
    expect(unwrap(await openArchive(destination)).document).toEqual(document);
    expect(await readFile(source, 'utf8')).toBe(bytes);
    const db = new DatabaseSync(destination, { readOnly: true });
    try {
      expect(
        db
          .prepare(
            'EXPLAIN QUERY PLAN SELECT * FROM bank_expenses ORDER BY position',
          )
          .all(),
      ).toMatchObject([
        {
          detail: expect.stringContaining('USING INDEX bank_expenses_position'),
        },
      ]);
      expect(
        db
          .prepare(
            'SELECT amount, typeof(amount) AS storage FROM bank_expenses ORDER BY position',
          )
          .all(),
      ).toMatchObject([{ amount: '12345678901234567890.01', storage: 'text' }]);
      expect(
        db.prepare('SELECT count(*) AS n FROM fic_issued_payments').get()!.n,
      ).toBe(3);
      expect(
        db
          .prepare('SELECT count(*) AS n FROM fic_pending_received_documents')
          .get()!.n,
      ).toBe(3);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe(
        'ok',
      );
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),
      ).toHaveLength(20);
    } finally {
      db.close();
    }
  });

  it.each([undefined, [], [{ id: '1', source: 'mail' as const }]])(
    'mantiene pending FIC assente distinto da liste presenti: %s',
    async (pending) => {
      const document = createEmptyDocument();
      document.financialSnapshot = {
        source: 'fatture_in_cloud',
        company: { id: '1', name: 'Studio' },
        acquiredAt: document.createdAt,
        issuedDocuments: [],
        receivedDocuments: [],
        ...(pending === undefined ? {} : { pendingReceivedDocuments: pending }),
      };
      const path = join(await directory(), 'Cash.sqlite');
      const created = unwrap(await createArchive(path, document));
      expect(created.document).toEqual(document);
      const changed = structuredClone(document);
      changed.fiscalPaymentOverrides = [];
      const saved = unwrap(await saveArchive(path, changed, created.token));
      expect(saved.document).toHaveProperty('fiscalPaymentOverrides', []);
      delete changed.fiscalPaymentOverrides;
      const removed = unwrap(await saveArchive(path, changed, saved.token));
      expect(removed.document).not.toHaveProperty('fiscalPaymentOverrides');
    },
  );

  it('riusa la trasformazione legacy del consumo e delle conferme fiscali', async () => {
    const document = createEmptyDocument();
    const profile = createFiscalPreset2026();
    const fiscal: Record<string, unknown> = {
      ...profile.fiscal,
      substituteTaxRate: '15',
    };
    for (const key of [
      'activityPhase',
      'reducedEligibilityConfirmed',
      'ordinaryApplicabilityConfirmed',
      'reducedSubstituteTaxRate',
      'ordinarySubstituteTaxRate',
    ])
      delete fiscal[key];
    const dir = await directory();
    const source = join(dir, 'legacy.json');
    await writeFile(
      source,
      JSON.stringify({
        ...document,
        schemaVersion: 1,
        profiles: [{ ...profile, confirmed: true, fiscal }],
        settings: { ficCompanyId: '10', ficConsultingProductId: '20' },
        vehicles: [
          {
            ...meta(),
            name: 'Auto',
            fuel: 'Benzina',
            consumption: '5.00',
            consumptionUnit: 'l/100km',
            annualKm: '10000',
            annualInsurance: '0.00',
            annualTax: '0.00',
            annualMaintenance: '0.00',
          },
        ],
      }),
    );
    const imported = unwrap(
      await importJsonArchive(source, join(dir, 'Cash.sqlite')),
    );
    expect(imported.document!.vehicles[0]).toMatchObject({
      consumption: '20.00',
      consumptionUnit: 'km/l',
    });
    expect(imported.document!.profiles[0]!.confirmed).toBe(false);
    expect(imported.document!.settings.fic).toEqual({
      enabled: false,
      legacyReferences: { companyId: '10', productId: '20' },
    });
  });

  it.each([
    { localClients: [{ ...meta(), name: 'Locale' }] },
    { sites: [{ ...meta(), name: 'Sede', oneWayKm: '20' }] },
    { quotes: [{ ...meta(), client: { source: 'local' } }] },
    { quotes: [{ items: [{ subItems: [{ kind: 'travel' }] }] }] },
  ])('blocca dati legacy ambigui senza creare file: %j', async (ambiguous) => {
    const dir = await directory();
    const source = join(dir, 'legacy.json');
    const bytes = JSON.stringify({
      ...createEmptyDocument(),
      schemaVersion: 3,
      ...ambiguous,
    });
    await writeFile(source, bytes);
    expect(
      unwrap(await previewMigration(source)).blockers.length,
    ).toBeGreaterThan(0);
    expect(
      await importJsonArchive(source, join(dir, 'Cash.sqlite')),
    ).toMatchObject({ ok: false, error: { code: 'MIGRATION_REQUIRED' } });
    expect(await readFile(source, 'utf8')).toBe(bytes);
    expect(await readdir(dir)).toEqual(['legacy.json']);
  });
});

describe('transazioni, revisioni, backup e recovery', () => {
  it('segnala un database occupato senza salvare o avanzare la revisione', async () => {
    const path = join(await directory(), 'Cash.sqlite');
    const created = unwrap(await createArchive(path, createEmptyDocument()));
    const writer = new DatabaseSync(path);
    writer.exec('BEGIN IMMEDIATE');
    try {
      const changed = structuredClone(created.document!);
      changed.settings.fuelTerritory = 'Busy';
      expect(await saveArchive(path, changed, created.token)).toMatchObject({
        ok: false,
        error: { code: 'IO' },
      });
    } finally {
      writer.exec('ROLLBACK');
      writer.close();
    }
    expect(unwrap(await openArchive(path)).document).toEqual(created.document);
  }, 10000);

  it('esegue rollback anche quando il commit fallisce dopo gli aggiornamenti', async () => {
    const path = join(await directory(), 'Cash.sqlite');
    const created = unwrap(await createArchive(path, createEmptyDocument()));
    const exec = DatabaseSync.prototype.exec;
    let injected = false;
    const spy = vi
      .spyOn(DatabaseSync.prototype, 'exec')
      .mockImplementation(function (this: DatabaseSync, sql: string) {
        if (sql === 'COMMIT' && !injected) {
          injected = true;
          throw new Error('Injected commit I/O failure');
        }
        return exec.call(this, sql);
      });
    const changed = structuredClone(created.document!);
    changed.settings.fuelTerritory = 'Unsaved';
    const result = await saveArchive(path, changed, created.token);
    spy.mockRestore();
    expect(injected).toBe(true);
    expect(result).toMatchObject({ ok: false, error: { code: 'IO' } });
    expect(unwrap(await openArchive(path)).document).toEqual(created.document);
    expect(unwrap(await openArchive(backupPathFor(path))).document).toEqual(
      created.document,
    );
  });

  it('aggiorna soltanto la riga modificata e la revisione', async () => {
    const path = join(await directory(), 'Cash.sqlite');
    const document = comprehensiveDocument();
    const created = unwrap(await createArchive(path, document));
    const db = new DatabaseSync(path);
    try {
      db.exec('CREATE TABLE audit(tableName TEXT);');
      for (const table of [
        'business_costs',
        'bank_expenses',
        'quotes',
        'profiles',
        'shared_settings',
        'archive_metadata',
      ]) {
        for (const event of ['INSERT', 'UPDATE', 'DELETE'])
          db.exec(
            `CREATE TRIGGER audit_${table}_${event} AFTER ${event} ON ${table} BEGIN INSERT INTO audit VALUES ('${table}'); END`,
          );
      }
      document.settings.fuelTerritory = 'Lazio';
      const saved = unwrap(await saveArchive(path, document, created.token));
      expect(saved.token.revision).toBe(2);
      expect(
        db
          .prepare('SELECT tableName FROM audit ORDER BY tableName')
          .all()
          .map((row) => row.tableName),
      ).toEqual(['archive_metadata', 'shared_settings']);
      expect(unwrap(await openArchive(backupPathFor(path))).document).toEqual(
        created.document,
      );
    } finally {
      db.close();
    }
  });

  it('serializza writer concorrenti e rifiuta revisioni obsolete', async () => {
    const path = join(await directory(), 'Cash.sqlite');
    const created = unwrap(await createArchive(path, createEmptyDocument()));
    const results = await Promise.all([
      saveArchive(path, created.document!, created.token),
      saveArchive(path, created.document!, created.token),
    ]);
    expect(results.map((result) => result.ok)).toEqual([true, false]);
    expect(results[1]).toMatchObject({ error: { code: 'CONFLICT' } });
    const saved = unwrap(results[0]!);
    expect(
      unwrap(await saveArchive(path, saved.document!, saved.token)).token
        .revision,
    ).toBe(3);
    const external = new DatabaseSync(path);
    external.exec('UPDATE archive_metadata SET revision=revision+1');
    external.close();
    expect(
      await saveArchive(path, saved.document!, { ...saved.token, revision: 3 }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(unwrap(await inspectArchive(path)).header.revision).toBe(4);
  });

  it('invalida una scrittura già in coda quando si chiude la sessione', async () => {
    const path = join(await directory(), 'Cash.sqlite');
    const created = unwrap(await createArchive(path, createEmptyDocument()));
    const saving = saveArchive(path, created.document!, created.token);
    closeArchive(path);
    expect(await saving).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(unwrap(await openArchive(path)).token.revision).toBe(1);
  });

  it('esegue rollback di banca e snapshot FIC dopo un errore SQL', async () => {
    const path = join(await directory(), 'Cash.sqlite');
    const created = unwrap(await createArchive(path, comprehensiveDocument()));
    const db = new DatabaseSync(path);
    try {
      db.exec(
        "CREATE TRIGGER fail_snapshot BEFORE INSERT ON fic_received_documents BEGIN SELECT RAISE(ABORT, 'injected write failure'); END",
      );
      const changed = structuredClone(created.document!);
      changed.bankExpenses.push({
        ...meta(),
        date: '2026-10-02',
        description: 'Nuova',
        amount: '10.00',
        categoryIds: [],
      });
      changed.financialSnapshot!.receivedDocuments.push({
        id: 'new',
        type: 'expense',
        date: '2026-10-02',
        amountGross: '20.00',
        payments: [],
      });
      expect(await saveArchive(path, changed, created.token)).toMatchObject({
        ok: false,
        error: { code: 'IO' },
      });
      expect(unwrap(await openArchive(path)).document).toEqual(
        created.document,
      );
      db.exec('DROP TRIGGER fail_snapshot');
      expect(
        unwrap(await saveArchive(path, changed, created.token)).token.revision,
      ).toBe(2);
    } finally {
      db.close();
    }
  });

  it('rifiuta duplicati SQL e riferimenti non validi senza modifiche parziali', async () => {
    const path = join(await directory(), 'Cash.sqlite');
    const created = unwrap(await createArchive(path, comprehensiveDocument()));
    const db = new DatabaseSync(path);
    try {
      expect(() =>
        db.exec(
          "INSERT INTO bank_expenses SELECT 'duplicate', createdAt, updatedAt, 99, date, description, amount, excludedFromCalculations FROM bank_expenses LIMIT 1",
        ),
      ).toThrow();
      const invalid = structuredClone(created.document!);
      invalid.bankExpenses[0]!.categoryIds.push(meta().id);
      expect(await saveArchive(path, invalid, created.token)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION' },
      });
      expect(unwrap(await openArchive(path)).document).toEqual(
        created.document,
      );
    } finally {
      db.close();
    }
  });

  it('annulla il salvataggio se la destinazione del backup non è scrivibile', async () => {
    const dir = await directory();
    const path = join(dir, 'Cash.sqlite');
    const created = unwrap(await createArchive(path, createEmptyDocument()));
    // A directory at the backup destination forces a real filesystem error.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(backupPathFor(path));
    expect(
      await saveArchive(path, created.document!, created.token),
    ).toMatchObject({ ok: false, error: { code: 'IO' } });
    expect(unwrap(await openArchive(path)).document).toEqual(created.document);
    expect((await readdir(dir)).some((name) => name.endsWith('.tmp'))).toBe(
      false,
    );
  });

  it('ripristina esplicitamente, conserva copie datate e recupera anche dati dirty', async () => {
    const dir = await directory();
    const path = join(dir, 'Cash.sqlite');
    const created = unwrap(await createArchive(path, comprehensiveDocument()));
    const dirty = structuredClone(created.document!);
    dirty.settings.fuelTerritory = 'Lazio';
    const saved = unwrap(await saveArchive(path, dirty, created.token));
    const restored = unwrap(await restoreBackup(path, saved.token));
    expect(restored.document).toEqual({
      ...created.document,
      documentId: restored.token.documentId,
      revision: 1,
      createdAt: restored.document!.createdAt,
      updatedAt: restored.document!.updatedAt,
    });
    expect(restored.token.documentId).not.toBe(created.token.documentId);
    expect(unwrap(await openArchive(backupPathFor(path))).document).toEqual(
      created.document,
    );
    const names = await readdir(dir);
    expect(
      names.filter((name) => name.includes('.prima-ripristino.')),
    ).toHaveLength(1);
    expect(
      names.filter((name) => name.includes('.backup-conservato.')),
    ).toHaveLength(1);
    const recovered = unwrap(
      await saveRecoveryCopy(join(dir, 'recovery.sqlite'), dirty),
    );
    expect(recovered.document!.settings.fuelTerritory).toBe('Lazio');
    expect(recovered.token.documentId).not.toBe(created.token.documentId);
    expect(recovered.token.revision).toBe(1);
  });
});

describe('riconoscimento e versioni SQL', () => {
  it('blocca schema futuro in sola lettura senza scrivere il database', async () => {
    const path = join(await directory(), 'Cash.sqlite');
    unwrap(await createArchive(path, createEmptyDocument()));
    closeArchive(path);
    const db = new DatabaseSync(path);
    db.exec('PRAGMA user_version=99');
    db.close();
    const before = await readFile(path);
    const opened = unwrap(await openArchive(path));
    expect(opened).toMatchObject({
      readOnly: true,
      headerOnly: true,
      storageVersion: 99,
    });
    expect(await readFile(path)).toEqual(before);
    expect(
      await saveArchive(path, createEmptyDocument(), opened.token),
    ).toMatchObject({ ok: false });
  });

  it('non inizializza un SQLite sconosciuto, schema zero o un file corrotto', async () => {
    const dir = await directory();
    const unknown = join(dir, 'unknown.sqlite');
    const db = new DatabaseSync(unknown);
    db.exec('CREATE TABLE other(id INTEGER)');
    db.close();
    const before = await readFile(unknown);
    expect((await openArchive(unknown)).ok).toBe(false);
    expect(await readFile(unknown)).toEqual(before);
    const cash = join(dir, 'Cash.sqlite');
    unwrap(await createArchive(cash, createEmptyDocument()));
    closeArchive(cash);
    const zero = new DatabaseSync(cash);
    zero.exec('PRAGMA user_version=0');
    zero.close();
    expect((await openArchive(cash)).ok).toBe(false);
    const corrupt = join(dir, 'corrupt.sqlite');
    await writeFile(corrupt, 'SQLite format 3\0corrupt');
    expect((await openArchive(corrupt)).ok).toBe(false);
    expect(await openArchive(join(dir, 'missing.sqlite'))).toMatchObject({
      ok: false,
      error: { code: 'FILE_NOT_FOUND' },
    });
    expect(await openArchive(dir)).toMatchObject({
      ok: false,
      error: { code: 'IO' },
    });
  });

  it('verifica il runner delle future migrazioni con backup e rollback', async () => {
    const path = join(await directory(), 'Cash.sqlite');
    const created = unwrap(await createArchive(path, comprehensiveDocument()));
    closeArchive(path);
    const safety = await runSchemaMigrations(
      path,
      [{ version: 2, sql: 'CREATE INDEX test_migration ON quotes(position)' }],
      2,
    );
    expect(safety).toBeDefined();
    const db = new DatabaseSync(path);
    try {
      expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(2);
      expect(
        db
          .prepare("SELECT name FROM sqlite_master WHERE name='test_migration'")
          .get(),
      ).toBeDefined();
    } finally {
      db.close();
    }
    await expect(
      runSchemaMigrations(
        path,
        [
          {
            version: 3,
            sql: 'ALTER TABLE quotes ADD COLUMN migration_test TEXT; SELECT * FROM no_such_table',
          },
        ],
        3,
      ),
    ).rejects.toThrow('backup:');
    const rolledBack = new DatabaseSync(path);
    try {
      expect(
        rolledBack.prepare('PRAGMA user_version').get()!.user_version,
      ).toBe(2);
      expect(
        rolledBack
          .prepare('PRAGMA table_info(quotes)')
          .all()
          .some((row) => row.name === 'migration_test'),
      ).toBe(false);
    } finally {
      rolledBack.close();
    }
    expect(unwrap(await openArchive(safety!)).document).toEqual(
      created.document,
    );
  });
});
