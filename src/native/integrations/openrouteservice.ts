import Decimal from 'decimal.js';
import { err, ok, type Coordinates, type GeocodingResult, type Result, type RouteResult } from '../../domain/model';
import { officialFetch } from './http';

const BASE = 'https://api.openrouteservice.org';
const headers = (apiKey: string): HeadersInit => ({ Authorization: apiKey, Accept: 'application/json' });

function providerDiagnostic(payload: unknown): { code?: string; message?: string } {
  if (!payload || typeof payload !== 'object') return {};
  const record = payload as { code?: unknown; message?: unknown; error?: unknown };
  const nested = record.error && typeof record.error === 'object' ? providerDiagnostic(record.error) : {};
  return {
    code: typeof record.code === 'number' || typeof record.code === 'string' ? String(record.code) : nested.code,
    message: typeof record.message === 'string' && record.message.trim() ? record.message.trim() : nested.message,
  };
}

function providerError(status: number, payload?: unknown): Result<never> {
  if (status === 401 || status === 403) return err({ code: 'AUTHENTICATION', source: 'OpenRouteService', message: 'API key OpenRouteService non valida.', action: 'Controlla la chiave nelle Impostazioni.' });
  if (status === 429) return err({ code: 'RATE_LIMIT', source: 'OpenRouteService', message: 'Limite OpenRouteService raggiunto.', action: 'Attendi il ripristino del limite prima di riprovare.' });
  const diagnostic = providerDiagnostic(payload);
  const details = diagnostic.message ? [`ORS${diagnostic.code ? ` ${diagnostic.code}` : ''}: ${diagnostic.message}`] : [`HTTP ${status}`];
  if (diagnostic.code === '2010') {
    const coordinateIndex = diagnostic.message?.match(/coordinate\s+([01])\b/i)?.[1];
    const siteLabel = coordinateIndex === '0' ? 'Partenza' : coordinateIndex === '1' ? 'Destinazione' : undefined;
    return err({
      code: 'SOURCE_INVALID', source: 'OpenRouteService',
      message: `OpenRouteService non trova una strada percorribile vicino ${siteLabel ? `alla ${siteLabel}` : 'a una delle due Sedi'}.`,
      action: `Controlla le coordinate ${siteLabel ? `della ${siteLabel}` : 'della Sede indicata nel dettaglio'} e localizzala nuovamente più vicino a una strada accessibile alle auto.`,
      details,
    });
  }
  if (status >= 500) return err({ code: 'SOURCE_UNAVAILABLE', source: 'OpenRouteService', message: `OpenRouteService non è al momento disponibile (${status}).`, action: 'Riprova più tardi.', details });
  return err({ code: 'SOURCE_INVALID', source: 'OpenRouteService', message: `OpenRouteService ha rifiutato la richiesta (${status}).`, action: 'Controlla i dettagli restituiti dal servizio e le coordinate delle Sedi.', details });
}

async function requestJson(url: string, apiKey: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Result<unknown>> {
  const response = await officialFetch(url, { ...init, headers: { ...headers(apiKey), ...init.headers } }, fetcher);
  if (!response.ok) return err({ ...response.error, source: 'OpenRouteService' });
  let payload: unknown;
  try {
    const body = await response.value.text();
    payload = body ? JSON.parse(body) : undefined;
  } catch {
    if (!response.value.ok) return providerError(response.value.status);
    return err({ code: 'SOURCE_INVALID', source: 'OpenRouteService', message: 'OpenRouteService ha restituito una risposta non valida.' });
  }
  if (!response.value.ok) return providerError(response.value.status, payload);
  return ok(payload);
}

function parseFeatures(payload: unknown): Result<GeocodingResult[]> {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { features?: unknown }).features)) return err({ code: 'SOURCE_INVALID', source: 'OpenRouteService', message: 'Risposta di geocodifica non valida.' });
  const values: GeocodingResult[] = [];
  for (const [index, feature] of ((payload as { features: unknown[] }).features).entries()) {
    if (!feature || typeof feature !== 'object') continue;
    const record = feature as { geometry?: { coordinates?: unknown[] }; properties?: { label?: unknown; name?: unknown }; id?: unknown };
    const pair = record.geometry?.coordinates; const longitude = pair?.[0]; const latitude = pair?.[1];
    const label = typeof record.properties?.label === 'string' ? record.properties.label : typeof record.properties?.name === 'string' ? record.properties.name : undefined;
    if (typeof longitude !== 'number' || typeof latitude !== 'number' || !label) continue;
    values.push({ id: typeof record.id === 'string' ? record.id : String(index), label, coordinates: { longitude: new Decimal(longitude).toDecimalPlaces(7).toString(), latitude: new Decimal(latitude).toDecimalPlaces(7).toString() } });
  }
  return ok(values);
}

export async function searchAddress(text: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<Result<GeocodingResult[]>> {
  if (!text.trim()) return err({ code: 'VALIDATION', source: 'OpenRouteService', field: 'address', message: 'Inserisci un indirizzo da cercare.' });
  const url = new URL(`${BASE}/geocode/search`); url.searchParams.set('text', text.trim()); url.searchParams.set('size', '10');
  const response = await requestJson(url.toString(), apiKey, {}, fetcher); return response.ok ? parseFeatures(response.value) : response;
}

export async function reverseCoordinates(coordinates: Coordinates, apiKey: string, fetcher: typeof fetch = fetch): Promise<Result<GeocodingResult[]>> {
  const url = new URL(`${BASE}/geocode/reverse`); url.searchParams.set('point.lon', coordinates.longitude); url.searchParams.set('point.lat', coordinates.latitude); url.searchParams.set('size', '1');
  const response = await requestJson(url.toString(), apiKey, {}, fetcher); return response.ok ? parseFeatures(response.value) : response;
}

export async function calculateRoute(departure: Coordinates, destination: Coordinates, apiKey: string, fetcher: typeof fetch = fetch): Promise<Result<RouteResult>> {
  const points = [departure, destination].map(({ longitude, latitude }) => [Number(longitude), Number(latitude)] as const);
  if (points.some(([longitude, latitude]) => !Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90))
    return err({ code: 'VALIDATION', source: 'OpenRouteService', field: 'coordinates', message: 'Le coordinate di Partenza o Destinazione non sono valide.', action: 'Localizza nuovamente entrambe le Sedi.' });
  const response = await requestJson(`${BASE}/v2/directions/driving-car/json`, apiKey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: points }) }, fetcher);
  if (!response.ok) return response;
  const route = response.value as { routes?: Array<{ summary?: { distance?: unknown; duration?: unknown } }>; features?: Array<{ properties?: { summary?: { distance?: unknown; duration?: unknown } } }> };
  const summary = route.routes?.[0]?.summary ?? route.features?.[0]?.properties?.summary;
  if (typeof summary?.distance !== 'number' || !Number.isFinite(summary.distance) || typeof summary.duration !== 'number' || !Number.isFinite(summary.duration)) return err({ code: 'SOURCE_INVALID', source: 'OpenRouteService', message: 'La risposta del percorso non contiene distanza e durata valide.', action: 'Riprova; se il problema continua verifica lo stato di OpenRouteService.', details: ['Mancano routes[0].summary.distance o routes[0].summary.duration.'] });
  return ok({ distanceMeters: new Decimal(summary.distance).toString(), durationSeconds: new Decimal(summary.duration).toString() });
}

export async function verifyConnection(apiKey: string, fetcher: typeof fetch = fetch): Promise<Result<void>> {
  const url = new URL(`${BASE}/geocode/search`); url.searchParams.set('text', 'Roma, Italia'); url.searchParams.set('size', '1');
  const response = await requestJson(url.toString(), apiKey, {}, fetcher); if (!response.ok) return response;
  const result = parseFeatures(response.value); if (!result.ok) return result;
  if (!result.value.length) return err({ code: 'SOURCE_INVALID', source: 'OpenRouteService', message: 'La verifica non ha restituito risultati validi.' });
  return ok(undefined);
}
