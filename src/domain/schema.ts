import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, type CashDocument } from './model';

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const decimal = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, 'decimale non valido');
const entity = { id: uuid, createdAt: iso, updatedAt: iso };
const clientRefSchema = z.object({ companyId: z.string().min(1), clientId: z.string().min(1), displayName: z.string().min(1) });
const siteSnapshotSchema = z.object({ sourceId: uuid, name: z.string().min(1), address: z.string().min(1), oneWayKm: decimal.optional() });
const fuel = z.enum(['Benzina', 'Gasolio', 'GPL', 'Metano']);

export const fuelEvidenceSchema = z.object({
  fuel, mode: z.enum(['SELF', 'SERVITO']), territory: z.string().min(1),
  network: z.literal('NON_AUTOSTRADALE'), price: decimal, priceUnit: z.enum(['EUR/l', 'EUR/kg']),
  referenceDate: z.string().date(), acquiredAt: iso,
});

export const foiEvidenceSchema = z.object({
  fromPeriod: z.string().regex(/^\d{4}-\d{2}$/), toPeriod: z.string().regex(/^\d{4}-\d{2}$/),
  fromIndex: decimal, toIndex: decimal, fromBase: z.string().min(1), toBase: z.string().min(1),
  fromLinkFactor: decimal, toLinkFactor: decimal, revaluedAmount: decimal, acquiredAt: iso,
});

const variantOwner = z.object({ groupId: uuid, optionId: uuid });
const baseSub = { ...entity, description: z.string().min(1), variantOwner: variantOwner.optional(), manuallyModified: z.boolean().optional() };
export const quoteSubItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...baseSub, kind: z.literal('time'), minutes: z.number().int().positive() }),
  z.object({ ...baseSub, kind: z.literal('expense'), amount: decimal }),
  z.object({ ...baseSub, kind: z.literal('travel'), site: siteSnapshotSchema, vehicleId: uuid,
    roundTrip: z.boolean(), occurrences: z.number().int().positive(), timeMode: z.enum(['automatic', 'manual']),
    manualMinutesPerOccurrence: z.number().int().positive().optional(), totalMinutes: z.number().int().positive(),
    totalDistanceKm: decimal, vehicleCostPerKm: decimal, totalCost: decimal, fuelEvidence: fuelEvidenceSchema }),
]);

const reusableSubItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...entity, kind: z.literal('time'), description: z.string().min(1), minutes: z.number().int().positive() }),
  z.object({ ...entity, kind: z.literal('expense'), description: z.string().min(1), amount: decimal }),
  z.object({ ...entity, kind: z.literal('travel'), description: z.string().min(1), roundTrip: z.boolean(),
    occurrences: z.number().int().positive(), timeMode: z.enum(['automatic', 'manual']),
    manualMinutesPerOccurrence: z.number().int().positive().optional() }),
]);
const definitionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('time'), description: z.string().min(1), minutes: z.number().int().positive() }),
  z.object({ kind: z.literal('expense'), description: z.string().min(1), amount: decimal }),
  z.object({ kind: z.literal('travel'), description: z.string().min(1), roundTrip: z.boolean(),
    occurrences: z.number().int().positive(), timeMode: z.enum(['automatic', 'manual']),
    manualMinutesPerOccurrence: z.number().int().positive().optional() }),
]);
const variantOptionSchema = z.object({ ...entity, name: z.string().min(1), subItems: z.array(definitionSchema) });
const variantGroupSchema = z.object({ ...entity, name: z.string().min(1), options: z.array(variantOptionSchema).min(1), defaultOptionId: uuid.optional() });

const fiscalSchema = z.object({ atecoCode: z.string().min(1), profitabilityCoefficient: decimal,
  contributionRate: decimal, contributionCeiling: decimal, substituteTaxRate: decimal,
  ordinaryThreshold: decimal, cessationThreshold: decimal });
const holidaySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('recurring'), name: z.string().min(1), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
  z.object({ kind: z.literal('specific'), name: z.string().min(1), date: z.string().date() }),
]);
const capacitySchema = z.object({ hoursPerDay: decimal, vacationDays: z.number().int().nonnegative(),
  unplannedDays: z.number().int().nonnegative(), clientTimePercentage: decimal,
  localHolidays: z.array(holidaySchema), travelSpeedKmh: decimal.optional() });
export const profileSchema = z.object({ ...entity, year: z.number().int().min(2000).max(2200), revision: z.number().int().positive(),
  confirmed: z.boolean(), revenueTarget: decimal, specificAnnualExpenses: decimal, fiscal: fiscalSchema, capacity: capacitySchema });

const profileSnapshotSchema = z.object({ sourceId: uuid, year: z.number().int(), revision: z.number().int().positive(),
  revenueTarget: decimal, specificAnnualExpenses: decimal, revenueFromTime: decimal,
  availableClientMinutes: z.number().int().positive(), hourlyTarget: decimal, fiscal: fiscalSchema });
const priceReferenceSchema = z.object({ amount: decimal, period: z.string().regex(/^\d{4}-\d{2}$/), foiEvidence: foiEvidenceSchema.optional() });
const quoteItemSchema = z.object({ ...entity, name: z.string().min(1), subItems: z.array(quoteSubItemSchema),
  variantGroups: z.array(variantGroupSchema), variantSelections: z.array(z.object({ groupId: uuid, optionId: uuid })),
  referencePrice: priceReferenceSchema.optional(), chosenPrice: decimal.optional() });
const exportLineSchema = z.object({ itemIds: z.array(uuid).min(1), description: z.string().min(1), amount: decimal, quantity: z.literal(1) });
const exportAttemptSchema = z.object({ ...entity, companyId: z.string().min(1), lines: z.array(exportLineSchema).min(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/), outcome: z.enum(['pending', 'success', 'rejected', 'uncertain']),
  remoteDocumentId: z.string().optional(), diagnostic: z.string().optional() });

const templateItemSchema = z.object({ ...entity, name: z.string().min(1),
  referencePrice: z.object({ amount: decimal, period: z.string().regex(/^\d{4}-\d{2}$/) }).optional(),
  subItems: z.array(reusableSubItemSchema), variantGroups: z.array(variantGroupSchema) });
const templateSchema = z.object({ ...entity, name: z.string().min(1), items: z.array(templateItemSchema).min(1) });

export const cashDocumentSchema: z.ZodType<CashDocument> = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION), documentId: uuid, revision: z.number().int().positive(),
  createdAt: iso, updatedAt: iso,
  settings: z.object({ fuelTerritory: z.string().min(1).optional(), ficCompanyId: z.string().min(1).optional(), ficConsultingProductId: z.string().min(1).optional() }),
  profiles: z.array(profileSchema),
  businessCosts: z.array(z.object({ ...entity, category: z.string().min(1), description: z.string().min(1), monthlyAmount: decimal })),
  vehicles: z.array(z.object({ ...entity, name: z.string().min(1), fuel, consumption: decimal,
    consumptionUnit: z.enum(['l/100km', 'kg/100km']), annualKm: decimal, annualInsurance: decimal,
    annualTax: decimal, annualMaintenance: decimal })),
  sites: z.array(z.object({ ...entity, name: z.string().min(1), address: z.string().min(1), client: clientRefSchema.optional(), oneWayKm: decimal.optional() })),
  catalog: z.object({ subItems: z.array(reusableSubItemSchema), templates: z.array(templateSchema) }),
  quotes: z.array(z.object({ ...entity, date: z.string().date(), profileId: uuid.optional(), profileSnapshot: profileSnapshotSchema.optional(),
    client: clientRefSchema.extend({ vatNumber: z.string() }).optional(), mainSite: siteSnapshotSchema.optional(), items: z.array(quoteItemSchema),
    commission: decimal.optional(), snapshotRevision: z.number().int().nonnegative(), snapshotUpdatedAt: iso.optional(),
    exportAttempts: z.array(exportAttemptSchema) })),
});

export const documentHeaderSchema = z.object({ schemaVersion: z.number().int().positive(), documentId: uuid,
  revision: z.number().int().positive(), createdAt: iso, updatedAt: iso });

export function parseDocument(input: unknown): CashDocument {
  return cashDocumentSchema.parse(input);
}
