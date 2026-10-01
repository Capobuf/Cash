import { describe, expect, it } from 'vitest';
import { aggregateCollectionsByClient } from '../../src/domain/financial-analysis';
import { buildFinancialOverviewFlow, calculateFinancialOverview } from '../../src/domain/financial-overview';
import { d, money, sumMoney } from '../../src/domain/decimal';
import { createEmptyDocument, createFiscalPreset2026, meta, type FicIssuedDocument } from '../../src/domain/model';

const invoice = (amount: string, overrides: Partial<FicIssuedDocument> = {}): FicIssuedDocument => ({
  id: meta().id, type: 'invoice', date: '2026-01-01', amountGross: amount, entityId: 'client', entityName: 'Cliente',
  payments: [{ amount, status: 'paid', paidDate: '2026-02-01' }], ...overrides,
});
function fixture(collected = '40000.00', spent = '10000.00') {
  const doc = createEmptyDocument();
  const profile = createFiscalPreset2026();
  profile.confirmed = true;
  // Deliberate fixture parameters: 6,000 contributions + 3,000 substitute tax.
  Object.assign(profile.fiscal, { profitabilityCoefficient: '75', contributionRate: '20', ordinarySubstituteTaxRate: '12.5' });
  doc.profiles = [profile];
  doc.financialSnapshot = { source: 'fatture_in_cloud', company: { id: '1', name: 'Studio' }, acquiredAt: '2026-10-01T10:00:00Z',
    issuedDocuments: [invoice(collected)], receivedDocuments: [] };
  doc.bankExpenses = [{ ...meta(), amount: spent, date: '2026-02-03', description: 'Spesa', categoryIds: [] }];
  return doc;
}
const overview = (doc = fixture(), year = 2026) => calculateFinancialOverview(doc, year, '2026-10-01');

describe('panoramica finanziaria unificata', () => {
  it('calcola margine e disponibile con la sola stima fiscale esistente', () => {
    const result = overview();
    expect(result).toMatchObject({ collectedRevenue: '40000.00', bankExpenses: '10000.00', cashMarginBeforeTax: '30000.00',
      fiscalReserve: '9000.00', availableAfterTaxAndExpenses: '21000.00', bankExpenseShareOfCollections: '25.00', availableShareOfCollections: '52.50' });
    expect(result.fiscalReserve).toBe(result.analysis?.fiscalProjection?.totalToReserve);
  });

  it.each(['missing', 'unconfirmed', 'other-year'] as const)('mantiene il margine senza inventare fiscalità: %s', mode => {
    const doc = fixture();
    if (mode === 'missing') doc.profiles = [];
    if (mode === 'unconfirmed') doc.profiles[0]!.confirmed = false;
    if (mode === 'other-year') doc.profiles[0]!.year = 2025;
    expect(overview(doc)).toMatchObject({ cashMarginBeforeTax: '30000.00', fiscalReserve: undefined, availableAfterTaxAndExpenses: undefined });
    expect(overview(doc).fiscalUnavailableReason).toBeTruthy();
    expect(buildFinancialOverviewFlow(overview(doc)).nodes.some(node => node.key === 'margin')).toBe(true);
  });

  it('preserva il disavanzo e non crea un flusso incoerente', () => {
    const result = overview(fixture('10000.00', '12000.00'));
    expect(result.cashMarginBeforeTax).toBe('-2000.00');
    expect(result.availableAfterTaxAndExpenses).toBe('-4250.00');
    expect(buildFinancialOverviewFlow(result)).toMatchObject({ nodes: [], links: [], message: expect.stringContaining('superano') });
  });

  it('tiene separati costi FIC, pianificati e banca; preserva le note di credito', () => {
    const doc = fixture('10000.00', '1000.00');
    doc.businessCosts = [{ ...meta(), category: 'Software', description: 'Piano', monthlyAmount: '500.00' }];
    doc.financialSnapshot!.receivedDocuments = [{ id: 'cost', type: 'expense', date: '2026-02-01', amountGross: '1000.00',
      payments: [{ status: 'paid', amount: '1000.00', paidDate: '2026-02-03' }] },
    { id: 'credit', type: 'passive_credit_note', date: '2026-02-01', amountGross: '50.00', payments: [] }];
    doc.financialSnapshot!.issuedDocuments.push(invoice('100.00', { type: 'credit_note' }));
    expect(overview(doc)).toMatchObject({ collectedRevenue: '10000.00', issuedRevenue: '10000.00', bankExpenses: '1000.00',
      documentedCosts: '1000.00', ficPaidCosts: '1000.00', plannedBusinessCosts: '6000.00', cashMarginBeforeTax: '9000.00',
      analysis: { issuedCreditNotes: '100.00', receivedCreditNotes: '50.00' } });
  });

  it('raggruppa gli incassi per paidDate su tutte le fatture senza perdere controparti sconosciute', () => {
    const doc = fixture();
    doc.financialSnapshot!.issuedDocuments = [
      invoice('0.10', { date: '2025-12-20', entityName: ' ACME  srl ' }),
      invoice('0.20', { entityId: undefined, entityName: 'acme srl' }),
      invoice('7.31', { entityId: undefined, entityName: undefined }),
      invoice('100.00', { payments: [
        { amount: '5.00', status: 'paid', paidDate: '2025-01-01' },
        { amount: '6.00', status: 'reversed', paidDate: '2026-01-01' },
        { amount: '7.00', status: 'not_paid', dueDate: '2026-01-01' },
        { amount: '8.00', status: 'paid' },
      ] }),
      invoice('100.00', { type: 'credit_note' }),
    ];
    const result = overview(doc);
    expect(result.collectionsByClient.map(client => [client.name, client.amount])).toEqual([
      ['Controparte non disponibile', '7.31'], ['ACME srl', '0.30'],
    ]);
    expect(sumMoney(result.collectionsByClient.map(client => client.amount))).toBe(result.collectedRevenue);
    expect(aggregateCollectionsByClient(doc.financialSnapshot!, 2025)[0]?.amount).toBe('5.00');
  });

  it('non fonde omonimi con ID diversi o identità ambigue senza ID', () => {
    const doc = fixture();
    doc.financialSnapshot!.issuedDocuments = [invoice('1.00', { entityId: 'a' }), invoice('2.00', { entityId: 'b' }), invoice('3.00', { entityId: undefined })];
    expect(overview(doc).collectionsByClient.map(client => client.amount)).toEqual(['3.00', '2.00', '1.00']);
  });

  it('unisce dodici mesi per data pagamento FIC e data movimento bancario', () => {
    const doc = fixture();
    doc.financialSnapshot!.issuedDocuments[0]!.date = '2025-12-31';
    doc.bankExpenses[0]!.date = '2026-03-01';
    doc.bankExpenses.push({ ...doc.bankExpenses[0]!, ...meta(), date: '2025-03-01' });
    const result = overview(doc);
    expect(result.monthly).toHaveLength(12);
    for (const month of result.monthly) expect(month.cashMarginBeforeTax).toBe(money(d(month.collectedRevenue!).minus(month.bankExpenses)));
    expect(result.monthly[1]?.cashMarginBeforeTax).toBe('40000.00');
    expect(result.monthly[2]?.cashMarginBeforeTax).toBe('-10000.00');
    expect(sumMoney(result.monthly.map(month => month.cashMarginBeforeTax!))).toBe(result.cashMarginBeforeTax);
  });

  it('conta la spesa una volta ma include categorie multiple, sottocategorie e regole', () => {
    const doc = fixture();
    doc.bankExpenseCategories = [
      { ...meta(), id: 'online', name: 'Pagamenti online' }, { ...meta(), id: 'software', name: 'Software' },
      { ...meta(), id: 'suite', name: 'Suite', parentId: 'software' },
    ];
    doc.bankExpenses[0]!.categoryIds = ['online', 'software', 'suite'];
    doc.bankExpenseRules = [{ ...meta(), categoryId: 'software', matchText: 'Spesa' }];
    expect(overview(doc).bankExpenses).toBe('10000.00');
    expect(overview(doc).bankSummary.categories.map(category => category.amount)).toEqual(['10000.00', '10000.00']);
    expect(overview(doc).bankSummary.categories[1]?.children[0]?.amount).toBe('10000.00');
  });

  it('distingue snapshot assente, raccolte vuote e incassato zero', () => {
    const doc = fixture(); delete doc.financialSnapshot;
    const absent = overview(doc);
    expect(absent).toMatchObject({ bankExpenses: '10000.00', issuedRevenue: undefined, collectedRevenue: undefined,
      cashMarginBeforeTax: undefined, fiscalReserve: undefined, availableAfterTaxAndExpenses: undefined, documentedCosts: undefined });
    expect(absent.monthly.every(month => month.collectedRevenue === undefined && month.cashMarginBeforeTax === undefined)).toBe(true);
    expect(buildFinancialOverviewFlow(absent).links).toEqual([]);
    const empty = fixture(); empty.bankExpenses = []; empty.financialSnapshot!.issuedDocuments = [];
    expect(overview(empty)).toMatchObject({ bankExpenses: '0.00', collectedRevenue: '0.00', cashMarginBeforeTax: '0.00',
      availableAfterTaxAndExpenses: '0.00', bankExpenseShareOfCollections: undefined, availableShareOfCollections: undefined });
    expect(buildFinancialOverviewFlow(overview(empty)).links).toEqual([]);
    expect(overview(fixture(), 2027)).toMatchObject({ bankExpenses: '0.00', collectedRevenue: '0.00', fiscalReserve: undefined });
  });

  it('conserva gli importi del Sankey, inclusi top 5 e resto esatto', () => {
    const doc = fixture('40000.00', '10000.00');
    doc.financialSnapshot!.issuedDocuments = Array.from({ length: 8 }, (_, i) => invoice('5000.00', { entityId: String(i), entityName: `Cliente ${i}` }));
    const result = overview(doc); const flow = buildFinancialOverviewFlow(result);
    const index = (key: string) => flow.nodes.findIndex(node => node.key === key);
    const incoming = (key: string) => sumMoney(flow.links.filter(link => link.target === index(key)).map(link => link.value));
    const outgoing = (key: string) => sumMoney(flow.links.filter(link => link.source === index(key)).map(link => link.value));
    expect(flow.nodes.find(node => node.key === 'other-clients')?.amount).toBe('15000.00');
    expect(incoming('collected')).toBe(result.collectedRevenue);
    expect(outgoing('collected')).toBe(result.collectedRevenue);
    expect(incoming('margin')).toBe(result.cashMarginBeforeTax);
    expect(outgoing('margin')).toBe(result.cashMarginBeforeTax);
    expect(flow.links.every(link => link.value > 0)).toBe(true);
  });

  it.each(['10000.00', '8000.00', '7750.00', '0.00'])('gestisce i confini del Sankey con spese %s', spent => {
    const result = overview(fixture('10000.00', spent)); const flow = buildFinancialOverviewFlow(result);
    expect(flow.links.every(link => link.value > 0)).toBe(true);
    expect(flow.nodes.every((_, index) => flow.links.some(link => link.source === index || link.target === index))).toBe(true);
    if (d(result.availableAfterTaxAndExpenses!).lt(0)) {
      expect(flow.nodes.some(node => node.key === 'fiscal' || node.key === 'available')).toBe(false);
      expect(flow.message).toContain('disavanzo');
    }
  });
});
