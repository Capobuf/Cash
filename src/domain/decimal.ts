import Decimal from 'decimal.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export const d = (value: Decimal.Value): Decimal => new Decimal(value);
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
