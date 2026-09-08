import type { LocalHoliday, Result } from './model';
import { err, ok } from './model';

export interface WorkCalendar {
  year: number;
  weekdays: number;
  excludedWeekdayHolidays: string[];
  theoreticalWorkdays: number;
  warnings: string[];
}

const dateKey = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function italianNationalHolidays(year: number): Set<string> {
  const fixed: Array<[number, number]> = [[1, 1], [1, 6], [4, 25], [5, 1], [6, 2], [8, 15],
    [11, 1], [12, 8], [12, 25], [12, 26]];
  if (year >= 2026) fixed.push([10, 4]);
  const values = new Set(fixed.map(([month, day]) => dateKey(year, month, day)));
  const easter = easterSunday(year);
  easter.setUTCDate(easter.getUTCDate() + 1);
  values.add(dateKey(year, easter.getUTCMonth() + 1, easter.getUTCDate()));
  return values;
}

export function calculateWorkCalendar(year: number, localHolidays: LocalHoliday[]): Result<WorkCalendar> {
  if (!Number.isInteger(year) || year < 2000 || year > 2200)
    return err({ code: 'VALIDATION', field: 'year', message: 'Anno del profilo non valido.' });
  const holidays = italianNationalHolidays(year);
  const warnings: string[] = [];
  for (const holiday of localHolidays) {
    if (holiday.kind === 'recurring') {
      if (!isValidDate(year, holiday.month, holiday.day)) {
        warnings.push(`${holiday.name}: data non valida per il ${year}, non applicata.`);
        continue;
      }
      holidays.add(dateKey(year, holiday.month, holiday.day));
    } else {
      const parsed = new Date(`${holiday.date}T00:00:00Z`);
      if (Number.isNaN(parsed.valueOf()) || parsed.getUTCFullYear() !== year) continue;
      holidays.add(holiday.date);
    }
  }

  let weekdays = 0;
  const excluded: string[] = [];
  for (let cursor = new Date(Date.UTC(year, 0, 1)); cursor.getUTCFullYear() === year; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue;
    weekdays += 1;
    const key = cursor.toISOString().slice(0, 10);
    if (holidays.has(key)) excluded.push(key);
  }
  return ok({ year, weekdays, excludedWeekdayHolidays: excluded, theoreticalWorkdays: weekdays - excluded.length, warnings });
}
