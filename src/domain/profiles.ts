import { calculateProfile } from './calculations';
import { err, meta, nowIso, ok, type BusinessCost, type EconomicProfile, type Result } from './model';

export function saveProfileRevision(previous: EconomicProfile | undefined, draft: EconomicProfile): EconomicProfile {
  if (!previous) return { ...structuredClone(draft), confirmed: false };
  const comparablePrevious = { ...structuredClone(previous), updatedAt: '', confirmed: false, revision: 0 };
  const comparableDraft = { ...structuredClone(draft), updatedAt: '', confirmed: false, revision: 0 };
  if (JSON.stringify(comparablePrevious) === JSON.stringify(comparableDraft)) return structuredClone(previous);
  return { ...structuredClone(draft), id: previous.id, createdAt: previous.createdAt, updatedAt: nowIso(),
    revision: previous.revision + 1, confirmed: false };
}

export function confirmProfile(profile: EconomicProfile, costs: BusinessCost[]): Result<EconomicProfile> {
  const candidate = { ...structuredClone(profile), confirmed: true, updatedAt: nowIso() };
  const validation = calculateProfile(candidate, costs);
  if (!validation.ok) return validation;
  return ok(candidate);
}

export function copyProfileToYear(profile: EconomicProfile, year: number): Result<EconomicProfile> {
  if (!Number.isInteger(year) || year < 2000 || year > 2200)
    return err({ code: 'VALIDATION', field: 'year', message: 'Anno fiscale non valido.' });
  return ok({ ...structuredClone(profile), ...meta(), year, revision: 1, confirmed: false,
    fiscal: { ...structuredClone(profile.fiscal), reducedEligibilityConfirmed: false,
      ordinaryApplicabilityConfirmed: false } });
}
