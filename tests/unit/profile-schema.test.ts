import { describe, expect, it } from 'vitest';
import { calculateWorkCalendar } from '../../src/domain/calendar';
import { calculateProfile } from '../../src/domain/calculations';
import {
  createBlankProfile,
  createEmptyDocument,
  createFiscalPreset2026,
  type EconomicProfile,
} from '../../src/domain/model';
import { confirmProfile } from '../../src/domain/profiles';
import { cashDocumentSchema, profileSchema } from '../../src/domain/schema';

const validProfile = (): EconomicProfile => ({
  ...createFiscalPreset2026(),
  confirmed: true,
  revenueTarget: '50000.00',
});

const invalidParameters: {
  name: string;
  change: (profile: EconomicProfile) => void;
  path: string[];
}[] = [
  {
    name: 'fatturato obiettivo zero',
    change: (profile) => (profile.revenueTarget = '0.00'),
    path: ['revenueTarget'],
  },
  {
    name: 'spese specifiche pari al fatturato',
    change: (profile) => (profile.specificAnnualExpenses = '50000.00'),
    path: ['specificAnnualExpenses'],
  },
  {
    name: 'redditività zero',
    change: (profile) => (profile.fiscal.profitabilityCoefficient = '0'),
    path: ['fiscal'],
  },
  {
    name: 'aliquota INPS zero',
    change: (profile) => (profile.fiscal.contributionRate = '0'),
    path: ['fiscal', 'contributionRate'],
  },
  {
    name: 'aliquota ordinaria zero',
    change: (profile) => (profile.fiscal.ordinarySubstituteTaxRate = '0'),
    path: ['fiscal'],
  },
  {
    name: 'aliquota ridotta zero anche in fase ordinaria',
    change: (profile) => (profile.fiscal.reducedSubstituteTaxRate = '0'),
    path: ['fiscal'],
  },
  {
    name: 'massimale zero',
    change: (profile) => (profile.fiscal.contributionCeiling = '0.00'),
    path: ['fiscal', 'contributionCeiling'],
  },
  {
    name: 'soglia ordinaria zero',
    change: (profile) => (profile.fiscal.ordinaryThreshold = '0.00'),
    path: ['fiscal', 'cessationThreshold'],
  },
  {
    name: 'soglie uguali',
    change: (profile) => (profile.fiscal.cessationThreshold = '85000.00'),
    path: ['fiscal', 'cessationThreshold'],
  },
  {
    name: 'soglie invertite',
    change: (profile) => (profile.fiscal.cessationThreshold = '84000.00'),
    path: ['fiscal', 'cessationThreshold'],
  },
  {
    name: 'ore giornaliere zero',
    change: (profile) => (profile.capacity.hoursPerDay = '0'),
    path: ['capacity', 'hoursPerDay'],
  },
  {
    name: 'percentuale cliente zero',
    change: (profile) => (profile.capacity.clientTimePercentage = '0'),
    path: ['capacity', 'clientTimePercentage'],
  },
  {
    name: 'ferie oltre i giorni lavorativi',
    change: (profile) => (profile.capacity.vacationDays = 366),
    path: ['capacity', 'vacationDays'],
  },
  {
    name: 'nessun giorno disponibile',
    change: (profile) => {
      const calendar = calculateWorkCalendar(profile.year, []);
      if (!calendar.ok) throw new Error(calendar.error.message);
      profile.capacity.vacationDays = calendar.value.theoreticalWorkdays;
      profile.capacity.unplannedDays = 0;
    },
    path: ['capacity', 'clientTimePercentage'],
  },
  {
    name: 'minuti cliente arrotondati a zero',
    change: (profile) => {
      profile.capacity.hoursPerDay = '0.0001';
      profile.capacity.clientTimePercentage = '1';
    },
    path: ['capacity', 'clientTimePercentage'],
  },
  {
    name: 'ATECO fuori perimetro',
    change: (profile) => (profile.fiscal.atecoCode = '01.11.00'),
    path: ['fiscal'],
  },
  {
    name: 'ATECO vuoto',
    change: (profile) => (profile.fiscal.atecoCode = ''),
    path: ['fiscal', 'atecoCode'],
  },
  {
    name: 'fase agevolata senza conferma requisiti',
    change: (profile) => (profile.fiscal.activityPhase = 'reduced_eligible'),
    path: ['fiscal', 'reducedEligibilityConfirmed'],
  },
  {
    name: 'fase agevolata oltre soglia senza conferma applicabilità',
    change: (profile) => {
      profile.revenueTarget = '90000.00';
      profile.fiscal.activityPhase = 'reduced_eligible';
      profile.fiscal.reducedEligibilityConfirmed = true;
    },
    path: ['fiscal', 'ordinaryApplicabilityConfirmed'],
  },
];

describe('invarianti condivise dei profili confermati', () => {
  it.each(invalidParameters)(
    'rifiuta $name nello schema e nel comando di conferma',
    ({ change, path }) => {
      const profile = validProfile();
      change(profile);
      const command = confirmProfile(profile, []);
      expect(command.ok).toBe(false);
      const parsed = profileSchema.safeParse(profile);
      expect(parsed.success).toBe(false);
      if (command.ok || parsed.success) return;
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({ path, message: command.error.message }),
      );
    },
  );

  it.each([
    ['ordinary', '85000.00', false],
    ['ordinary', '85000.01', true],
    ['ordinary', '100000.00', true],
    ['ordinary', '100000.01', false],
    ['reduced_eligible', '50000.00', false],
    ['reduced_eligible', '85000.00', false],
    ['reduced_eligible', '85000.01', true],
    ['reduced_eligible', '100000.00', true],
    ['reduced_eligible', '100000.01', false],
  ] as const)(
    'accetta fase %s, fatturato %s, applicabilità %s e resta calcolabile',
    (phase, revenue, applicability) => {
      const profile = validProfile();
      profile.revenueTarget = revenue;
      profile.fiscal.activityPhase = phase;
      profile.fiscal.reducedEligibilityConfirmed = phase === 'reduced_eligible';
      profile.fiscal.ordinaryApplicabilityConfirmed = applicability;
      const parsed = profileSchema.safeParse(profile);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(calculateProfile(parsed.data, []).ok).toBe(true);
      expect(confirmProfile(parsed.data, []).ok).toBe(true);
    },
  );

  it('propaga il campo fiscale nella validazione dell’intero archivio', () => {
    const document = createEmptyDocument();
    const profile = validProfile();
    profile.fiscal.contributionRate = '0';
    document.profiles = [profile];
    const parsed = cashDocumentSchema.safeParse(document);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['profiles', 0, 'fiscal', 'contributionRate'],
        }),
      );
  });
});

describe('profili da verificare', () => {
  it('preserva il profilo vuoto e le soglie entrambe zero senza confermarlo', () => {
    const draft = createBlankProfile(2027);
    expect(profileSchema.parse(draft)).toEqual(draft);
    expect(confirmProfile(draft, []).ok).toBe(false);
  });

  it.each(invalidParameters.filter(({ name }) => name !== 'soglie invertite'))(
    'consente la bozza con $name',
    ({ change }) => {
      const draft = validProfile();
      draft.confirmed = false;
      change(draft);
      expect(profileSchema.parse(draft)).toEqual(draft);
    },
  );

  it('mantiene il vincolo preesistente sulle soglie invertite della bozza', () => {
    const draft = validProfile();
    draft.confirmed = false;
    draft.fiscal.cessationThreshold = '84000.00';
    expect(profileSchema.safeParse(draft).success).toBe(false);
  });
});
