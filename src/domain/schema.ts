import Decimal from 'decimal.js';
import { z } from 'zod';
import { isYearMonth } from './calendar';
import {
  CURRENT_SCHEMA_VERSION,
  type CashDocument,
  type CashError,
} from './model';
import {
  bankExpenseIdentity,
  normalizeBankDescription,
  normalizeBankRuleText,
} from './bank-expenses';

type ValidationIssue = { path: PropertyKey[]; code: string; message: string };
const pathLabels: Record<string, string> = {
  bankExpenses: 'Movimenti bancari',
  bankExpenseCategories: 'Categorie spese',
  bankExpenseRules: 'Regole automatiche',
  categoryIds: 'categorie manuali',
  matchText: 'testo da riconoscere',
  categoryId: 'categoria',
  parentId: 'categoria principale',
  vehicles: 'Veicoli',
  businessCosts: 'Costi aziendali',
  sites: 'Sedi',
  profiles: 'Profili',
  quotes: 'Preventivi',
  catalog: 'Catalogo',
  settings: 'Impostazioni',
  name: 'nome',
  displayName: 'denominazione',
  category: 'categoria',
  description: 'descrizione',
  address: 'indirizzo',
  coordinates: 'coordinate',
  consumption: 'consumo',
  annualKm: 'km annui',
  annualInsurance: 'assicurazione annua',
  annualTax: 'bollo annuo',
  annualMaintenance: 'manutenzione annua',
  monthlyAmount: 'importo mensile',
  revenueTarget: 'fatturato obiettivo',
  specificAnnualExpenses: 'spese specifiche annue',
  contributionCeiling: 'massimale contributivo',
  ordinaryThreshold: 'soglia ordinaria',
  cessationThreshold: 'soglia di cessazione',
  year: 'anno',
  fiscal: 'parametri fiscali',
  capacity: 'capacità lavorativa',
};

const issueLocation = (path: PropertyKey[]): string =>
  path
    .map((part) =>
      typeof part === 'number'
        ? `${part + 1}`
        : (pathLabels[String(part)] ?? String(part)),
    )
    .join(' · ');

export function validationErrorFromIssues(
  issues: readonly ValidationIssue[],
): CashError {
  const details = issues.slice(0, 8).map((issue) => {
    const location = issueLocation(issue.path);
    const message =
      issue.code === 'too_small' &&
      ['name', 'displayName', 'category', 'description'].includes(
        String(issue.path.at(-1)),
      )
        ? 'campo obbligatorio'
        : issue.message;
    return location ? `${location}: ${message}` : message;
  });
  return {
    code: 'VALIDATION',
    source: 'archive',
    message: 'Alcuni dati non sono validi.',
    action:
      'Correggi i campi indicati: le modifiche non valide non verranno salvate.',
    details,
  };
}

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const period = z.string().refine(isYearMonth, 'periodo YYYY-MM non valido');
const decimal = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, 'decimale non valido');
const boundedDecimal = (
  maxDecimals: number,
  min?: string,
  max?: string,
  exclusiveMin = false,
) =>
  decimal.superRefine((value, ctx) => {
    const parsed = new Decimal(value);
    if (parsed.decimalPlaces() > maxDecimals)
      ctx.addIssue({
        code: 'custom',
        message: `massimo ${maxDecimals} decimali`,
      });
    if (min !== undefined && (exclusiveMin ? parsed.lte(min) : parsed.lt(min)))
      ctx.addIssue({ code: 'custom', message: 'valore sotto il minimo' });
    if (max !== undefined && parsed.gt(max))
      ctx.addIssue({ code: 'custom', message: 'valore sopra il massimo' });
  });
const moneyInput = boundedDecimal(2, '0');
const percentage = boundedDecimal(4, '0', '100');
const distance = boundedDecimal(1, '0');
const coordinate = boundedDecimal(7);
const positiveConsumption = boundedDecimal(2, '0', undefined, true);
const perKmValue = boundedDecimal(6, '0');
const entity = { id: uuid, createdAt: iso, updatedAt: iso };
const ficClientRefSchema = z.object({
  source: z.literal('fatture_in_cloud'),
  companyId: z.string().min(1),
  clientId: z.string().min(1),
  displayName: z.string().min(1),
});
const clientSnapshotSchema = ficClientRefSchema.extend({
  vatNumber: z.string().optional(),
});
const coordinatesSchema = z
  .object({ longitude: coordinate, latitude: coordinate })
  .superRefine((value, ctx) => {
    if (
      new Decimal(value.longitude).lt(-180) ||
      new Decimal(value.longitude).gt(180)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['longitude'],
        message: 'longitudine fuori intervallo',
      });
    if (
      new Decimal(value.latitude).lt(-90) ||
      new Decimal(value.latitude).gt(90)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['latitude'],
        message: 'latitudine fuori intervallo',
      });
  });
const resolvedLocationSchema = z.object({
  coordinates: coordinatesSchema,
  inputKind: z.enum(['address', 'coordinates']),
  inputValue: z.string().min(1),
});
const siteSnapshotSchema = z.object({
  sourceId: uuid,
  name: z.string().min(1),
  address: z.string().min(1).optional(),
  coordinates: coordinatesSchema.optional(),
});
const fuel = z.enum(['Benzina', 'Gasolio', 'GPL', 'Metano']);

export const fuelEvidenceSchema = z.object({
  fuel,
  mode: z.enum(['SELF', 'SERVITO']),
  territory: z.string().min(1),
  network: z.literal('NON_AUTOSTRADALE'),
  price: boundedDecimal(3, '0', undefined, true),
  priceUnit: z.enum(['EUR/l', 'EUR/kg']),
  referenceDate: z.string().date(),
  acquiredAt: iso,
});
export const foiEvidenceSchema = z.object({
  fromPeriod: period,
  toPeriod: period,
  fromIndex: decimal,
  toIndex: decimal,
  fromBase: z.string().min(1),
  toBase: z.string().min(1),
  fromLinkFactor: decimal,
  toLinkFactor: decimal,
  revaluedAmount: decimal,
  acquiredAt: iso,
});

const variantOwner = z.object({
  groupId: uuid,
  optionId: uuid,
  definitionIndex: z.number().int().nonnegative().optional(),
});
const baseSub = {
  ...entity,
  description: z.string().min(1),
  variantOwner: variantOwner.optional(),
  manuallyModified: z.boolean().optional(),
};
const quoteTravelSchema = z
  .object({
    ...baseSub,
    kind: z.literal('travel'),
    departure: siteSnapshotSchema.optional(),
    destination: siteSnapshotSchema.optional(),
    vehicleId: uuid.optional(),
    vehicleName: z.string().min(1).optional(),
    roundTrip: z.boolean(),
    occurrences: z.number().int().positive(),
    distanceKmPerOccurrence: distance.optional(),
    travelMinutesPerOccurrence: z.number().int().positive().optional(),
    distanceSource: z.enum(['route', 'manual']).optional(),
    durationSource: z.enum(['route', 'manual']).optional(),
    totalMinutes: z.number().int().positive().optional(),
    totalDistanceKm: distance.optional(),
    vehicleCostPerKm: perKmValue.optional(),
    totalCost: moneyInput.optional(),
    fuelEvidence: fuelEvidenceSchema.optional(),
  })
  .superRefine((travel, ctx) => {
    if (
      (travel.distanceKmPerOccurrence === undefined) !==
      (travel.totalDistanceKm === undefined)
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'distanza per occorrenza e totale devono essere entrambe presenti',
      });
    if (
      (travel.travelMinutesPerOccurrence === undefined) !==
      (travel.totalMinutes === undefined)
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'tempo per occorrenza e totale devono essere entrambi presenti',
      });
    if (
      travel.totalCost !== undefined &&
      (travel.vehicleCostPerKm === undefined ||
        travel.totalDistanceKm === undefined)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'il costo richiede distanza e costo chilometrico',
      });
  });
export const quoteSubItemSchema = z.discriminatedUnion('kind', [
  z.object({
    ...baseSub,
    kind: z.literal('time'),
    minutes: z.number().int().positive(),
  }),
  z.object({ ...baseSub, kind: z.literal('expense'), amount: moneyInput }),
  quoteTravelSchema,
]);

const reusableTravelFields = {
  kind: z.literal('travel'),
  description: z.string().min(1),
  roundTrip: z.boolean(),
  occurrences: z.number().int().positive(),
  distanceKmPerOccurrence: distance.optional(),
  travelMinutesPerOccurrence: z.number().int().positive().optional(),
};
const reusableSubItemSchema = z.discriminatedUnion('kind', [
  z.object({
    ...entity,
    kind: z.literal('time'),
    description: z.string().min(1),
    minutes: z.number().int().positive(),
  }),
  z.object({
    ...entity,
    kind: z.literal('expense'),
    description: z.string().min(1),
    amount: moneyInput,
  }),
  z.object({ ...entity, ...reusableTravelFields }),
]);
const definitionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('time'),
    description: z.string().min(1),
    minutes: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('expense'),
    description: z.string().min(1),
    amount: moneyInput,
  }),
  z.object(reusableTravelFields),
]);
const variantOptionSchema = z.object({
  ...entity,
  name: z.string().min(1),
  subItems: z.array(definitionSchema),
});
const variantGroupSchema = z
  .object({
    ...entity,
    name: z.string().min(1),
    options: z.array(variantOptionSchema).min(1),
    defaultOptionId: uuid.optional(),
  })
  .superRefine((group, ctx) => {
    const names = new Set<string>();
    for (const [index, option] of group.options.entries()) {
      const key = option.name.trim().toLocaleLowerCase('it');
      if (names.has(key))
        ctx.addIssue({
          code: 'custom',
          path: ['options', index, 'name'],
          message: 'nome opzione duplicato nel gruppo',
        });
      names.add(key);
    }
    if (
      group.defaultOptionId &&
      !group.options.some((option) => option.id === group.defaultOptionId)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['defaultOptionId'],
        message: 'opzione predefinita non appartenente al gruppo',
      });
  });
const variantGroupsSchema = z
  .array(variantGroupSchema)
  .superRefine((groups, ctx) => {
    const names = new Set<string>();
    for (const [index, group] of groups.entries()) {
      const key = group.name.trim().toLocaleLowerCase('it');
      if (names.has(key))
        ctx.addIssue({
          code: 'custom',
          path: [index, 'name'],
          message: 'nome gruppo variante duplicato',
        });
      names.add(key);
    }
  });

const fiscalSchema = z.object({
  atecoCode: z.string(),
  profitabilityCoefficient: percentage,
  contributionRate: percentage,
  contributionCeiling: moneyInput,
  activityPhase: z.enum(['reduced_eligible', 'ordinary']),
  reducedEligibilityConfirmed: z.boolean(),
  ordinaryApplicabilityConfirmed: z.boolean(),
  reducedSubstituteTaxRate: percentage,
  ordinarySubstituteTaxRate: percentage,
  ordinaryThreshold: moneyInput,
  cessationThreshold: moneyInput,
});
const holidaySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('recurring'),
    name: z.string().min(1),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  }),
  z.object({
    kind: z.literal('specific'),
    name: z.string().min(1),
    date: z.string().date(),
  }),
]);
const capacitySchema = z.object({
  hoursPerDay: boundedDecimal(4, '0', '24'),
  vacationDays: z.number().int().nonnegative(),
  unplannedDays: z.number().int().nonnegative(),
  clientTimePercentage: percentage,
  localHolidays: z.array(holidaySchema),
});
export const profileSchema = z
  .object({
    ...entity,
    year: z.number().int().min(2000).max(2200),
    revision: z.number().int().positive(),
    confirmed: z.boolean(),
    revenueTarget: moneyInput,
    specificAnnualExpenses: moneyInput,
    fiscal: fiscalSchema,
    capacity: capacitySchema,
  })
  .superRefine((profile, ctx) => {
    if (
      new Decimal(profile.fiscal.cessationThreshold).lt(
        profile.fiscal.ordinaryThreshold,
      )
    )
      ctx.addIssue({
        code: 'custom',
        path: ['fiscal', 'cessationThreshold'],
        message:
          'la soglia di cessazione deve essere almeno pari alla soglia ordinaria',
      });
    if (!profile.confirmed) return;
    if (!profile.fiscal.atecoCode.trim())
      ctx.addIssue({
        code: 'custom',
        path: ['fiscal', 'atecoCode'],
        message: 'ATECO obbligatorio per un profilo confermato',
      });
    if (
      profile.fiscal.activityPhase === 'reduced_eligible' &&
      !profile.fiscal.reducedEligibilityConfirmed
    )
      ctx.addIssue({
        code: 'custom',
        path: ['fiscal', 'reducedEligibilityConfirmed'],
        message: 'conferma aliquota ridotta obbligatoria',
      });
    const revenue = new Decimal(profile.revenueTarget);
    const ordinary = new Decimal(profile.fiscal.ordinaryThreshold);
    const cessation = new Decimal(profile.fiscal.cessationThreshold);
    if (
      profile.fiscal.activityPhase === 'ordinary' &&
      revenue.gt(ordinary) &&
      revenue.lte(cessation) &&
      !profile.fiscal.ordinaryApplicabilityConfirmed
    )
      ctx.addIssue({
        code: 'custom',
        path: ['fiscal', 'ordinaryApplicabilityConfirmed'],
        message: 'conferma applicabilità oltre soglia obbligatoria',
      });
  });

const profileSnapshotSchema = z.object({
  sourceId: uuid,
  year: z.number().int(),
  revision: z.number().int().positive(),
  revenueTarget: decimal,
  specificAnnualExpenses: decimal,
  revenueFromTime: decimal,
  availableClientMinutes: z.number().int().positive(),
  hourlyTarget: decimal,
  fiscal: fiscalSchema,
});
const priceReferenceSchema = z.object({
  amount: moneyInput,
  period,
  foiEvidence: foiEvidenceSchema.optional(),
});
const quoteItemSchema = z
  .object({
    ...entity,
    name: z.string().min(1),
    subItems: z.array(quoteSubItemSchema),
    variantGroups: variantGroupsSchema,
    variantSelections: z.array(z.object({ groupId: uuid, optionId: uuid })),
    referencePrice: priceReferenceSchema.optional(),
    chosenPrice: moneyInput.optional(),
  })
  .superRefine((item, ctx) => {
    const selected = new Set<string>();
    for (const [index, selection] of item.variantSelections.entries()) {
      const group = item.variantGroups.find(
        (candidate) => candidate.id === selection.groupId,
      );
      if (!group?.options.some((option) => option.id === selection.optionId))
        ctx.addIssue({
          code: 'custom',
          path: ['variantSelections', index],
          message: 'selezione variante non appartenente alla voce',
        });
      if (selected.has(selection.groupId))
        ctx.addIssue({
          code: 'custom',
          path: ['variantSelections', index],
          message: 'gruppo variante selezionato più volte',
        });
      selected.add(selection.groupId);
    }
  });
const exportLineSchema = z.object({
  itemIds: z.array(uuid).min(1),
  description: z.string().min(1),
  amount: moneyInput,
  quantity: z.literal(1),
});
const exportAttemptSchema = z.object({
  ...entity,
  companyId: z.string().min(1),
  lines: z.array(exportLineSchema).min(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  outcome: z.enum(['pending', 'success', 'rejected', 'uncertain']),
  remoteDocumentId: z.string().optional(),
  diagnostic: z.string().optional(),
});
const templateItemSchema = z.object({
  ...entity,
  name: z.string().min(1),
  referencePrice: z.object({ amount: moneyInput, period }).optional(),
  subItems: z.array(reusableSubItemSchema),
  variantGroups: variantGroupsSchema,
});
const templateSchema = z.object({
  ...entity,
  name: z.string().min(1),
  items: z.array(templateItemSchema).min(1),
});

const financialPaymentSchema = z
  .object({
    id: z.string().min(1).optional(),
    amount: moneyInput,
    dueDate: z.string().date().optional(),
    paidDate: z.string().date().optional(),
    status: z.enum(['paid', 'not_paid', 'reversed']),
  })
  .superRefine((payment, ctx) => {
    if (payment.status === 'paid' && !payment.paidDate)
      ctx.addIssue({
        code: 'custom',
        path: ['paidDate'],
        message: 'Un pagamento paid richiede una data di pagamento valida.',
      });
  });
const financialDocumentFields = {
  id: z.string().min(1),
  date: z.string().date(),
  entityId: z.string().min(1).optional(),
  entityName: z.string().optional(),
  amountGross: moneyInput,
  payments: z.array(financialPaymentSchema),
};
export const financialSnapshotSchema = z
  .object({
    pendingReceivedDocuments: z
      .array(
        z.object({
          id: z.string().min(1),
          source: z.enum(['agyo', 'mail', 'browser']),
          documentType: z.string().optional(),
          date: z.string().date().optional(),
          subject: z.string().optional(),
          supplierName: z.string().optional(),
          amountGross: moneyInput.optional(),
          category: z.string().optional(),
        }),
      )
      .optional(),
    source: z.literal('fatture_in_cloud'),
    company: z.object({ id: z.string().min(1), name: z.string().min(1) }),
    acquiredAt: iso,
    issuedDocuments: z.array(
      z.object({
        ...financialDocumentFields,
        stampDuty: moneyInput.optional(),
        type: z.enum(['invoice', 'credit_note']),
        number: z.string().optional(),
        numeration: z.string().optional(),
        description: z.string().optional(),
      }),
    ),
    receivedDocuments: z.array(
      z.object({
        ...financialDocumentFields,
        type: z.enum(['expense', 'passive_credit_note']),
        invoiceNumber: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
      }),
    ),
  })
  .superRefine((snapshot, ctx) => {
    const pendingIds = new Set<string>();
    (snapshot.pendingReceivedDocuments ?? []).forEach((document, index) => {
      const key = `${document.source}:${document.id}`;
      if (pendingIds.has(key))
        ctx.addIssue({
          code: 'custom',
          path: ['pendingReceivedDocuments', index, 'id'],
          message: 'ID pending FIC duplicato nella stessa sorgente.',
        });
      pendingIds.add(key);
    });
    for (const collection of [
      'issuedDocuments',
      'receivedDocuments',
    ] as const) {
      const ids = new Set<string>();
      snapshot[collection].forEach((document, index) => {
        if (ids.has(document.id))
          ctx.addIssue({
            code: 'custom',
            path: [collection, index, 'id'],
            message: 'ID FIC duplicato.',
          });
        ids.add(document.id);
      });
    }
  });

export const bankExpenseRowSchema = z.object({
  date: z.string().date(),
  description: z
    .string()
    .min(1)
    .refine(
      (value) => value === normalizeBankDescription(value),
      'descrizione non normalizzata',
    ),
  amount: z
    .string()
    .regex(/^(?:0|[1-9]\d*)\.\d{2}$/)
    .refine(
      (value) =>
        /^(?:0|[1-9]\d*)\.\d{2}$/.test(value) && new Decimal(value).gt(0),
      'importo non positivo',
    ),
});
export const bankExpenseImportSchema = z.object({
  rows: z.array(bankExpenseRowSchema),
  ignoredIncome: z.number().int().nonnegative(),
});
export const bankExpenseRuleSchema = z.object({
  ...entity,
  matchText: z
    .string()
    .trim()
    .refine(
      (value) => normalizeBankRuleText(value).length > 0,
      'Inserisci almeno una lettera o un numero.',
    ),
  categoryId: uuid,
});

// Early v6 archives used a single manual category. Normalize only that known
// legacy shape, leaving malformed arrays/references for validation to reject.
const bankExpenseSchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return input;
    const row = input as Record<string, unknown>;
    const categoryIds =
      row.categoryIds === undefined
        ? row.categoryId === undefined
          ? []
          : [row.categoryId]
        : Array.isArray(row.categoryIds) &&
            row.categoryId !== undefined &&
            !row.categoryIds.includes(row.categoryId)
          ? [...row.categoryIds, row.categoryId]
          : row.categoryIds;
    return { ...row, categoryIds };
  },
  bankExpenseRowSchema.extend({ ...entity, categoryIds: z.array(uuid) }),
);

export const cashDocumentSchema: z.ZodType<CashDocument> = z
  .object({
    bankExpenses: z.array(bankExpenseSchema).default([]),
    bankExpenseCategories: z.array(
      z.object({
        ...entity,
        name: z.string().trim().min(1),
        parentId: uuid.optional(),
        systemRole: z.literal('vat_taxes').optional(),
      }),
    ),
    bankExpenseRules: z.array(bankExpenseRuleSchema).default([]),
    financialSnapshot: financialSnapshotSchema.optional(),
    fiscalPaymentOverrides: z
      .array(
        z.object({
          year: z.number().int().min(2000).max(2200),
          total: moneyInput,
        }),
      )
      .superRefine((entries, ctx) => {
        const years = new Set<number>();
        entries.forEach((entry, index) => {
          if (years.has(entry.year))
            ctx.addIssue({
              code: 'custom',
              path: [index, 'year'],
              message: 'Correzione fiscale già presente per questo anno.',
            });
          years.add(entry.year);
        });
      })
      .optional(),
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    documentId: uuid,
    revision: z.number().int().positive(),
    createdAt: iso,
    updatedAt: iso,
    settings: z.object({
      fuelTerritory: z.string().min(1).optional(),
      defaultDepartureSiteId: uuid.optional(),
      defaultVehicleId: uuid.optional(),
      fic: z.object({
        enabled: z.boolean(),
        company: z
          .object({ id: z.string().min(1), name: z.string().min(1) })
          .optional(),
        product: z
          .object({ id: z.string().min(1), name: z.string().min(1) })
          .optional(),
        taxProfile: z
          .object({
            acquiredAt: iso,
            hasProfessionalFund: z.boolean().optional(),
            companyType: z.string().optional(),
            companySubtype: z.string().optional(),
            profession: z.string().optional(),
            regime: z.string().optional(),
            profitCoefficient: decimal.optional(),
            contributionsPercentage: decimal.optional(),
            defaultVat: z
              .object({
                id: z.string().min(1),
                value: z.number().optional(),
                description: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
        legacyReferences: z
          .object({
            companyId: z.string().min(1).optional(),
            productId: z.string().min(1).optional(),
          })
          .optional(),
        lastVerification: z
          .object({
            at: iso,
            result: z.enum(['success', 'error']),
            diagnostic: z.string().optional(),
          })
          .optional(),
      }),
    }),
    profiles: z.array(profileSchema),
    businessCosts: z.array(
      z.object({
        ...entity,
        category: z.string().min(1),
        description: z.string().min(1),
        monthlyAmount: moneyInput,
      }),
    ),
    vehicles: z.array(
      z.object({
        ...entity,
        name: z.string().min(1),
        fuel,
        consumption: positiveConsumption,
        consumptionUnit: z.enum(['km/l', 'kg/100km']),
        annualKm: boundedDecimal(1, '0', undefined, true),
        annualInsurance: moneyInput,
        annualTax: moneyInput,
        annualMaintenance: moneyInput,
      }),
    ),
    sites: z.array(
      z.object({
        ...entity,
        name: z.string().min(1),
        address: z.string().min(1).optional(),
        client: ficClientRefSchema.optional(),
        location: resolvedLocationSchema.optional(),
      }),
    ),
    catalog: z.object({
      subItems: z.array(reusableSubItemSchema),
      templates: z.array(templateSchema),
    }),
    quotes: z.array(
      z.object({
        ...entity,
        date: z.string().date(),
        profileId: uuid.optional(),
        profileSnapshot: profileSnapshotSchema.optional(),
        client: clientSnapshotSchema.optional(),
        mainSite: siteSnapshotSchema.optional(),
        items: z.array(quoteItemSchema),
        commission: moneyInput.optional(),
        snapshotRevision: z.number().int().nonnegative(),
        snapshotUpdatedAt: iso.optional(),
        exportAttempts: z.array(exportAttemptSchema),
      }),
    ),
  })
  .superRefine((document, ctx) => {
    const entityIds = new Set<string>();
    const register = (entity: { id: string }, path: (string | number)[]) => {
      if (entityIds.has(entity.id))
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'id'],
          message: 'UUID locale duplicato',
        });
      entityIds.add(entity.id);
    };
    const registerGroups = (
      groups: z.infer<typeof variantGroupSchema>[],
      path: (string | number)[],
    ) => {
      groups.forEach((group, index) => {
        const groupPath = [...path, index];
        register(group, groupPath);
        group.options.forEach((option, optionIndex) =>
          register(option, [...groupPath, 'options', optionIndex]),
        );
      });
    };
    for (const key of [
      'profiles',
      'businessCosts',
      'vehicles',
      'sites',
      'bankExpenses',
      'bankExpenseCategories',
      'bankExpenseRules',
    ] as const)
      document[key].forEach((entity, index) => register(entity, [key, index]));
    document.catalog.subItems.forEach((entity, index) =>
      register(entity, ['catalog', 'subItems', index]),
    );
    document.catalog.templates.forEach((template, index) => {
      const path = ['catalog', 'templates', index];
      register(template, path);
      template.items.forEach((item, itemIndex) => {
        const itemPath = [...path, 'items', itemIndex];
        register(item, itemPath);
        item.subItems.forEach((subItem, subIndex) =>
          register(subItem, [...itemPath, 'subItems', subIndex]),
        );
        registerGroups(item.variantGroups, [...itemPath, 'variantGroups']);
      });
    });
    document.quotes.forEach((quote, index) => {
      const path = ['quotes', index];
      register(quote, path);
      quote.items.forEach((item, itemIndex) => {
        const itemPath = [...path, 'items', itemIndex];
        register(item, itemPath);
        item.subItems.forEach((subItem, subIndex) =>
          register(subItem, [...itemPath, 'subItems', subIndex]),
        );
        registerGroups(item.variantGroups, [...itemPath, 'variantGroups']);
      });
      quote.exportAttempts.forEach((attempt, attemptIndex) =>
        register(attempt, [...path, 'exportAttempts', attemptIndex]),
      );
    });
    if (
      document.bankExpenseCategories.filter(
        (category) => category.systemRole === 'vat_taxes',
      ).length !== 1
    )
      ctx.addIssue({
        code: 'custom',
        path: ['bankExpenseCategories'],
        message:
          'È richiesta esattamente una categoria di sistema Imposte P.IVA.',
      });
    const categories = new Map(
      document.bankExpenseCategories.map((category) => [category.id, category]),
    );
    const names = new Set<string>();
    document.bankExpenseCategories.forEach((category, index) => {
      const path = ['bankExpenseCategories', index];
      // A migrated user category may share the system category's display name.
      const key = JSON.stringify([
        category.systemRole ?? '',
        category.parentId ?? '',
        category.name.trim().toLocaleLowerCase('it'),
      ]);
      if (names.has(key))
        ctx.addIssue({
          code: 'custom',
          path,
          message: 'Nome categoria già presente nello stesso livello',
        });
      names.add(key);
      if (
        category.parentId &&
        (category.parentId === category.id ||
          !categories.has(category.parentId) ||
          categories.get(category.parentId)?.parentId)
      )
        ctx.addIssue({
          code: 'custom',
          path,
          message: 'Il padre deve essere una categoria principale esistente',
        });
    });
    const movements = new Set<string>();
    document.bankExpenses.forEach((expense, index) => {
      const path = ['bankExpenses', index];
      if (expense.categoryIds.some((id) => !categories.has(id)))
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'categoryIds'],
          message: 'Categoria del movimento inesistente',
        });
      if (new Set(expense.categoryIds).size !== expense.categoryIds.length)
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'categoryIds'],
          message: 'Categorie manuali duplicate',
        });
      const key = bankExpenseIdentity(expense);
      if (movements.has(key))
        ctx.addIssue({
          code: 'custom',
          path,
          message: 'Movimento bancario duplicato',
        });
      movements.add(key);
    });
    document.bankExpenseRules.forEach((rule, index) => {
      const path = ['bankExpenseRules', index];
      if (!categories.has(rule.categoryId))
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'categoryId'],
          message: 'Categoria della regola inesistente',
        });
    });
    const years = new Set<number>();
    for (const [index, profile] of document.profiles.entries()) {
      if (years.has(profile.year))
        ctx.addIssue({
          code: 'custom',
          path: ['profiles', index, 'year'],
          message: 'esiste già un profilo per questo anno',
        });
      years.add(profile.year);
    }
    if (
      document.settings.fic.enabled &&
      (!document.settings.fic.company || !document.settings.fic.product)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['settings', 'fic'],
        message:
          'azienda e prodotto Consulenza sono obbligatori quando Fatture in Cloud è attivo',
      });
    if (
      document.settings.defaultDepartureSiteId &&
      !document.sites.some(
        (site) => site.id === document.settings.defaultDepartureSiteId,
      )
    )
      ctx.addIssue({
        code: 'custom',
        path: ['settings', 'defaultDepartureSiteId'],
        message: 'Sede di partenza predefinita inesistente',
      });
    if (
      document.settings.defaultVehicleId &&
      !document.vehicles.some(
        (vehicle) => vehicle.id === document.settings.defaultVehicleId,
      )
    )
      ctx.addIssue({
        code: 'custom',
        path: ['settings', 'defaultVehicleId'],
        message: 'Veicolo predefinito inesistente',
      });
  });

export const documentHeaderSchema = z.object({
  schemaVersion: z.number().int().positive(),
  documentId: uuid,
  revision: z.number().int().positive(),
  createdAt: iso,
  updatedAt: iso,
});
export function parseDocument(input: unknown): CashDocument {
  return cashDocumentSchema.parse(input);
}
