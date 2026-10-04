import {
  effectiveCategoryIds,
  isBankExpenseExcluded,
  summarizeBankExpenses,
} from './bank-expenses';
import {
  aggregateCollectionsByClient,
  annualPlannedBusinessCosts,
  calculateFinancialAnalysis,
} from './financial-analysis';
import { d, money, percentOut, sumMoney } from './decimal';
import type { CashDocument } from './model';

export function calculateFiscalReserve(
  total: string | undefined,
  paid = '0.00',
) {
  const remaining =
    total === undefined
      ? undefined
      : money(d(total).minus(paid).clamp(0, Infinity));
  const excess =
    total === undefined
      ? undefined
      : money(d(paid).minus(total).clamp(0, Infinity));
  return { total, paid, remaining, excess };
}

export function calculateFinancialOverview(
  doc: CashDocument,
  year: number,
  today: string,
) {
  const analysis = doc.financialSnapshot
    ? calculateFinancialAnalysis(
        doc.financialSnapshot,
        year,
        doc.profiles.find((profile) => profile.year === year),
        doc.businessCosts,
        today,
        doc.profiles.find((profile) => profile.year === year + 1),
        doc.settings.fic.company?.id === doc.financialSnapshot.company.id
          ? doc.settings.fic.taxProfile
          : undefined,
      )
    : undefined;
  const bankSummary = summarizeBankExpenses(
    doc.bankExpenses,
    doc.bankExpenseCategories,
    year,
    doc.bankExpenseRules,
  );
  const collectedRevenue = analysis?.collectedRevenue;
  const marginAfterOutflows =
    collectedRevenue === undefined
      ? undefined
      : money(d(collectedRevenue).minus(bankSummary.total));
  const taxCategoryId = doc.bankExpenseCategories.find(
    (category) => category.systemRole === 'vat_taxes',
  )?.id;
  const paidTaxes = sumMoney(
    doc.bankExpenses
      .filter(
        (expense) =>
          expense.date.slice(0, 4) === String(year) &&
          !isBankExpenseExcluded(
            expense,
            doc.bankExpenseCategories,
            doc.bankExpenseRules,
          ) &&
          taxCategoryId !== undefined &&
          effectiveCategoryIds(expense, doc.bankExpenseRules).includes(
            taxCategoryId,
          ),
      )
      .map((expense) => expense.amount),
  );
  const fiscalPaymentOverride = doc.fiscalPaymentOverrides?.find(
    (entry) => entry.year === year,
  )?.total;
  const fiscalSituation = calculateFiscalReserve(
    fiscalPaymentOverride,
    paidTaxes,
  );
  // All bank expenses include taxes already paid; subtract only the fiscal remainder.
  const estimatedAvailability =
    marginAfterOutflows === undefined || fiscalSituation.remaining === undefined
      ? undefined
      : money(d(marginAfterOutflows).minus(fiscalSituation.remaining));
  const share = (amount: string | undefined) =>
    amount !== undefined &&
    collectedRevenue !== undefined &&
    d(collectedRevenue).gt(0)
      ? percentOut(d(amount).div(collectedRevenue).mul(100))
      : undefined;
  return {
    year,
    analysis,
    bankSummary,
    issuedRevenue: analysis?.issuedRevenue,
    collectedRevenue,
    outstandingRevenue: analysis?.outstandingRevenue,
    overdueRevenue: analysis?.overdueRevenue,
    bankExpenses: bankSummary.total,
    marginAfterOutflows,
    fiscalSituation,
    fiscalReserve: fiscalSituation.remaining,
    fiscalPaymentOverride,
    fiscalPaymentUnavailableReason:
      fiscalPaymentOverride === undefined
        ? `Manca il totale annuale dei versamenti ${year} del commercialista; ancora da versare e disponibilità stimata non sono determinabili.`
        : undefined,
    fiscalUnavailableReason:
      analysis?.fiscalUnavailableReason ??
      (!analysis
        ? 'Nessuno snapshot Fatture in Cloud disponibile.'
        : undefined),
    estimatedAvailability,
    bankExpenseShareOfCollections: share(bankSummary.total),
    availableShareOfCollections: share(estimatedAvailability),
    monthly: bankSummary.monthly.map((bankMonth, index) => {
      const collected = analysis?.monthly[index]?.collectedRevenue;
      return {
        month: bankMonth.month,
        collectedRevenue: collected,
        bankExpenses: bankMonth.amount,
        marginAfterOutflows:
          collected === undefined
            ? undefined
            : money(d(collected).minus(bankMonth.amount)),
      };
    }),
    collectionsByClient: doc.financialSnapshot
      ? aggregateCollectionsByClient(doc.financialSnapshot, year)
      : [],
    plannedBusinessCosts:
      analysis?.plannedBusinessCosts ??
      annualPlannedBusinessCosts(doc.businessCosts),
    documentedCosts: analysis?.documentedCosts,
    ficPaidCosts: analysis?.paidCosts,
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
export function buildFinancialOverviewFlow(
  overview: FinancialOverview,
): OverviewFlow {
  const {
    collectedRevenue: collected,
    bankExpenses,
    marginAfterOutflows: margin,
    fiscalReserve: reserve,
    estimatedAvailability: available,
  } = overview;
  const flow: OverviewFlow = { nodes: [], links: [] };
  if (collected === undefined || margin === undefined)
    return {
      ...flow,
      message: 'Flusso non disponibile senza uno snapshot Fatture in Cloud.',
    };
  if (d(margin).lt(0))
    return {
      ...flow,
      message:
        'Le uscite dal conto superano l’incassato dell’anno; il flusso non può essere rappresentato come ripartizione positiva.',
    };
  if (d(collected).isZero())
    return {
      ...flow,
      message:
        'Nessun incasso nell’anno selezionato: nessun flusso positivo da rappresentare.',
    };
  const node = (key: string, name: string, amount: string) =>
    flow.nodes.push({ key, name, amount }) - 1;
  const link = (source: number, target: number, amount: string) =>
    flow.links.push({ source, target, value: Number(amount) });
  const collectedNode = node('collected', 'Incassato nell’anno', collected);
  const clients = overview.collectionsByClient.slice(0, 5);
  const others = overview.collectionsByClient.slice(5);
  for (const client of clients)
    link(
      node(client.key, client.name, client.amount),
      collectedNode,
      client.amount,
    );
  if (others.length) {
    const amount = sumMoney(others.map((client) => client.amount));
    link(node('other-clients', 'Altri clienti', amount), collectedNode, amount);
  }
  if (d(bankExpenses).gt(0)) {
    const bankNode = node('bank', 'Uscite dal conto', bankExpenses);
    link(collectedNode, bankNode, bankExpenses);
    const paid = overview.fiscalSituation.paid;
    // Effective tax categories identify a partition; ordinary categories may overlap.
    const otherOutflows = money(d(bankExpenses).minus(paid));
    if (d(paid).gt(0))
      link(
        bankNode,
        node('paid-taxes', 'Imposte P.IVA già pagate', paid),
        paid,
      );
    if (d(otherOutflows).gt(0))
      link(
        bankNode,
        node('other-outflows', 'Altre uscite', otherOutflows),
        otherOutflows,
      );
  }
  if (d(margin).gt(0)) {
    const marginNode = node('margin', 'Margine dopo le uscite', margin);
    link(collectedNode, marginNode, margin);
    if (
      reserve !== undefined &&
      available !== undefined &&
      d(available).gte(0)
    ) {
      if (d(reserve).gt(0))
        link(
          marginNode,
          node('fiscal', 'Ancora da versare nell’anno', reserve),
          reserve,
        );
      if (d(available).gt(0))
        link(
          marginNode,
          node('available', 'Disponibilità stimata', available),
          available,
        );
    }
  }
  if (reserve === undefined)
    flow.message = overview.fiscalPaymentUnavailableReason;
  else if (available !== undefined && d(available).lt(0))
    flow.message =
      'Il totale ancora da versare supera il margine: il diagramma si ferma al margine dopo le uscite. Il disavanzo stimato è indicato nel riepilogo.';
  return flow;
}
