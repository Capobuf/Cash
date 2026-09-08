import keytar from 'keytar';
import { err, ok, type Result } from '../domain/model';

const SERVICE = 'it.cash.desktop';
const ACCOUNT = 'fatture-in-cloud-token';

export async function hasFicToken(): Promise<Result<boolean>> {
  try { return ok((await keytar.getPassword(SERVICE, ACCOUNT)) !== null); }
  catch (cause) { return err({ code: 'CREDENTIALS', source: 'credentials', message: 'Gestore credenziali non disponibile.', details: [String(cause)] }); }
}
export async function setFicToken(token: string): Promise<Result<void>> {
  if (!token.trim()) return err({ code: 'VALIDATION', source: 'credentials', field: 'token', message: 'Il token non può essere vuoto.' });
  try { await keytar.setPassword(SERVICE, ACCOUNT, token.trim()); return ok(undefined); }
  catch (cause) { return err({ code: 'CREDENTIALS', source: 'credentials', message: 'Salvataggio token non riuscito.', details: [String(cause)] }); }
}
export async function deleteFicToken(): Promise<Result<void>> {
  try { await keytar.deletePassword(SERVICE, ACCOUNT); return ok(undefined); }
  catch (cause) { return err({ code: 'CREDENTIALS', source: 'credentials', message: 'Rimozione token non riuscita.', details: [String(cause)] }); }
}
export async function requireFicToken(): Promise<Result<string>> {
  try { const token = await keytar.getPassword(SERVICE, ACCOUNT);
    return token ? ok(token) : err({ code: 'CREDENTIALS', source: 'credentials', message: 'Configurare il token Fatture in Cloud su questa postazione.' });
  } catch (cause) { return err({ code: 'CREDENTIALS', source: 'credentials', message: 'Gestore credenziali non disponibile.', details: [String(cause)] }); }
}
