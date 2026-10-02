import { describe, expect, it } from 'vitest';
import {
  calculateFinancialAnalysis,
  financialPaymentSummary,
  financialYears,
} from '../../src/domain/financial-analysis';
import {
  calculateFiscalAdvances,
  calculateFiscalProjection,
  calculateProfile,
} from '../../src/domain/calculations';
import { d, money } from '../../src/domain/decimal';
import {
  createFiscalPreset2026,
  meta,
  type FicFinancialSnapshot,
  type FicIssuedDocument,
} from '../../src/domain/model';

const invoice = (values: Partial<FicIssuedDocument>): FicIssuedDocument => ({
  id: '1',
  type: 'invoice',
  date: '2026-02-01',
  amountGross: '100.00',
  stampDuty: '0.00',
  payments: [],
  ...values,
});
const snapshot = (): FicFinancialSnapshot => ({
  source: 'fatture_in_cloud',
  company: { id: '1', name: 'Studio' },
  acquiredAt: '2026-09-30T10:00:00Z',
  issuedDocuments: [
    invoice({
      id: '1',
      date: '2025-12-20',
      amountGross: '200.00',
      payments: [{ amount: '200.00', status: 'paid', paidDate: '2026-01-15' }],
    }),
    invoice({ id: '2' }),
    invoice({
      id: '3',
      amountGross: '300.00',
      payments: [
        { amount: '100.00', status: 'paid', paidDate: '2026-03-10' },
        { amount: '150.00', status: 'not_paid', dueDate: '2026-03-20' },
        {
          amount: '50.00',
          status: 'reversed',
          dueDate: '2026-11-01',
          paidDate: '2026-03-11',
        },
      ],
    }),
    invoice({
      id: '4',
      type: 'credit_note',
      amountGross: '25.00',
      payments: [{ amount: '25.00', status: 'paid', paidDate: '2026-03-10' }],
    }),
  ],
  receivedDocuments: [
    {
      id: '1',
      type: 'expense',
      date: '2026-04-01',
      amountGross: '80.00',
      payments: [{ amount: '80.00', status: 'paid', paidDate: '2026-05-01' }],
    },
    {
      id: '2',
      type: 'expense',
      date: '2025-12-01',
      amountGross: '20.00',
      payments: [{ amount: '20.00', status: 'paid', paidDate: '2026-01-10' }],
    },
    {
      id: '3',
      type: 'passive_credit_note',
      date: '2026-04-02',
      amountGross: '10.00',
      payments: [{ amount: '10.00', status: 'paid', paidDate: '2026-05-01' }],
    },
  ],
});

describe('analisi finanziaria', () => {
  it.each([
    ['ordinary', false, '15', '3714.98', '12450.43', '10701.74', '23152.17'],
    [
      'reduced_eligible',
      true,
      '5',
      '1238.33',
      '9973.78',
      '8225.09',
      '18198.87',
    ],
    [
      'reduced_eligible',
      false,
      '15',
      '3714.98',
      '12450.43',
      '10701.74',
      '23152.17',
    ],
  ] as const)(
    'previsione completa %s confermata %s: %s%% con bollo e acconti',
    (phase, confirmed, rate, tax, annual, advances, total) => {
      const profile = createFiscalPreset2026();
      profile.confirmed = true;
      profile.fiscal.activityPhase = phase;
      profile.fiscal.reducedEligibilityConfirmed = confirmed;
      const data = snapshot();
      data.issuedDocuments = [
        invoice({
          stampDuty: '2.00',
          amountGross: '50000.00',
          payments: [
            { amount: '50000.00', status: 'paid', paidDate: '2026-05-01' },
          ],
        }),
      ];
      const result = calculateFinancialAnalysis(
        data,
        2026,
        profile,
        [],
        '2026-10-01',
      );
      expect(result.collectedRevenue).toBe('50000.00');
      expect(result.fiscalProjection).toMatchObject({
        atecoCode: '62.20.10',
        profitabilityCoefficient: '67',
        forfaitIncome: '33500.00',
        contributionBase: '33500.00',
        contributions: '8733.45',
        taxBase: '24766.55',
        effectiveTaxRate: rate,
        substituteTax: tax,
        stampDuty: '2.00',
        annualTotal: annual,
        contributionAdvance: '6986.76',
        contributionAdvanceFirst: '3493.38',
        contributionAdvanceSecond: '3493.38',
        totalAdvances: advances,
        totalToReserve: total,
        advanceRateProjected: true,
      });
      expect(result.fiscalWarnings).toContain(
        'Aliquota INPS dell’anno successivo non disponibile: proiezione effettuata con l’aliquota 2026.',
      );
    },
  );

  it('usa il principio di cassa e mantiene rivalsa e bollo riaddebitato nel pagamento', () => {
    const profile = createFiscalPreset2026();
    profile.confirmed = true;
    const data = snapshot();
    data.issuedDocuments = [
      invoice({
        id: 'old',
        date: '2025-12-01',
        stampDuty: '2.00',
        amountGross: '1040.00',
        payments: [
          { amount: '1040.00', status: 'paid', paidDate: '2026-01-01' },
        ],
      }),
      invoice({
        id: 'unpaid',
        stampDuty: '2.00',
        payments: [{ amount: '100.00', status: 'not_paid' }],
      }),
      invoice({
        id: 'future',
        stampDuty: '0.00',
        payments: [
          { amount: '100.00', status: 'paid', paidDate: '2027-01-01' },
        ],
      }),
      invoice({
        id: 'charged-stamp',
        stampDuty: '2.00',
        amountGross: '1042.00',
        payments: [
          { amount: '1042.00', status: 'paid', paidDate: '2026-02-01' },
        ],
      }),
    ];
    const result = calculateFinancialAnalysis(
      data,
      2026,
      profile,
      [],
      '2026-10-01',
    );
    expect(result.collectedRevenue).toBe('2082.00');
    expect(result.fiscalProjection).toMatchObject({
      forfaitIncome: '1394.94',
      stampDuty: '6.00',
    });
    delete data.issuedDocuments[1]!.stampDuty;
    const incomplete = calculateFinancialAnalysis(
      data,
      2026,
      profile,
      [],
      '2026-10-01',
    );
    expect(incomplete.collectedRevenue).toBe('2082.00');
    expect(incomplete.fiscalProjection?.contributions).toBeDefined();
    expect(incomplete.fiscalProjection).toEqual(result.fiscalProjection);
    expect(incomplete.fiscalUnavailableReason).toBeUndefined();
  });

  it.each([
    { amountGross: '77.45', expected: '0.00' },
    { amountGross: '77.46', expected: '0.00' },
    { amountGross: '77.47', expected: '2.00' },
    { amountGross: '100.00', numeration: 'PA', number: '1', expected: '0.00' },
    { amountGross: '100.00', numeration: 'PA/2026', expected: '0.00' },
    { amountGross: '100.00', numeration: ' pa/2026 ', expected: '0.00' },
    { amountGross: '100.00', number: 'PA-1', expected: '0.00' },
    { amountGross: '100.00', numeration: 'SPA', expected: '2.00' },
    { amountGross: '100.00', numeration: '/A', expected: '2.00' },
    { amountGross: '100.00', numeration: '', expected: '2.00' },
    { amountGross: '100.00', type: 'credit_note' as const, expected: '0.00' },
    { amountGross: '100.00', date: '2025-12-31', expected: '0.00' },
  ])(
    'calcola il bollo per importo, prefisso e anno: %j',
    ({ expected, ...values }) => {
      const profile = createFiscalPreset2026();
      profile.confirmed = true;
      for (const stampDuty of [undefined, '0.00', '2.00', '4.00']) {
        const data = {
          ...snapshot(),
          issuedDocuments: [invoice({ ...values, stampDuty })],
        };
        const result = calculateFinancialAnalysis(
          data,
          2026,
          profile,
          [],
          '2026-10-01',
        );
        expect(result.fiscalProjection).toMatchObject({
          stampDuty: expected,
          annualTotal: expected,
          totalToReserve: expected,
        });
        expect(result.fiscalUnavailableReason).toBeUndefined();
      }
    },
  );

  it.each([
    ['0.00', '0.00', '0.00', '0.00'],
    ['51.65', '0.00', '0.00', '0.00'],
    ['51.66', '51.66', '0.00', '51.66'],
    ['257.51', '257.51', '0.00', '257.51'],
    ['257.52', '257.52', '103.01', '154.51'],
    ['1000.01', '1000.01', '400.00', '600.01'],
  ])('acconto sostitutiva con imposta %s', (tax, total, first, second) => {
    const result = calculateFiscalProjection(
      '1000.00',
      createFiscalPreset2026().fiscal,
    );
    if (!result.ok) throw new Error(result.error.message);
    const advance = calculateFiscalAdvances(
      { ...result.value, substituteTax: tax },
      '26.07',
    );
    expect(advance).toMatchObject({
      substituteTaxAdvance: total,
      substituteTaxAdvanceFirst: first,
      substituteTaxAdvanceSecond: second,
    });
    expect(money(d(first).plus(second))).toBe(total);
    expect(
      money(
        d(advance.contributionAdvanceFirst).plus(
          advance.contributionAdvanceSecond,
        ),
      ),
    ).toBe(advance.contributionAdvance);
  });

  it('usa soltanto l’aliquota INPS del profilo successivo confermato e non genera profili', () => {
    const profile = createFiscalPreset2026();
    profile.confirmed = true;
    const next = { ...structuredClone(profile), year: 2027 };
    next.fiscal.contributionRate = '27';
    const run = () =>
      calculateFinancialAnalysis(
        snapshot(),
        2026,
        profile,
        [],
        '2026-10-01',
        next,
      );
    expect(run().fiscalProjection).toMatchObject({
      contributionAdvance: '43.42',
      contributionAdvanceFirst: '21.71',
      contributionAdvanceSecond: '21.71',
      advanceContributionRate: '27',
      advanceRateProjected: false,
    });
    expect(run().fiscalWarnings).toEqual([]);
    next.confirmed = false;
    expect(run().fiscalProjection).toMatchObject({
      advanceContributionRate: '26.07',
      advanceRateProjected: true,
    });
    next.confirmed = true;
    next.year = 2028;
    expect(run().fiscalProjection?.advanceRateProjected).toBe(true);
  });

  it('applica il massimale e blocca profili fuori perimetro senza bloccare incassi', () => {
    const profile = createFiscalPreset2026();
    profile.confirmed = true;
    profile.fiscal.contributionCeiling = '100.00';
    expect(
      calculateFinancialAnalysis(snapshot(), 2026, profile, [], '2026-10-01')
        .fiscalProjection,
    ).toMatchObject({ contributionBase: '100.00', contributions: '26.07' });
    profile.fiscal.atecoCode = '69.10.10';
    const result = calculateFinancialAnalysis(
      snapshot(),
      2026,
      profile,
      [],
      '2026-10-01',
    );
    expect(result.collectedRevenue).toBe('300.00');
    expect(result.fiscalProjection).toBeUndefined();
    profile.fiscal.atecoCode = '62.20.10';
    expect(
      calculateFinancialAnalysis(
        snapshot(),
        2026,
        profile,
        [],
        '2026-10-01',
        undefined,
        { acquiredAt: '2026-01-01T00:00:00Z', regime: 'ordinario' },
      ).fiscalProjection,
    ).toBeUndefined();
  });
  it.each([
    { companyType: 'company' },
    { companyType: 'independent_contractor', hasProfessionalFund: true },
    { companyType: 'independent_contractor', regime: 'ordinario' },
    { companyType: 'individual', companySubtype: 'artigiano' },
  ])('mantiene il blocco per profili non supportati: %j', (values) => {
    const profile = createFiscalPreset2026();
    profile.confirmed = true;
    const result = calculateFinancialAnalysis(
      snapshot(),
      2026,
      profile,
      [],
      '2026-10-01',
      undefined,
      { acquiredAt: '2026-09-30T17:24:53.927Z', ...values },
    );
    expect(result.fiscalProjection).toBeUndefined();
    expect(result.fiscalUnavailableReason).toContain('fuori dal perimetro');
    expect(result.collectedRevenue).toBe('300.00');
  });
  it('separa emesso, incassato per anno pagamento, note di credito e costi', () => {
    const profile = createFiscalPreset2026();
    profile.revenueTarget = '1000.00';
    profile.confirmed = true;
    const result = calculateFinancialAnalysis(
      snapshot(),
      2026,
      profile,
      [
        {
          ...meta(),
          category: 'Software',
          description: 'Suite',
          monthlyAmount: '10.00',
        },
      ],
      '2026-09-30',
    );
    expect(result).toMatchObject({
      issuedRevenue: '400.00',
      collectedRevenue: '300.00',
      outstandingRevenue: '300.00',
      overdueRevenue: '150.00',
      issuedCreditNotes: '25.00',
      plannedBusinessCosts: '120.00',
      documentedCosts: '80.00',
      paidCosts: '100.00',
      receivedCreditNotes: '10.00',
      revenueTarget: '1000.00',
      gapToTarget: '700.00',
      percentIssuedVsTarget: '40.00',
      percentCollectedVsTarget: '30.00',
    });
    expect(result.monthly).toHaveLength(12);
    expect(result.monthly[0]).toMatchObject({
      issuedRevenue: '0.00',
      collectedRevenue: '200.00',
      paidCosts: '20.00',
    });
    expect(result.monthly[1]?.issuedRevenue).toBe('400.00');
    expect(result.monthly[2]?.collectedRevenue).toBe('100.00');
    expect(result.monthly[3]?.documentedCosts).toBe('80.00');
    expect(result.monthly[4]?.paidCosts).toBe('80.00');
    expect(result.monthly[11]).toEqual({
      month: 12,
      issuedRevenue: '0.00',
      collectedRevenue: '0.00',
      documentedCosts: '0.00',
      paidCosts: '0.00',
    });
    const planning = calculateProfile(
      { ...profile, revenueTarget: '300.00' },
      [],
    );
    expect(planning.ok).toBe(true);
    if (planning.ok) {
      expect(result.fiscalProjection?.fiscalNet).toBe(planning.value.fiscalNet);
      expect(result.fiscalProjection?.contributions).toBe(
        planning.value.contributions,
      );
      expect(result.fiscalProjection?.substituteTax).toBe(
        planning.value.substituteTax,
      );
    }
    expect(result.fiscalProjection?.totalToReserve).toBe('120.61');
  });

  it('deriva residui e scadenze senza inventare date, ignorando reversed nell’incassato', () => {
    expect(financialPaymentSummary(invoice({}), '2026-09-30')).toMatchObject({
      paid: '0.00',
      outstanding: '100.00',
      overdue: '0.00',
      dueDate: undefined,
      status: 'Da incassare',
    });
    expect(
      financialPaymentSummary(snapshot().issuedDocuments[2]!, '2026-03-20'),
    ).toMatchObject({
      paid: '100.00',
      outstanding: '200.00',
      overdue: '0.00',
      status: 'Parziale',
    });
    expect(
      financialPaymentSummary(snapshot().issuedDocuments[2]!, '2026-03-21'),
    ).toMatchObject({ overdue: '150.00', status: 'Scaduta' });
    expect(
      financialPaymentSummary(snapshot().issuedDocuments[0]!, '2026-09-30'),
    ).toMatchObject({ outstanding: '0.00', status: 'Pagata' });
    // A payment schedule is authoritative even when its sum differs from gross.
    expect(
      financialPaymentSummary(
        invoice({
          payments: [
            { amount: '80.00', status: 'paid', paidDate: '2026-01-01' },
          ],
        }),
        '2026-09-30',
      ).outstanding,
    ).toBe('0.00');
  });

  it('rende indisponibile solo il fisco se il profilo manca, non è confermato o è di un altro anno', () => {
    for (const profile of [
      undefined,
      createFiscalPreset2026(),
      { ...createFiscalPreset2026(), year: 2025, confirmed: true },
    ]) {
      const result = calculateFinancialAnalysis(
        snapshot(),
        2026,
        profile,
        [],
        '2026-09-30',
      );
      expect(result.collectedRevenue).toBe('300.00');
      expect(result.fiscalProjection).toBeUndefined();
      expect(result.fiscalUnavailableReason).toBeTruthy();
    }
  });

  it('gestisce obiettivo superato, obiettivo nullo, zero incassi e soglie fiscali sugli incassi', () => {
    const profile = createFiscalPreset2026();
    Object.assign(profile, { confirmed: true, revenueTarget: '100.00' });
    const run = () =>
      calculateFinancialAnalysis(snapshot(), 2026, profile, [], '2026-09-30');
    expect(run().gapToTarget).toBe('-200.00');
    profile.revenueTarget = '0.00';
    expect(run().percentCollectedVsTarget).toBeUndefined();
    profile.fiscal.ordinaryThreshold = '200.00';
    profile.fiscal.cessationThreshold = '400.00';
    expect(run().fiscalUnavailableReason).toContain('applicabilità');
    profile.fiscal.ordinaryApplicabilityConfirmed = true;
    expect(run().fiscalProjection).toBeDefined();
    profile.fiscal.cessationThreshold = '250.00';
    expect(run().fiscalUnavailableReason).toContain('cessazione');
    const empty = { ...snapshot(), issuedDocuments: [], receivedDocuments: [] };
    expect(
      calculateFinancialAnalysis(empty, 2026, profile, [], '2026-09-30')
        .fiscalProjection?.fiscalNet,
    ).toBe('0.00');
  });

  it('unisce gli anni di profili, documenti e pagamenti e mantiene precisione decimale', () => {
    const data = snapshot();
    data.issuedDocuments[0]!.payments[0]!.paidDate = '2027-01-01';
    expect(
      financialYears(data, [{ ...createFiscalPreset2026(), year: 2024 }]),
    ).toEqual([2027, 2026, 2025, 2024]);
    expect(financialYears(undefined, [], [], [{ year: 2023 }])).toEqual([2023]);
    data.issuedDocuments[2]!.payments[1]!.dueDate = '2028-01-01';
    expect(
      financialYears(
        data,
        [{ ...createFiscalPreset2026(), year: 2024 }],
        [
          {
            ...meta(),
            date: '2023-01-01',
            amount: '1.00',
            description: 'Uscita',
            categoryIds: [],
          },
        ],
      ),
    ).toEqual([2028, 2027, 2026, 2025, 2024, 2023]);
    data.issuedDocuments = [
      invoice({ id: '1', amountGross: '0.10' }),
      invoice({ id: '2', amountGross: '0.20' }),
    ];
    expect(
      calculateFinancialAnalysis(data, 2026, undefined, [], '2026-09-30')
        .issuedRevenue,
    ).toBe('0.30');
  });
});
