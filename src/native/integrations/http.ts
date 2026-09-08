import { err, ok, type Result } from '../../domain/model';

export const ALLOWED_HOSTS = new Set(['www.mimit.gov.it', 'esploradati.istat.it', 'api-v2.fattureincloud.it']);

export async function officialFetch(url: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Result<Response>> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname))
    return err({ code: 'VALIDATION', message: 'Endpoint non autorizzato.', source: 'archive' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal, redirect: 'error' });
    return ok(response);
  } catch (cause) {
    return err({ code: 'SOURCE_UNAVAILABLE', message: 'Fonte ufficiale non raggiungibile.', details: [String(cause)] });
  } finally { clearTimeout(timeout); }
}
