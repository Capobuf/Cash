import { err, modeForFuel, ok, type Fuel, type FuelEvidence, type Result } from '../../domain/model';
import { officialFetch } from './http';

export const MIMIT_CSV_URL = 'https://www.mimit.gov.it/images/stories/carburanti/MediaRegionaleStradale.csv';

export function parseMimitCsv(csv: string, territory: string, fuel: Fuel, acquiredAt = new Date().toISOString()): Result<FuelEvidence> {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const date = lines[0]?.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!date) return err({ code: 'SOURCE_INVALID', source: 'MIMIT', message: 'La fonte MIMIT non espone una data di aggiornamento valida.' });
  if (lines[1]?.trim() !== 'REGIONE;TIPOLOGIA;EROGAZIONE;PREZZO MEDIO')
    return err({ code: 'SOURCE_INVALID', source: 'MIMIT', message: 'Intestazione CSV MIMIT non riconosciuta.' });
  const mode = modeForFuel(fuel);
  const row = lines.slice(2).map(line => line.split(';').map(value => value.trim()))
    .find(values => values[0]?.toLocaleLowerCase('it') === territory.trim().toLocaleLowerCase('it') && values[1] === fuel && values[2] === mode);
  if (!row || !row[3] || !/^\d+(?:\.\d{1,3})?$/.test(row[3]))
    return err({ code: 'MISSING_DATA', source: 'MIMIT', message: `Nessun prezzo ufficiale disponibile per ${fuel} ${mode} in ${territory}.` });
  return ok({ fuel, mode, territory: row[0]!, network: 'NON_AUTOSTRADALE', price: row[3],
    priceUnit: fuel === 'Metano' ? 'EUR/kg' : 'EUR/l', referenceDate: `${date[3]}-${date[2]}-${date[1]}`, acquiredAt });
}

export async function latestFuelPrice(territory: string, fuel: Fuel, fetcher: typeof fetch = fetch): Promise<Result<FuelEvidence>> {
  const response = await officialFetch(MIMIT_CSV_URL, { headers: { Accept: 'text/csv' } }, fetcher);
  if (!response.ok) return { ok: false, error: { ...response.error, source: 'MIMIT' } };
  if (!response.value.ok) return err({ code: 'SOURCE_UNAVAILABLE', source: 'MIMIT', message: `MIMIT ha risposto HTTP ${response.value.status}.` });
  return parseMimitCsv(await response.value.text(), territory, fuel);
}
