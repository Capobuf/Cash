import type { LocalHoliday, Result } from './model';
import { err, ok } from './model';

export interface WorkCalendar {
  year: number;
  weekdays: number;
  excludedWeekdayHolidays: string[];
  theoreticalWorkdays: number;
  warnings: string[];
}

export interface ItalianNationalHoliday { name: string; date: string }

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

export function italianNationalHolidayEntries(year: number): ItalianNationalHoliday[] {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return [];
  const fixed: Array<{ name: string; month: number; day: number }> = [
    { name: 'Capodanno', month: 1, day: 1 },
    { name: 'Epifania', month: 1, day: 6 },
    { name: 'Festa della Liberazione', month: 4, day: 25 },
    { name: 'Festa dei Lavoratori', month: 5, day: 1 },
    { name: 'Festa della Repubblica', month: 6, day: 2 },
    { name: 'Ferragosto', month: 8, day: 15 },
    { name: 'Ognissanti', month: 11, day: 1 },
    { name: 'Immacolata Concezione', month: 12, day: 8 },
    { name: 'Natale', month: 12, day: 25 },
    { name: 'Santo Stefano', month: 12, day: 26 },
  ];
  if (year >= 2026) fixed.push({ name: "San Francesco d'Assisi", month: 10, day: 4 });
  const easter = easterSunday(year);
  easter.setUTCDate(easter.getUTCDate() + 1);
  return [
    ...fixed.map(({ name, month, day }) => ({ name, date: dateKey(year, month, day) })),
    { name: "Lunedì dell'Angelo", date: dateKey(year, easter.getUTCMonth() + 1, easter.getUTCDate()) },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function italianNationalHolidays(year: number): Set<string> {
  return new Set(italianNationalHolidayEntries(year).map((holiday) => holiday.date));
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
