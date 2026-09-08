import { z } from 'zod';
import { err, ok, type ExportLine, type FicClientSnapshot, type Result } from '../../domain/model';
import { officialFetch } from './http';

const BASE = 'https://api-v2.fattureincloud.it';
const clientSchema = z.object({ id: z.union([z.string(), z.number()]), name: z.string().min(1), vat_number: z.string().nullish() });
const productSchema = z.object({ id: z.union([z.string(), z.number()]), name: z.string().min(1), default_vat: z.object({
  id: z.union([z.string(),z.number()]), value:z.number().nullish(), description:z.string().nullish() }).optional() });
export interface VerifiedProduct { id:string; name:string; vat:{id:string;value?:number;description?:string} }
const companySchema = z.object({ id: z.union([z.string(), z.number()]), name: z.string().min(1) });
const permissionLevel = z.enum(['none', 'read', 'write', 'detailed']).nullish();
const companyInfoSchema = z.object({ id: z.union([z.string(), z.number()]), name: z.string().min(1),
  access_info: z.object({ permissions: z.object({ fic_clients: permissionLevel, fic_products: permissionLevel,
    fic_issued_documents_detailed: z.object({ quotes: permissionLevel }).nullish() }) }) });

async function ficFetch(path: string, token: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Result<Response>> {
  const response = await officialFetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
    'Content-Type': 'application/json', ...(init.headers ?? {}) } }, fetcher);
  return response.ok ? response : { ok: false, error: { ...response.error, source: 'FattureInCloud' } };
}

export async function listCompanies(token: string, fetcher: typeof fetch = fetch): Promise<Result<Array<{ id: string; name: string }>>> {
  const response = await ficFetch('/user/companies', token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) return err({ code: 'CREDENTIALS', source: 'FattureInCloud', message: `Token non valido o non autorizzato (HTTP ${response.value.status}).` });
  try {
    const json = await response.value.json() as { data?: { companies?: unknown[] } };
    return ok(z.array(companySchema).parse(json.data?.companies ?? []).map(company => ({ id: String(company.id), name: company.name })));
  } catch (cause) { return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Risposta aziende non valida.', details: [String(cause)] }); }
}

export async function verifyActivation(token: string, companyId: string, productId: string,
  fetcher: typeof fetch = fetch): Promise<Result<{ company: { id: string; name: string }; product: { id: string; name: string } }>> {
  const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/company/info`, token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) return err({ code: 'CREDENTIALS', source: 'FattureInCloud', message: `Azienda o autorizzazioni non verificabili (HTTP ${response.value.status}).` });
  try {
    const json = await response.value.json() as { data?: unknown };
    const company = companyInfoSchema.parse(json.data);
    const permissions = company.access_info.permissions;
    const canRead = (level: z.infer<typeof permissionLevel>) => level === 'read' || level === 'write' || level === 'detailed';
    if (!canRead(permissions.fic_clients) || !canRead(permissions.fic_products) || permissions.fic_issued_documents_detailed?.quotes !== 'write')
      return err({ code: 'CREDENTIALS', source: 'FattureInCloud', message: 'Permessi insufficienti: servono entity.clients:r, products:r e issued_documents.quotes:a.' });
    const product = await verifyProduct(companyId, productId, token, fetcher);
    if (!product.ok) return product;
    return ok({ company: { id: String(company.id), name: company.name }, product: product.value });
  } catch (cause) { return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Risposta permessi azienda non valida.', details: [String(cause)] }); }
}

export async function listConsultingProducts(token: string, companyId: string, fetcher: typeof fetch = fetch):
  Promise<Result<Array<{ id: string; name: string }>>> {
  const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/products?per_page=100&q=${encodeURIComponent('Consulenza')}`, token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) return err({ code: 'CREDENTIALS', source: 'FattureInCloud', message: `Prodotti non leggibili (HTTP ${response.value.status}); verificare products:r.` });
  try {
    const json = await response.value.json() as { data?: unknown[] };
    return ok(z.array(productSchema).parse(json.data ?? []).filter(product => product.name.trim().toLocaleLowerCase('it') === 'consulenza')
      .map(product => ({ id: String(product.id), name: product.name })));
  } catch (cause) { return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Risposta prodotti non valida.', details: [String(cause)] }); }
}

export async function searchClients(companyId: string, query: string, token: string, fetcher: typeof fetch = fetch): Promise<Result<FicClientSnapshot[]>> {
  const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/entities/clients?per_page=50&q=${encodeURIComponent(query)}`, token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) return err({ code: 'SOURCE_UNAVAILABLE', source: 'FattureInCloud', message: `Ricerca clienti rifiutata (HTTP ${response.value.status}).` });
  try {
    const json = await response.value.json() as { data?: unknown[] };
    const clients = z.array(clientSchema).parse(json.data ?? []);
    return ok(clients.map(client => ({ source: 'fatture_in_cloud' as const, companyId, clientId: String(client.id), displayName: client.name,
      ...(client.vat_number ? { vatNumber: client.vat_number } : {}) })));
  } catch (cause) { return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Risposta clienti non valida.', details: [String(cause)] }); }
}

export async function verifyProduct(companyId: string, productId: string, token: string, fetcher: typeof fetch = fetch): Promise<Result<VerifiedProduct>> {
  const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/products/${encodeURIComponent(productId)}`, token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) return err({ code: 'SOURCE_UNAVAILABLE', source: 'FattureInCloud', message: `Prodotto non verificabile (HTTP ${response.value.status}).` });
  try { const json = await response.value.json() as { data?: unknown }; const product = productSchema.parse(json.data);
    if (product.name.trim().toLocaleLowerCase('it') !== 'consulenza') return err({ code: 'VALIDATION', source: 'FattureInCloud', field: 'productId', message: 'Il prodotto selezionato non è “Consulenza”.' });
    if(!product.default_vat?.id)return err({code:'MISSING_DATA',source:'FattureInCloud',field:'product.default_vat',message:'Il prodotto Consulenza non espone una disciplina IVA verificabile.'});
    return ok({ id: String(product.id), name: product.name, vat:{id:String(product.default_vat.id),...(product.default_vat.value!=null?{value:product.default_vat.value}:{}),...(product.default_vat.description?{description:product.default_vat.description}:{})} });
  } catch (cause) { return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Risposta prodotto non valida.', details: [String(cause)] }); }
}

export async function exportQuote(input: { companyId: string; clientId: string; productId: string; product:VerifiedProduct; lines: ExportLine[]; attemptId: string },
  token: string, fetcher: typeof fetch = fetch): Promise<Result<{ outcome: 'success' | 'rejected' | 'uncertain'; remoteDocumentId?: string; diagnostic?: string }>> {
  const payload = { data: { type: 'quote', entity: { id: Number(input.clientId) }, items_list: input.lines.map(line => ({
    product_id: Number(input.productId), name: 'Consulenza', description:line.description, qty: 1, net_price: Number(line.amount), vat:{id:Number(input.product.vat.id)} })), notes: `Cash attempt ${input.attemptId}` } };
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
