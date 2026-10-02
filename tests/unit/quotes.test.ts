import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  createFiscalPreset2026,
} from '../../src/domain/model';
import { createQuote } from '../../src/domain/quotes';

describe('creazione condivisa del preventivo', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'Europe/Rome');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([
    ['2026-07-14T22:30:00Z', '2026-07-15', -120],
    ['2025-12-31T23:30:00Z', '2026-01-01', -60],
  ])('usa il giorno locale a mezzanotte (%s)', (instant, expected, offset) => {
    vi.setSystemTime(new Date(instant));
    expect(new Date().getTimezoneOffset()).toBe(offset);
    expect(createQuote(createEmptyDocument()).date).toBe(expected);
  });

  it('crea uno snapshot indipendente del profilo confermato', () => {
    const document = createEmptyDocument();
    const profile = createFiscalPreset2026();
    Object.assign(profile, { confirmed: true, revenueTarget: '50000.00' });
    document.profiles.push(profile);
    const before = structuredClone(document);
    const quote = createQuote(document);
    expect(quote).toMatchObject({
      date: '2026-10-02',
      profileId: profile.id,
      profileSnapshot: {
        sourceId: profile.id,
        year: 2026,
        revision: profile.revision,
      },
      items: [],
      snapshotRevision: 0,
      exportAttempts: [],
    });
    expect(quote.profileSnapshot?.fiscal).toEqual(profile.fiscal);
    expect(quote.profileSnapshot?.fiscal).not.toBe(profile.fiscal);
    expect(document).toEqual(before);
    expect(createQuote(document).id).not.toBe(quote.id);
  });

  it.each([false, true])(
    'crea un preventivo incompleto senza profilo confermato (profilo presente: %s)',
    (hasProfile) => {
      const document = createEmptyDocument();
      if (hasProfile) document.profiles.push(createFiscalPreset2026());
      const quote = createQuote(document);
      expect(quote.profileId).toBeUndefined();
      expect(quote.profileSnapshot).toBeUndefined();
      expect(quote).toMatchObject({
        date: '2026-10-02',
        items: [],
        snapshotRevision: 0,
        exportAttempts: [],
      });
    },
  );
});
