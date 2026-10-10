import {
  createEmptyDocument,
  createFiscalPreset2026,
  meta,
  type CashDocument,
  type VariantGroup,
} from '../../src/domain/model';

const groups = (): VariantGroup[] => {
  const option = {
    ...meta(),
    name: 'Completa',
    subItems: [
      { kind: 'expense' as const, description: 'Materiale', amount: '123.40' },
    ],
  };
  return [
    {
      ...meta(),
      name: 'Servizio',
      options: [option],
      defaultOptionId: option.id,
    },
  ];
};

export function comprehensiveDocument(): CashDocument {
  const document = createEmptyDocument('2026-10-01T12:00:00.000Z');
  document.revision = 7;
  const profile = createFiscalPreset2026();
  profile.revision = 3;
  profile.capacity.localHolidays = [
    { kind: 'recurring', name: 'Patrono', month: 6, day: 29 },
    { kind: 'specific', name: 'Chiusura', date: '2026-12-24' },
  ];
  document.profiles = [profile];
  document.businessCosts = [
    {
      ...meta(),
      category: 'Software',
      description: 'Suite',
      monthlyAmount: '99.00',
    },
  ];
  const vehicle = {
    ...meta(),
    name: 'Auto',
    fuel: 'Benzina' as const,
    consumption: '20.00',
    consumptionUnit: 'km/l' as const,
    annualKm: '10000.0',
    annualInsurance: '12345678901234567890.01',
    annualTax: '0.00',
    annualMaintenance: '200.10',
  };
  document.vehicles = [vehicle];
  const site = {
    ...meta(),
    name: 'Cliente',
    address: 'Roma',
    client: {
      source: 'fatture_in_cloud' as const,
      companyId: '1',
      clientId: '10',
      displayName: 'Cliente',
    },
    location: {
      coordinates: { longitude: '12.4963660', latitude: '41.9027820' },
      inputKind: 'address' as const,
      inputValue: 'Roma',
    },
  };
  document.sites = [site, { ...meta(), name: 'Studio' }];
  document.settings = {
    fuelTerritory: 'Toscana',
    defaultDepartureSiteId: site.id,
    defaultVehicleId: vehicle.id,
    fic: {
      enabled: true,
      company: { id: '1', name: 'Studio' },
      product: { id: '2', name: 'Consulenza' },
      taxProfile: {
        acquiredAt: document.createdAt,
        hasProfessionalFund: false,
        companyType: '',
        companySubtype: 'professionista',
        profession: 'Consulenza',
        regime: 'forfettario',
        profitCoefficient: '67.0000',
        contributionsPercentage: '26.0700',
        defaultVat: { id: '0', value: 0, description: '' },
      },
      legacyReferences: { companyId: 'old', productId: 'legacy' },
      lastVerification: {
        at: document.createdAt,
        result: 'error',
        diagnostic: 'Offline',
      },
    },
  };
  document.catalog.subItems = [
    { ...meta(), kind: 'time', description: 'Lavoro', minutes: 90 },
    { ...meta(), kind: 'expense', description: 'Materiale', amount: '0.00' },
    {
      ...meta(),
      kind: 'travel',
      description: '',
      roundTrip: false,
      occurrences: 2,
      distanceKmPerOccurrence: '12.0',
      travelMinutesPerOccurrence: 30,
    },
  ];
  document.catalog.templates = [
    {
      ...meta(),
      name: 'Template',
      items: [
        {
          ...meta(),
          name: 'Attività',
          referencePrice: { amount: '200.00', period: '2025-01' },
          subItems: [
            { ...meta(), kind: 'time', description: 'Lavoro', minutes: 60 },
          ],
          variantGroups: groups(),
        },
      ],
    },
  ];
  const variants = groups();
  const item = {
    ...meta(),
    name: 'Intervento',
    chosenPrice: '1000.00',
    variantGroups: variants,
    variantSelections: [
      { groupId: variants[0]!.id, optionId: variants[0]!.options[0]!.id },
    ],
    subItems: [
      {
        ...meta(),
        kind: 'time' as const,
        description: 'Lavoro',
        minutes: 60,
        manuallyModified: false,
      },
      {
        ...meta(),
        kind: 'expense' as const,
        description: 'Materiale',
        amount: '123.40',
        variantOwner: {
          groupId: variants[0]!.id,
          optionId: variants[0]!.options[0]!.id,
          definitionIndex: 0,
        },
      },
      {
        ...meta(),
        kind: 'travel' as const,
        description: '',
        departure: {
          sourceId: meta().id,
          name: 'Sede storica eliminata',
          address: 'Milano',
          coordinates: { longitude: '9.1900000', latitude: '45.4642000' },
        },
        destination: { sourceId: site.id, name: site.name },
        vehicleId: meta().id,
        vehicleName: 'Veicolo storico',
        roundTrip: true,
        occurrences: 2,
        distanceKmPerOccurrence: '10.0',
        travelMinutesPerOccurrence: 15,
        distanceSource: 'manual' as const,
        durationSource: 'route' as const,
        totalMinutes: 60,
        totalDistanceKm: '40.0',
        vehicleCostPerKm: '0.200000',
        totalCost: '8.00',
        fuelEvidence: {
          fuel: 'Benzina' as const,
          mode: 'SELF' as const,
          territory: 'Lazio',
          network: 'NON_AUTOSTRADALE' as const,
          price: '1.750',
          priceUnit: 'EUR/l' as const,
          referenceDate: '2026-09-30',
          acquiredAt: document.createdAt,
        },
      },
    ],
    referencePrice: {
      amount: '900.00',
      period: '2025-01',
      foiEvidence: {
        fromPeriod: '2025-01',
        toPeriod: '2026-01',
        fromIndex: '120.00',
        toIndex: '121.00',
        fromBase: '2015',
        toBase: '2015',
        fromLinkFactor: '1',
        toLinkFactor: '1',
        revaluedAmount: '907.50',
        acquiredAt: document.createdAt,
      },
    },
  };
  document.quotes = [
    {
      ...meta(),
      date: '2026-10-01',
      profileId: meta().id,
      profileSnapshot: {
        sourceId: profile.id,
        year: profile.year,
        revision: profile.revision,
        revenueTarget: '85000.00',
        specificAnnualExpenses: '0.00',
        revenueFromTime: '85000.00',
        availableClientMinutes: 60000,
        hourlyTarget: '85.000000',
        fiscal: structuredClone(profile.fiscal),
      },
      client: { ...site.client, vatNumber: '' },
      mainSite: {
        sourceId: site.id,
        name: site.name,
        address: site.address,
        coordinates: site.location.coordinates,
      },
      items: [item],
      commission: '0.00',
      snapshotRevision: 3,
      snapshotUpdatedAt: document.createdAt,
      exportAttempts: [
        {
          ...meta(),
          companyId: '1',
          lines: [
            {
              itemIds: [item.id],
              description: 'Intervento',
              amount: '1000.00',
              quantity: 1,
            },
          ],
          payloadHash: 'a'.repeat(64),
          outcome: 'uncertain',
          remoteDocumentId: '42',
          diagnostic: 'Verificare esito remoto',
        },
      ],
    },
  ];
  const parent = {
    ...meta(),
    name: 'Servizi',
    excludedFromCalculations: false,
  };
  const child = {
    ...meta(),
    name: 'Software',
    parentId: parent.id,
    excludedFromCalculations: true,
  };
  document.bankExpenseCategories.push(parent, child);
  document.bankExpenses = [
    {
      ...meta(),
      date: '2026-10-01',
      description: 'Licenza Software',
      amount: '12345678901234567890.01',
      categoryIds: [child.id, parent.id],
      excludedFromCalculations: false,
    },
  ];
  document.bankExpenseRules = [
    { ...meta(), matchText: 'Licenza', categoryId: child.id },
  ];
  document.fiscalPaymentOverrides = [
    { year: 2027, total: '0.00' },
    { year: 2026, total: '12345678901234567890.01' },
  ];
  document.financialSnapshot = {
    source: 'fatture_in_cloud',
    company: { id: '1', name: 'Studio' },
    acquiredAt: document.createdAt,
    issuedDocuments: [
      {
        id: '1',
        type: 'invoice',
        date: '2026-01-01',
        number: '',
        numeration: 'A',
        description: '',
        entityId: '10',
        entityName: 'Cliente',
        amountGross: '1000.00',
        stampDuty: '0.00',
        payments: [
          {
            id: 'same',
            amount: '500.00',
            dueDate: '2026-01-15',
            paidDate: '2026-01-16',
            status: 'paid',
          },
          { amount: '400.00', dueDate: '2026-02-15', status: 'not_paid' },
          { id: 'same', amount: '100.00', status: 'reversed' },
        ],
      },
    ],
    receivedDocuments: [
      {
        id: '1',
        type: 'passive_credit_note',
        date: '2026-01-02',
        invoiceNumber: '',
        entityId: '10',
        entityName: '',
        description: 'Credito',
        category: 'Software',
        amountGross: '10.00',
        payments: [{ amount: '10.00', paidDate: '2026-01-03', status: 'paid' }],
      },
    ],
    pendingReceivedDocuments: [
      {
        id: '1',
        source: 'agyo',
        documentType: '',
        date: '2026-01-01',
        subject: '',
        supplierName: 'Fornitore',
        amountGross: '0.00',
        category: '',
      },
      { id: '1', source: 'mail' },
      { id: '1', source: 'browser' },
    ],
  };
  return document;
}
