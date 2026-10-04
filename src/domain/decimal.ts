import Decimal from 'decimal.js';
import { err, ok, type Result } from './model';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export const d = (value: Decimal.Value): Decimal => new Decimal(value);
export function parseDecimalInput(
  input: string,
  maxDecimals: number,
  nonNegative = true,
): Result<string> {
  const normalized = input.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized))
    return err({ code: 'VALIDATION', message: 'Inserisci un numero valido.' });
  const value = d(normalized);
  if (!value.isFinite() || (nonNegative && value.lt(0)))
    return err({
      code: 'VALIDATION',
      message: 'Inserisci un numero finito e non negativo.',
    });
  if ((normalized.split('.')[1]?.length ?? 0) > maxDecimals)
    return err({
      code: 'VALIDATION',
      message: `Inserisci un valore con massimo ${maxDecimals} decimali.`,
    });
  return ok(value.toFixed(maxDecimals));
}
export const money = (value: Decimal.Value): string =>
  d(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
export const perKm = (value: Decimal.Value): string =>
  d(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
export const percentOut = (value: Decimal.Value): string =>
  d(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
export const decimalHours = (minutes: number): Decimal => d(minutes).div(60);
export const floorMinute = (hours: Decimal.Value): number =>
  d(hours).mul(60).floor().toNumber();
export const sumMoney = (values: Decimal.Value[]): string =>
  money(values.reduce<Decimal>((sum, value) => sum.plus(value), d(0)));
