import { calculateFiscalProjection, type FiscalProjection } from './calculations';
import { d, money, percentOut, sumMoney } from './decimal';
import type { BusinessCost, EconomicProfile, FicFinancialSnapshot, FicIssuedDocument, FicReceivedDocument } from './model';

type FinancialDocument = FicIssuedDocument | FicReceivedDocument;
const inYear = (date: string | undefined, year: number) => date?.slice(0, 4) === String(year);

export function financialYears(snapshot: FicFinancialSnapshot | undefined, profiles: EconomicProfile[]): number[] {
  const years = new Set(profiles.map(profile => profile.year));
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

export function calculateFinancialAnalysis(snapshot: FicFinancialSnapshot, year: number,
  profile: EconomicProfile | undefined, costs: BusinessCost[], today: string) {
  const annualProfile = profile?.year === year ? profile : undefined;
  const invoices = snapshot.issuedDocuments.filter(document => document.type === 'invoice');
  const expenses = snapshot.receivedDocuments.filter(document => document.type === 'expense');
  const annualInvoices = invoices.filter(document => inYear(document.date, year));
  const annualExpenses = expenses.filter(document => inYear(document.date, year));
  const total = (documents: FinancialDocument[]) => sumMoney(documents.map(document => document.amountGross));
  const paidInYear = (documents: FinancialDocument[]) => documents.flatMap(document => document.payments)
    .filter(payment => payment.status === 'paid' && inYear(payment.paidDate, year));
  const collections = paidInYear(invoices); const paidExpenses = paidInYear(expenses);
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
    revenueTarget, issuedRevenue, collectedRevenue,
    outstandingRevenue: sumMoney(invoiceDetails.map(detail => detail.outstanding)),
    overdueRevenue: sumMoney(invoiceDetails.map(detail => detail.overdue)),
    issuedCreditNotes: total(snapshot.issuedDocuments.filter(document => document.type === 'credit_note' && inYear(document.date, year))),
    plannedBusinessCosts: money(costs.reduce((sum, cost) => sum.plus(d(cost.monthlyAmount).mul(12)), d(0))),
    documentedCosts: total(annualExpenses), paidCosts: sumMoney(paidExpenses.map(payment => payment.amount)),
    receivedCreditNotes: total(snapshot.receivedDocuments.filter(document => document.type === 'passive_credit_note' && inYear(document.date, year))),
    gapToTarget: revenueTarget === undefined ? undefined : money(d(revenueTarget).minus(collectedRevenue)),
    percentIssuedVsTarget: revenueTarget && d(revenueTarget).gt(0) ? percentOut(d(issuedRevenue).div(revenueTarget).mul(100)) : undefined,
    percentCollectedVsTarget: revenueTarget && d(revenueTarget).gt(0) ? percentOut(d(collectedRevenue).div(revenueTarget).mul(100)) : undefined,
    fiscalProjection, fiscalUnavailableReason, fiscalWarnings, monthly, invoiceDetails, costDetails,
  };
}
