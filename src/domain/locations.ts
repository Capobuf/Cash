import Decimal from 'decimal.js';
import { err, ok, type CashDocument, type Coordinates, type Result, type Site, type SiteSnapshot } from './model';

export function parseCoordinates(input: string): Result<Coordinates> {
  const parts = input.split(',').map((part) => part.trim());
  if (parts.length !== 2 || parts.some((part) => !part)) return err({ code: 'VALIDATION', field: 'coordinates', message: 'Inserisci le coordinate nel formato latitudine, longitudine usato da Google Maps.' });
  try {
    const latitude = new Decimal(parts[0]!); const longitude = new Decimal(parts[1]!);
    if (longitude.lt(-180) || longitude.gt(180) || latitude.lt(-90) || latitude.gt(90)) throw new Error('range');
    return ok({ longitude: longitude.toDecimalPlaces(7).toString(), latitude: latitude.toDecimalPlaces(7).toString() });
  } catch { return err({ code: 'VALIDATION', field: 'coordinates', message: 'Le coordinate non sono valide. Usa latitudine, longitudine come in Google Maps.' }); }
}

export function coordinatesInput(coordinates: Coordinates): string { return `${coordinates.latitude}, ${coordinates.longitude}`; }

function legacyCoordinatesInput(coordinates: Coordinates): string { return `${coordinates.longitude}, ${coordinates.latitude}`; }

export function snapshotSite(site: Site): SiteSnapshot {
  return { sourceId: site.id, name: site.name, ...(site.address ? { address: site.address } : {}), ...(site.location ? { coordinates: structuredClone(site.location.coordinates) } : {}) };
}

export function siteHasUsableLocation(site: Site): boolean {
  if (!site.location) return false;
  if (site.location.inputKind === 'address') return Boolean(site.address?.trim() && site.address.trim() === site.location.inputValue);
  return site.location.inputValue === coordinatesInput(site.location.coordinates)
    || site.location.inputValue === legacyCoordinatesInput(site.location.coordinates);
}

export function setDefaultDepartureSite(document: CashDocument, siteId?: string): Result<void> {
  if (siteId && !document.sites.some((site) => site.id === siteId)) return err({ code: 'VALIDATION', field: 'defaultDepartureSiteId', message: 'La Sede scelta non esiste.' });
  document.settings.defaultDepartureSiteId = siteId; return ok(undefined);
}

export function setDefaultVehicle(document: CashDocument, vehicleId?: string): Result<void> {
  if (vehicleId && !document.vehicles.some((vehicle) => vehicle.id === vehicleId)) return err({ code: 'VALIDATION', field: 'defaultVehicleId', message: 'Il Veicolo scelto non esiste.' });
  document.settings.defaultVehicleId = vehicleId; return ok(undefined);
}
