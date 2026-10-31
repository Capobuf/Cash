import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  nextTableSort,
  normalizeTablePreferences,
  readTablePreferences,
  saveTablePreferences,
} from '../../src/renderer/lib/table-preferences';

afterEach(() => vi.unstubAllGlobals());

describe('preferenze delle tabelle', () => {
  it('cicla ascendente, discendente, default e riparte cambiando colonna', () => {
    const ascending = nextTableSort(undefined, 'date');
    expect(ascending).toEqual({ id: 'date', direction: 'asc' });
    const descending = nextTableSort(ascending, 'date');
    expect(descending).toEqual({ id: 'date', direction: 'desc' });
    expect(nextTableSort(descending, 'date')).toBeUndefined();
    expect(nextTableSort(descending, 'amount')).toEqual({
      id: 'amount',
      direction: 'asc',
    });
  });

  it('gestisce colonne aggiunte, rimosse, duplicate e preferenze non valide', () => {
    expect(
      normalizeTablePreferences(
        { order: ['b', 'old', 'b'], hidden: ['old', 'b'] },
        ['a', 'b', 'new'],
      ),
    ).toEqual({ order: ['b', 'a', 'new'], hidden: ['b'] });
    expect(
      normalizeTablePreferences({ order: 'bad', hidden: ['a', 'b'] }, [
        'a',
        'b',
      ]),
    ).toEqual({ order: ['a', 'b'], hidden: [] });
    expect(normalizeTablePreferences(null, ['a'])).toEqual({
      order: ['a'],
      hidden: [],
    });
  });

  it('ripristina le preferenze salvate senza mescolare le tabelle', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    const preferences = { order: ['amount', 'date'], hidden: ['date'] };
    expect(saveTablePreferences('quotes', preferences)).toBe(true);
    expect(readTablePreferences('quotes', ['date', 'amount'])).toEqual(
      preferences,
    );
    expect(readTablePreferences('bank', ['date', 'amount'])).toEqual({
      order: ['date', 'amount'],
      hidden: [],
    });
  });

  it('gestisce dati corrotti e storage non disponibile', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{bad',
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(readTablePreferences('quotes', ['date'])).toEqual({
      order: ['date'],
      hidden: [],
    });
    expect(
      saveTablePreferences('quotes', { order: ['date'], hidden: [] }),
    ).toBe(false);
  });
});
