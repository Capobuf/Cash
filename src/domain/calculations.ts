import Decimal from 'decimal.js';
import { calculateWorkCalendar } from './calendar';
import {
  d,
  decimalHours,
  floorMinute,
  money,
  perKm,
  percentOut,
  sumMoney,
} from './decimal';
import {
  err,
  modeForFuel,
  ok,
  type BusinessCost,
  type EconomicProfile,
  type FiscalParameters,
  type FuelEvidence,
  type QuoteItem,
  type Result,
  type RouteResult,
  type Vehicle,
} from './model';

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
const fail = <T>(message: string, field?: string): Result<T> =>
  err({ code: 'VALIDATION', message, ...(field ? { field } : {}) });

export interface FiscalProjection {
  forfaitIncome: string;
  contributionBase: string;
  contributions: string;
  taxBase: string;
  effectiveTaxRate: string;
  substituteTax: string;
  fiscalNet: string;
  totalToReserve: string;
}

// Management forecast, shared with target planning. Estimated contributions are
// not the contributions actually paid and deductible in an income tax return.
export function calculateFiscalProjection(
  revenueAmount: string,
  fiscal: FiscalParameters,
): Result<FiscalProjection> {
  try {
    const revenue = d(revenueAmount);
    if (!revenue.isFinite() || revenue.lt(0))
      return fail('Il ricavo fiscale deve essere non negativo.', 'revenue');
    if (!fiscal.atecoCode.trim())
      return fail('Il codice ATECO è obbligatorio.', 'atecoCode');
    if (
      !['62.20.10', '62.02.00'].includes(fiscal.atecoCode.trim()) ||
      !d(fiscal.ordinarySubstituteTaxRate).eq(15) ||
      !d(fiscal.reducedSubstituteTaxRate).eq(5)
    )
      return fail(
        'Profilo fuori perimetro: previsione disponibile solo per consulenza informatica in regime forfettario, Gestione Separata e aliquote 5%/15%.',
        'fiscal',
      );
    const profitability = d(fiscal.profitabilityCoefficient).div(100);
    const contributionRate = d(fiscal.contributionRate).div(100);
    if (
      !contributionRate.isFinite() ||
      contributionRate.lte(0) ||
      contributionRate.gt(1)
    )
      return fail(
        'Configura l’aliquota INPS dell’anno in Impostazioni → Profili annuali → Fiscalità: deve essere maggiore di 0% e non superiore a 100%.',
        'contributionRate',
      );
    const effectiveRate =
      fiscal.activityPhase === 'reduced_eligible' &&
      fiscal.reducedEligibilityConfirmed
        ? fiscal.reducedSubstituteTaxRate
        : fiscal.ordinarySubstituteTaxRate;
    const taxRate = d(effectiveRate).div(100);
    if (
      profitability.lte(0) ||
      profitability.gt(1) ||
      contributionRate.lt(0) ||
      contributionRate.gt(1) ||
      taxRate.lt(0) ||
      taxRate.gt(1)
    )
      return fail('Coefficienti e aliquote fiscali non validi.', 'fiscal');
    if (d(fiscal.contributionCeiling).lte(0))
      return fail(
        'Il massimale contributivo deve essere positivo.',
        'contributionCeiling',
      );
    if (
      d(fiscal.ordinaryThreshold).lte(0) ||
      d(fiscal.cessationThreshold).lte(fiscal.ordinaryThreshold)
    )
      return fail(
        'Le soglie devono essere positive e la cessazione deve superare la soglia ordinaria.',
        'fiscal.thresholds',
      );
    const forfaitIncome = revenue.mul(profitability);
    const contributionBase = Decimal.min(
      forfaitIncome,
      d(fiscal.contributionCeiling),
    );
    const contributions = d(money(contributionBase.mul(contributionRate)));
    const taxBase = Decimal.max(0, forfaitIncome.minus(contributions));
    const substituteTax = d(money(taxBase.mul(taxRate)));
    const fiscalNet = revenue.minus(contributions).minus(substituteTax);
    return ok({
      forfaitIncome: money(forfaitIncome),
      contributionBase: money(contributionBase),
      contributions: money(contributions),
      taxBase: money(taxBase),
      effectiveTaxRate: effectiveRate,
      substituteTax: money(substituteTax),
      fiscalNet: money(fiscalNet),
      totalToReserve: money(contributions.plus(substituteTax)),
    });
  } catch {
    return fail('Parametri fiscali non validi.', 'fiscal');
  }
}

export function calculateFiscalAdvances(
  projection: FiscalProjection,
  contributionRate: string,
) {
  const substituteTax = d(projection.substituteTax);
  const taxAdvance = substituteTax.lte('51.65') ? d(0) : substituteTax;
  const taxFirst = taxAdvance.lt('257.52')
    ? '0.00'
    : money(taxAdvance.mul('0.4'));
  const referenceContributions = d(projection.contributionBase)
    .mul(contributionRate)
    .div(100);
  const contributionAdvance = money(referenceContributions.mul('0.8'));
  const contributionFirst = money(referenceContributions.mul('0.4'));
  return {
    substituteTaxAdvance: money(taxAdvance),
    substituteTaxAdvanceFirst: taxFirst,
    substituteTaxAdvanceSecond: money(taxAdvance.minus(taxFirst)),
    contributionAdvance,
    contributionAdvanceFirst: contributionFirst,
    // Assign any rounding cent to the second instalment so totals always reconcile.
    contributionAdvanceSecond: money(
      d(contributionAdvance).minus(contributionFirst),
    ),
    totalAdvances: money(taxAdvance.plus(contributionAdvance)),
  };
}

function calculateProfileCore(
  profile: EconomicProfile,
  costs: BusinessCost[],
  requireConfirmed: boolean,
): Result<ProfileAnalysis> {
  try {
    const revenue = d(profile.revenueTarget);
    const specific = d(profile.specificAnnualExpenses);
    if (revenue.lte(0))
      return fail(
        'Il fatturato obiettivo deve essere maggiore di zero.',
        'revenueTarget',
      );
    if (!profile.fiscal.atecoCode.trim())
      return fail('Il codice ATECO è obbligatorio.', 'atecoCode');
    if (specific.lt(0) || specific.gte(revenue))
      return fail(
        'Le spese specifiche devono essere non negative e inferiori al fatturato.',
        'specificAnnualExpenses',
      );
    const hours = d(profile.capacity.hoursPerDay);
    const clientPercent = d(profile.capacity.clientTimePercentage);
    if (hours.lte(0) || hours.gt(24))
      return fail(
        'Le ore giornaliere devono essere tra 0 e 24.',
        'hoursPerDay',
      );
    if (clientPercent.lte(0) || clientPercent.gt(100))
      return fail(
        'La percentuale dedicabile deve essere tra 0 e 100.',
        'clientTimePercentage',
      );
    const calendar = calculateWorkCalendar(
      profile.year,
      profile.capacity.localHolidays,
    );
    if (!calendar.ok) return calendar;
    const daysOff =
      profile.capacity.vacationDays + profile.capacity.unplannedDays;
    if (
      daysOff < 0 ||
      !Number.isInteger(daysOff) ||
      daysOff > calendar.value.theoreticalWorkdays
    )
      return fail(
        'Ferie e imprevisti superano i giorni lavorativi teorici.',
        'vacationDays',
      );
    const availableDays = calendar.value.theoreticalWorkdays - daysOff;
    const workMinutes = d(availableDays)
      .mul(hours)
      .mul(60)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();
    const clientMinutes = d(workMinutes)
      .mul(clientPercent)
      .div(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();
    if (clientMinutes <= 0)
      return fail(
        'Le ore disponibili per i lavori devono essere maggiori di zero.',
        'clientTimePercentage',
      );
    const fiscalResult = calculateFiscalProjection(
      profile.revenueTarget,
      profile.fiscal,
    );
    if (!fiscalResult.ok) return fiscalResult;
    const annualCosts = costs.reduce(
      (sum, cost) => sum.plus(d(cost.monthlyAmount).mul(12)),
      d(0),
    );
    if (annualCosts.lt(0))
      return fail(
        'I costi aziendali non possono essere negativi.',
        'businessCosts',
      );
    const revenueFromTime = revenue.minus(specific);
    const hourlyTarget = revenueFromTime.div(d(clientMinutes).div(60));
    const warnings = [...calendar.value.warnings];
    if (revenue.gt(profile.fiscal.ordinaryThreshold))
      warnings.push(
        'Superata la soglia ordinaria: confermare l’applicabilità del regime.',
      );
    const base: ProfileAnalysis = {
      revenueTarget: money(revenue),
      revenueFromTime: money(revenueFromTime),
      annualBusinessCosts: money(annualCosts),
      theoreticalWorkdays: calendar.value.theoreticalWorkdays,
      availableDays,
      availableWorkMinutes: workMinutes,
      availableClientMinutes: clientMinutes,
      hourlyTarget: money(hourlyTarget),
      excludedHolidays: calendar.value.excludedWeekdayHolidays,
      warnings,
    };
    if (requireConfirmed && !profile.confirmed)
      return err({
        code: 'MISSING_DATA',
        field: 'confirmed',
        message: 'Confermare il profilo fiscale prima della proiezione.',
        details: [JSON.stringify(base)],
      });
    if (
      requireConfirmed &&
      profile.fiscal.activityPhase === 'reduced_eligible' &&
      !profile.fiscal.reducedEligibilityConfirmed
    )
      return err({
        code: 'MISSING_DATA',
        field: 'reducedEligibilityConfirmed',
        message:
          'Confermare separatamente i requisiti per l’aliquota agevolata.',
      });
    if (
      requireConfirmed &&
      revenue.gt(profile.fiscal.ordinaryThreshold) &&
      revenue.lte(profile.fiscal.cessationThreshold) &&
      !profile.fiscal.ordinaryApplicabilityConfirmed
    )
      return err({
        code: 'MISSING_DATA',
        field: 'ordinaryApplicabilityConfirmed',
        message:
          'Confermare l’applicabilità del regime oltre la soglia ordinaria.',
      });
    if (revenue.gt(profile.fiscal.cessationThreshold)) {
      base.warnings.push(
        'Superata la soglia di cessazione: proiezione fiscale non disponibile.',
      );
      return ok(base);
    }
    const { totalToReserve, ...projection } = fiscalResult.value;
    return ok({
      ...base,
      ...projection,
      availableIncome: money(
        revenue.minus(totalToReserve).minus(annualCosts).minus(specific),
      ),
    });
  } catch (cause) {
    return fail(
      cause instanceof Error ? cause.message : 'Valori del profilo non validi.',
    );
  }
}

export function previewProfile(
  profile: EconomicProfile,
  costs: BusinessCost[],
): Result<ProfileAnalysis> {
  return calculateProfileCore(profile, costs, false);
}
export function calculateProfile(
  profile: EconomicProfile,
  costs: BusinessCost[],
): Result<ProfileAnalysis> {
  return calculateProfileCore(profile, costs, true);
}

export interface VehicleCost {
  fuelCostPerKm: string;
  annualCostPerKm: string;
  costPerKm: string;
}
export function calculateVehicleCost(
  vehicle: Vehicle,
  evidence: FuelEvidence,
): Result<VehicleCost> {
  try {
    if (
      evidence.fuel !== vehicle.fuel ||
      evidence.mode !== modeForFuel(vehicle.fuel)
    )
      return fail(
        'Il dato MIMIT non corrisponde a carburante e modalità del veicolo.',
        'fuelEvidence',
      );
    const expectedUnit =
      vehicle.consumptionUnit === 'km/l' ? 'EUR/l' : 'EUR/kg';
    if (evidence.priceUnit !== expectedUnit)
      return fail(
        'Unità di consumo e prezzo carburante incompatibili.',
        'consumptionUnit',
      );
    const consumption = d(vehicle.consumption);
    const annualKm = d(vehicle.annualKm);
    if (consumption.lte(0) || annualKm.lte(0))
      return fail('Consumo e km annui devono essere positivi.', 'vehicle');
    const fuel =
      vehicle.consumptionUnit === 'km/l'
        ? d(evidence.price).div(consumption)
        : consumption.div(100).mul(evidence.price);
    const annual = d(vehicle.annualInsurance)
      .plus(vehicle.annualTax)
      .plus(vehicle.annualMaintenance);
    if (annual.lt(0))
      return fail(
        'I costi annuali del veicolo non possono essere negativi.',
        'vehicle',
      );
    const fixed = annual.div(annualKm);
    return ok({
      fuelCostPerKm: perKm(fuel),
      annualCostPerKm: perKm(fixed),
      costPerKm: perKm(fuel.plus(fixed)),
    });
  } catch {
    return fail('Dati veicolo o carburante non validi.', 'vehicle');
  }
}

export interface RouteValues {
  distanceKmPerOccurrence: string;
  travelMinutesPerOccurrence: number;
}
export function routeValuesRequireOverwriteConfirmation(
  distance: string | number | undefined,
  minutes: string | number | undefined,
): boolean {
  return (
    String(distance ?? '').trim().length > 0 ||
    String(minutes ?? '').trim().length > 0
  );
}

export function valuesFromRoute(
  route: RouteResult,
  roundTrip: boolean,
): Result<RouteValues> {
  try {
    const factor = roundTrip ? 2 : 1;
    const distanceMeters = d(route.distanceMeters);
    const durationSeconds = d(route.durationSeconds);
    if (distanceMeters.lt(0) || durationSeconds.lte(0))
      return fail(
        'La risposta del percorso contiene valori non validi.',
        'route',
      );
    const minutes = durationSeconds
      .mul(factor)
      .div(60)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();
    if (minutes <= 0)
      return fail(
        'Il tempo del percorso deve essere positivo.',
        'route.duration',
      );
    return ok({
      distanceKmPerOccurrence: distanceMeters
        .mul(factor)
        .div(1000)
        .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
        .toFixed(1),
      travelMinutesPerOccurrence: minutes,
    });
  } catch {
    return fail('La risposta del percorso non è valida.', 'route');
  }
}

export interface TravelCalculation {
  totalDistanceKm?: string;
  totalMinutes?: number;
  totalCost?: string;
}
export function calculateTravel(input: {
  distanceKmPerOccurrence?: string;
  travelMinutesPerOccurrence?: number;
  occurrences: number;
  vehicleCostPerKm?: string;
}): Result<TravelCalculation> {
  try {
    if (!Number.isInteger(input.occurrences) || input.occurrences <= 0)
      return fail(
        'Le occorrenze devono essere un intero positivo.',
        'occurrences',
      );
    if (
      input.distanceKmPerOccurrence === undefined &&
      input.travelMinutesPerOccurrence === undefined
    )
      return err({
        code: 'MISSING_DATA',
        field: 'travel',
        message: 'Inserire o calcolare almeno distanza o tempo per occorrenza.',
      });
    if (
      input.travelMinutesPerOccurrence !== undefined &&
      (!Number.isInteger(input.travelMinutesPerOccurrence) ||
        input.travelMinutesPerOccurrence <= 0)
    )
      return fail(
        'Il tempo per occorrenza deve essere un intero positivo.',
        'travelMinutesPerOccurrence',
      );
    const distance =
      input.distanceKmPerOccurrence === undefined
        ? undefined
        : d(input.distanceKmPerOccurrence).mul(input.occurrences);
    if (distance?.lt(0))
      return fail(
        'La distanza non può essere negativa.',
        'distanceKmPerOccurrence',
      );
    return ok({
      ...(distance !== undefined
        ? {
            totalDistanceKm: distance
              .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
              .toFixed(1),
          }
        : {}),
      ...(input.travelMinutesPerOccurrence !== undefined
        ? { totalMinutes: input.travelMinutesPerOccurrence * input.occurrences }
        : {}),
      ...(distance !== undefined && input.vehicleCostPerKm !== undefined
        ? { totalCost: money(distance.mul(input.vehicleCostPerKm)) }
        : {}),
    });
  } catch {
    return fail('Dati della trasferta non validi.', 'travel');
  }
}

export interface ItemAnalysis {
  minutes?: number;
  expenses?: string;
  timeValue?: string;
  theoreticalValue?: string;
  chosenPrice?: string;
  minutesPartial: boolean;
  expensesPartial: boolean;
  timeValuePartial: boolean;
  theoreticalPartial: boolean;
  yieldPerHour?: string;
  deviationPercent?: string;
  coherentMinutes?: number;
  deficit?: string;
  blockers: string[];
}

function economicIndicators(
  minutes: number | undefined,
  expenses: string | undefined,
  chosenPrice: string | undefined,
  hourlyTarget?: string,
): Pick<
  ItemAnalysis,
  'yieldPerHour' | 'deviationPercent' | 'coherentMinutes' | 'deficit'
> {
  if (
    chosenPrice === undefined ||
    expenses === undefined ||
    !minutes ||
    minutes <= 0
  )
    return {};
  const margin = d(chosenPrice).minus(expenses);
  const yieldPerHour = money(margin.div(decimalHours(minutes)));
  const rate = hourlyTarget === undefined ? undefined : d(hourlyTarget);
  return {
    yieldPerHour,
    ...(margin.lt(0) ? { deficit: money(margin.abs()) } : {}),
    ...(rate?.gt(0)
      ? {
          deviationPercent: percentOut(
            d(yieldPerHour).div(rate).minus(1).mul(100),
          ),
          ...(margin.gte(0)
            ? { coherentMinutes: floorMinute(margin.div(rate)) }
            : {}),
        }
      : {}),
  };
}

export function calculateItem(
  item: QuoteItem,
  hourlyTarget?: string,
): ItemAnalysis {
  const blockers: string[] = [];
  let minutes: number | undefined;
  const expenses: string[] = [];
  let minutesPartial = false;
  let expensesPartial = false;
  for (const sub of item.subItems) {
    if (sub.kind === 'time') minutes = (minutes ?? 0) + sub.minutes;
    else if (sub.kind === 'expense') expenses.push(money(sub.amount));
    else {
      const travelLabel = sub.description.trim()
        ? `Trasferta “${sub.description}”`
        : 'Trasferta';
      if (!sub.departure)
        blockers.push(`${travelLabel}: partenza non selezionata.`);
      if (!sub.destination)
        blockers.push(`${travelLabel}: destinazione non selezionata.`);
      if (!sub.vehicleId)
        blockers.push(`${travelLabel}: Veicolo non selezionato.`);
      if (sub.totalMinutes === undefined) {
        minutesPartial = true;
        blockers.push(`${travelLabel}: tempo non disponibile.`);
      } else minutes = (minutes ?? 0) + sub.totalMinutes;
      if (sub.totalCost === undefined) {
        expensesPartial = true;
        blockers.push(`${travelLabel}: costo non disponibile.`);
      } else expenses.push(money(sub.totalCost));
    }
  }
  const rate = hourlyTarget === undefined ? undefined : d(hourlyTarget);
  const expenseTotal =
    expenses.length || (item.subItems.length && !expensesPartial)
      ? sumMoney(expenses)
      : undefined;
  const timeValue =
    minutes !== undefined && rate?.gt(0)
      ? money(decimalHours(minutes).mul(rate))
      : undefined;
  const components = [
    timeValue,
    expenses.length ? sumMoney(expenses) : undefined,
  ].filter((value): value is string => value !== undefined);
  const theoreticalValue = components.length ? sumMoney(components) : undefined;
  const theoreticalPartial =
    theoreticalValue !== undefined &&
    (blockers.length > 0 ||
      minutesPartial ||
      expensesPartial ||
      (minutes !== undefined && timeValue === undefined));
  return {
    minutes,
    expenses: expenseTotal,
    timeValue,
    theoreticalValue,
    chosenPrice: item.chosenPrice,
    minutesPartial,
    expensesPartial,
    timeValuePartial: minutesPartial,
    theoreticalPartial,
    blockers,
    ...(!blockers.length && !minutesPartial && !expensesPartial
      ? economicIndicators(
          minutes,
          expenseTotal,
          item.chosenPrice,
          hourlyTarget,
        )
      : {}),
  };
}

export interface QuoteAnalysis extends Omit<ItemAnalysis, 'chosenPrice'> {
  chosenTotal?: string;
  chosenPartial: boolean;
  blockingItems: string[];
}
export function calculateQuote(
  items: QuoteItem[],
  hourlyTarget?: string,
): QuoteAnalysis {
  const analyses = items.map((item) => calculateItem(item, hourlyTarget));
  const blockingItems = analyses.flatMap((analysis, index) =>
    analysis.blockers.length
      ? [
          `${items[index]?.name.trim() || `Voce ${index + 1}`}: ${analysis.blockers.join(' ')}`,
        ]
      : [],
  );
  const prices = items.flatMap((item) =>
    item.chosenPrice === undefined ? [] : [item.chosenPrice],
  );
  const chosenTotal = prices.length ? sumMoney(prices) : undefined;
  const sumAvailable = (key: 'expenses' | 'timeValue' | 'theoreticalValue') => {
    const values = analyses.flatMap((analysis) =>
      analysis[key] === undefined ? [] : [analysis[key]!],
    );
    return values.length ? sumMoney(values) : undefined;
  };
  const knownMinutes = analyses.flatMap((analysis) =>
    analysis.minutes === undefined ? [] : [analysis.minutes],
  );
  const minutes = knownMinutes.length
    ? knownMinutes.reduce((sum, value) => sum + value, 0)
    : undefined;
  const expenses = sumAvailable('expenses');
  const theoreticalValue = sumAvailable('theoreticalValue');
  const chosenPartial = prices.length > 0 && prices.length < items.length;
  const theoreticalPartial =
    theoreticalValue !== undefined &&
    analyses.some(
      (analysis) =>
        analysis.theoreticalValue === undefined || analysis.theoreticalPartial,
    );
  return {
    minutes,
    expenses,
    timeValue: sumAvailable('timeValue'),
    theoreticalValue,
    chosenTotal,
    chosenPartial,
    minutesPartial: analyses.some(
      (analysis) =>
        analysis.minutesPartial ||
        (analysis.minutes === undefined && analysis.expenses === undefined),
    ),
    expensesPartial: analyses.some(
      (analysis) => analysis.expensesPartial || analysis.expenses === undefined,
    ),
    timeValuePartial: analyses.some(
      (analysis) =>
        analysis.timeValuePartial || analysis.timeValue === undefined,
    ),
    theoreticalPartial,
    blockers: blockingItems,
    blockingItems,
    ...(!chosenPartial &&
    !blockingItems.length &&
    analyses.every(
      (analysis) =>
        analysis.expenses !== undefined &&
        !analysis.expensesPartial &&
        !analysis.minutesPartial &&
        (analysis.minutes !== undefined ||
          analysis.theoreticalValue !== undefined),
    )
      ? economicIndicators(minutes, expenses, chosenTotal, hourlyTarget)
      : {}),
  };
}
