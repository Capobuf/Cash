import { describe, expect, it } from 'vitest';
import { calculateWorkCalendar, easterSunday } from '../../src/domain/calendar';

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
});
