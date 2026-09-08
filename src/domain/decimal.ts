import Decimal from 'decimal.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export const d = (value: Decimal.Value): Decimal => new Decimal(value);
export const money = (value: Decimal.Value): string => d(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
export const perKm = (value: Decimal.Value): string => d(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
export const percentOut = (value: Decimal.Value): string => d(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
export const decimalHours = (minutes: number): Decimal => d(minutes).div(60);
export const roundMinute = (hours: Decimal.Value): number => d(hours).mul(60).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
export const floorMinute = (hours: Decimal.Value): number => d(hours).mul(60).floor().toNumber();
export const sumMoney = (values: Decimal.Value[]): string => money(values.reduce<Decimal>((sum, value) => sum.plus(value), d(0)));

export function requireDecimal(value: string, field: string, options: { min?: number; max?: number; maxDecimals?: number; exclusiveMin?: boolean } = {}): Decimal {
  let parsed: Decimal;
  try { parsed = d(value); } catch { throw new Error(`${field}: numero decimale non valido`); }
  if (!parsed.isFinite()) throw new Error(`${field}: numero decimale non valido`);
  if (options.min !== undefined && (options.exclusiveMin ? parsed.lte(options.min) : parsed.lt(options.min)))
    throw new Error(`${field}: valore fuori intervallo`);
  if (options.max !== undefined && parsed.gt(options.max)) throw new Error(`${field}: valore fuori intervallo`);
  if (options.maxDecimals !== undefined && parsed.decimalPlaces() > options.maxDecimals)
    throw new Error(`${field}: massimo ${options.maxDecimals} decimali`);
  return parsed;
}
