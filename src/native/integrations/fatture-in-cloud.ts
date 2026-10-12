import { z } from 'zod';
import {
  err,
  ok,
  type CashError,
  type ExportLine,
  type FicClientDetails,
  type FicClientSnapshot,
  type FicTaxProfileSnapshot,
  type Result,
} from '../../domain/model';
import type {
  FicQuotaObservation,
  FicClientPage,
  FicExportResult,
} from '../../shared/fic';
import { officialFetch } from './http';
import { d, money } from '../../domain/decimal';
import { financialSnapshotSchema } from '../../domain/schema';
import type { FicFinancialSnapshot } from '../../domain/model';
import type { FicAccessVerification } from '../../domain/integration';

const BASE = 'https://api-v2.fattureincloud.it';
const queryString = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`;
const clientSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  vat_number: z.string().nullish(),
});
const clientDetailsSchema = clientSchema.loose();
const clientPageSchema = z.object({
  data: z.array(clientSchema),
  current_page: z.number().int().positive(),
  last_page: z.number().int().positive(),
});
const productSummarySchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
});
const vatSchema = z.object({
  id: z.union([z.string(), z.number()]),
  value: z.number().nullish(),
  description: z.string().nullish(),
});
const productSchema = productSummarySchema.extend({
  default_vat: vatSchema.nullish(),
});
const taxProfileSchema = z.object({
  company_type: z.string().nullish(),
  company_subtype: z.string().nullish(),
  profession: z.string().nullish(),
  cassa_name: z.string().nullish(),
  cassa2_name: z.string().nullish(),
  default_cassa: z.number().nonnegative().nullish(),
  default_cassa2: z.number().nonnegative().nullish(),
  regime: z.string().nullish(),
  profit_coefficient: z.number().nullish(),
  contributions_percentage: z.number().nullish(),
  default_vat: vatSchema.nullish(),
});
export interface VerifiedProduct {
  id: string;
  name: string;
  vat: { id: string; value?: number; description?: string };
}
const companySchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
});
const permissionLevel = z.enum(['none', 'read', 'write', 'detailed']).nullish();
export const companyInfoSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  access_info: z.object({
    permissions: z
      .object({
        fic_situation: permissionLevel,
        fic_clients: permissionLevel,
        fic_suppliers: permissionLevel,
        fic_products: permissionLevel,
        fic_issued_documents: permissionLevel,
        fic_received_documents: permissionLevel,
        fic_receipts: permissionLevel,
        fic_calendar: permissionLevel,
        fic_archive: permissionLevel,
        fic_taxes: permissionLevel,
        fic_stock: permissionLevel,
        fic_cashbook: permissionLevel,
        fic_settings: permissionLevel,
        fic_emails: permissionLevel,
        fic_export: permissionLevel,
        fic_import_bankstatements: permissionLevel,
        fic_import_clients_suppliers: permissionLevel,
        fic_import_issued_documents: permissionLevel,
        fic_import_products: permissionLevel,
        fic_recurring: permissionLevel,
        fic_riba: permissionLevel,
        dic_employees: permissionLevel,
        dic_settings: permissionLevel,
        dic_timesheet: permissionLevel,
        fic_issued_documents_detailed: z
          .object({
            quotes: permissionLevel,
            proformas: permissionLevel,
            invoices: permissionLevel,
            receipts: permissionLevel,
            delivery_notes: permissionLevel,
            credit_notes: permissionLevel,
            orders: permissionLevel,
            work_reports: permissionLevel,
            supplier_orders: permissionLevel,
            self_invoices: permissionLevel,
          })
          .loose()
          .nullish(),
      })
      .loose(),
  }),
});

function missingPermissions(
  company: z.infer<typeof companyInfoSchema>,
  financialOnly: boolean,
): string[] {
  const permissions = company.access_info.permissions;
  const canRead = (level: z.infer<typeof permissionLevel>) =>
    level === 'read' || level === 'write' || level === 'detailed';
  const issuedLevel = (type: 'invoices' | 'credit_notes' | 'quotes') =>
    permissions.fic_issued_documents === 'detailed' ||
    permissions.fic_issued_documents == null
      ? permissions.fic_issued_documents_detailed?.[type]
      : permissions.fic_issued_documents;
  const checks: Array<[string, boolean]> = [
    ['issued_documents.invoices:r', canRead(issuedLevel('invoices'))],
    ['issued_documents.credit_notes:r', canRead(issuedLevel('credit_notes'))],
    ['received_documents:r', canRead(permissions.fic_received_documents)],
  ];
  if (!financialOnly)
    checks.push(
      ['entity.clients:r', canRead(permissions.fic_clients)],
      ['products:r', canRead(permissions.fic_products)],
      ['settings:r', canRead(permissions.fic_settings)],
      ['issued_documents.quotes:a', issuedLevel('quotes') === 'write'],
    );
  return checks.filter(([, allowed]) => !allowed).map(([scope]) => scope);
}

const permissionsError = (scopes: string[]) =>
  err({
    code: 'CREDENTIALS',
    source: 'FattureInCloud',
    message: `Accesso non consentito: verifica gli scope ${scopes.join(', ')} e i permessi dell’utente sull’azienda.`,
    action:
      'Verifica il collegamento in Impostazioni → Integrazioni. La risposta non identifica da sola uno scope token mancante.',
  });

export async function verifyPermissions(
  companyId: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<Result<FicAccessVerification>> {
  const base = `/c/${encodeURIComponent(companyId)}`;
  const response = await ficFetch(`${base}/company/info`, token, {}, fetcher);
  if (!response.ok) return response;
  try {
    const company = companyInfoSchema.parse(
      ((await response.value.json()) as { data?: unknown }).data,
    );
    if (String(company.id) !== companyId)
      throw new Error('Azienda diversa da quella richiesta.');
    const result: FicAccessVerification = {
      company: { id: String(company.id), name: company.name },
      checkedAt: new Date().toISOString(),
      companyPermissions: company.access_info.permissions,
      requiredAccess: [],
    };
    const probes: Array<[string, string, string[]]> = [
      [
        'Clienti',
        'entity.clients:r',
        ['/entities/clients?per_page=1&fields=id'],
      ],
      ['Prodotti', 'products:r', ['/products?per_page=1&fields=id']],
      ['Profilo fiscale', 'settings:r', ['/settings/tax_profile']],
      [
        'Lettura fatture',
        'issued_documents.invoices:r',
        ['/issued_documents?type=invoice&per_page=1&fields=id'],
      ],
      [
        'Lettura note di credito',
        'issued_documents.credit_notes:r',
        ['/issued_documents?type=credit_note&per_page=1&fields=id'],
      ],
      [
        'Lettura documenti ricevuti',
        'received_documents:r',
        [
          '/received_documents?type=expense&per_page=1&fields=id',
          '/received_documents?type=passive_credit_note&per_page=1&fields=id',
          ...['agyo', 'mail', 'browser'].map(
            (type) =>
              `/received_documents/pending?type=${type}&per_page=1&fields=id`,
          ),
        ],
      ],
    ];
    for (const [label, scope, paths] of probes) {
      let status: FicAccessVerification['requiredAccess'][number]['status'] =
        'available';
      let detail =
        'Accesso effettivo confermato da richieste API di sola lettura (2xx).';
      for (const path of paths) {
        const probe = await ficFetch(`${base}${path}`, token, {}, fetcher);
        if (!probe.ok) {
          if (probe.error.code === 'RATE_LIMIT') return probe;
          status =
            probe.error.code === 'CREDENTIALS' ? 'unavailable' : 'unverifiable';
          detail = [probe.error.message, probe.error.action]
            .filter(Boolean)
            .join(' ');
          break;
        }
        // Probes never retain remote documents or tax data.
        await probe.value.body?.cancel();
      }
      result.requiredAccess.push({ label, scope, status, detail });
    }
    const permissions = company.access_info.permissions;
    const quoteLevel =
      permissions.fic_issued_documents === 'detailed' ||
      permissions.fic_issued_documents == null
        ? permissions.fic_issued_documents_detailed?.quotes
        : permissions.fic_issued_documents;
    result.requiredAccess.push({
      label: 'Creazione preventivi',
      scope: 'issued_documents.quotes:a',
      status: 'unverifiable',
      detail: `Permesso azienda rilevato: ${quoteLevel ?? 'non esposto'}. Accesso write verificato realmente soltanto durante l’esportazione; nessun documento creato per la verifica.`,
    });
    result.checkedAt = new Date().toISOString();
    return ok(result);
  } catch (cause) {
    return err({
      code: 'SOURCE_INVALID',
      source: 'FattureInCloud',
      message: 'Risposta permessi azienda non valida.',
      details: [String(cause)],
    });
  }
}

const normalizeVat = (
  vat: z.infer<typeof vatSchema>,
): VerifiedProduct['vat'] => ({
  id: String(vat.id),
  ...(vat.value != null ? { value: vat.value } : {}),
  ...(vat.description ? { description: vat.description } : {}),
});

export async function getTaxProfile(
  companyId: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<Result<FicTaxProfileSnapshot>> {
  const response = await ficFetch(
    `/c/${encodeURIComponent(companyId)}/settings/tax_profile`,
    token,
    {},
    fetcher,
  );
  if (!response.ok) return response;
  try {
    const json = (await response.value.json()) as { data?: unknown };
    const profile = taxProfileSchema.parse(json.data);
    return ok({
      acquiredAt: new Date().toISOString(),
      ...([
        profile.cassa_name,
        profile.cassa2_name,
        profile.default_cassa,
        profile.default_cassa2,
      ].some((value) => value != null)
        ? {
            hasProfessionalFund: Boolean(
              profile.cassa_name?.trim() ||
              profile.cassa2_name?.trim() ||
              profile.default_cassa ||
              profile.default_cassa2,
            ),
          }
        : {}),
      ...(profile.company_type ? { companyType: profile.company_type } : {}),
      ...(profile.company_subtype
        ? { companySubtype: profile.company_subtype }
        : {}),
      ...(profile.profession ? { profession: profile.profession } : {}),
      ...(profile.regime ? { regime: profile.regime } : {}),
      ...(profile.profit_coefficient != null
        ? { profitCoefficient: String(profile.profit_coefficient) }
        : {}),
      ...(profile.contributions_percentage != null
        ? { contributionsPercentage: String(profile.contributions_percentage) }
        : {}),
      ...(profile.default_vat
        ? { defaultVat: normalizeVat(profile.default_vat) }
        : {}),
    });
  } catch (cause) {
    return err({
      code: 'SOURCE_INVALID',
      source: 'FattureInCloud',
      message: 'Risposta profilo fiscale aziendale non valida.',
      details: [String(cause)],
    });
  }
}

const quotas = new Map<string, FicQuotaObservation>();
const quotaListeners = new Set<(observation: FicQuotaObservation) => void>();

export function getFicQuota(companyId: string): FicQuotaObservation | null {
  const observation = quotas.get(companyId);
  return observation ? { ...observation } : null;
}

export function onFicQuota(
  listener: (observation: FicQuotaObservation) => void,
): () => void {
  quotaListeners.add(listener);
  return () => {
    quotaListeners.delete(listener);
  };
}

function integerHeader(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name)?.trim();
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

interface FicHttpFailure extends CashError {
  requestSent: boolean;
  httpStatus?: number;
}

function rateLimitError(waitMs?: number): CashError {
  return {
    code: 'RATE_LIMIT',
    source: 'FattureInCloud',
    message: `Limite API raggiunto.${waitMs !== undefined ? ` Attendi ${Math.ceil(waitMs / 1000)} secondi prima di riprovare.` : ' Tempo di attesa non disponibile.'}`,
  };
}

async function ficHttpError(
  response: Response,
  path: string,
  token: string,
): Promise<FicHttpFailure> {
  let payload: { error?: unknown; error_description?: unknown } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // Non-JSON responses still establish their HTTP status; never display the raw body.
  }
  const object =
    payload && typeof payload.error === 'object' && payload.error !== null
      ? (payload.error as Record<string, unknown>)
      : undefined;
  const remoteCode =
    typeof object?.code === 'string'
      ? object.code
      : typeof payload?.error === 'string'
        ? payload.error
        : '';
  const clean = (value: unknown): string =>
    typeof value === 'string'
      ? value
          .replaceAll(token, '[credenziale rimossa]')
          .replace(/Bearer\s+\S+/gi, '[credenziale rimossa]')
          .replace(/[\r\n\t]+/g, ' ')
          .trim()
          .slice(0, 240)
      : '';
  const remoteMessage = clean(object?.message ?? payload?.error_description);
  const status = response.status;
  const waitSeconds = integerHeader(response.headers, 'Retry-After');
  // A 403 is not evidence of invalid credentials: quotas and expired licenses use it too.
  const quota =
    status === 429 ||
    (status === 403 &&
      remoteCode !== 'LICENSE_EXPIRED' &&
      (waitSeconds !== undefined ||
        integerHeader(response.headers, 'RateLimit-HourlyRemaining') === 0 ||
        integerHeader(response.headers, 'RateLimit-MonthlyRemaining') === 0 ||
        /rate.?limit|quota|too_many_requests/i.test(remoteCode)));
  let error: CashError;
  if (quota)
    error = rateLimitError(
      waitSeconds === undefined ? undefined : waitSeconds * 1000,
    );
  else if (status === 401)
    error = {
      code: 'CREDENTIALS',
      message: 'Collegamento Fatture in Cloud non valido.',
      action: 'Controlla il token nelle Impostazioni → Integrazioni.',
    };
  else if (status === 403 && remoteCode === 'LICENSE_EXPIRED')
    error = {
      code: 'SOURCE_UNAVAILABLE',
      message: 'La licenza Fatture in Cloud è scaduta.',
      action: 'Verifica la licenza dell’azienda in Fatture in Cloud.',
    };
  else if (status === 403) {
    const scope = path.includes('/products')
      ? 'products:r'
      : path.includes('/tax_profile')
        ? 'settings:r'
        : path.includes('/entities/clients')
          ? 'entity.clients:r'
          : path.includes('/received_documents')
            ? 'received_documents:r'
            : path.includes('type=invoice')
              ? 'issued_documents.invoices:r'
              : path.includes('type=credit_note')
                ? 'issued_documents.credit_notes:r'
                : path.includes('/issued_documents')
                  ? 'issued_documents.quotes:a'
                  : undefined;
    const permissionEvidence =
      /permission|forbidden|access_denied|insufficient_scope|unauthorized/i.test(
        `${remoteCode} ${remoteMessage}`,
      );
    error = {
      code: permissionEvidence ? 'CREDENTIALS' : 'SOURCE_UNAVAILABLE',
      message: permissionEvidence
        ? 'Accesso non consentito da Fatture in Cloud.'
        : 'Fatture in Cloud ha rifiutato la richiesta; causa non identificata.',
      action: `Verifica ${scope ? `lo scope ${scope}, ` : 'gli scope, '}i permessi dell’utente sull’azienda e la licenza.`,
    };
  } else
    error = {
      code:
        status === 400 || status === 422
          ? 'SOURCE_INVALID'
          : status === 409
            ? 'CONFLICT'
            : 'SOURCE_UNAVAILABLE',
      message:
        status === 400
          ? 'Richiesta rifiutata da Fatture in Cloud.'
          : status === 422
            ? 'Operazione rifiutata da Fatture in Cloud: dati non validi.'
            : status === 404
              ? 'Risorsa Fatture in Cloud non trovata.'
              : status === 409
                ? 'Conflitto con i dati presenti in Fatture in Cloud.'
                : 'Fatture in Cloud temporaneamente non disponibile.',
    };
  const validation: string[] = [];
  const visit = (value: unknown, field = '', depth = 0) => {
    if (
      depth > 5 ||
      validation.length >= 5 ||
      /token|authorization|password|secret/i.test(field)
    )
      return;
    if (typeof value === 'string') {
      const message = clean(value);
      if (message) validation.push(`${field}: ${message}`);
    } else if (Array.isArray(value))
      value.slice(0, 5).forEach((item) => visit(item, field, depth + 1));
    else if (value && typeof value === 'object')
      Object.entries(value)
        .slice(0, 20)
        .forEach(([key, item]) =>
          visit(item, field ? `${field}.${key}` : key, depth + 1),
        );
  };
  if (status === 422) visit(object?.validation_result);
  return {
    ...error,
    source: 'FattureInCloud',
    requestSent: true,
    httpStatus: status,
    message: `${error.message} (HTTP ${status})${remoteMessage ? ` ${remoteMessage}` : ''}${validation.length ? ` ${validation.join('; ').slice(0, 600)}` : ''}`,
  };
}

async function ficFetch(
  path: string,
  token: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<
  { ok: true; value: Response } | { ok: false; error: FicHttpFailure }
> {
  const companyPart = /^\/c\/([^/]+)\//.exec(path)?.[1];
  const companyId = companyPart ? decodeURIComponent(companyPart) : undefined;
  const isGet = (init.method ?? 'GET').toUpperCase() === 'GET';
  for (let attempt = 0; attempt < (isGet ? 3 : 1); attempt++) {
    const suspendedUntil = companyId
      ? quotas.get(companyId)?.suspendedUntil
      : undefined;
    const remaining = suspendedUntil
      ? Date.parse(suspendedUntil) - Date.now()
      : 0;
    // A local cooldown rejection is certain: no POST has been dispatched.
    if (remaining > 0)
      return {
        ok: false,
        error: { ...rateLimitError(remaining), requestSent: false },
      };
    const response = await officialFetch(
      `${BASE}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      },
      fetcher,
    );
    if (!response.ok) {
      if (isGet && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
        continue;
      }
      return {
        ok: false,
        error: {
          code: response.error.code,
          message: response.error.message,
          action: response.error.action,
          source: 'FattureInCloud',
          requestSent: true,
        },
      };
    }
    const http = response.value;
    const waitSeconds = integerHeader(http.headers, 'Retry-After');
    const error = http.ok ? undefined : await ficHttpError(http, path, token);
    if (companyId) {
      const previousCooldown = quotas.get(companyId)?.suspendedUntil;
      const waitUntil =
        error?.code === 'RATE_LIMIT' &&
        waitSeconds !== undefined &&
        waitSeconds <= 8_640_000_000
          ? new Date(Date.now() + waitSeconds * 1000).toISOString()
          : undefined;
      const observation: FicQuotaObservation = {
        companyId,
        observedAt: new Date().toISOString(),
        hourlyRemaining: integerHeader(
          http.headers,
          'RateLimit-HourlyRemaining',
        ),
        hourlyLimit: integerHeader(http.headers, 'RateLimit-HourlyLimit'),
        monthlyRemaining: integerHeader(
          http.headers,
          'RateLimit-MonthlyRemaining',
        ),
        monthlyLimit: integerHeader(http.headers, 'RateLimit-MonthlyLimit'),
        ...(waitUntil || previousCooldown
          ? {
              suspendedUntil:
                waitUntil && (!previousCooldown || waitUntil > previousCooldown)
                  ? waitUntil
                  : previousCooldown,
            }
          : {}),
      };
      quotas.set(companyId, observation);
      for (const listener of quotaListeners) listener({ ...observation });
    }
    if (!error) return { ok: true, value: http };
    if (isGet && attempt < 2) {
      if (
        error.code === 'RATE_LIMIT' &&
        waitSeconds !== undefined &&
        waitSeconds <= 5
      ) {
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
        continue;
      }
      if (http.status >= 500 && http.status <= 599) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
        continue;
      }
    }
    return { ok: false, error };
  }
  throw new Error('FIC attempt limit exceeded');
}
export async function listCompanies(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<Result<Array<{ id: string; name: string }>>> {
  const response = await ficFetch('/user/companies', token, {}, fetcher);
  if (!response.ok) return response;
  try {
    const json = (await response.value.json()) as {
      data?: { companies?: unknown[] };
    };
    return ok(
      z
        .array(companySchema)
        .parse(json.data?.companies ?? [])
        .map((company) => ({ id: String(company.id), name: company.name })),
    );
  } catch (cause) {
    return err({
      code: 'SOURCE_INVALID',
      source: 'FattureInCloud',
      message: 'Risposta aziende non valida.',
      details: [String(cause)],
    });
  }
}

export async function verifyActivation(
  token: string,
  companyId: string,
  productId: string,
  fetcher: typeof fetch = fetch,
): Promise<
  Result<{
    company: { id: string; name: string };
    product: { id: string; name: string };
    taxProfile: FicTaxProfileSnapshot;
  }>
> {
  const response = await ficFetch(
    `/c/${encodeURIComponent(companyId)}/company/info`,
    token,
    {},
    fetcher,
  );
  if (!response.ok) return response;
  try {
    const json = (await response.value.json()) as { data?: unknown };
    const company = companyInfoSchema.parse(json.data);
    const missing = missingPermissions(company, false);
    if (missing.length) return permissionsError(missing);
    const taxProfile = await getTaxProfile(companyId, token, fetcher);
    if (!taxProfile.ok) return taxProfile;
    const regime = taxProfile.value.regime?.trim().toLocaleLowerCase('it');
    if (regime && !regime.startsWith('forfettario'))
      return err({
        code: 'VALIDATION',
        source: 'FattureInCloud',
        field: 'taxProfile.regime',
        message: `Il regime fiscale “${taxProfile.value.regime}” non è supportato da Cash.`,
        action: 'Cash supporta attualmente soltanto il regime forfettario.',
      });
    const product = await verifyProduct(
      companyId,
      productId,
      token,
      fetcher,
      taxProfile.value.defaultVat,
    );
    if (!product.ok) return product;
    return ok({
      company: { id: String(company.id), name: company.name },
      product: product.value,
      taxProfile: taxProfile.value,
    });
  } catch (cause) {
    return err({
      code: 'SOURCE_INVALID',
      source: 'FattureInCloud',
      message: 'Risposta permessi azienda non valida.',
      details: [String(cause)],
    });
  }
}

export async function listConsultingProducts(
  token: string,
  companyId: string,
  fetcher: typeof fetch = fetch,
): Promise<Result<Array<{ id: string; name: string }>>> {
  const query = `name = ${queryString('Consulenza')}`;
  const response = await ficFetch(
    `/c/${encodeURIComponent(companyId)}/products?per_page=100&fields=id,name&q=${encodeURIComponent(query)}`,
    token,
    {},
    fetcher,
  );
  if (!response.ok) return response;
  try {
    const json = (await response.value.json()) as { data?: unknown[] };
    return ok(
      z
        .array(productSummarySchema)
        .parse(json.data ?? [])
        .filter(
          (product) =>
            product.name.trim().toLocaleLowerCase('it') === 'consulenza',
        )
        .map((product) => ({ id: String(product.id), name: product.name })),
    );
  } catch (cause) {
    return err({
      code: 'SOURCE_INVALID',
      source: 'FattureInCloud',
      message: 'Risposta prodotti non valida.',
      details: [String(cause)],
    });
  }
}

export async function searchClients(
  companyId: string,
  query: string,
  token: string,
  fetcher: typeof fetch = fetch,
  page = 1,
): Promise<Result<FicClientPage>> {
  if (!Number.isSafeInteger(page) || page < 1)
    return err({
      code: 'VALIDATION',
      source: 'FattureInCloud',
      message: 'Pagina clienti non valida.',
    });
  const normalized = query.trim();
  const filter = normalized
    ? `&q=${encodeURIComponent(`name contains ${queryString(normalized)}`)}`
    : '';
  const response = await ficFetch(
    `/c/${encodeURIComponent(companyId)}/entities/clients?per_page=100&fields=id,name,vat_number&page=${page}${filter}`,
    token,
    {},
    fetcher,
  );
  if (!response.ok) return response;
  try {
    const result = clientPageSchema.parse(await response.value.json());
    if (result.current_page !== page || result.last_page < page)
      throw new Error('Paginazione clienti incoerente.');
    const clients = new Map<string, FicClientSnapshot>();
    for (const client of result.data) {
      const clientId = String(client.id);
      clients.set(clientId, {
        source: 'fatture_in_cloud',
        companyId,
        clientId,
        displayName: client.name,
        ...(client.vat_number ? { vatNumber: client.vat_number } : {}),
      });
    }
    return ok({
      clients: [...clients.values()],
      page,
      ...(page < result.last_page ? { nextPage: page + 1 } : {}),
    });
  } catch (cause) {
    return err({
      code: 'SOURCE_INVALID',
      source: 'FattureInCloud',
      message: `Risposta clienti non valida alla pagina ${page}.`,
      details: [String(cause)],
    });
  }
}

function displayFicValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value ? 'Sì' : 'No';
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export async function getClientDetails(
  companyId: string,
  clientId: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<Result<FicClientDetails>> {
  const response = await ficFetch(
    `/c/${encodeURIComponent(companyId)}/entities/clients/${encodeURIComponent(clientId)}?fieldset=detailed`,
    token,
    {},
    fetcher,
  );
  if (!response.ok) return response;
  try {
    const json = (await response.value.json()) as { data?: unknown };
    const client = clientDetailsSchema.parse(json.data);
    const fields = Object.entries(client).flatMap(([key, raw]) => {
      const value = displayFicValue(raw);
      return value === undefined ? [] : [{ key, value }];
    });
    return ok({
      source: 'fatture_in_cloud',
      companyId,
      clientId: String(client.id),
      displayName: client.name,
      ...(client.vat_number ? { vatNumber: client.vat_number } : {}),
      fields,
    });
  } catch (cause) {
    return err({
      code: 'SOURCE_INVALID',
      source: 'FattureInCloud',
      message: 'Risposta dettaglio cliente non valida.',
      details: [String(cause)],
    });
  }
}

export async function verifyProduct(
  companyId: string,
  productId: string,
  token: string,
  fetcher: typeof fetch = fetch,
  companyDefaultVat?: VerifiedProduct['vat'],
): Promise<Result<VerifiedProduct>> {
  const response = await ficFetch(
    `/c/${encodeURIComponent(companyId)}/products/${encodeURIComponent(productId)}?fields=id,name,default_vat`,
    token,
    {},
    fetcher,
  );
  if (!response.ok) return response;
  try {
    const json = (await response.value.json()) as { data?: unknown };
    const product = productSchema.parse(json.data);
    if (String(product.id) !== productId)
      throw new Error('Prodotto diverso da quello richiesto.');
    if (product.name.trim().toLocaleLowerCase('it') !== 'consulenza')
      return err({
        code: 'VALIDATION',
        source: 'FattureInCloud',
        field: 'productId',
        message: 'Il prodotto selezionato non è “Consulenza”.',
      });
    let vat:
      z.infer<typeof vatSchema> | VerifiedProduct['vat'] | null | undefined =
      product.default_vat ?? companyDefaultVat;
    if (!vat?.id) {
      const taxProfile = await getTaxProfile(companyId, token, fetcher);
      if (!taxProfile.ok) return taxProfile;
      vat = taxProfile.value.defaultVat;
    }
    if (!vat?.id)
      return err({
        code: 'MISSING_DATA',
        source: 'FattureInCloud',
        field: 'product.default_vat',
        message:
          'Né il prodotto “Consulenza” né l’azienda hanno un’IVA predefinita.',
        action:
          'Configura l’IVA predefinita del prodotto o del profilo fiscale in Fatture in Cloud, salva e poi ripeti la verifica.',
      });
    return ok({
      id: String(product.id),
      name: product.name,
      vat: normalizeVat(vat),
    });
  } catch (cause) {
    return err({
      code: 'SOURCE_INVALID',
      source: 'FattureInCloud',
      message: 'Risposta prodotto non valida.',
      details: [String(cause)],
    });
  }
}

const remoteId = z
  .union([z.string().regex(/^\d+$/), z.number().int().positive().safe()])
  .transform(String);
const remoteMoney = z
  .union([z.number().finite(), z.string().regex(/^-?\d+(?:\.\d+)?$/)])
  .refine((value) => {
    try {
      return d(value).isFinite() && d(value).gte(0);
    } catch {
      return false;
    }
  }, 'Importo non valido')
  .transform((value) => money(value));
const remotePayment = z
  .object({
    id: remoteId.nullish(),
    amount: remoteMoney,
    due_date: z.string().date().nullish(),
    paid_date: z.string().date().nullish(),
    status: z.enum(['paid', 'not_paid', 'reversed']),
  })
  .superRefine((payment, ctx) => {
    if (payment.status === 'paid' && !payment.paid_date)
      ctx.addIssue({
        code: 'custom',
        path: ['paid_date'],
        message:
          'Pagamento paid senza paid_date valida: impossibile attribuire l’anno.',
      });
  });
const remoteFinancialDocument = z.object({
  id: remoteId,
  type: z.enum(['invoice', 'credit_note', 'expense', 'passive_credit_note']),
  date: z.string().date(),
  amount_gross: remoteMoney,
  number: z.union([z.string(), z.number().int()]).nullish(),
  numeration: z.string().nullish(),
  invoice_number: z.string().nullish(),
  entity: z
    .object({ id: remoteId.nullish(), name: z.string().nullish() })
    .nullish(),
  description: z.string().nullish(),
  subject: z.string().nullish(),
  category: z.string().nullish(),
  payments_list: z.array(remotePayment).nullable(),
  // Missing or malformed stamp data must not discard otherwise usable cash flows.
  stamp_duty: remoteMoney.optional().catch(undefined),
});
const financialPage = z.object({
  data: z.array(remoteFinancialDocument),
  current_page: z.number().int().positive(),
  last_page: z.number().int().positive(),
});

// Pending dates are optional metadata: accept date-only and timestamp forms,
// validating the entire value before retaining its calendar day (no UTC shift).
const remotePendingDate = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    return value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T') || undefined;
  },
  z
    .union([
      z.string().date(),
      z
        .string()
        .datetime({ offset: true, local: true })
        .transform((value) => value.slice(0, 10)),
    ])
    .nullish(),
);

const remotePending = z.object({
  id: remoteId,
  type: z.enum(['agyo', 'mail', 'browser']).nullish(),
  document_type: z.string().nullish(),
  date: remotePendingDate,
  subject: z.string().nullish(),
  supplier_name: z.string().nullish(),
  amount_gross: remoteMoney.nullish(),
  category: z.string().nullish(),
});
const pendingPage = z.object({
  data: z.array(remotePending),
  current_page: z.number().int().positive(),
  last_page: z.number().int().positive(),
});

async function listPendingDocuments(
  companyId: string,
  token: string,
  source: 'agyo' | 'mail' | 'browser',
  fetcher: typeof fetch,
) {
  const documents: NonNullable<
    FicFinancialSnapshot['pendingReceivedDocuments']
  > = [];
  const seen = new Set<string>();
  const fields =
    'id,type,document_type,date,subject,supplier_name,amount_gross,category';
  let lastPage = 1;
  for (let page = 1; page <= lastPage; page++) {
    const response = await ficFetch(
      `/c/${encodeURIComponent(companyId)}/received_documents/pending?type=${source}&per_page=100&fields=${encodeURIComponent(fields)}&page=${page}`,
      token,
      {},
      fetcher,
    );
    if (!response.ok) return response;
    try {
      const result = pendingPage.parse(await response.value.json());
      if (
        result.current_page !== page ||
        result.last_page < page ||
        (page > 1 && result.last_page !== lastPage)
      )
        throw new Error('Paginazione pending incoerente.');
      lastPage = result.last_page;
      for (const document of result.data) {
        // A pending response can contain sources other than the requested one.
        // Prefer the document's declared source; the query is only a fallback.
        const documentSource = document.type ?? source;
        const key = `${documentSource}:${document.id}`;
        if (seen.has(key))
          throw new Error('ID pending FIC duplicato nella stessa lettura.');
        seen.add(key);
        documents.push({
          id: document.id,
          source: documentSource,
          ...(document.document_type != null
            ? { documentType: document.document_type }
            : {}),
          ...(document.date != null ? { date: document.date } : {}),
          ...(document.subject != null ? { subject: document.subject } : {}),
          ...(document.supplier_name != null
            ? { supplierName: document.supplier_name }
            : {}),
          ...(document.amount_gross != null
            ? { amountGross: document.amount_gross }
            : {}),
          ...(document.category != null ? { category: document.category } : {}),
        });
      }
    } catch (cause) {
      return err({
        code: 'SOURCE_INVALID',
        source: 'FattureInCloud',
        message: `Dati pending ${source} non validi alla pagina ${page}. Nessuno snapshot aggiornato.`,
        details: [String(cause)],
      });
    }
  }
  return ok(documents);
}

async function listFinancialDocuments(
  companyId: string,
  token: string,
  type: z.infer<typeof remoteFinancialDocument>['type'],
  fetcher: typeof fetch,
) {
  const issued = type === 'invoice' || type === 'credit_note';
  const endpoint = issued ? 'issued_documents' : 'received_documents';
  const fields = `id,type,date,entity,amount_gross,payments_list,${issued ? 'number,numeration,subject,stamp_duty' : 'invoice_number,description,category'}`;
  const documents: z.infer<typeof remoteFinancialDocument>[] = [];
  let lastPage = 1;
  for (let page = 1; page <= lastPage; page++) {
    const response = await ficFetch(
      `/c/${encodeURIComponent(companyId)}/${endpoint}?type=${type}&per_page=100&fieldset=detailed&fields=${encodeURIComponent(fields)}&page=${page}`,
      token,
      {},
      fetcher,
    );
    if (!response.ok) return response;
    try {
      const result = financialPage.parse(await response.value.json());
      if (
        result.current_page !== page ||
        result.last_page < page ||
        (page > 1 && result.last_page !== lastPage)
      )
        throw new Error(
          'Paginazione incoerente o cambiata durante la lettura. Ripetere l’aggiornamento.',
        );
      if (result.data.some((document) => document.type !== type))
        throw new Error('Tipo documento diverso da quello richiesto.');
      lastPage = result.last_page;
      documents.push(...result.data);
    } catch (cause) {
      return err({
        code: 'SOURCE_INVALID',
        source: 'FattureInCloud',
        message: `Dati ${type} non validi alla pagina ${page}. Nessuno snapshot aggiornato.`,
        details: [String(cause)],
      });
    }
  }
  return ok(documents);
}

export async function syncFinancialData(
  companyId: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<Result<FicFinancialSnapshot>> {
  const response = await ficFetch(
    `/c/${encodeURIComponent(companyId)}/company/info`,
    token,
    {},
    fetcher,
  );
  if (!response.ok) return response;
  try {
    const company = companyInfoSchema.parse(
      ((await response.value.json()) as { data?: unknown }).data,
    );
    if (String(company.id) !== companyId)
      throw new Error('Azienda restituita diversa da quella configurata.');
    const missing = missingPermissions(company, true);
    if (missing.length) return permissionsError(missing);
    const snapshot: FicFinancialSnapshot = {
      source: 'fatture_in_cloud',
      company: { id: String(company.id), name: company.name },
      acquiredAt: new Date().toISOString(),
      issuedDocuments: [],
      receivedDocuments: [],
    };
    for (const type of [
      'invoice',
      'credit_note',
      'expense',
      'passive_credit_note',
    ] as const) {
      const result = await listFinancialDocuments(
        companyId,
        token,
        type,
        fetcher,
      );
      if (!result.ok) return result;
      for (const document of result.value) {
        const common = {
          id: document.id,
          date: document.date,
          amountGross: document.amount_gross,
          ...(document.entity?.id != null
            ? { entityId: document.entity.id }
            : {}),
          ...(document.entity?.name != null
            ? { entityName: document.entity.name }
            : {}),
          payments: (document.payments_list ?? []).map((payment) => ({
            amount: payment.amount,
            status: payment.status,
            ...(payment.id != null ? { id: payment.id } : {}),
            ...(payment.due_date ? { dueDate: payment.due_date } : {}),
            ...(payment.paid_date ? { paidDate: payment.paid_date } : {}),
          })),
        };
        if (type === 'invoice' || type === 'credit_note')
          snapshot.issuedDocuments.push({
            ...common,
            type,
            ...(document.stamp_duty !== undefined
              ? { stampDuty: document.stamp_duty }
              : {}),
            ...(document.subject != null
              ? { description: document.subject }
              : {}),
            ...(document.number != null
              ? { number: String(document.number) }
              : {}),
            ...(document.numeration != null
              ? { numeration: document.numeration }
              : {}),
          });
        else
          snapshot.receivedDocuments.push({
            ...common,
            type,
            ...(document.invoice_number != null
              ? { invoiceNumber: document.invoice_number }
              : {}),
            ...(document.description != null
              ? { description: document.description }
              : {}),
            ...(document.category != null
              ? { category: document.category }
              : {}),
          });
      }
    }
    snapshot.pendingReceivedDocuments = [];
    const pendingByKey = new Map<string, string>();
    for (const source of ['agyo', 'mail', 'browser'] as const) {
      const pending = await listPendingDocuments(
        companyId,
        token,
        source,
        fetcher,
      );
      if (!pending.ok) return pending;
      for (const document of pending.value) {
        const key = `${document.source}:${document.id}`;
        const normalized = JSON.stringify(document);
        const previous = pendingByKey.get(key);
        if (previous !== undefined) {
          if (previous !== normalized)
            throw new Error(
              'Dati pending FIC discordanti tra richieste. Ripetere l’aggiornamento.',
            );
          continue;
        }
        pendingByKey.set(key, normalized);
        snapshot.pendingReceivedDocuments.push(document);
      }
    }
    snapshot.acquiredAt = new Date().toISOString();
    return ok(financialSnapshotSchema.parse(snapshot));
  } catch (cause) {
    return err({
      code: 'SOURCE_INVALID',
      source: 'FattureInCloud',
      message:
        'Snapshot finanziario non valido. I dati precedenti restano invariati.',
      details: [String(cause)],
    });
  }
}

export async function exportQuote(
  input: {
    companyId: string;
    clientId: string;
    productId: string;
    product: VerifiedProduct;
    lines: ExportLine[];
    attemptId: string;
  },
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<Result<FicExportResult>> {
  const payload = {
    data: {
      type: 'quote',
      entity: { id: Number(input.clientId) },
      items_list: input.lines.map((line) => ({
        product_id: Number(input.productId),
        name: 'Consulenza',
        description: line.description,
        qty: 1,
        net_price: Number(line.amount),
        vat: { id: Number(input.product.vat.id) },
      })),
      notes: `Cash attempt ${input.attemptId}`,
    },
  };
  const response = await ficFetch(
    `/c/${encodeURIComponent(input.companyId)}/issued_documents`,
    token,
    { method: 'POST', body: JSON.stringify(payload) },
    fetcher,
  );
  if (!response.ok) {
    const { httpStatus, requestSent } = response.error;
    const rejected =
      !requestSent ||
      (httpStatus !== undefined &&
        [400, 401, 403, 404, 405, 409, 422, 429].includes(httpStatus));
    return ok({
      outcome: rejected ? 'rejected' : 'uncertain',
      requestSent,
      diagnostic: `${!requestSent ? 'Non inviato: ' : ''}${response.error.message}`,
      error: response.error,
    });
  }
  try {
    const json = (await response.value.json()) as {
      data?: { id?: string | number };
    };
    if (json.data?.id === undefined)
      return ok({
        outcome: 'uncertain',
        diagnostic: 'Risposta priva di identificativo documento.',
      });
    return ok({ outcome: 'success', remoteDocumentId: String(json.data.id) });
  } catch (cause) {
    return ok({ outcome: 'uncertain', diagnostic: String(cause) });
  }
}
