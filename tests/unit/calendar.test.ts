import { describe, expect, it } from 'vitest';
import { calculateWorkCalendar, easterSunday, italianNationalHolidayEntries } from '../../src/domain/calendar';

describe('calendario lavorativo italiano', () => {
  it('calcola Pasqua e non conta festività nel weekend due volte', () => {
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    const result = calculateWorkCalendar(2026, [{ kind: 'recurring', name: 'Duplicata', month: 12, day: 25 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.theoreticalWorkdays).toBe(254);
    expect(result.value.excludedWeekdayHolidays.filter(x => x === '2026-12-25')).toHaveLength(1);
    expect(result.value.excludedWeekdayHolidays).not.toContain('2026-10-04');
  });

  it('segnala una ricorrenza non valida senza applicarla', () => {
    const result = calculateWorkCalendar(2026, [{ kind: 'recurring', name: '29 febbraio', month: 2, day: 29 }]);
    expect(result.ok && result.value.warnings).toHaveLength(1);
  });

  it('espone le festività italiane con nome e data per la UI', () => {
    const holidays = italianNationalHolidayEntries(2026);
    expect(holidays).toContainEqual({ name: 'Capodanno', date: '2026-01-01' });
    expect(holidays).toContainEqual({ name: "Lunedì dell'Angelo", date: '2026-04-06' });
    expect(holidays).toContainEqual({ name: "San Francesco d'Assisi", date: '2026-10-04' });
    expect(holidays.map((holiday) => holiday.date)).toEqual([...holidays.map((holiday) => holiday.date)].sort());
  });

  it('non include San Francesco prima del 2026', () => {
    expect(italianNationalHolidayEntries(2025).some((holiday) => holiday.date === '2025-10-04')).toBe(false);
  });
});
