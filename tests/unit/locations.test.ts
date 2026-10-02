import { describe, expect, it } from 'vitest';
import {
  coordinatesInput,
  parseCoordinates,
  siteHasUsableLocation,
} from '../../src/domain/locations';
import { meta, type Site } from '../../src/domain/model';

describe('Sedi e valori predefiniti globali', () => {
  it('interpreta il formato Google Maps latitudine, longitudine e controlla gli intervalli', () => {
    expect(parseCoordinates('41.468225188142576, 14.562198586305103')).toEqual({
      ok: true,
      value: { longitude: '14.5621986', latitude: '41.4682252' },
    });
    expect(parseCoordinates('91, 45').ok).toBe(false);
    expect(parseCoordinates('45').ok).toBe(false);
  });
  it('invalida una localizzazione quando cambia l’input originario e accetta il formato storico', () => {
    const site: Site = {
      ...meta(),
      name: 'Studio',
      address: 'Roma',
      location: {
        inputKind: 'address',
        inputValue: 'Roma',
        coordinates: { longitude: '12.4964', latitude: '41.9028' },
      },
    };
    expect(siteHasUsableLocation(site)).toBe(true);
    site.address = 'Milano';
    expect(siteHasUsableLocation(site)).toBe(false);
    site.location = {
      inputKind: 'coordinates',
      inputValue: '41.9028, 12.4964',
      coordinates: { longitude: '12.4964', latitude: '41.9028' },
    };
    expect(coordinatesInput(site.location.coordinates)).toBe(
      '41.9028, 12.4964',
    );
    expect(siteHasUsableLocation(site)).toBe(true);
    site.location.inputValue = '12.4964, 41.9028';
    expect(siteHasUsableLocation(site)).toBe(true);
  });
});
