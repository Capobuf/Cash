import { describe, expect, it } from 'vitest';
import { calculateFinancialAnalysis, financialPaymentSummary, financialYears } from '../../src/domain/financial-analysis';
import { calculateProfile } from '../../src/domain/calculations';
import { createFiscalPreset2026, meta, type FicFinancialSnapshot, type FicIssuedDocument } from '../../src/domain/model';

const invoice = (values: Partial<FicIssuedDocument>): FicIssuedDocument => ({ id: '1', type: 'invoice', date: '2026-02-01', amountGross: '100.00', payments: [], ...values });
const snapshot = (): FicFinancialSnapshot => ({ source: 'fatture_in_cloud', company: { id: '1', name: 'Studio' }, acquiredAt: '2026-09-30T10:00:00Z',
  issuedDocuments: [
    invoice({ id: '1', date: '2025-12-20', amountGross: '200.00', payments: [{ amount: '200.00', status: 'paid', paidDate: '2026-01-15' }] }),
    invoice({ id: '2' }),
    invoice({ id: '3', amountGross: '300.00', payments: [
      { amount: '100.00', status: 'paid', paidDate: '2026-03-10' },
      { amount: '150.00', status: 'not_paid', dueDate: '2026-03-20' },
      { amount: '50.00', status: 'reversed', dueDate: '2026-11-01', paidDate: '2026-03-11' },
    ] }),
    invoice({ id: '4', type: 'credit_note', amountGross: '25.00', payments: [{ amount: '25.00', status: 'paid', paidDate: '2026-03-10' }] }),
  ], receivedDocuments: [
    { id: '1', type: 'expense', date: '2026-04-01', amountGross: '80.00', payments: [{ amount: '80.00', status: 'paid', paidDate: '2026-05-01' }] },
    { id: '2', type: 'expense', date: '2025-12-01', amountGross: '20.00', payments: [{ amount: '20.00', status: 'paid', paidDate: '2026-01-10' }] },
    { id: '3', type: 'passive_credit_note', date: '2026-04-02', amountGross: '10.00', payments: [{ amount: '10.00', status: 'paid', paidDate: '2026-05-01' }] },
  ] });

describe('analisi finanziaria', () => {
  it('separa emesso, incassato per anno pagamento, note di credito e costi', () => {
    const profile = createFiscalPreset2026(); profile.revenueTarget = '1000.00'; profile.confirmed = true;
    const result = calculateFinancialAnalysis(snapshot(), 2026, profile, [{ ...meta(), category: 'Software', description: 'Suite', monthlyAmount: '10.00' }], '2026-09-30');
    expect(result).toMatchObject({ issuedRevenue: '400.00', collectedRevenue: '300.00', outstandingRevenue: '300.00', overdueRevenue: '150.00',
      issuedCreditNotes: '25.00', plannedBusinessCosts: '120.00', documentedCosts: '80.00', paidCosts: '100.00', receivedCreditNotes: '10.00',
      revenueTarget: '1000.00', gapToTarget: '700.00', percentIssuedVsTarget: '40.00', percentCollectedVsTarget: '30.00' });
    expect(result.monthly).toHaveLength(12);
    expect(result.monthly[0]).toMatchObject({ issuedRevenue: '0.00', collectedRevenue: '200.00', paidCosts: '20.00' });
    expect(result.monthly[1]?.issuedRevenue).toBe('400.00');
    expect(result.monthly[2]?.collectedRevenue).toBe('100.00');
    expect(result.monthly[3]?.documentedCosts).toBe('80.00');
    expect(result.monthly[4]?.paidCosts).toBe('80.00');
    expect(result.monthly[11]).toEqual({ month: 12, issuedRevenue: '0.00', collectedRevenue: '0.00', documentedCosts: '0.00', paidCosts: '0.00' });
    const planning = calculateProfile({ ...profile, revenueTarget: '300.00' }, []);
    expect(planning.ok).toBe(true);
    if (planning.ok) {
      expect(result.fiscalProjection?.fiscalNet).toBe(planning.value.fiscalNet);
      expect(result.fiscalProjection?.contributions).toBe(planning.value.contributions);
      expect(result.fiscalProjection?.substituteTax).toBe(planning.value.substituteTax);
    }
    expect(result.fiscalProjection?.totalToReserve).toBe('74.69');
  });

  it('deriva residui e scadenze senza inventare date, ignorando reversed nell’incassato', () => {
    expect(financialPaymentSummary(invoice({}), '2026-09-30')).toMatchObject({ paid: '0.00', outstanding: '100.00', overdue: '0.00', dueDate: undefined, status: 'Da incassare' });
    expect(financialPaymentSummary(snapshot().issuedDocuments[2]!, '2026-03-20')).toMatchObject({ paid: '100.00', outstanding: '200.00', overdue: '0.00', status: 'Parziale' });
    expect(financialPaymentSummary(snapshot().issuedDocuments[2]!, '2026-03-21')).toMatchObject({ overdue: '150.00', status: 'Scaduta' });
    expect(financialPaymentSummary(snapshot().issuedDocuments[0]!, '2026-09-30')).toMatchObject({ outstanding: '0.00', status: 'Pagata' });
    // A payment schedule is authoritative even when its sum differs from gross.
    expect(financialPaymentSummary(invoice({ payments: [{ amount: '80.00', status: 'paid', paidDate: '2026-01-01' }] }), '2026-09-30').outstanding).toBe('0.00');
  });

  it('rende indisponibile solo il fisco se il profilo manca, non è confermato o è di un altro anno', () => {
    for (const profile of [undefined, createFiscalPreset2026(), { ...createFiscalPreset2026(), year: 2025, confirmed: true }]) {
      const result = calculateFinancialAnalysis(snapshot(), 2026, profile, [], '2026-09-30');
      expect(result.collectedRevenue).toBe('300.00');
      expect(result.fiscalProjection).toBeUndefined();
      expect(result.fiscalUnavailableReason).toBeTruthy();
    }
  });

  it('gestisce obiettivo superato, obiettivo nullo, zero incassi e soglie fiscali sugli incassi', () => {
    const profile = createFiscalPreset2026(); Object.assign(profile, { confirmed: true, revenueTarget: '100.00' });
    const run = () => calculateFinancialAnalysis(snapshot(), 2026, profile, [], '2026-09-30');
    expect(run().gapToTarget).toBe('-200.00');
    profile.revenueTarget = '0.00'; expect(run().percentCollectedVsTarget).toBeUndefined();
    profile.fiscal.ordinaryThreshold = '200.00'; profile.fiscal.cessationThreshold = '400.00';
    expect(run().fiscalUnavailableReason).toContain('applicabilità');
    profile.fiscal.ordinaryApplicabilityConfirmed = true; expect(run().fiscalProjection).toBeDefined();
    profile.fiscal.cessationThreshold = '250.00'; expect(run().fiscalUnavailableReason).toContain('cessazione');
    const empty = { ...snapshot(), issuedDocuments: [], receivedDocuments: [] };
    expect(calculateFinancialAnalysis(empty, 2026, profile, [], '2026-09-30').fiscalProjection?.fiscalNet).toBe('0.00');
  });

  it('unisce gli anni di profili, documenti e pagamenti e mantiene precisione decimale', () => {
    const data = snapshot(); data.issuedDocuments[0]!.payments[0]!.paidDate = '2027-01-01';
    expect(financialYears(data, [{ ...createFiscalPreset2026(), year: 2024 }])).toEqual([2027, 2026, 2025, 2024]);
    data.issuedDocuments = [invoice({ id: '1', amountGross: '0.10' }), invoice({ id: '2', amountGross: '0.20' })];
    expect(calculateFinancialAnalysis(data, 2026, undefined, [], '2026-09-30').issuedRevenue).toBe('0.30');
  });
});
