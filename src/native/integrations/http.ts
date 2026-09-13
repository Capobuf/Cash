import { err, ok, type Result } from '../../domain/model';

export const ALLOWED_HOSTS = new Set(['www.mimit.gov.it', 'esploradati.istat.it', 'api-v2.fattureincloud.it', 'api.openrouteservice.org']);

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
    const record = cause as { name?: unknown; message?: unknown; cause?: { code?: unknown } } | undefined;
    const name = typeof record?.name === 'string' ? record.name : 'Error';
    const message = typeof record?.message === 'string' ? record.message : 'errore di trasporto';
    const causeCode = typeof record?.cause?.code === 'string' ? record.cause.code : undefined;
    const timedOut = controller.signal.aborted || name === 'AbortError' || name === 'TimeoutError';
    return err({
      code: 'SOURCE_UNAVAILABLE',
      message: timedOut ? 'La richiesta alla fonte ufficiale ha superato il tempo massimo di 15 secondi.' : 'Connessione alla fonte ufficiale non riuscita.',
      action: timedOut ? 'Riprova; se il problema continua verifica proxy, VPN o firewall.' : 'Controlla connessione, proxy, VPN o firewall e riprova.',
      details: [`${name}: ${message}${causeCode ? ` (${causeCode})` : ''}`],
    });
  } finally { clearTimeout(timeout); }
}
