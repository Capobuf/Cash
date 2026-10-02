import { calculateFiscalProjection, type FiscalProjection } from './calculations';
import { d, money, percentOut, sumMoney } from './decimal';
import type { BankExpense, BusinessCost, EconomicProfile, FicFinancialSnapshot, FicIssuedDocument, FicReceivedDocument, FinancialProvision } from './model';

type FinancialDocument = FicIssuedDocument | FicReceivedDocument;
const inYear = (date: string | undefined, year: number) => date?.slice(0, 4) === String(year);
const paidInYear = (documents: FinancialDocument[], year: number) => documents.flatMap(document => document.payments)
  .filter(payment => payment.status === 'paid' && inYear(payment.paidDate, year));

export const annualPlannedBusinessCosts = (costs: BusinessCost[]) =>
  money(costs.reduce((sum, cost) => sum.plus(d(cost.monthlyAmount).mul(12)), d(0)));

export function financialYears(snapshot: FicFinancialSnapshot | undefined, profiles: EconomicProfile[], bankExpenses: BankExpense[] = [], provisions: FinancialProvision[] = []): number[] {
  const years = new Set(profiles.map(profile => profile.year));
  for (const provision of provisions) years.add(provision.year);
  for (const expense of bankExpenses) years.add(Number(expense.date.slice(0, 4)));
  for (const document of [...(snapshot?.issuedDocuments ?? []), ...(snapshot?.receivedDocuments ?? [])]) {
    years.add(Number(document.date.slice(0, 4)));
    for (const payment of document.payments) {
      if (payment.paidDate) years.add(Number(payment.paidDate.slice(0, 4)));
      if (payment.dueDate) years.add(Number(payment.dueDate.slice(0, 4)));
    }
  }
  return [...years].sort((a, b) => b - a);
}

export function financialPaymentSummary(document: FinancialDocument, today: string) {
  const paid = sumMoney(document.payments.filter(payment => payment.status === 'paid').map(payment => payment.amount));
  const unpaid = document.payments.filter(payment => payment.status !== 'paid' && d(payment.amount).gt(0));
  // FIC payment schedules can differ from amount_gross (e.g. withholding).
  // Only an absent schedule makes the entire gross amount outstanding.
  const outstanding = document.payments.length ? sumMoney(unpaid.map(payment => payment.amount)) : document.amountGross;
  const overdue = sumMoney(unpaid.filter(payment => payment.dueDate && payment.dueDate < today).map(payment => payment.amount));
  const dueDate = d(outstanding).gt(0) ? unpaid.flatMap(payment => payment.dueDate ? [payment.dueDate] : []).sort()[0] : undefined;
  const status = d(outstanding).isZero() ? 'Pagata' : d(overdue).gt(0) ? 'Scaduta' : d(paid).gt(0) ? 'Parziale' : 'Da incassare';
  return { paid, outstanding, overdue, dueDate, status };
}

export interface FinancialMonth {
  month: number; issuedRevenue: string; collectedRevenue: string; documentedCosts: string; paidCosts: string;
}

const share = (amount: string, total: string) => d(total).gt(0) ? percentOut(d(amount).div(total).mul(100)) : undefined;

// Dates are validated ISO calendar dates; UTC prevents DST from changing day counts.
export const calendarDaysBetween = (from: string, to: string): number =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

function groupDocuments<T extends FinancialDocument>(documents: T[], keyOf: (document: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const document of documents) {
    const key = keyOf(document);
    const group = groups.get(key);
    if (group) group.push(document); else groups.set(key, [document]);
  }
  return [...groups.values()];
}

const entityKey = (document: FinancialDocument) => document.entityId
  ? `entity:${document.entityId}` : `document:${document.type}:${document.id}`;
const cleanEntityName = (name: string | undefined) => name?.normalize('NFC').trim().replace(/\s+/g, ' ') ?? '';
const clientNameKey = (document: FicIssuedDocument) => cleanEntityName(document.entityName).toLocaleLowerCase('it-IT');

function groupClientDocuments(invoices: FicIssuedDocument[]) {
  const idsByName = new Map<string, Set<string>>();
  for (const invoice of invoices) {
    const name = clientNameKey(invoice);
    if (!name || !invoice.entityId) continue;
    const ids = idsByName.get(name) ?? new Set<string>();
    ids.add(invoice.entityId);
    idsByName.set(name, ids);
  }
  const keyOf = (invoice: FicIssuedDocument) => {
    if (invoice.entityId) return entityKey(invoice);
    const name = clientNameKey(invoice);
    if (!name) return entityKey(invoice);
    const ids = idsByName.get(name);
    // Attach a document without an ID only when its name identifies one FIC client.
    return ids?.size === 1 ? `entity:${[...ids][0]}` : `name:${name}`;
  };
  return groupDocuments(invoices, keyOf).map(documents => ({ documents, key: keyOf(documents[0]!) }));
}

function identity(documents: FinancialDocument[], key = entityKey(documents[0]!)) {
  const first = documents[0]!;
  return { key, entityId: documents.find(document => document.entityId)?.entityId,
    name: cleanEntityName(documents.find(document => document.entityName?.trim())?.entityName) || 'Controparte non disponibile',
    ungroupedDocumentId: key.startsWith('document:') ? first.id : undefined };
}

// Aggregates refer to documents issued in the selected year and their complete
// payment schedules. Calendar-year cash flows remain separate in the KPI/months.
export function aggregateClients(invoices: FicIssuedDocument[], today: string) {
  const total = sumMoney(invoices.map(document => document.amountGross));
  return groupClientDocuments(invoices).map(({ documents, key }) => {
    const summaries = documents.map(document => financialPaymentSummary(document, today));
    const issuedRevenue = sumMoney(documents.map(document => document.amountGross));
    return { ...identity(documents, key), invoiceCount: documents.length, issuedRevenue,
      collectedRevenue: sumMoney(summaries.map(summary => summary.paid)),
      outstandingRevenue: sumMoney(summaries.map(summary => summary.outstanding)),
      overdueRevenue: sumMoney(summaries.map(summary => summary.overdue)),
      revenueShare: share(issuedRevenue, total) };
  }).sort((a, b) => d(b.issuedRevenue).cmp(a.issuedRevenue) || a.key.localeCompare(b.key));
}

// Cash-year collections include invoices from any issue year. Reuse client identity
// resolution across all invoices, including documents without an ID or readable name.
export function aggregateCollectionsByClient(snapshot: FicFinancialSnapshot, year: number) {
  return groupClientDocuments(snapshot.issuedDocuments.filter(document => document.type === 'invoice'))
    .map(({ documents, key }) => ({ ...identity(documents, key),
      amount: sumMoney(paidInYear(documents, year).map(payment => payment.amount)) }))
    .filter(client => !d(client.amount).isZero())
    .sort((a, b) => d(b.amount).cmp(a.amount) || a.key.localeCompare(b.key));
}

export function analyzeClientPayments(invoices: FicIssuedDocument[], today: string) {
  return groupClientDocuments(invoices).map(({ documents, key }) => {
    const payments = documents.flatMap(document => document.payments);
    const delays = payments.flatMap(payment => payment.status === 'paid' && payment.dueDate && payment.paidDate
      ? [Math.max(0, calendarDaysBetween(payment.dueDate, payment.paidDate))] : []);
    const openDueDates = payments.flatMap(payment => payment.status !== 'paid' && d(payment.amount).gt(0)
      && payment.dueDate && payment.dueDate < today ? [payment.dueDate] : []).sort();
    const summaries = documents.map(document => financialPaymentSummary(document, today));
    return { ...identity(documents, key), analyzedPaymentCount: delays.length,
      averageDelayDays: delays.length ? delays.reduce((sum, delay) => sum + delay, 0) / delays.length : undefined,
      maxDelayDays: delays.length ? Math.max(...delays) : undefined,
      onTimePercentage: delays.length ? percentOut(d(delays.filter(delay => delay === 0).length).div(delays.length).mul(100)) : undefined,
      overdueRevenue: sumMoney(summaries.map(summary => summary.overdue)),
      overdueInvoiceCount: summaries.filter(summary => d(summary.overdue).gt(0)).length,
      oldestOpenDueDays: openDueDates[0] ? calendarDaysBetween(openDueDates[0], today) : undefined };
  }).sort((a, b) => (b.averageDelayDays ?? -1) - (a.averageDelayDays ?? -1)
    || d(b.overdueRevenue).cmp(a.overdueRevenue) || a.key.localeCompare(b.key));
}

function costTotals(documents: FicReceivedDocument[], today: string) {
  const summaries = documents.map(document => financialPaymentSummary(document, today));
  return { documentCount: documents.length, documentedCosts: sumMoney(documents.map(document => document.amountGross)),
    paidCosts: sumMoney(summaries.map(summary => summary.paid)), outstandingCosts: sumMoney(summaries.map(summary => summary.outstanding)) };
}

export function aggregateCostCategories(expenses: FicReceivedDocument[], today: string) {
  const total = sumMoney(expenses.map(document => document.amountGross));
  const categoryKey = (document: FicReceivedDocument) => document.category?.trim() ? `category:${document.category}` : 'missing';
  return groupDocuments(expenses, categoryKey).map(documents => {
    const totals = costTotals(documents, today);
    return { key: categoryKey(documents[0]!), category: documents[0]!.category?.trim() ? documents[0]!.category! : 'Senza categoria',
      ...totals, costShare: share(totals.documentedCosts, total) };
  }).sort((a, b) => d(b.documentedCosts).cmp(a.documentedCosts) || a.key.localeCompare(b.key));
}

export function aggregateSuppliers(expenses: FicReceivedDocument[], today: string) {
  return groupDocuments(expenses, entityKey).map(documents => ({ ...identity(documents), ...costTotals(documents, today) }))
    .sort((a, b) => d(b.documentedCosts).cmp(a.documentedCosts) || a.key.localeCompare(b.key));
}

export type FinancialAnalysis = ReturnType<typeof calculateFinancialAnalysis>;

export function calculateFinancialAnalysis(snapshot: FicFinancialSnapshot, year: number,
  profile: EconomicProfile | undefined, costs: BusinessCost[], today: string) {
  const annualProfile = profile?.year === year ? profile : undefined;
  const invoices = snapshot.issuedDocuments.filter(document => document.type === 'invoice');
  const expenses = snapshot.receivedDocuments.filter(document => document.type === 'expense');
  const annualInvoices = invoices.filter(document => inYear(document.date, year));
  const annualExpenses = expenses.filter(document => inYear(document.date, year));
  const total = (documents: FinancialDocument[]) => sumMoney(documents.map(document => document.amountGross));
  const collections = paidInYear(invoices, year); const paidExpenses = paidInYear(expenses, year);
  const issuedRevenue = total(annualInvoices); const collectedRevenue = sumMoney(collections.map(payment => payment.amount));
  const invoiceDetails = annualInvoices.map(document => ({ document, ...financialPaymentSummary(document, today) }));
  const costDetails = annualExpenses.map(document => ({ document, ...financialPaymentSummary(document, today) }));
  const revenueTarget = annualProfile?.revenueTarget;
  let fiscalProjection: FiscalProjection | undefined;
  let fiscalUnavailableReason: string | undefined;
  const fiscalWarnings: string[] = [];
  if (!annualProfile) fiscalUnavailableReason = `Manca il profilo fiscale per il ${year}.`;
  else if (!annualProfile.confirmed) fiscalUnavailableReason = `Il profilo fiscale ${year} non è confermato.`;
  else {
    const fiscal = annualProfile.fiscal;
    if (fiscal.activityPhase === 'reduced_eligible' && !fiscal.reducedEligibilityConfirmed)
      fiscalUnavailableReason = 'Confermare i requisiti per l’aliquota agevolata.';
    else if (d(collectedRevenue).gt(fiscal.cessationThreshold))
      fiscalUnavailableReason = 'Incassato oltre la soglia di cessazione: proiezione forfettaria non disponibile.';
    else if (d(collectedRevenue).gt(fiscal.ordinaryThreshold) && !fiscal.ordinaryApplicabilityConfirmed)
      fiscalUnavailableReason = 'Confermare l’applicabilità del regime oltre la soglia ordinaria.';
    else {
      const result = calculateFiscalProjection(collectedRevenue, fiscal);
      if (result.ok) fiscalProjection = result.value; else fiscalUnavailableReason = result.error.message;
    }
    if (d(collectedRevenue).gt(fiscal.ordinaryThreshold)) fiscalWarnings.push('Incassato oltre la soglia ordinaria del regime forfettario.');
  }
  const monthly: FinancialMonth[] = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1; const isMonth = (date: string) => Number(date.slice(5, 7)) === month;
    return { month,
      issuedRevenue: total(annualInvoices.filter(document => isMonth(document.date))),
      collectedRevenue: sumMoney(collections.filter(payment => isMonth(payment.paidDate!)).map(payment => payment.amount)),
      documentedCosts: total(annualExpenses.filter(document => isMonth(document.date))),
      paidCosts: sumMoney(paidExpenses.filter(payment => isMonth(payment.paidDate!)).map(payment => payment.amount)),
    };
  });
  return {
    invoiceCount: annualInvoices.length,
    outstandingInvoiceCount: invoiceDetails.filter(detail => d(detail.outstanding).gt(0)).length,
    overdueInvoiceCount: invoiceDetails.filter(detail => d(detail.overdue).gt(0)).length,
    costDocumentCount: annualExpenses.length,
    clientAnalysis: aggregateClients(annualInvoices, today),
    clientPaymentAnalysis: analyzeClientPayments(annualInvoices, today),
    costCategoryAnalysis: aggregateCostCategories(annualExpenses, today),
    supplierAnalysis: aggregateSuppliers(annualExpenses, today),
    costIncidenceOnIssued: share(total(annualExpenses), issuedRevenue),
    paidCostIncidenceOnCollected: share(sumMoney(paidExpenses.map(payment => payment.amount)), collectedRevenue),
    revenueTarget, issuedRevenue, collectedRevenue,
    outstandingRevenue: sumMoney(invoiceDetails.map(detail => detail.outstanding)),
    overdueRevenue: sumMoney(invoiceDetails.map(detail => detail.overdue)),
    issuedCreditNotes: total(snapshot.issuedDocuments.filter(document => document.type === 'credit_note' && inYear(document.date, year))),
    plannedBusinessCosts: annualPlannedBusinessCosts(costs),
    documentedCosts: total(annualExpenses), paidCosts: sumMoney(paidExpenses.map(payment => payment.amount)),
    receivedCreditNotes: total(snapshot.receivedDocuments.filter(document => document.type === 'passive_credit_note' && inYear(document.date, year))),
    gapToTarget: revenueTarget === undefined ? undefined : money(d(revenueTarget).minus(collectedRevenue)),
    percentIssuedVsTarget: revenueTarget && d(revenueTarget).gt(0) ? percentOut(d(issuedRevenue).div(revenueTarget).mul(100)) : undefined,
    percentCollectedVsTarget: revenueTarget && d(revenueTarget).gt(0) ? percentOut(d(collectedRevenue).div(revenueTarget).mul(100)) : undefined,
    fiscalProjection, fiscalUnavailableReason, fiscalWarnings, monthly, invoiceDetails, costDetails,
  };
}
