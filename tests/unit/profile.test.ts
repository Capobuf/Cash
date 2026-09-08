import { describe, expect, it } from 'vitest';
import { calculateProfile, previewProfile } from '../../src/domain/calculations';
import { createFiscalPreset2026, meta } from '../../src/domain/model';
import { confirmProfile, copyProfileToYear, saveProfileRevision } from '../../src/domain/profiles';

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

  it('mostra anteprima 5%/15% e richiede conferma separata per il 5%',()=>{
    const profile=createFiscalPreset2026();profile.revenueTarget='50000.00';profile.fiscal.activityPhase='reduced_eligible';
    const ordinaryPreview=previewProfile(profile,[]);expect(ordinaryPreview.ok&&ordinaryPreview.value.effectiveTaxRate).toBe('15');
    profile.fiscal.reducedEligibilityConfirmed=true;const reducedPreview=previewProfile(profile,[]);
    expect(reducedPreview.ok&&reducedPreview.value.effectiveTaxRate).toBe('5');
    profile.fiscal.reducedEligibilityConfirmed=false;expect(confirmProfile(profile,[]).ok).toBe(false);
  });

  it('ogni modifica crea revisione Da verificare e la copia annuale non è confermata',()=>{
    const profile=createFiscalPreset2026();profile.revenueTarget='50000.00';profile.confirmed=true;
    const draft=structuredClone(profile);draft.revenueTarget='51000.00';const saved=saveProfileRevision(profile,draft);
    expect(saved.revision).toBe(2);expect(saved.confirmed).toBe(false);
    const copied=copyProfileToYear(profile,2027);expect(copied.ok&&copied.value.confirmed).toBe(false);expect(copied.ok&&copied.value.id).not.toBe(profile.id);
  });

  it('richiede conferma specifica oltre la soglia ordinaria',()=>{const profile=createFiscalPreset2026();profile.revenueTarget='90000.00';expect(confirmProfile(profile,[]).ok).toBe(false);profile.fiscal.ordinaryApplicabilityConfirmed=true;expect(confirmProfile(profile,[]).ok).toBe(true);});
});
