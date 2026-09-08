import { z } from 'zod';
import { err, ok, type ClientSnapshot, type ExportLine, type Result } from '../../domain/model';
import { officialFetch } from './http';

const BASE = 'https://api-v2.fattureincloud.it/v2';
const clientSchema = z.object({ id: z.union([z.string(), z.number()]), name: z.string().min(1), vat_number: z.string().nullish() });
const productSchema = z.object({ id: z.union([z.string(), z.number()]), name: z.string().min(1) });

async function ficFetch(path: string, token: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Result<Response>> {
  const response = await officialFetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
    'Content-Type': 'application/json', ...(init.headers ?? {}) } }, fetcher);
  return response.ok ? response : { ok: false, error: { ...response.error, source: 'FattureInCloud' } };
}

export async function searchClients(companyId: string, query: string, token: string, fetcher: typeof fetch = fetch): Promise<Result<ClientSnapshot[]>> {
  const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/entities/clients?per_page=50&q=${encodeURIComponent(query)}`, token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) return err({ code: 'SOURCE_UNAVAILABLE', source: 'FattureInCloud', message: `Ricerca clienti rifiutata (HTTP ${response.value.status}).` });
  try {
    const json = await response.value.json() as { data?: unknown[] };
    const clients = z.array(clientSchema).parse(json.data ?? []);
    return ok(clients.map(client => ({ companyId, clientId: String(client.id), displayName: client.name, vatNumber: client.vat_number ?? '' })));
  } catch (cause) { return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Risposta clienti non valida.', details: [String(cause)] }); }
}

export async function verifyProduct(companyId: string, productId: string, token: string, fetcher: typeof fetch = fetch): Promise<Result<{ id: string; name: string }>> {
  const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/products/${encodeURIComponent(productId)}`, token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) return err({ code: 'SOURCE_UNAVAILABLE', source: 'FattureInCloud', message: `Prodotto non verificabile (HTTP ${response.value.status}).` });
  try { const json = await response.value.json() as { data?: unknown }; const product = productSchema.parse(json.data);
    if (product.name.trim().toLocaleLowerCase('it') !== 'consulenza') return err({ code: 'VALIDATION', source: 'FattureInCloud', field: 'productId', message: 'Il prodotto selezionato non è “Consulenza”.' });
    return ok({ id: String(product.id), name: product.name });
  } catch (cause) { return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Risposta prodotto non valida.', details: [String(cause)] }); }
}

export async function exportQuote(input: { companyId: string; clientId: string; productId: string; lines: ExportLine[]; attemptId: string },
  token: string, fetcher: typeof fetch = fetch): Promise<Result<{ outcome: 'success' | 'rejected' | 'uncertain'; remoteDocumentId?: string; diagnostic?: string }>> {
  const payload = { data: { type: 'quote', entity: { id: Number(input.clientId) }, items: input.lines.map(line => ({
    product_id: Number(input.productId), name: line.description, qty: 1, net_price: Number(line.amount) })), notes: `Cash attempt ${input.attemptId}` } };
  const response = await ficFetch(`/c/${encodeURIComponent(input.companyId)}/issued_documents`, token,
    { method: 'POST', body: JSON.stringify(payload) }, fetcher);
  if (!response.ok) return ok({ outcome: 'uncertain', diagnostic: response.error.message });
  if (!response.value.ok) return ok({ outcome: 'rejected', diagnostic: `HTTP ${response.value.status}` });
  try {
    const json = await response.value.json() as { data?: { id?: string | number } };
    if (json.data?.id === undefined) return ok({ outcome: 'uncertain', diagnostic: 'Risposta priva di identificativo documento.' });
    return ok({ outcome: 'success', remoteDocumentId: String(json.data.id) });
  } catch (cause) { return ok({ outcome: 'uncertain', diagnostic: String(cause) }); }
}
