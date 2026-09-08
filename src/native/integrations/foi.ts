import Decimal from 'decimal.js';
import { money } from '../../domain/decimal';
import { err, ok, type FoiEvidence, type Result } from '../../domain/model';
import { officialFetch } from './http';

export const ISTAT_FOI_URL = 'https://esploradati.istat.it/SDMXWS/rest/data/169_745_DF_DCSP_FOI1B2015_1';
export interface FoiObservation { period: string; value: string; base: string; linkFactor: string }

function splitCsvLine(line: string): string[] {
  const values: string[] = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { values.push(value); value = ''; } else value += char;
  }
  values.push(value); return values;
}

export function parseFoiSdmxCsv(csv: string): Result<FoiObservation[]> {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return err({ code: 'SOURCE_INVALID', source: 'ISTAT', message: 'Serie FOI vuota.' });
  const headers = splitCsvLine(lines[0]!);
  const periodIndex = headers.indexOf('TIME_PERIOD'), valueIndex = headers.indexOf('OBS_VALUE');
  if (periodIndex < 0 || valueIndex < 0) return err({ code: 'SOURCE_INVALID', source: 'ISTAT', message: 'Colonne SDMX FOI mancanti.' });
  const baseIndex = headers.findIndex(value => value === 'BASE_PER' || value === 'BASE_YEAR');
  const rows: FoiObservation[] = [];
  for (const line of lines.slice(1)) {
    const values = splitCsvLine(line);
    const period = values[periodIndex], value = values[valueIndex];
    if (period && /^\d{4}-\d{2}$/.test(period) && value && /^\d+(?:\.\d+)?$/.test(value))
      rows.push({ period, value, base: baseIndex >= 0 ? values[baseIndex] || '2015=100' : '2015=100', linkFactor: '1' });
  }
  const unique = new Map(rows.map(row => [row.period, row]));
  if (!unique.size) return err({ code: 'SOURCE_INVALID', source: 'ISTAT', message: 'Nessuna osservazione mensile FOI valida nella risposta.' });
  return ok([...unique.values()].sort((a, b) => a.period.localeCompare(b.period)));
}

export function revalueFromSeries(amount: string, fromPeriod: string, series: FoiObservation[], acquiredAt = new Date().toISOString()): Result<FoiEvidence> {
  const start = series.find(row => row.period === fromPeriod);
  const end = [...series].sort((a, b) => b.period.localeCompare(a.period))[0];
  if (!start || !end) return err({ code: 'MISSING_DATA', source: 'ISTAT', message: `Indice FOI non disponibile per ${fromPeriod} o per il periodo finale.` });
  if (start.base !== end.base && (start.linkFactor === '1' || end.linkFactor === '1'))
    return err({ code: 'MISSING_DATA', source: 'ISTAT', message: 'Coefficienti ufficiali di raccordo mancanti per basi FOI diverse.' });
  try {
    const fromComparable = new Decimal(start.value).mul(start.linkFactor);
    const toComparable = new Decimal(end.value).mul(end.linkFactor);
    return ok({ fromPeriod, toPeriod: end.period, fromIndex: start.value, toIndex: end.value,
      fromBase: start.base, toBase: end.base, fromLinkFactor: start.linkFactor, toLinkFactor: end.linkFactor,
      revaluedAmount: money(new Decimal(amount).mul(toComparable).div(fromComparable)), acquiredAt });
  } catch { return err({ code: 'VALIDATION', source: 'ISTAT', field: 'amount', message: 'Importo o indice FOI non valido.' }); }
}

export async function revalueFoi(amount: string, fromPeriod: string, fetcher: typeof fetch = fetch): Promise<Result<FoiEvidence>> {
  const response = await officialFetch(`${ISTAT_FOI_URL}?startPeriod=${encodeURIComponent(fromPeriod)}&lastNObservations=240`,
    { headers: { Accept: 'application/vnd.sdmx.data+csv;version=1.0.0' } }, fetcher);
  if (!response.ok) return { ok: false, error: { ...response.error, source: 'ISTAT' } };
  if (!response.value.ok) return err({ code: 'SOURCE_UNAVAILABLE', source: 'ISTAT', message: `ISTAT ha risposto HTTP ${response.value.status}.` });
  const series = parseFoiSdmxCsv(await response.value.text());
  return series.ok ? revalueFromSeries(amount, fromPeriod, series.value) : series;
}
