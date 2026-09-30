import { z } from 'zod';
import { err, ok, type ExportLine, type FicClientDetails, type FicClientSnapshot, type FicTaxProfileSnapshot, type Result } from '../../domain/model';
import { officialFetch } from './http';
import { d, money } from '../../domain/decimal';
import { financialSnapshotSchema } from '../../domain/schema';
import type { FicFinancialSnapshot } from '../../domain/model';

const BASE = 'https://api-v2.fattureincloud.it';
const queryString = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const clientSchema = z.object({ id: z.union([z.string(), z.number()]), name: z.string().min(1), vat_number: z.string().nullish() });
const clientDetailsSchema = clientSchema.loose();
const productSummarySchema = z.object({ id: z.union([z.string(), z.number()]), name: z.string().min(1) });
const vatSchema = z.object({ id: z.union([z.string(),z.number()]), value:z.number().nullish(), description:z.string().nullish() });
const productSchema = productSummarySchema.extend({ default_vat: vatSchema.nullish() });
const taxProfileSchema = z.object({ company_type:z.string().nullish(), company_subtype:z.string().nullish(), profession:z.string().nullish(),
  regime:z.string().nullish(), profit_coefficient:z.number().nullish(), contributions_percentage:z.number().nullish(), default_vat:vatSchema.nullish() });
export interface VerifiedProduct { id:string; name:string; vat:{id:string;value?:number;description?:string} }
const companySchema = z.object({ id: z.union([z.string(), z.number()]), name: z.string().min(1) });
const permissionLevel = z.enum(['none', 'read', 'write', 'detailed']).nullish();
const companyInfoSchema = z.object({ id: z.union([z.string(), z.number()]), name: z.string().min(1),
  access_info: z.object({ permissions: z.object({ fic_clients: permissionLevel, fic_products: permissionLevel,
    fic_settings: permissionLevel, fic_received_documents: permissionLevel,
    fic_issued_documents_detailed: z.object({ quotes: permissionLevel, invoices: permissionLevel, credit_notes: permissionLevel }).nullish() }) }) });

function missingPermissions(company: z.infer<typeof companyInfoSchema>, financialOnly: boolean): string[] {
  const permissions = company.access_info.permissions;
  const canRead = (level: z.infer<typeof permissionLevel>) => level === 'read' || level === 'write' || level === 'detailed';
  const checks: Array<[string, boolean]> = [
    ['issued_documents.invoices:r', canRead(permissions.fic_issued_documents_detailed?.invoices)],
    ['issued_documents.credit_notes:r', canRead(permissions.fic_issued_documents_detailed?.credit_notes)],
    ['received_documents:r', canRead(permissions.fic_received_documents)],
  ];
  if (!financialOnly) checks.push(['entity.clients:r', canRead(permissions.fic_clients)], ['products:r', canRead(permissions.fic_products)],
    ['settings:r', canRead(permissions.fic_settings)], ['issued_documents.quotes:a', permissions.fic_issued_documents_detailed?.quotes === 'write']);
  return checks.filter(([, allowed]) => !allowed).map(([scope]) => scope);
}

const permissionsError = (scopes: string[]) => err({ code: 'CREDENTIALS', source: 'FattureInCloud',
  message: `Permessi insufficienti: ${scopes.join(', ')}.`,
  action: 'Riconfigura il token in Impostazioni → Integrazioni con gli scope indicati e verifica i permessi azienda.' });

const normalizeVat = (vat:z.infer<typeof vatSchema>):VerifiedProduct['vat'] => ({id:String(vat.id),
  ...(vat.value!=null?{value:vat.value}:{}),...(vat.description?{description:vat.description}:{})});

export async function getTaxProfile(companyId:string,token:string,fetcher:typeof fetch=fetch):Promise<Result<FicTaxProfileSnapshot>>{
  const response=await ficFetch(`/c/${encodeURIComponent(companyId)}/settings/tax_profile`,token,{},fetcher);
  if(!response.ok)return response;
  if(!response.value.ok)return response.value.status===401||response.value.status===403
    ?err({code:'CREDENTIALS',source:'FattureInCloud',message:`Accesso al profilo fiscale negato (HTTP ${response.value.status}); verificare settings:r.`})
    :err({code:'SOURCE_UNAVAILABLE',source:'FattureInCloud',message:`Profilo fiscale aziendale non disponibile (HTTP ${response.value.status}).`});
  try{const json=await response.value.json() as {data?:unknown};const profile=taxProfileSchema.parse(json.data);return ok({acquiredAt:new Date().toISOString(),
    ...(profile.company_type?{companyType:profile.company_type}:{}),...(profile.company_subtype?{companySubtype:profile.company_subtype}:{}),
    ...(profile.profession?{profession:profile.profession}:{}),...(profile.regime?{regime:profile.regime}:{}),
    ...(profile.profit_coefficient!=null?{profitCoefficient:String(profile.profit_coefficient)}:{}),
    ...(profile.contributions_percentage!=null?{contributionsPercentage:String(profile.contributions_percentage)}:{}),
    ...(profile.default_vat?{defaultVat:normalizeVat(profile.default_vat)}:{})});
  }catch(cause){return err({code:'SOURCE_INVALID',source:'FattureInCloud',message:'Risposta profilo fiscale aziendale non valida.',details:[String(cause)]});}
}

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
  fetcher: typeof fetch = fetch): Promise<Result<{ company: { id: string; name: string }; product: { id: string; name: string }; taxProfile:FicTaxProfileSnapshot }>> {
  const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/company/info`, token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) return err({ code: 'CREDENTIALS', source: 'FattureInCloud', message: `Azienda o autorizzazioni non verificabili (HTTP ${response.value.status}).` });
  try {
    const json = await response.value.json() as { data?: unknown };
    const company = companyInfoSchema.parse(json.data);
    const missing = missingPermissions(company, false);
    if (missing.length) return permissionsError(missing);
    const taxProfile=await getTaxProfile(companyId,token,fetcher);if(!taxProfile.ok)return taxProfile;
    const regime=taxProfile.value.regime?.trim().toLocaleLowerCase('it');
    if(regime&&!regime.startsWith('forfettario'))return err({code:'VALIDATION',source:'FattureInCloud',field:'taxProfile.regime',
      message:`Il regime fiscale “${taxProfile.value.regime}” non è supportato da Cash.`,action:'Cash supporta attualmente soltanto il regime forfettario.'});
    const product = await verifyProduct(companyId, productId, token, fetcher,taxProfile.value.defaultVat);
    if (!product.ok) return product;
    return ok({ company: { id: String(company.id), name: company.name }, product: product.value, taxProfile:taxProfile.value });
  } catch (cause) { return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Risposta permessi azienda non valida.', details: [String(cause)] }); }
}

export async function listConsultingProducts(token: string, companyId: string, fetcher: typeof fetch = fetch):
  Promise<Result<Array<{ id: string; name: string }>>> {
  const query = `name = ${queryString('Consulenza')}`;
  const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/products?per_page=100&q=${encodeURIComponent(query)}`, token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) return response.value.status === 401 || response.value.status === 403
    ? err({ code: 'CREDENTIALS', source: 'FattureInCloud', message: `Accesso ai prodotti negato (HTTP ${response.value.status}); verificare products:r.` })
    : err({ code: response.value.status === 422 ? 'SOURCE_INVALID' : 'SOURCE_UNAVAILABLE', source: 'FattureInCloud', message: `Richiesta prodotti rifiutata da Fatture in Cloud (HTTP ${response.value.status}).` });
  try {
    const json = await response.value.json() as { data?: unknown[] };
    return ok(z.array(productSummarySchema).parse(json.data ?? []).filter(product => product.name.trim().toLocaleLowerCase('it') === 'consulenza')
      .map(product => ({ id: String(product.id), name: product.name })));
  } catch (cause) { return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Risposta prodotti non valida.', details: [String(cause)] }); }
}

export async function searchClients(companyId: string, query: string, token: string, fetcher: typeof fetch = fetch): Promise<Result<FicClientSnapshot[]>> {
  const normalized = query.trim();
  const filter = normalized ? `&q=${encodeURIComponent(`name contains ${queryString(normalized)}`)}` : '';
  const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/entities/clients?per_page=50${filter}`, token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) return err({ code: 'SOURCE_UNAVAILABLE', source: 'FattureInCloud', message: `Ricerca clienti rifiutata (HTTP ${response.value.status}).` });
  try {
    const json = await response.value.json() as { data?: unknown[] };
    const clients = z.array(clientSchema).parse(json.data ?? []);
    return ok(clients.map(client => ({ source: 'fatture_in_cloud' as const, companyId, clientId: String(client.id), displayName: client.name,
      ...(client.vat_number ? { vatNumber: client.vat_number } : {}) })));
  } catch (cause) { return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Risposta clienti non valida.', details: [String(cause)] }); }
}

function displayFicValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value ? 'Sì' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  try { return JSON.stringify(value); }
  catch { return undefined; }
}

export async function getClientDetails(companyId: string, clientId: string, token: string,
  fetcher: typeof fetch = fetch): Promise<Result<FicClientDetails>> {
  const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/entities/clients/${encodeURIComponent(clientId)}?fieldset=detailed`, token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) return response.value.status === 401 || response.value.status === 403
    ? err({ code: 'CREDENTIALS', source: 'FattureInCloud', message: `Accesso al cliente negato (HTTP ${response.value.status}); verificare entity.clients:r.` })
    : err({ code: 'SOURCE_UNAVAILABLE', source: 'FattureInCloud', message: `Dettaglio cliente non disponibile (HTTP ${response.value.status}).` });
  try {
    const json = await response.value.json() as { data?: unknown };
    const client = clientDetailsSchema.parse(json.data);
    const fields = Object.entries(client).flatMap(([key, raw]) => {
      const value = displayFicValue(raw);
      return value === undefined ? [] : [{ key, value }];
    });
    return ok({ source: 'fatture_in_cloud', companyId, clientId: String(client.id), displayName: client.name,
      ...(client.vat_number ? { vatNumber: client.vat_number } : {}), fields });
  } catch (cause) {
    return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Risposta dettaglio cliente non valida.', details: [String(cause)] });
  }
}

export async function verifyProduct(companyId: string, productId: string, token: string, fetcher: typeof fetch = fetch,
  companyDefaultVat?:VerifiedProduct['vat']): Promise<Result<VerifiedProduct>> {
  const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/products/${encodeURIComponent(productId)}?fieldset=detailed`, token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) return err({ code: 'SOURCE_UNAVAILABLE', source: 'FattureInCloud', message: `Prodotto non verificabile (HTTP ${response.value.status}).` });
  try { const json = await response.value.json() as { data?: unknown }; const product = productSchema.parse(json.data);
    if (product.name.trim().toLocaleLowerCase('it') !== 'consulenza') return err({ code: 'VALIDATION', source: 'FattureInCloud', field: 'productId', message: 'Il prodotto selezionato non è “Consulenza”.' });
    let vat:z.infer<typeof vatSchema>|VerifiedProduct['vat']|null|undefined=product.default_vat??companyDefaultVat;
    if(!vat?.id){const taxProfile=await getTaxProfile(companyId,token,fetcher);if(!taxProfile.ok)return taxProfile;vat=taxProfile.value.defaultVat;}
    if(!vat?.id)return err({code:'MISSING_DATA',source:'FattureInCloud',field:'product.default_vat',message:'Né il prodotto “Consulenza” né l’azienda hanno un’IVA predefinita.',action:'Configura l’IVA predefinita del prodotto o del profilo fiscale in Fatture in Cloud, salva e poi ripeti la verifica.'});
    return ok({ id: String(product.id), name: product.name, vat:normalizeVat(vat) });
  } catch (cause) { return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Risposta prodotto non valida.', details: [String(cause)] }); }
}

const remoteId = z.union([z.string().regex(/^\d+$/), z.number().int().positive().safe()]).transform(String);
const remoteMoney = z.union([z.number().finite(), z.string().regex(/^-?\d+(?:\.\d+)?$/)])
  .refine(value => d(value).isFinite() && d(value).gte(0), 'Importo non valido').transform(value => money(value));
const remotePayment = z.object({
  id: remoteId.nullish(), amount: remoteMoney, due_date: z.string().date().nullish(),
  paid_date: z.string().date().nullish(), status: z.enum(['paid', 'not_paid', 'reversed']),
}).superRefine((payment, ctx) => {
  if (payment.status === 'paid' && !payment.paid_date)
    ctx.addIssue({ code: 'custom', path: ['paid_date'], message: 'Pagamento paid senza paid_date valida: impossibile attribuire l’anno.' });
});
const remoteFinancialDocument = z.object({
  id: remoteId, type: z.enum(['invoice', 'credit_note', 'expense', 'passive_credit_note']),
  date: z.string().date(), amount_gross: remoteMoney,
  number: z.union([z.string(), z.number().int()]).nullish(), numeration: z.string().nullish(),
  invoice_number: z.string().nullish(), entity: z.object({ name: z.string().nullish() }).nullish(),
  description: z.string().nullish(), category: z.string().nullish(),
  payments_list: z.array(remotePayment).nullable(),
});
const financialPage = z.object({ data: z.array(remoteFinancialDocument), current_page: z.number().int().positive(), last_page: z.number().int().positive() });

async function listFinancialDocuments(companyId: string, token: string, type: z.infer<typeof remoteFinancialDocument>['type'], fetcher: typeof fetch) {
  const issued = type === 'invoice' || type === 'credit_note';
  const endpoint = issued ? 'issued_documents' : 'received_documents';
  const fields = `id,type,date,entity,amount_gross,payments_list,${issued ? 'number,numeration' : 'invoice_number,description,category'}`;
  const scope = issued ? type === 'invoice' ? 'issued_documents.invoices:r' : 'issued_documents.credit_notes:r' : 'received_documents:r';
  const documents: z.infer<typeof remoteFinancialDocument>[] = [];
  let lastPage = 1;
  for (let page = 1; page <= lastPage; page++) {
    const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/${endpoint}?type=${type}&per_page=100&fieldset=detailed&fields=${encodeURIComponent(fields)}&page=${page}`, token, {}, fetcher);
    if (!response.ok) return response;
    if (!response.value.ok) {
      if (response.value.status === 401 || response.value.status === 403) return permissionsError([scope]);
      return err({ code: response.value.status === 429 ? 'RATE_LIMIT' : 'SOURCE_UNAVAILABLE', source: 'FattureInCloud',
        message: `Sincronizzazione ${type}, pagina ${page} non riuscita (HTTP ${response.value.status}).` });
    }
    try {
      const result = financialPage.parse(await response.value.json());
      if (result.current_page !== page || result.last_page < page || (page > 1 && result.last_page !== lastPage))
        throw new Error('Paginazione incoerente o cambiata durante la lettura. Ripetere l’aggiornamento.');
      if (result.data.some(document => document.type !== type)) throw new Error('Tipo documento diverso da quello richiesto.');
      lastPage = result.last_page;
      documents.push(...result.data);
    } catch (cause) {
      return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: `Dati ${type} non validi alla pagina ${page}. Nessuno snapshot aggiornato.`, details: [String(cause)] });
    }
  }
  return ok(documents);
}

export async function syncFinancialData(companyId: string, token: string, fetcher: typeof fetch = fetch): Promise<Result<FicFinancialSnapshot>> {
  const response = await ficFetch(`/c/${encodeURIComponent(companyId)}/company/info`, token, {}, fetcher);
  if (!response.ok) return response;
  if (!response.value.ok) {
    if (response.value.status === 401 || response.value.status === 403)
      return permissionsError(['issued_documents.invoices:r', 'issued_documents.credit_notes:r', 'received_documents:r']);
    return err({ code: response.value.status === 429 ? 'RATE_LIMIT' : 'SOURCE_UNAVAILABLE', source: 'FattureInCloud',
      message: `Verifica azienda non disponibile (HTTP ${response.value.status}).` });
  }
  try {
    const company = companyInfoSchema.parse((await response.value.json() as { data?: unknown }).data);
    if (String(company.id) !== companyId) throw new Error('Azienda restituita diversa da quella configurata.');
    const missing = missingPermissions(company, true);
    if (missing.length) return permissionsError(missing);
    const snapshot: FicFinancialSnapshot = { source: 'fatture_in_cloud', company: { id: String(company.id), name: company.name },
      acquiredAt: new Date().toISOString(), issuedDocuments: [], receivedDocuments: [] };
    for (const type of ['invoice', 'credit_note', 'expense', 'passive_credit_note'] as const) {
      const result = await listFinancialDocuments(companyId, token, type, fetcher);
      if (!result.ok) return result;
      for (const document of result.value) {
        const common = { id: document.id, date: document.date, amountGross: document.amount_gross,
          ...(document.entity?.name != null ? { entityName: document.entity.name } : {}),
          payments: (document.payments_list ?? []).map(payment => ({ amount: payment.amount, status: payment.status,
            ...(payment.id != null ? { id: payment.id } : {}), ...(payment.due_date ? { dueDate: payment.due_date } : {}),
            ...(payment.paid_date ? { paidDate: payment.paid_date } : {}) })) };
        if (type === 'invoice' || type === 'credit_note') snapshot.issuedDocuments.push({ ...common, type,
          ...(document.number != null ? { number: String(document.number) } : {}), ...(document.numeration != null ? { numeration: document.numeration } : {}) });
        else snapshot.receivedDocuments.push({ ...common, type,
          ...(document.invoice_number != null ? { invoiceNumber: document.invoice_number } : {}),
          ...(document.description != null ? { description: document.description } : {}), ...(document.category != null ? { category: document.category } : {}) });
      }
    }
    snapshot.acquiredAt = new Date().toISOString();
    return ok(financialSnapshotSchema.parse(snapshot));
  } catch (cause) {
    return err({ code: 'SOURCE_INVALID', source: 'FattureInCloud', message: 'Snapshot finanziario non valido. I dati precedenti restano invariati.', details: [String(cause)] });
  }
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
