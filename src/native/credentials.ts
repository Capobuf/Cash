import keytar from 'keytar';
import { err, ok, type Result } from '../domain/model';

const SERVICE = 'it.cash.desktop';
const FIC_ACCOUNT = 'fatture-in-cloud-token';
const ORS_ACCOUNT = 'openrouteservice-api-key';

async function has(account: string): Promise<Result<boolean>> {
  try { return ok((await keytar.getPassword(SERVICE, account)) !== null); }
  catch (cause) { return err({ code: 'CREDENTIALS', source: 'credentials', message: 'Gestore credenziali non disponibile.', details: [String(cause)] }); }
}
async function set(account: string, value: string, label: string): Promise<Result<void>> {
  if (!value.trim()) return err({ code: 'VALIDATION', source: 'credentials', field: 'credential', message: `${label} non può essere vuota.` });
  try { await keytar.setPassword(SERVICE, account, value.trim()); return ok(undefined); }
  catch (cause) { return err({ code: 'CREDENTIALS', source: 'credentials', message: `Salvataggio ${label} non riuscito.`, details: [String(cause)] }); }
}
async function requireValue(account: string, message: string): Promise<Result<string>> {
  try { const value = await keytar.getPassword(SERVICE, account); return value ? ok(value) : err({ code: 'CREDENTIALS', source: 'credentials', message }); }
  catch (cause) { return err({ code: 'CREDENTIALS', source: 'credentials', message: 'Gestore credenziali non disponibile.', details: [String(cause)] }); }
}

export const hasFicToken = (): Promise<Result<boolean>> => has(FIC_ACCOUNT);
export const setFicToken = (token: string): Promise<Result<void>> => set(FIC_ACCOUNT, token, 'Il token');
export async function deleteFicToken(): Promise<Result<void>> {
  try { await keytar.deletePassword(SERVICE, FIC_ACCOUNT); return ok(undefined); }
  catch (cause) { return err({ code: 'CREDENTIALS', source: 'credentials', message: 'Rimozione token non riuscita.', details: [String(cause)] }); }
}
export const requireFicToken = (): Promise<Result<string>> => requireValue(FIC_ACCOUNT, 'Configurare il token Fatture in Cloud su questa postazione.');

export const hasOrsApiKey = (): Promise<Result<boolean>> => has(ORS_ACCOUNT);
export const setOrsApiKey = (apiKey: string): Promise<Result<void>> => set(ORS_ACCOUNT, apiKey, 'La API key OpenRouteService');
export const requireOrsApiKey = (): Promise<Result<string>> => requireValue(ORS_ACCOUNT, 'Configura la API key OpenRouteService nelle Impostazioni.');
