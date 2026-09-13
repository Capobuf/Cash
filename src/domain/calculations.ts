import Decimal from 'decimal.js';
import { calculateWorkCalendar } from './calendar';
import { d, decimalHours, floorMinute, money, perKm, percentOut, roundMinute, sumMoney } from './decimal';
import { err, modeForFuel, ok, type BusinessCost, type EconomicProfile, type FuelEvidence,
  type QuoteItem, type Result, type Vehicle } from './model';

export interface ProfileAnalysis {
  revenueTarget: string;
  revenueFromTime: string;
  forfaitIncome?: string;
  contributionBase?: string;
  contributions?: string;
  taxBase?: string;
  effectiveTaxRate?: string;
  substituteTax?: string;
  fiscalNet?: string;
  annualBusinessCosts: string;
  availableIncome?: string;
  theoreticalWorkdays: number;
  availableDays: number;
  availableWorkMinutes: number;
  availableClientMinutes: number;
  hourlyTarget: string;
  excludedHolidays: string[];
  warnings: string[];
}

const fail = <T>(message: string, field?: string): Result<T> => err({ code: 'VALIDATION', message, ...(field ? { field } : {}) });

function calculateProfileCore(profile: EconomicProfile, costs: BusinessCost[], requireConfirmed: boolean): Result<ProfileAnalysis> {
  try {
    const revenue = d(profile.revenueTarget);
    const specific = d(profile.specificAnnualExpenses);
    if (revenue.lte(0)) return fail('Il fatturato obiettivo deve essere maggiore di zero.', 'revenueTarget');
    if (!profile.fiscal.atecoCode.trim()) return fail('Il codice ATECO è obbligatorio.', 'atecoCode');
    if (specific.lt(0) || specific.gte(revenue)) return fail('Le spese specifiche devono essere non negative e inferiori al fatturato.', 'specificAnnualExpenses');
    const hours = d(profile.capacity.hoursPerDay);
    const clientPercent = d(profile.capacity.clientTimePercentage);
    if (hours.lte(0) || hours.gt(24)) return fail('Le ore giornaliere devono essere tra 0 e 24.', 'hoursPerDay');
    if (clientPercent.lte(0) || clientPercent.gt(100)) return fail('La percentuale dedicabile deve essere tra 0 e 100.', 'clientTimePercentage');

    const calendar = calculateWorkCalendar(profile.year, profile.capacity.localHolidays);
    if (!calendar.ok) return calendar;
    const daysOff = profile.capacity.vacationDays + profile.capacity.unplannedDays;
    if (daysOff < 0 || !Number.isInteger(daysOff) || daysOff > calendar.value.theoreticalWorkdays)
      return fail('Ferie e imprevisti superano i giorni lavorativi teorici.', 'vacationDays');
    const availableDays = calendar.value.theoreticalWorkdays - daysOff;
    const workMinutes = d(availableDays).mul(hours).mul(60).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    const clientMinutes = d(workMinutes).mul(clientPercent).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    if (clientMinutes <= 0) return fail('Le ore disponibili per i lavori devono essere maggiori di zero.', 'clientTimePercentage');

    const profitability = d(profile.fiscal.profitabilityCoefficient).div(100);
    const contributionRate = d(profile.fiscal.contributionRate).div(100);
    const effectiveRate = profile.fiscal.activityPhase === 'reduced_eligible' && profile.fiscal.reducedEligibilityConfirmed
      ? profile.fiscal.reducedSubstituteTaxRate : profile.fiscal.ordinarySubstituteTaxRate;
    const taxRate = d(effectiveRate).div(100);
    if (profitability.lte(0) || profitability.gt(1) || contributionRate.lt(0) || contributionRate.gt(1) || taxRate.lt(0) || taxRate.gt(1))
      return fail('Coefficienti e aliquote fiscali non validi.', 'fiscal');
    if (d(profile.fiscal.contributionCeiling).lte(0)) return fail('Il massimale contributivo deve essere positivo.', 'contributionCeiling');
    if (d(profile.fiscal.ordinaryThreshold).lte(0) || d(profile.fiscal.cessationThreshold).lte(profile.fiscal.ordinaryThreshold))
      return fail('Le soglie devono essere positive e la cessazione deve superare la soglia ordinaria.', 'fiscal.thresholds');

    const annualCosts = costs.reduce((sum, cost) => sum.plus(d(cost.monthlyAmount).mul(12)), d(0));
    if (annualCosts.lt(0)) return fail('I costi aziendali non possono essere negativi.', 'businessCosts');
    const revenueFromTime = revenue.minus(specific);
    const hourlyTarget = revenueFromTime.div(d(clientMinutes).div(60));
    const warnings = [...calendar.value.warnings];
    if (revenue.gt(profile.fiscal.ordinaryThreshold)) warnings.push('Superata la soglia ordinaria: confermare l’applicabilità del regime.');

    const base: ProfileAnalysis = {
      revenueTarget: money(revenue), revenueFromTime: money(revenueFromTime),
      annualBusinessCosts: money(annualCosts), theoreticalWorkdays: calendar.value.theoreticalWorkdays,
      availableDays, availableWorkMinutes: workMinutes, availableClientMinutes: clientMinutes,
      hourlyTarget: money(hourlyTarget), excludedHolidays: calendar.value.excludedWeekdayHolidays, warnings,
    };
    if (requireConfirmed && !profile.confirmed) return err({ code: 'MISSING_DATA', field: 'confirmed', message: 'Confermare il profilo fiscale prima della proiezione.', details: [JSON.stringify(base)] });
    if (requireConfirmed && profile.fiscal.activityPhase === 'reduced_eligible' && !profile.fiscal.reducedEligibilityConfirmed)
      return err({ code: 'MISSING_DATA', field: 'reducedEligibilityConfirmed', message: 'Confermare separatamente i requisiti per l’aliquota agevolata.' });
    if (requireConfirmed && revenue.gt(profile.fiscal.ordinaryThreshold) && revenue.lte(profile.fiscal.cessationThreshold) && !profile.fiscal.ordinaryApplicabilityConfirmed)
      return err({ code: 'MISSING_DATA', field: 'ordinaryApplicabilityConfirmed', message: 'Confermare l’applicabilità del regime oltre la soglia ordinaria.' });
    if (revenue.gt(profile.fiscal.cessationThreshold)) {
      base.warnings.push('Superata la soglia di cessazione: proiezione fiscale non disponibile.');
      return ok(base);
    }
    const forfaitIncome = revenue.mul(profitability);
    const contributionBase = Decimal.min(forfaitIncome, d(profile.fiscal.contributionCeiling));
    const contributions = d(money(contributionBase.mul(contributionRate)));
    const taxBase = Decimal.max(0, forfaitIncome.minus(contributions));
    const substituteTax = d(money(taxBase.mul(taxRate)));
    const fiscalNet = revenue.minus(contributions).minus(substituteTax);
    return ok({ ...base, forfaitIncome: money(forfaitIncome), contributionBase: money(contributionBase), contributions: money(contributions),
      taxBase: money(taxBase), effectiveTaxRate: effectiveRate, substituteTax: money(substituteTax), fiscalNet: money(fiscalNet),
      availableIncome: money(fiscalNet.minus(annualCosts).minus(specific)) });
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : 'Valori del profilo non validi.');
  }
}

export function previewProfile(profile: EconomicProfile, costs: BusinessCost[]): Result<ProfileAnalysis> {
  return calculateProfileCore(profile, costs, false);
}

export function calculateProfile(profile: EconomicProfile, costs: BusinessCost[]): Result<ProfileAnalysis> {
  return calculateProfileCore(profile, costs, true);
}

export interface VehicleCost { fuelCostPerKm: string; annualCostPerKm: string; costPerKm: string }
export function calculateVehicleCost(vehicle: Vehicle, evidence: FuelEvidence): Result<VehicleCost> {
  try {
    if (evidence.fuel !== vehicle.fuel || evidence.mode !== modeForFuel(vehicle.fuel))
      return fail('Il dato MIMIT non corrisponde a carburante e modalità del veicolo.', 'fuelEvidence');
    const expectedUnit = vehicle.consumptionUnit === 'km/l' ? 'EUR/l' : 'EUR/kg';
    if (evidence.priceUnit !== expectedUnit) return fail('Unità di consumo e prezzo carburante incompatibili.', 'consumptionUnit');
    const consumption = d(vehicle.consumption), annualKm = d(vehicle.annualKm);
    if (consumption.lte(0) || annualKm.lte(0)) return fail('Consumo e km annui devono essere positivi.', 'vehicle');
    const fuel = vehicle.consumptionUnit === 'km/l'
      ? d(evidence.price).div(consumption)
      : consumption.div(100).mul(evidence.price);
    const annual = d(vehicle.annualInsurance).plus(vehicle.annualTax).plus(vehicle.annualMaintenance);
    if (annual.lt(0)) return fail('I costi annuali del veicolo non possono essere negativi.', 'vehicle');
    const fixed = annual.div(annualKm);
    return ok({ fuelCostPerKm: perKm(fuel), annualCostPerKm: perKm(fixed), costPerKm: perKm(fuel.plus(fixed)) });
  } catch { return fail('Dati veicolo o carburante non validi.', 'vehicle'); }
}

export interface TravelCalculation { totalDistanceKm: string; totalMinutes: number; totalCost: string }
export function calculateTravel(input: { oneWayKm?: string; roundTrip: boolean; occurrences: number;
  speedKmh?: string; manualMinutesPerOccurrence?: number; vehicleCostPerKm: string }): Result<TravelCalculation> {
  try {
    if (input.oneWayKm === undefined) return err({ code: 'MISSING_DATA', field: 'site.oneWayKm', message: 'La Sede non ha una distanza configurata.' });
    if (!Number.isInteger(input.occurrences) || input.occurrences <= 0) return fail('Le occorrenze devono essere un intero positivo.', 'occurrences');
    const distance = d(input.oneWayKm).mul(input.roundTrip ? 2 : 1).mul(input.occurrences);
    if (distance.lt(0)) return fail('La distanza non può essere negativa.', 'oneWayKm');
    let minutes: number;
    if (input.manualMinutesPerOccurrence !== undefined) {
      if (!Number.isInteger(input.manualMinutesPerOccurrence) || input.manualMinutesPerOccurrence <= 0)
        return fail('Il tempo manuale deve essere un intero positivo.', 'manualMinutesPerOccurrence');
      minutes = input.manualMinutesPerOccurrence * input.occurrences;
    } else {
      if (input.speedKmh === undefined || d(input.speedKmh).lte(0))
        return err({ code: 'MISSING_DATA', field: 'travelSpeedKmh', message: 'Configurare la velocità media o inserire un tempo manuale.' });
      minutes = roundMinute(distance.div(input.speedKmh));
      if (minutes <= 0) return fail('Il tempo automatico risultante deve essere positivo.', 'travel');
    }
    return ok({ totalDistanceKm: distance.toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1), totalMinutes: minutes,
      totalCost: money(distance.mul(input.vehicleCostPerKm)) });
  } catch { return fail('Dati della trasferta non validi.', 'travel'); }
}

export interface ItemAnalysis {
  minutes: number; expenses: string; timeValue: string; theoreticalValue: string;
  yieldPerHour?: string; deviationPercent?: string; coherentMinutes?: number;
  deficit?: string; blockers: string[];
}
export function calculateItem(item: QuoteItem, hourlyTarget: string): ItemAnalysis {
  const blockers: string[] = [];
  let minutes = 0;
  const expenses: string[] = [];
  for (const sub of item.subItems) {
    if (sub.kind === 'time') minutes += sub.minutes;
    else if (sub.kind === 'expense') expenses.push(money(sub.amount));
    else { minutes += sub.totalMinutes; expenses.push(money(sub.totalCost)); }
  }
  if (minutes <= 0) blockers.push('Serve almeno una sottovoce che produca tempo positivo.');
  const rate = d(hourlyTarget);
  if (rate.lte(0)) blockers.push('Il valore medio da generare deve essere positivo.');
  const expenseTotal = sumMoney(expenses);
  const timeValue = minutes > 0 && rate.gt(0) ? money(decimalHours(minutes).mul(rate)) : '0.00';
  const theoreticalValue = money(d(timeValue).plus(expenseTotal));
  const result: ItemAnalysis = { minutes, expenses: expenseTotal, timeValue, theoreticalValue, blockers };
  if (item.chosenPrice === undefined) return result;
  if (d(item.chosenPrice).lt(0)) { blockers.push('Il prezzo scelto non può essere negativo.'); return result; }
  if (minutes <= 0 || rate.lte(0)) return result;
  const margin = d(item.chosenPrice).minus(expenseTotal);
  result.yieldPerHour = money(margin.div(decimalHours(minutes)));
  result.deviationPercent = percentOut(d(result.yieldPerHour).div(rate).minus(1).mul(100));
  if (margin.lt(0)) result.deficit = money(margin.abs());
  else result.coherentMinutes = floorMinute(margin.div(rate));
  return result;
}

export interface QuoteAnalysis {
  minutes?: number; expenses?: string; timeValue?: string; theoreticalValue?: string;
  chosenTotal?: string; yieldPerHour?: string; deviationPercent?: string; coherentMinutes?: number;
  deficit?: string; blockers: string[]; blockingItems: string[];
}
export function calculateQuote(items: QuoteItem[], hourlyTarget: string): QuoteAnalysis {
  const analyses = items.map(item => calculateItem(item, hourlyTarget));
  const blockingItems = items.length ? analyses.flatMap((a, i) => a.blockers.length ? [`${items[i]?.name ?? `Voce ${i + 1}`}: ${a.blockers.join(' ')}`] : []) : ['Preventivo: aggiungere almeno una voce calcolabile.'];
  const minutes = analyses.reduce((sum, value) => sum + value.minutes, 0);
  const expenses = sumMoney(analyses.map(value => value.expenses));
  const timeValue = sumMoney(analyses.map(value => value.timeValue));
  const theoreticalValue = sumMoney(analyses.map(value => value.theoreticalValue));
  if (blockingItems.length) return { blockers: [...blockingItems], blockingItems };
  const result: QuoteAnalysis = { minutes, expenses, timeValue, theoreticalValue, blockers: [], blockingItems };
  if (items.some(item => item.chosenPrice === undefined)) {
    if (items.some(item => item.chosenPrice === undefined)) result.blockers.push('Ogni voce richiede un prezzo scelto per gli indicatori complessivi.');
    return result;
  }
  result.chosenTotal = sumMoney(items.map(item => item.chosenPrice!));
  const synthetic: QuoteItem = { ...items[0]!, name: 'Totale', chosenPrice: result.chosenTotal,
    subItems: [{ id: '00000000-0000-4000-8000-000000000000', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
      kind: 'time', description: 'Tempo totale', minutes },
      { id: '00000000-0000-4000-8000-000000000001', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
        kind: 'expense', description: 'Spese totali', amount: expenses }] };
  const aggregate = calculateItem(synthetic, hourlyTarget);
  result.yieldPerHour = aggregate.yieldPerHour;
  result.deviationPercent = aggregate.deviationPercent;
  result.coherentMinutes = aggregate.coherentMinutes;
  result.deficit = aggregate.deficit;
  return result;
}
