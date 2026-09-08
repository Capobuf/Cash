import { describe, expect, it } from 'vitest';
import { calculateProfile } from '../../src/domain/calculations';
import { createFiscalPreset2026, meta } from '../../src/domain/model';

describe('profilo economico e fiscale', () => {
  it('applica la formula forfettaria e arrotonda i componenti visibili', () => {
    const profile = createFiscalPreset2026();
    Object.assign(profile, { confirmed: true, revenueTarget: '50000.00', specificAnnualExpenses: '1000.00' });
    const result = calculateProfile(profile, [{ ...meta(), category: 'Software', description: 'Suite', monthlyAmount: '100.00' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.forfaitIncome).toBe('33500.00');
    expect(result.value.contributions).toBe('8733.45');
    expect(result.value.substituteTax).toBe('3714.98');
    expect(result.value.fiscalNet).toBe('37551.57');
    expect(result.value.availableIncome).toBe('35351.57');
  });

  it('blocca la proiezione non confermata e non inventa valori', () => {
    const profile = createFiscalPreset2026(); profile.revenueTarget = '50000.00';
    const result = calculateProfile(profile, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('MISSING_DATA');
  });

  it('lascia la pianificazione ma omette il fisco oltre 100 mila', () => {
    const profile = createFiscalPreset2026(); Object.assign(profile, { confirmed: true, revenueTarget: '100000.01' });
    const result = calculateProfile(profile, []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.fiscalNet).toBeUndefined();
  });
});
