import { z } from 'zod';
import Decimal from 'decimal.js';
import { CURRENT_SCHEMA_VERSION, type CashDocument, type CashError } from './model';

type ValidationIssue = { path: PropertyKey[]; code: string; message: string };
const pathLabels:Record<string,string>={
  vehicles:'Veicoli',businessCosts:'Costi aziendali',sites:'Sedi',profiles:'Profili',quotes:'Preventivi',localClients:'Clienti',catalog:'Catalogo',settings:'Impostazioni',
  name:'nome',displayName:'denominazione',category:'categoria',description:'descrizione',address:'indirizzo',consumption:'consumo',annualKm:'km annui',
  annualInsurance:'assicurazione annua',annualTax:'bollo annuo',annualMaintenance:'manutenzione annua',monthlyAmount:'importo mensile',
  revenueTarget:'fatturato obiettivo',specificAnnualExpenses:'spese specifiche annue',contributionCeiling:'massimale contributivo',
  ordinaryThreshold:'soglia ordinaria',cessationThreshold:'soglia di cessazione',year:'anno',fiscal:'parametri fiscali',capacity:'capacità lavorativa',
};

const issueLocation = (path: PropertyKey[]): string => path.map((part,index)=>{
  if(typeof part==='number')return `${part+1}`;
  const label=pathLabels[String(part)]??String(part);
  return index===0?label:`${label}`;
}).join(' · ');

export function validationErrorFromIssues(issues: readonly ValidationIssue[]): CashError {
  const details=issues.slice(0,8).map(issue=>{
    const location=issueLocation(issue.path);
    const message=issue.code==='too_small'&&['name','displayName','category','description','address'].includes(String(issue.path.at(-1)))
      ? 'campo obbligatorio' : issue.message;
    return location?`${location}: ${message}`:message;
  });
  return {code:'VALIDATION',source:'archive',message:'Alcuni dati non sono validi.',action:'Correggi i campi indicati: le modifiche non valide non verranno salvate.',details};
}

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const decimal = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, 'decimale non valido');
const boundedDecimal = (maxDecimals:number, min?:string, max?:string, exclusiveMin=false) => decimal.superRefine((value,ctx)=>{
  const parsed=new Decimal(value);if(parsed.decimalPlaces()>maxDecimals)ctx.addIssue({code:'custom',message:`massimo ${maxDecimals} decimali`});
  if(min!==undefined&&(exclusiveMin?parsed.lte(min):parsed.lt(min)))ctx.addIssue({code:'custom',message:'valore sotto il minimo'});
  if(max!==undefined&&parsed.gt(max))ctx.addIssue({code:'custom',message:'valore sopra il massimo'});
});
const moneyInput=boundedDecimal(2,'0');const percentage=boundedDecimal(4,'0','100');
const distance=boundedDecimal(1,'0');const positiveConsumption=boundedDecimal(2,'0',undefined,true);const perKmValue=boundedDecimal(6,'0');
const entity = { id: uuid, createdAt: iso, updatedAt: iso };
const localClientRefSchema = z.object({ source: z.literal('local'), localClientId: uuid, displayName: z.string().min(1) });
const ficClientRefSchema = z.object({ source: z.literal('fatture_in_cloud'), companyId: z.string().min(1), clientId: z.string().min(1), displayName: z.string().min(1) });
const clientRefSchema = z.discriminatedUnion('source', [localClientRefSchema, ficClientRefSchema]);
const clientSnapshotSchema = z.discriminatedUnion('source', [
  localClientRefSchema.extend({ vatNumber: z.string().optional() }),
  ficClientRefSchema.extend({ vatNumber: z.string().optional() }),
]);
const siteSnapshotSchema = z.object({ sourceId: uuid, name: z.string().min(1), address: z.string().min(1), oneWayKm: decimal.optional() });
const fuel = z.enum(['Benzina', 'Gasolio', 'GPL', 'Metano']);

export const fuelEvidenceSchema = z.object({
  fuel, mode: z.enum(['SELF', 'SERVITO']), territory: z.string().min(1),
  network: z.literal('NON_AUTOSTRADALE'), price: boundedDecimal(3,'0',undefined,true), priceUnit: z.enum(['EUR/l', 'EUR/kg']),
  referenceDate: z.string().date(), acquiredAt: iso,
});

export const foiEvidenceSchema = z.object({
  fromPeriod: z.string().regex(/^\d{4}-\d{2}$/), toPeriod: z.string().regex(/^\d{4}-\d{2}$/),
  fromIndex: decimal, toIndex: decimal, fromBase: z.string().min(1), toBase: z.string().min(1),
  fromLinkFactor: decimal, toLinkFactor: decimal, revaluedAmount: decimal, acquiredAt: iso,
});

const variantOwner = z.object({ groupId: uuid, optionId: uuid, definitionIndex: z.number().int().nonnegative().optional() });
const baseSub = { ...entity, description: z.string().min(1), variantOwner: variantOwner.optional(), manuallyModified: z.boolean().optional() };
const quoteTravelSchema = z.object({ ...baseSub, kind: z.literal('travel'), site: siteSnapshotSchema, vehicleId: uuid,
  roundTrip: z.boolean(), occurrences: z.number().int().positive(), timeMode: z.enum(['automatic', 'manual']),
  manualMinutesPerOccurrence: z.number().int().positive().optional(), totalMinutes: z.number().int().positive(),
  totalDistanceKm: distance, vehicleCostPerKm: perKmValue, totalCost: moneyInput, fuelEvidence: fuelEvidenceSchema })
  .superRefine((travel,ctx)=>{if(travel.timeMode==='manual'&&travel.manualMinutesPerOccurrence===undefined)ctx.addIssue({code:'custom',path:['manualMinutesPerOccurrence'],message:'minuti manuali obbligatori in modalità manuale'});});
export const quoteSubItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...baseSub, kind: z.literal('time'), minutes: z.number().int().positive() }),
  z.object({ ...baseSub, kind: z.literal('expense'), amount: moneyInput }),
  quoteTravelSchema,
]);

const reusableTravelSchema=z.object({ ...entity, kind: z.literal('travel'), description: z.string().min(1), roundTrip: z.boolean(),
  occurrences: z.number().int().positive(), timeMode: z.enum(['automatic', 'manual']), manualMinutesPerOccurrence: z.number().int().positive().optional() })
  .superRefine((travel,ctx)=>{if(travel.timeMode==='manual'&&travel.manualMinutesPerOccurrence===undefined)ctx.addIssue({code:'custom',path:['manualMinutesPerOccurrence'],message:'minuti manuali obbligatori in modalità manuale'});});
const reusableSubItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...entity, kind: z.literal('time'), description: z.string().min(1), minutes: z.number().int().positive() }),
  z.object({ ...entity, kind: z.literal('expense'), description: z.string().min(1), amount: moneyInput }),
  reusableTravelSchema,
]);
const definitionTravelSchema=z.object({ kind: z.literal('travel'), description: z.string().min(1), roundTrip: z.boolean(),
  occurrences: z.number().int().positive(), timeMode: z.enum(['automatic', 'manual']), manualMinutesPerOccurrence: z.number().int().positive().optional() })
  .superRefine((travel,ctx)=>{if(travel.timeMode==='manual'&&travel.manualMinutesPerOccurrence===undefined)ctx.addIssue({code:'custom',path:['manualMinutesPerOccurrence'],message:'minuti manuali obbligatori in modalità manuale'});});
const definitionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('time'), description: z.string().min(1), minutes: z.number().int().positive() }),
  z.object({ kind: z.literal('expense'), description: z.string().min(1), amount: moneyInput }),
  definitionTravelSchema,
]);
const variantOptionSchema = z.object({ ...entity, name: z.string().min(1), subItems: z.array(definitionSchema) });
const variantGroupSchema = z.object({ ...entity, name: z.string().min(1), options: z.array(variantOptionSchema).min(1), defaultOptionId: uuid.optional() })
  .superRefine((group,ctx)=>{
    const names=new Set<string>();
    for(const [index,option] of group.options.entries()){
      const key=option.name.trim().toLocaleLowerCase('it');
      if(names.has(key))ctx.addIssue({code:'custom',path:['options',index,'name'],message:'nome opzione duplicato nel gruppo'});
      names.add(key);
    }
    if(group.defaultOptionId&&!group.options.some(option=>option.id===group.defaultOptionId))
      ctx.addIssue({code:'custom',path:['defaultOptionId'],message:'opzione predefinita non appartenente al gruppo'});
  });
const variantGroupsSchema=z.array(variantGroupSchema).superRefine((groups,ctx)=>{const names=new Set<string>();for(const [index,group] of groups.entries()){const key=group.name.trim().toLocaleLowerCase('it');if(names.has(key))ctx.addIssue({code:'custom',path:[index,'name'],message:'nome gruppo variante duplicato'});names.add(key);}});

const fiscalSchema = z.object({ atecoCode: z.string(), profitabilityCoefficient: percentage,
  contributionRate: percentage, contributionCeiling: moneyInput, activityPhase: z.enum(['reduced_eligible', 'ordinary']),
  reducedEligibilityConfirmed: z.boolean(), ordinaryApplicabilityConfirmed: z.boolean(),
  reducedSubstituteTaxRate: percentage, ordinarySubstituteTaxRate: percentage,
  ordinaryThreshold: moneyInput, cessationThreshold: moneyInput });
const holidaySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('recurring'), name: z.string().min(1), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
  z.object({ kind: z.literal('specific'), name: z.string().min(1), date: z.string().date() }),
]);
const capacitySchema = z.object({ hoursPerDay: boundedDecimal(4,'0','24'), vacationDays: z.number().int().nonnegative(),
  unplannedDays: z.number().int().nonnegative(), clientTimePercentage: percentage,
  localHolidays: z.array(holidaySchema), travelSpeedKmh: boundedDecimal(4,'0',undefined,true).optional() });
export const profileSchema = z.object({ ...entity, year: z.number().int().min(2000).max(2200), revision: z.number().int().positive(),
  confirmed: z.boolean(), revenueTarget: moneyInput, specificAnnualExpenses: moneyInput, fiscal: fiscalSchema, capacity: capacitySchema })
  .superRefine((profile,ctx)=>{
    if(new Decimal(profile.fiscal.cessationThreshold).lt(profile.fiscal.ordinaryThreshold))
      ctx.addIssue({code:'custom',path:['fiscal','cessationThreshold'],message:'la soglia di cessazione deve essere almeno pari alla soglia ordinaria'});
    if(!profile.confirmed)return;
    if(!profile.fiscal.atecoCode.trim())ctx.addIssue({code:'custom',path:['fiscal','atecoCode'],message:'ATECO obbligatorio per un profilo confermato'});
    if(profile.fiscal.activityPhase==='reduced_eligible'&&!profile.fiscal.reducedEligibilityConfirmed)
      ctx.addIssue({code:'custom',path:['fiscal','reducedEligibilityConfirmed'],message:'conferma aliquota ridotta obbligatoria'});
    const revenue=new Decimal(profile.revenueTarget);const ordinary=new Decimal(profile.fiscal.ordinaryThreshold);const cessation=new Decimal(profile.fiscal.cessationThreshold);
    if(profile.fiscal.activityPhase==='ordinary'&&revenue.gt(ordinary)&&revenue.lte(cessation)&&!profile.fiscal.ordinaryApplicabilityConfirmed)
      ctx.addIssue({code:'custom',path:['fiscal','ordinaryApplicabilityConfirmed'],message:'conferma applicabilità oltre soglia obbligatoria'});
  });

const profileSnapshotSchema = z.object({ sourceId: uuid, year: z.number().int(), revision: z.number().int().positive(),
  revenueTarget: decimal, specificAnnualExpenses: decimal, revenueFromTime: decimal,
  availableClientMinutes: z.number().int().positive(), hourlyTarget: decimal, fiscal: fiscalSchema });
const priceReferenceSchema = z.object({ amount: moneyInput, period: z.string().regex(/^\d{4}-\d{2}$/), foiEvidence: foiEvidenceSchema.optional() });
const quoteItemSchema = z.object({ ...entity, name: z.string().min(1), subItems: z.array(quoteSubItemSchema),
  variantGroups: variantGroupsSchema, variantSelections: z.array(z.object({ groupId: uuid, optionId: uuid })),
  referencePrice: priceReferenceSchema.optional(), chosenPrice: moneyInput.optional() }).superRefine((item,ctx)=>{const selected=new Set<string>();for(const [index,selection] of item.variantSelections.entries()){const group=item.variantGroups.find(candidate=>candidate.id===selection.groupId);if(!group?.options.some(option=>option.id===selection.optionId))ctx.addIssue({code:'custom',path:['variantSelections',index],message:'selezione variante non appartenente alla voce'});if(selected.has(selection.groupId))ctx.addIssue({code:'custom',path:['variantSelections',index],message:'gruppo variante selezionato più volte'});selected.add(selection.groupId);}});
const exportLineSchema = z.object({ itemIds: z.array(uuid).min(1), description: z.string().min(1), amount: moneyInput, quantity: z.literal(1) });
const exportAttemptSchema = z.object({ ...entity, companyId: z.string().min(1), lines: z.array(exportLineSchema).min(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/), outcome: z.enum(['pending', 'success', 'rejected', 'uncertain']),
  remoteDocumentId: z.string().optional(), diagnostic: z.string().optional() });

const templateItemSchema = z.object({ ...entity, name: z.string().min(1),
  referencePrice: z.object({ amount: moneyInput, period: z.string().regex(/^\d{4}-\d{2}$/) }).optional(),
  subItems: z.array(reusableSubItemSchema), variantGroups: variantGroupsSchema });
const templateSchema = z.object({ ...entity, name: z.string().min(1), items: z.array(templateItemSchema).min(1) });

export const cashDocumentSchema: z.ZodType<CashDocument> = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION), documentId: uuid, revision: z.number().int().positive(),
  createdAt: iso, updatedAt: iso,
  settings: z.object({ fuelTerritory: z.string().min(1).optional(), fic: z.object({ enabled: z.boolean(),
    company: z.object({ id: z.string().min(1), name: z.string().min(1) }).optional(),
    product: z.object({ id: z.string().min(1), name: z.string().min(1) }).optional(),
    taxProfile: z.object({ acquiredAt: iso, companyType: z.string().optional(), companySubtype: z.string().optional(),
      profession: z.string().optional(), regime: z.string().optional(), profitCoefficient: decimal.optional(),
      contributionsPercentage: decimal.optional(), defaultVat: z.object({ id: z.string().min(1), value: z.number().optional(),
        description: z.string().optional() }).optional() }).optional(),
    legacyReferences: z.object({ companyId: z.string().min(1).optional(), productId: z.string().min(1).optional() }).optional(),
    lastVerification: z.object({ at: iso, result: z.enum(['success', 'error']), diagnostic: z.string().optional() }).optional() }) }),
  profiles: z.array(profileSchema),
  localClients: z.array(z.object({ ...entity, displayName: z.string().trim().min(1), vatNumber: z.string().optional() })),
  businessCosts: z.array(z.object({ ...entity, category: z.string().min(1), description: z.string().min(1), monthlyAmount: moneyInput })),
  vehicles: z.array(z.object({ ...entity, name: z.string().min(1), fuel, consumption: positiveConsumption,
    consumptionUnit: z.enum(['km/l', 'kg/100km']), annualKm: boundedDecimal(1,'0',undefined,true), annualInsurance: moneyInput,
    annualTax: moneyInput, annualMaintenance: moneyInput })),
  sites: z.array(z.object({ ...entity, name: z.string().min(1), address: z.string().min(1), client: clientRefSchema.optional(), oneWayKm: distance.optional() })),
  catalog: z.object({ subItems: z.array(reusableSubItemSchema), templates: z.array(templateSchema) }),
  quotes: z.array(z.object({ ...entity, date: z.string().date(), profileId: uuid.optional(), profileSnapshot: profileSnapshotSchema.optional(),
    client: clientSnapshotSchema.optional(), mainSite: siteSnapshotSchema.optional(), items: z.array(quoteItemSchema),
  commission: moneyInput.optional(), snapshotRevision: z.number().int().nonnegative(), snapshotUpdatedAt: iso.optional(),
    exportAttempts: z.array(exportAttemptSchema) })),
}).superRefine((document,ctx)=>{
  const years=new Set<number>();
  for(const [index,profile] of document.profiles.entries()){
    if(years.has(profile.year))ctx.addIssue({code:'custom',path:['profiles',index,'year'],message:'esiste già un profilo per questo anno'});
    years.add(profile.year);
  }
  if(document.settings.fic.enabled&&(!document.settings.fic.company||!document.settings.fic.product))
    ctx.addIssue({code:'custom',path:['settings','fic'],message:'azienda e prodotto Consulenza sono obbligatori quando Fatture in Cloud è attivo'});
  const localIds=new Set(document.localClients.map(client=>client.id));
  for(const [index,site] of document.sites.entries())if(site.client?.source==='local'&&!localIds.has(site.client.localClientId))
    ctx.addIssue({code:'custom',path:['sites',index,'client'],message:'Cliente locale referenziato inesistente'});
});

export const documentHeaderSchema = z.object({ schemaVersion: z.number().int().positive(), documentId: uuid,
  revision: z.number().int().positive(), createdAt: iso, updatedAt: iso });

export function parseDocument(input: unknown): CashDocument {
  return cashDocumentSchema.parse(input);
}
