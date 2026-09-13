export const CURRENT_SCHEMA_VERSION = 3;

export interface EntityMeta { id: string; createdAt: string; updatedAt: string }
export type DecimalString = string;

export type CashErrorCode =
  | 'VALIDATION' | 'MISSING_DATA' | 'SOURCE_UNAVAILABLE' | 'SOURCE_INVALID'
  | 'CONFLICT' | 'SCHEMA_NEWER' | 'MIGRATION_REQUIRED' | 'CANCELLED'
  | 'EXPORT_UNCERTAIN' | 'CREDENTIALS' | 'IO';

export interface CashError {
  code: CashErrorCode;
  message: string;
  field?: string;
  source?: 'archive' | 'MIMIT' | 'ISTAT' | 'FattureInCloud' | 'credentials';
  action?: string;
  details?: string[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: CashError };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = never>(error: CashError): Result<T> => ({ ok: false, error });

export interface RecurringHoliday { kind: 'recurring'; name: string; month: number; day: number }
export interface SpecificHoliday { kind: 'specific'; name: string; date: string }
export type LocalHoliday = RecurringHoliday | SpecificHoliday;

export interface FiscalParameters {
  atecoCode: string;
  profitabilityCoefficient: DecimalString;
  contributionRate: DecimalString;
  contributionCeiling: DecimalString;
  activityPhase: 'reduced_eligible' | 'ordinary';
  reducedEligibilityConfirmed: boolean;
  ordinaryApplicabilityConfirmed: boolean;
  reducedSubstituteTaxRate: DecimalString;
  ordinarySubstituteTaxRate: DecimalString;
  ordinaryThreshold: DecimalString;
  cessationThreshold: DecimalString;
}

export interface CapacityParameters {
  hoursPerDay: DecimalString;
  vacationDays: number;
  unplannedDays: number;
  clientTimePercentage: DecimalString;
  localHolidays: LocalHoliday[];
  travelSpeedKmh?: DecimalString;
}

export interface EconomicProfile extends EntityMeta {
  year: number;
  revision: number;
  confirmed: boolean;
  revenueTarget: DecimalString;
  specificAnnualExpenses: DecimalString;
  fiscal: FiscalParameters;
  capacity: CapacityParameters;
}

export interface BusinessCost extends EntityMeta {
  category: string;
  description: string;
  monthlyAmount: DecimalString;
}

export type Fuel = 'Benzina' | 'Gasolio' | 'GPL' | 'Metano';
export type MimitMode = 'SELF' | 'SERVITO';
export interface Vehicle extends EntityMeta {
  name: string;
  fuel: Fuel;
  consumption: DecimalString;
  consumptionUnit: 'km/l' | 'kg/100km';
  annualKm: DecimalString;
  annualInsurance: DecimalString;
  annualTax: DecimalString;
  annualMaintenance: DecimalString;
}

export interface LocalClient extends EntityMeta { displayName: string; vatNumber?: string }
export interface LocalClientRef { source: 'local'; localClientId: string; displayName: string }
export interface FicClientRef { source: 'fatture_in_cloud'; companyId: string; clientId: string; displayName: string }
export type ClientRef = LocalClientRef | FicClientRef;
export interface LocalClientSnapshot extends LocalClientRef { vatNumber?: string }
export interface FicClientSnapshot extends FicClientRef { vatNumber?: string }
export interface FicClientDetailField { key: string; value: string }
export interface FicClientDetails extends FicClientSnapshot { fields: FicClientDetailField[] }
export type ClientSnapshot = LocalClientSnapshot | FicClientSnapshot;
export interface Site extends EntityMeta {
  name: string;
  address: string;
  client?: ClientRef;
  oneWayKm?: DecimalString;
}
export interface SiteSnapshot {
  sourceId: string;
  name: string;
  address: string;
  oneWayKm?: DecimalString;
}

export interface FuelEvidence {
  fuel: Fuel;
  mode: MimitMode;
  territory: string;
  network: 'NON_AUTOSTRADALE';
  price: DecimalString;
  priceUnit: 'EUR/l' | 'EUR/kg';
  referenceDate: string;
  acquiredAt: string;
}

export interface FoiEvidence {
  fromPeriod: string;
  toPeriod: string;
  fromIndex: DecimalString;
  toIndex: DecimalString;
  fromBase: string;
  toBase: string;
  fromLinkFactor: DecimalString;
  toLinkFactor: DecimalString;
  revaluedAmount: DecimalString;
  acquiredAt: string;
}

export interface BaseSubItem extends EntityMeta {
  description: string;
  variantOwner?: { groupId: string; optionId: string; definitionIndex?: number };
  manuallyModified?: boolean;
}
export interface TimeSubItem extends BaseSubItem { kind: 'time'; minutes: number }
export interface ExpenseSubItem extends BaseSubItem { kind: 'expense'; amount: DecimalString }
export interface TravelSubItem extends BaseSubItem {
  kind: 'travel';
  site: SiteSnapshot;
  vehicleId: string;
  roundTrip: boolean;
  occurrences: number;
  timeMode: 'automatic' | 'manual';
  manualMinutesPerOccurrence?: number;
  totalMinutes: number;
  totalDistanceKm: DecimalString;
  vehicleCostPerKm: DecimalString;
  totalCost: DecimalString;
  fuelEvidence: FuelEvidence;
}
export type QuoteSubItem = TimeSubItem | ExpenseSubItem | TravelSubItem;

export type ReusableSubItem =
  | (EntityMeta & { kind: 'time'; description: string; minutes: number })
  | (EntityMeta & { kind: 'expense'; description: string; amount: DecimalString })
  | (EntityMeta & { kind: 'travel'; description: string; roundTrip: boolean; occurrences: number;
      timeMode: 'automatic' | 'manual'; manualMinutesPerOccurrence?: number });

export type SubItemDefinition =
  | { kind: 'time'; description: string; minutes: number }
  | { kind: 'expense'; description: string; amount: DecimalString }
  | { kind: 'travel'; description: string; roundTrip: boolean; occurrences: number;
      timeMode: 'automatic' | 'manual'; manualMinutesPerOccurrence?: number };
export interface VariantOption extends EntityMeta { name: string; subItems: SubItemDefinition[] }
export interface VariantGroup extends EntityMeta {
  name: string;
  options: VariantOption[];
  defaultOptionId?: string;
}

export interface PriceReference { amount: DecimalString; period: string; foiEvidence?: FoiEvidence }
export interface TemplateItem extends EntityMeta {
  name: string;
  referencePrice?: { amount: DecimalString; period: string };
  subItems: ReusableSubItem[];
  variantGroups: VariantGroup[];
}
export interface Template extends EntityMeta { name: string; items: TemplateItem[] }
export interface Catalog { subItems: ReusableSubItem[]; templates: Template[] }

export interface ProfileSnapshot {
  sourceId: string;
  year: number;
  revision: number;
  revenueTarget: DecimalString;
  specificAnnualExpenses: DecimalString;
  revenueFromTime: DecimalString;
  availableClientMinutes: number;
  hourlyTarget: DecimalString;
  fiscal: FiscalParameters;
}

export interface VariantSelection { groupId: string; optionId: string }
export interface QuoteItem extends EntityMeta {
  name: string;
  subItems: QuoteSubItem[];
  variantGroups: VariantGroup[];
  variantSelections: VariantSelection[];
  referencePrice?: PriceReference;
  chosenPrice?: DecimalString;
}

export type ExportOutcome = 'pending' | 'success' | 'rejected' | 'uncertain';
export interface ExportLine { itemIds: string[]; description: string; amount: DecimalString; quantity: 1 }
export interface ExportAttempt extends EntityMeta {
  companyId: string;
  lines: ExportLine[];
  payloadHash: string;
  outcome: ExportOutcome;
  remoteDocumentId?: string;
  diagnostic?: string;
}

export interface Quote extends EntityMeta {
  date: string;
  profileId?: string;
  profileSnapshot?: ProfileSnapshot;
  client?: ClientSnapshot;
  mainSite?: SiteSnapshot;
  items: QuoteItem[];
  commission?: DecimalString;
  snapshotRevision: number;
  snapshotUpdatedAt?: string;
  exportAttempts: ExportAttempt[];
}

export interface SharedSettings {
  fuelTerritory?: string;
  fic: {
    enabled: boolean;
    company?: { id: string; name: string };
    product?: { id: string; name: string };
    taxProfile?: FicTaxProfileSnapshot;
    legacyReferences?: { companyId?: string; productId?: string };
    lastVerification?: { at: string; result: 'success' | 'error'; diagnostic?: string };
  };
}

export interface FicTaxProfileSnapshot {
  acquiredAt: string;
  companyType?: string;
  companySubtype?: string;
  profession?: string;
  regime?: string;
  profitCoefficient?: DecimalString;
  contributionsPercentage?: DecimalString;
  defaultVat?: { id: string; value?: number; description?: string };
}

export interface CashDocument {
  schemaVersion: number;
  documentId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  settings: SharedSettings;
  profiles: EconomicProfile[];
  localClients: LocalClient[];
  businessCosts: BusinessCost[];
  vehicles: Vehicle[];
  sites: Site[];
  catalog: Catalog;
  quotes: Quote[];
}

export const nowIso = (): string => new Date().toISOString();
export const newId = (): string => globalThis.crypto.randomUUID();
export const meta = (): EntityMeta => { const time = nowIso(); return { id: newId(), createdAt: time, updatedAt: time }; };

export const modeForFuel = (fuel: Fuel): MimitMode =>
  fuel === 'Benzina' || fuel === 'Gasolio' ? 'SELF' : 'SERVITO';

export const createEmptyDocument = (now = nowIso()): CashDocument => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  documentId: newId(),
  revision: 1,
  createdAt: now,
  updatedAt: now,
  settings: { fic: { enabled: false } },
  profiles: [],
  localClients: [],
  businessCosts: [],
  vehicles: [],
  sites: [],
  catalog: { subItems: [], templates: [] },
  quotes: [],
});

export const createFiscalPreset2026 = (): EconomicProfile => ({
  ...meta(), year: 2026, revision: 1, confirmed: false, revenueTarget: '0.00',
  specificAnnualExpenses: '0.00',
  fiscal: {
    atecoCode: '62.20.10', profitabilityCoefficient: '67', contributionRate: '26.07',
    contributionCeiling: '122295.00', activityPhase: 'ordinary', reducedEligibilityConfirmed: false,
    ordinaryApplicabilityConfirmed: false, reducedSubstituteTaxRate: '5', ordinarySubstituteTaxRate: '15', ordinaryThreshold: '85000.00',
    cessationThreshold: '100000.00',
  },
  capacity: { hoursPerDay: '8', vacationDays: 20, unplannedDays: 5, clientTimePercentage: '60', localHolidays: [] },
});

export const createBlankProfile = (year: number): EconomicProfile => ({
  ...meta(), year, revision: 1, confirmed: false, revenueTarget: '0.00', specificAnnualExpenses: '0.00',
  fiscal: { atecoCode: '', profitabilityCoefficient: '0', contributionRate: '0', contributionCeiling: '0.00',
    activityPhase: 'ordinary', reducedEligibilityConfirmed: false, ordinaryApplicabilityConfirmed: false,
    reducedSubstituteTaxRate: '0', ordinarySubstituteTaxRate: '0', ordinaryThreshold: '0.00', cessationThreshold: '0.00' },
  capacity: { hoursPerDay: '0', vacationDays: 0, unplannedDays: 0, clientTimePercentage: '0', localHolidays: [] },
});
