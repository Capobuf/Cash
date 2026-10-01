import { summarizeBankExpenses } from './bank-expenses';
import { aggregateCollectionsByClient, annualPlannedBusinessCosts, calculateFinancialAnalysis } from './financial-analysis';
import { d, money, percentOut, sumMoney } from './decimal';
import type { CashDocument } from './model';

export function calculateFinancialOverview(doc: CashDocument, year: number, today: string) {
  const analysis = doc.financialSnapshot
    ? calculateFinancialAnalysis(doc.financialSnapshot, year, doc.profiles.find(profile => profile.year === year), doc.businessCosts, today)
    : undefined;
  const bankSummary = summarizeBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, year, doc.bankExpenseRules);
  const collectedRevenue = analysis?.collectedRevenue;
  const cashMarginBeforeTax = collectedRevenue === undefined ? undefined : money(d(collectedRevenue).minus(bankSummary.total));
  const fiscal = analysis?.fiscalProjection;
  const availableAfterTaxAndExpenses = cashMarginBeforeTax === undefined || !fiscal
    ? undefined : money(d(cashMarginBeforeTax).minus(fiscal.totalToReserve));
  const share = (amount: string | undefined) => amount !== undefined && collectedRevenue !== undefined && d(collectedRevenue).gt(0)
    ? percentOut(d(amount).div(collectedRevenue).mul(100)) : undefined;
  return {
    year, analysis, bankSummary,
    issuedRevenue: analysis?.issuedRevenue, collectedRevenue,
    outstandingRevenue: analysis?.outstandingRevenue, overdueRevenue: analysis?.overdueRevenue,
    bankExpenses: bankSummary.total, cashMarginBeforeTax,
    fiscalReserve: fiscal?.totalToReserve, fiscalContributions: fiscal?.contributions, fiscalSubstituteTax: fiscal?.substituteTax,
    fiscalUnavailableReason: analysis?.fiscalUnavailableReason ?? (!analysis ? 'Nessuno snapshot Fatture in Cloud disponibile.' : undefined),
    availableAfterTaxAndExpenses,
    bankExpenseShareOfCollections: share(bankSummary.total), availableShareOfCollections: share(availableAfterTaxAndExpenses),
    monthly: bankSummary.monthly.map((bankMonth, index) => {
      const collected = analysis?.monthly[index]?.collectedRevenue;
      return { month: bankMonth.month, collectedRevenue: collected, bankExpenses: bankMonth.amount,
        cashMarginBeforeTax: collected === undefined ? undefined : money(d(collected).minus(bankMonth.amount)) };
    }),
    collectionsByClient: doc.financialSnapshot ? aggregateCollectionsByClient(doc.financialSnapshot, year) : [],
    plannedBusinessCosts: analysis?.plannedBusinessCosts ?? annualPlannedBusinessCosts(doc.businessCosts),
    documentedCosts: analysis?.documentedCosts, ficPaidCosts: analysis?.paidCosts,
  };
}

export type FinancialOverview = ReturnType<typeof calculateFinancialOverview>;

export interface OverviewFlow {
  nodes: { key: string; name: string; amount: string }[];
  links: { source: number; target: number; value: number }[];
  message?: string;
}

// Monetary arithmetic stays decimal; only positive chart link values become numbers.
// Zero branches are omitted to avoid isolated nodes and zero-height Sankey layouts.
export function buildFinancialOverviewFlow(overview: FinancialOverview): OverviewFlow {
  const { collectedRevenue: collected, bankExpenses, cashMarginBeforeTax: margin, fiscalReserve: reserve,
    availableAfterTaxAndExpenses: available } = overview;
  const flow: OverviewFlow = { nodes: [], links: [] };
  if (collected === undefined || margin === undefined) return { ...flow, message: 'Flusso non disponibile senza uno snapshot Fatture in Cloud.' };
  if (d(margin).lt(0)) return { ...flow, message: 'Le uscite bancarie superano l’incassato dell’anno; il flusso non può essere rappresentato come ripartizione positiva.' };
  if (d(collected).isZero()) return { ...flow, message: 'Nessun incasso nell’anno selezionato: nessun flusso positivo da rappresentare.' };
  const node = (key: string, name: string, amount: string) => flow.nodes.push({ key, name, amount }) - 1;
  const link = (source: number, target: number, amount: string) => flow.links.push({ source, target, value: Number(amount) });
  const collectedNode = node('collected', 'Incassato', collected);
  const clients = overview.collectionsByClient.slice(0, 5);
  const others = overview.collectionsByClient.slice(5);
  for (const client of clients) link(node(client.key, client.name, client.amount), collectedNode, client.amount);
  if (others.length) {
    const amount = sumMoney(others.map(client => client.amount));
    link(node('other-clients', 'Altri clienti', amount), collectedNode, amount);
  }
  if (d(bankExpenses).gt(0)) link(collectedNode, node('bank', 'Spese bancarie', bankExpenses), bankExpenses);
  if (d(margin).gt(0)) {
    const marginNode = node('margin', 'Margine prima della fiscalità', margin);
    link(collectedNode, marginNode, margin);
    if (reserve !== undefined && available !== undefined && d(available).gte(0)) {
      if (d(reserve).gt(0)) link(marginNode, node('fiscal', 'Fiscalità e contributi stimati', reserve), reserve);
      if (d(available).gt(0)) link(marginNode, node('available', 'Disponibile stimato', available), available);
    }
  }
  if (reserve === undefined) flow.message = `Ripartizione fiscale non disponibile. ${overview.fiscalUnavailableReason ?? ''}`;
  else if (available !== undefined && d(available).lt(0)) flow.message = 'La fiscalità stimata supera il margine: il diagramma si ferma prima della fiscalità. Il disavanzo stimato è indicato nel riepilogo.';
  return flow;
}
