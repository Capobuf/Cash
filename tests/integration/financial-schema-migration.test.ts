import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createEmptyDocument,
  createFiscalPreset2026,
  meta,
} from '../../src/domain/model';
import { cashDocumentSchema, parseDocument } from '../../src/domain/schema';
import { bankCategoryDeletionBlocker } from '../../src/domain/bank-expenses';
import {
  backupPathFor,
  migrateArchive,
  openArchive,
  previewMigration,
  saveArchive,
} from '../../src/native/persistence';

describe('migrazione fiscale allo schema corrente', () => {
  it('migra v9 senza correzioni implicite e conserva correzioni annuali e zero dopo riapertura', async () => {
    const document = createEmptyDocument();
    document.profiles = [createFiscalPreset2026()];
    const path = join(
      await mkdtemp(join(tmpdir(), 'cash-schema10-')),
      'Cash.json',
    );
    const legacy = { ...document, schemaVersion: 9 };
    await writeFile(path, JSON.stringify(legacy));
    expect(await previewMigration(path)).toMatchObject({
      ok: true,
      value: { fromVersion: 9, toVersion: 11 },
    });
    const migrated = await migrateArchive(path);
    if (!migrated.ok) throw new Error(migrated.error.message);
    expect(migrated.value.document).toEqual(document);
    expect(JSON.parse(await readFile(backupPathFor(path), 'utf8'))).toEqual(
      legacy,
    );
    document.fiscalPaymentOverrides = [
      { year: 2026, total: '12582.66' },
      { year: 2027, total: '0.00' },
    ];
    const saved = await saveArchive(path, document, migrated.value.token);
    if (!saved.ok) throw new Error(saved.error.message);
    expect(await openArchive(path)).toMatchObject({
      ok: true,
      value: {
        document: { fiscalPaymentOverrides: document.fiscalPaymentOverrides },
      },
    });
  });

  it('rifiuta correzioni negative, anni duplicati e importi malformati', () => {
    const document = createEmptyDocument();
    for (const entries of [
      [{ year: 2026, total: '-1.00' }],
      [{ year: 2026, total: 'NaN' }],
      [{ year: 2026, total: '1.001' }],
      [
        { year: 2026, total: '0.00' },
        { year: 2026, total: '1.00' },
      ],
    ])
      expect(
        cashDocumentSchema.safeParse({
          ...document,
          fiscalPaymentOverrides: entries,
        }).success,
      ).toBe(false);
  });
  it('abbandona il saldo v8 preservando tutti gli altri dati e permette salvataggio e riapertura', async () => {
    const document = createEmptyDocument();
    document.profiles = [createFiscalPreset2026()];
    document.bankExpenseCategories[0]!.name = 'Tributi';
    const taxId = document.bankExpenseCategories[0]!.id;
    document.bankExpenseRules = [
      { ...meta(), matchText: 'F24', categoryId: taxId },
    ];
    document.bankExpenses = [
      {
        ...meta(),
        description: 'F24',
        date: '2026-06-01',
        amount: '7000.00',
        categoryIds: [taxId],
      },
    ];
    document.financialSnapshot = {
      source: 'fatture_in_cloud',
      company: { id: '1', name: 'Studio' },
      acquiredAt: '2026-10-01T10:00:00Z',
      issuedDocuments: [
        {
          id: '1',
          type: 'invoice',
          date: '2026-01-01',
          amountGross: '50000.00',
          stampDuty: '2.00',
          payments: [
            { amount: '50000.00', status: 'paid', paidDate: '2026-02-01' },
          ],
        },
      ],
      receivedDocuments: [],
      pendingReceivedDocuments: [
        { id: '2', source: 'agyo', supplierName: 'Fornitore' },
      ],
    };
    document.businessCosts = [
      {
        ...meta(),
        category: 'Software',
        description: 'Suite',
        monthlyAmount: '10.00',
      },
    ];
    document.sites = [{ ...meta(), name: 'Studio', address: 'Roma' }];
    document.settings.defaultDepartureSiteId = document.sites[0]!.id;
    document.vehicles = [
      {
        ...meta(),
        name: 'Auto',
        fuel: 'Benzina',
        consumption: '20',
        consumptionUnit: 'km/l',
        annualKm: '10000',
        annualInsurance: '500.00',
        annualTax: '200.00',
        annualMaintenance: '300.00',
      },
    ];
    document.catalog.subItems = [
      { ...meta(), kind: 'time', description: 'Lavoro', minutes: 60 },
    ];
    document.quotes = [
      {
        ...meta(),
        date: '2026-10-01',
        snapshotRevision: 0,
        items: [],
        exportAttempts: [],
      },
    ];
    const legacy = {
      ...document,
      schemaVersion: 8,
      financialProvisions: [
        { year: 2026, bankBalance: { amount: '12345.67', date: '2026-10-01' } },
      ],
    };
    const path = join(
      await mkdtemp(join(tmpdir(), 'cash-schema9-')),
      'Cash.json',
    );
    const bytes = JSON.stringify(legacy, null, 2);
    await writeFile(path, bytes);
    const preview = await previewMigration(path);
    expect(preview).toMatchObject({
      ok: true,
      value: { fromVersion: 8, toVersion: 11, blockers: [] },
    });
    if (!preview.ok) throw new Error(preview.error.message);
    expect(preview.value.changes.join(' ')).toContain(
      'rimuovendo il saldo bancario manuale',
    );
    expect(await readFile(path, 'utf8')).toBe(bytes);
    const migrated = await migrateArchive(path);
    if (!migrated.ok) throw new Error(migrated.error.message);
    expect(migrated.value.document).toEqual(document);
    expect(await readFile(backupPathFor(path), 'utf8')).toBe(bytes);
    const saved = await saveArchive(
      path,
      migrated.value.document!,
      migrated.value.token,
    );
    if (!saved.ok) throw new Error(saved.error.message);
    expect(await openArchive(path)).toMatchObject({
      ok: true,
      value: { document: saved.value.document },
    });
    expect(saved.value.document).toEqual({
      ...document,
      revision: 2,
      updatedAt: saved.value.document!.updatedAt,
    });
    expect(await readFile(path, 'utf8')).not.toMatch(
      /financialProvisions|bankBalance|12345\.67/,
    );
  });

  it('crea e valida documenti correnti senza il contenitore abbandonato', () => {
    const document = createEmptyDocument();
    expect(document.schemaVersion).toBe(11);
    expect(document).not.toHaveProperty('financialProvisions');
    expect(
      parseDocument({
        ...document,
        financialProvisions: [
          {
            year: 2026,
            bankBalance: { amount: '12345.67', date: '2026-10-01' },
          },
        ],
      }),
    ).toEqual(document);
  });
  it.each([6, 7])(
    'migra v%s senza perdere dati o convertire una categoria utente omonima',
    async (version) => {
      const document = createEmptyDocument();
      const category = { ...meta(), name: 'Imposte P.IVA' };
      document.bankExpenseCategories = [category];
      document.bankExpenseRules = [
        { ...meta(), matchText: 'F24', categoryId: category.id },
      ];
      document.bankExpenses = [
        {
          ...meta(),
          description: 'F24',
          date: '2026-06-01',
          amount: '6000.00',
          categoryIds: [category.id],
        },
      ];
      document.financialSnapshot = {
        source: 'fatture_in_cloud',
        acquiredAt: new Date().toISOString(),
        company: { id: '1', name: 'Studio' },
        issuedDocuments: [
          {
            id: '1',
            type: 'invoice',
            date: '2026-01-01',
            amountGross: '1042.00',
            payments: [
              { amount: '1042.00', status: 'paid', paidDate: '2026-02-01' },
            ],
          },
        ],
        receivedDocuments: [],
      };
      const bankBalance = { amount: '34000.00', date: '2026-10-01' };
      const legacy = {
        ...document,
        schemaVersion: version,
        financialProvisions:
          version === 7
            ? [
                {
                  year: 2026,
                  covered: '4000.00',
                  additions: [{ description: 'Bollo', amount: '180.00' }],
                  bankBalance,
                },
              ]
            : undefined,
      };
      const path = join(
        await mkdtemp(join(tmpdir(), 'cash-fiscal-')),
        'Cash.json',
      );
      const bytes = JSON.stringify(legacy, null, 2);
      await writeFile(path, bytes);
      expect(await openArchive(path)).toMatchObject({
        ok: false,
        error: { code: 'MIGRATION_REQUIRED' },
      });
      expect(await previewMigration(path)).toMatchObject({
        ok: true,
        value: { fromVersion: version, toVersion: 11, blockers: [] },
      });
      expect(await readFile(path, 'utf8')).toBe(bytes);
      const migrated = await migrateArchive(path);
      if (!migrated.ok) throw new Error(JSON.stringify(migrated.error));
      const doc = migrated.value.document!;
      expect(doc).toMatchObject({
        bankExpenses: document.bankExpenses,
        bankExpenseRules: document.bankExpenseRules,
        financialSnapshot: document.financialSnapshot,
      });
      expect(doc.bankExpenseCategories[0]).toEqual(category);
      expect(doc.bankExpenseCategories).toHaveLength(2);
      const system = doc.bankExpenseCategories[1]!;
      expect(system).toMatchObject({
        name: 'Imposte P.IVA',
        systemRole: 'vat_taxes',
      });
      expect(
        bankCategoryDeletionBlocker(doc.bankExpenseCategories, [], system.id),
      ).toContain('sistema');
      expect(doc).not.toHaveProperty('financialProvisions');
      expect(await readFile(backupPathFor(path), 'utf8')).toBe(bytes);
      system.name = 'Tributi rinominati';
      const saved = await saveArchive(path, doc, migrated.value.token);
      if (!saved.ok) throw new Error(JSON.stringify(saved.error));
      expect(await openArchive(path)).toMatchObject({
        ok: true,
        value: { document: saved.value.document },
      });
      expect((await migrateArchive(path)).ok).toBe(false);
      const reopened = await openArchive(path);
      if (!reopened.ok) throw new Error(reopened.error.message);
      expect(
        reopened.value.document!.bankExpenseCategories.filter(
          (entry) => entry.systemRole === 'vat_taxes',
        ),
      ).toEqual([system]);
      expect(await readFile(path, 'utf8')).not.toMatch(/"covered"|"additions"/);
    },
  );

  it('preserva una identità di sistema già presente senza duplicarla', async () => {
    const document = createEmptyDocument();
    document.bankExpenseCategories[0]!.name = 'Rinominata';
    const path = join(
      await mkdtemp(join(tmpdir(), 'cash-fiscal-')),
      'Cash.json',
    );
    await writeFile(path, JSON.stringify({ ...document, schemaVersion: 7 }));
    expect(await migrateArchive(path)).toMatchObject({
      ok: true,
      value: { document },
    });
  });
});
