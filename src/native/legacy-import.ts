import { readFile } from 'node:fs/promises';
import Decimal from 'decimal.js';
import {
  CURRENT_SCHEMA_VERSION,
  createTaxCategory,
  err,
  ok,
  type CashDocument,
  type Result,
} from '../domain/model';
import {
  cashDocumentSchema,
  documentHeaderSchema,
  validationErrorFromIssues,
} from '../domain/schema';
import type { MigrationPreview } from '../shared/archive';

export async function previewMigration(
  path: string,
): Promise<Result<MigrationPreview>> {
  try {
    return await previewMigrationNow(path);
  } catch {
    return err({
      code: 'VALIDATION',
      source: 'archive',
      message:
        'Impossibile preparare l’importazione: struttura JSON storica non valida.',
    });
  }
}

export async function inspectJsonArchive(path: string) {
  try {
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
    const header = documentHeaderSchema.safeParse(raw);
    if (!header.success)
      return err(validationErrorFromIssues(header.error.issues));
    return ok({ header: header.data, raw });
  } catch (cause) {
    return err({
      code:
        (cause as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'FILE_NOT_FOUND'
          : cause instanceof SyntaxError
            ? 'VALIDATION'
            : 'IO',
      source: 'archive',
      message: 'Impossibile leggere l’archivio JSON storico.',
      details: [String(cause)],
    });
  }
}

export async function readLegacyDocument(
  path: string,
): Promise<Result<CashDocument>> {
  const inspection = await inspectJsonArchive(path);
  if (!inspection.ok) return inspection;
  const { header, raw } = inspection.value;
  if (header.schemaVersion > CURRENT_SCHEMA_VERSION)
    return err({
      code: 'SCHEMA_NEWER',
      source: 'archive',
      message: `Schema JSON ${header.schemaVersion} non supportato. Aggiorna Cash prima di importare.`,
    });
  if (header.schemaVersion < CURRENT_SCHEMA_VERSION) {
    try {
      return migrateLegacyDocument(
        raw as Record<string, unknown>,
        header.schemaVersion,
      );
    } catch {
      return err({
        code: 'VALIDATION',
        source: 'archive',
        message:
          'Struttura dei dati JSON storici non valida. L’originale è stato conservato.',
      });
    }
  }
  const parsed = cashDocumentSchema.safeParse(raw);
  return parsed.success
    ? ok(parsed.data)
    : err(validationErrorFromIssues(parsed.error.issues));
}

async function previewMigrationNow(
  path: string,
): Promise<Result<MigrationPreview>> {
  const inspection = await inspectJsonArchive(path);
  if (!inspection.ok) return inspection;
  const fromVersion = inspection.value.header.schemaVersion;
  if (fromVersion < 1 || fromVersion > CURRENT_SCHEMA_VERSION)
    return err({
      code: 'VALIDATION',
      source: 'archive',
      message: `La migrazione supporta soltanto gli schemi da 1 a ${CURRENT_SCHEMA_VERSION}.`,
    });
  if (fromVersion === CURRENT_SCHEMA_VERSION)
    return ok({
      fromVersion,
      toVersion: CURRENT_SCHEMA_VERSION,
      changes: [],
      blockers: [],
    });
  const changes =
    fromVersion === 1
      ? [
          'Aggiunge l’anagrafica Clienti locali vuota.',
          'Imposta Fatture in Cloud su Disattivata conservando i riferimenti non segreti.',
          'Aggiunge fase attività, aliquote 5%/15% e conferme ai profili; i profili diventano Da verificare.',
          'Marca come Fatture in Cloud i riferimenti cliente e gli snapshot esistenti.',
        ]
      : [];
  if (fromVersion <= 2)
    changes.push(
      'Converte automaticamente i consumi dei carburanti liquidi da l/100 km a km/l.',
    );
  if (fromVersion <= 3)
    changes.push(
      'Rimuove velocità media e anagrafica clienti locale non previste dalla v0.6.',
      'Introduce coordinate delle Sedi, default globali e Trasferte con Partenza/Destinazione.',
    );
  if (fromVersion < 5)
    changes.push('Aggiorna allo schema 5 senza modificare i dati esistenti.');
  if (fromVersion < 6)
    changes.push(
      'Aggiunge categorie, movimenti bancari e regole automatiche vuoti, conservando lo snapshot finanziario esistente.',
    );
  if (fromVersion < 8)
    changes.push(
      'Crea la categoria di sistema Imposte P.IVA se assente. Rimuove copertura e integrazioni fiscali manuali senza creare movimenti.',
    );
  if (fromVersion < 9)
    changes.push(
      'Aggiorna allo schema 9 rimuovendo il saldo bancario manuale e il relativo contenitore annuale, non più utilizzati dalla panoramica finanziaria. Conserva profili, movimenti, categorie, regole, snapshot FIC, preventivi e gli altri dati.',
    );
  if (fromVersion < 10)
    changes.push(
      'Aggiorna allo schema 10 per consentire un totale fiscale annuale facoltativo del commercialista. Non crea correzioni, non ricostruisce F24 e conserva i dati esistenti.',
    );
  changes.push(
    'Aggiorna allo schema 11 per consentire l’esclusione di spese e categorie dai conteggi. Conserva i dati esistenti e non esclude automaticamente alcun movimento o categoria.',
  );
  const raw = inspection.value.raw as Record<string, unknown>;
  const blockers =
    fromVersion >= 4
      ? []
      : findV3Blockers(
          fromVersion === 1
            ? migrateV2Record(migrateV1(raw))
            : fromVersion === 2
              ? migrateV2Record(raw)
              : raw,
        );
  return ok({
    fromVersion,
    toVersion: CURRENT_SCHEMA_VERSION,
    changes,
    blockers,
  });
}

function migrateV1(raw: Record<string, unknown>): Record<string, unknown> {
  const settings = (raw.settings ?? {}) as Record<string, unknown>;
  const profiles = ((raw.profiles ?? []) as Array<Record<string, unknown>>).map(
    (profile) => {
      const fiscal = profile.fiscal as Record<string, unknown>;
      return {
        ...profile,
        confirmed: false,
        fiscal: {
          ...fiscal,
          activityPhase: 'ordinary',
          reducedEligibilityConfirmed: false,
          ordinaryApplicabilityConfirmed: false,
          reducedSubstituteTaxRate: '5',
          ordinarySubstituteTaxRate: fiscal.substituteTaxRate ?? '15',
          substituteTaxRate: undefined,
        },
      };
    },
  );
  const migrateRef = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || 'source' in value) return value;
    return {
      ...(value as Record<string, unknown>),
      source: 'fatture_in_cloud',
    };
  };
  const sites = ((raw.sites ?? []) as Array<Record<string, unknown>>).map(
    (site) => ({ ...site, client: migrateRef(site.client) }),
  );
  const quotes = ((raw.quotes ?? []) as Array<Record<string, unknown>>).map(
    (quote) => ({
      ...quote,
      client: migrateRef(quote.client),
      profileSnapshot: quote.profileSnapshot
        ? {
            ...(quote.profileSnapshot as Record<string, unknown>),
            fiscal: {
              ...((quote.profileSnapshot as Record<string, unknown>)
                .fiscal as Record<string, unknown>),
              activityPhase: 'ordinary',
              reducedEligibilityConfirmed: false,
              ordinaryApplicabilityConfirmed: false,
              reducedSubstituteTaxRate: '5',
              ordinarySubstituteTaxRate:
                (
                  (quote.profileSnapshot as Record<string, unknown>)
                    .fiscal as Record<string, unknown>
                ).substituteTaxRate ?? '15',
              substituteTaxRate: undefined,
            },
          }
        : undefined,
    }),
  );
  const legacyReferences = {
    ...(typeof settings.ficCompanyId === 'string'
      ? { companyId: settings.ficCompanyId }
      : {}),
    ...(typeof settings.ficConsultingProductId === 'string'
      ? { productId: settings.ficConsultingProductId }
      : {}),
  };
  return {
    ...raw,
    schemaVersion: 2,
    profiles,
    sites,
    quotes,
    localClients: [],
    settings: {
      ...(typeof settings.fuelTerritory === 'string'
        ? { fuelTerritory: settings.fuelTerritory }
        : {}),
      fic: {
        enabled: false,
        ...(Object.keys(legacyReferences).length ? { legacyReferences } : {}),
      },
    },
  };
}

function migrateV2Record(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const vehicles = ((raw.vehicles ?? []) as Array<Record<string, unknown>>).map(
    (vehicle) => {
      if (vehicle.consumptionUnit !== 'l/100km') return vehicle;
      const consumption = new Decimal(100)
        .div(String(vehicle.consumption))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toFixed(2);
      return { ...vehicle, consumption, consumptionUnit: 'km/l' };
    },
  );
  return { ...raw, schemaVersion: 3, vehicles };
}

function findV3Blockers(raw: Record<string, unknown>): string[] {
  const blockers: string[] = [];
  if (Array.isArray(raw.localClients) && raw.localClients.length)
    blockers.push(
      'L’archivio contiene Clienti locali, che non possono essere convertiti automaticamente in Clienti Fatture in Cloud.',
    );
  const sites = Array.isArray(raw.sites)
    ? (raw.sites as Array<Record<string, unknown>>)
    : [];
  if (sites.some((site) => site.oneWayKm !== undefined))
    blockers.push(
      'Una o più Sedi contengono oneWayKm, che non identifica una coppia Partenza/Destinazione.',
    );
  if (
    sites.some(
      (site) =>
        (site.client as Record<string, unknown> | undefined)?.source ===
        'local',
    )
  )
    blockers.push('Una o più Sedi fanno riferimento a Clienti locali.');
  const quotes = Array.isArray(raw.quotes)
    ? (raw.quotes as Array<Record<string, unknown>>)
    : [];
  if (
    quotes.some(
      (quote) =>
        (quote.client as Record<string, unknown> | undefined)?.source ===
        'local',
    )
  )
    blockers.push(
      'Uno o più preventivi contengono snapshot di Clienti locali.',
    );
  const hasTravel = quotes.some(
    (quote) =>
      Array.isArray(quote.items) &&
      (quote.items as Array<Record<string, unknown>>).some(
        (item) =>
          Array.isArray(item.subItems) &&
          (item.subItems as Array<Record<string, unknown>>).some(
            (sub) => sub.kind === 'travel',
          ),
      ),
  );
  if (hasTravel)
    blockers.push(
      'Una o più Trasferte usano il precedente modello a Sede singola/velocità media e non possono essere reinterpretate senza inventare dati.',
    );
  return blockers;
}

function migrateV3(raw: Record<string, unknown>): Record<string, unknown> {
  const profiles = ((raw.profiles as Array<Record<string, unknown>>) ?? []).map(
    (profile) => ({
      ...profile,
      capacity: {
        ...(profile.capacity as Record<string, unknown>),
        travelSpeedKmh: undefined,
      },
    }),
  );
  const sites = ((raw.sites as Array<Record<string, unknown>>) ?? []).map(
    ({ oneWayKm: _oneWayKm, ...site }) => site,
  );
  const { localClients: _localClients, ...withoutClients } = raw;
  return {
    ...withoutClients,
    schemaVersion: 4,
    profiles,
    sites,
    settings: {
      ...(raw.settings as Record<string, unknown>),
      defaultDepartureSiteId: undefined,
      defaultVehicleId: undefined,
    },
  };
}

function migrateLegacyDocument(
  raw: Record<string, unknown>,
  fromVersion: number,
): Result<CashDocument> {
  if (fromVersion === 10) {
    const migrated = cashDocumentSchema.safeParse({
      ...raw,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    return migrated.success
      ? ok(migrated.data)
      : err(validationErrorFromIssues(migrated.error.issues));
  }
  const v3 =
    fromVersion === 1
      ? migrateV2Record(migrateV1(raw))
      : fromVersion === 2
        ? migrateV2Record(raw)
        : raw;
  const blockers = fromVersion >= 4 ? [] : findV3Blockers(v3);
  if (blockers.length)
    return err({
      code: 'MIGRATION_REQUIRED',
      source: 'archive',
      message:
        'La migrazione automatica è bloccata per evitare una conversione arbitraria dei dati storici.',
      action:
        'Rimuovi o ricostruisci esplicitamente i dati indicati con una versione precedente di Cash, quindi riprova.',
      details: blockers,
    });
  const v4 = fromVersion >= 4 ? raw : migrateV3(v3);
  const categories = (v4.bankExpenseCategories ?? []) as Array<
    Record<string, unknown>
  >;
  const { financialProvisions: _discardedProvisions, ...withoutProvisions } =
    v4;
  const migrated = cashDocumentSchema.safeParse({
    ...withoutProvisions,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    bankExpenseCategories: categories.some(
      (category) => category.systemRole === 'vat_taxes',
    )
      ? categories
      : [...categories, createTaxCategory()],
  });
  return migrated.success
    ? ok(migrated.data)
    : err(validationErrorFromIssues(migrated.error.issues));
}
