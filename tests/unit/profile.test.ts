import { describe, expect, it } from 'vitest';
import { calculateFiscalProjection, calculateProfile, previewProfile } from '../../src/domain/calculations';
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

  it('richiede di configurare INPS nel nuovo anno senza modificare il profilo originale', () => {
    const source = createFiscalPreset2026(); source.revenueTarget = '50000.00'; source.confirmed = true;
    const copied = copyProfileToYear(source, 2027);
    expect(copied.ok).toBe(true);
    if (!copied.ok) return;
    expect(copied.value.fiscal.contributionRate).toBe('0');
    expect(source.fiscal.contributionRate).toBe('26.07');
    expect(confirmProfile(copied.value, [])).toMatchObject({ ok: false, error: { field: 'contributionRate' } });
    copied.value.fiscal.contributionRate = '24';
    expect(confirmProfile(copied.value, [])).toMatchObject({ ok: true, value: { confirmed: true } });
  });

  it.each(['0', '0.00', '-1', '100.01', 'NaN', 'Infinity'])('non produce una previsione con aliquota INPS %s', (rate) => {
    const fiscal = createFiscalPreset2026().fiscal; fiscal.contributionRate = rate;
    expect(calculateFiscalProjection('27268.40', fiscal)).toMatchObject({ ok: false, error: { field: 'contributionRate' } });
  });
});
