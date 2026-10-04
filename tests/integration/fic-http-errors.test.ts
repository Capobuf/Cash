import { describe, expect, it, vi } from 'vitest';
import {
  getClientDetails,
  getTaxProfile,
  listCompanies,
  listConsultingProducts,
  searchClients,
  syncFinancialData,
  verifyActivation,
  verifyPermissions,
  verifyProduct,
} from '../../src/native/integrations/fatture-in-cloud';

const failures = [
  [401, 'CREDENTIALS'],
  [403, 'CREDENTIALS'],
  [429, 'RATE_LIMIT'],
  [422, 'SOURCE_INVALID'],
  [500, 'SOURCE_UNAVAILABLE'],
  [503, 'SOURCE_UNAVAILABLE'],
] as const;
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
const company = {
  id: 1,
  name: 'Studio',
  access_info: {
    permissions: {
      fic_clients: 'read',
      fic_products: 'read',
      fic_settings: 'read',
      fic_issued_documents: 'write',
      fic_received_documents: 'read',
    },
  },
};

describe('classificazione HTTP FIC', () => {
  describe.each([
    [
      'discovery aziende',
      (fetcher: typeof fetch) => listCompanies('token', fetcher),
    ],
    [
      'attivazione',
      (fetcher: typeof fetch) => verifyActivation('token', '1', '2', fetcher),
    ],
    [
      'prodotti',
      (fetcher: typeof fetch) => listConsultingProducts('token', '1', fetcher),
    ],
    [
      'profilo fiscale',
      (fetcher: typeof fetch) => getTaxProfile('1', 'token', fetcher),
    ],
    [
      'ricerca clienti',
      (fetcher: typeof fetch) =>
        searchClients('1', 'Cliente', 'token', fetcher),
    ],
    [
      'dettaglio cliente',
      (fetcher: typeof fetch) => getClientDetails('1', '2', 'token', fetcher),
    ],
    [
      'verifica prodotto',
      (fetcher: typeof fetch) => verifyProduct('1', '2', 'token', fetcher),
    ],
    [
      'permessi azienda',
      (fetcher: typeof fetch) => verifyPermissions('1', 'token', fetcher),
    ],
    [
      'sincronizzazione azienda',
      (fetcher: typeof fetch) => syncFinancialData('1', 'token', fetcher),
    ],
  ] as const)('%s', (_, operation) => {
    it.each(failures)(
      'classifica HTTP %s come %s senza ritentare',
      async (status, code) => {
        const fetcher = vi.fn<typeof fetch>(async () => response({}, status));
        const result = await operation(fetcher);
        expect(result).toMatchObject({
          ok: false,
          error: { code, source: 'FattureInCloud' },
        });
        if (result.ok) throw new Error('Expected HTTP failure');
        if (code !== 'CREDENTIALS') {
          expect(result.error.message).toContain(`HTTP ${status}`);
          expect(result.error.message).not.toMatch(
            /token|scope|autorizzato|accesso.*negato/i,
          );
          expect(result.error.action).toBeUndefined();
        }
        expect(fetcher).toHaveBeenCalledOnce();
      },
    );
  });

  describe.each(['tax_profile', 'products/2'] as const)(
    'attivazione: %s',
    (endpoint) => {
      it.each(failures)(
        'propaga HTTP %s come %s dalle verifiche successive',
        async (status, code) => {
          const fetcher = vi.fn<typeof fetch>(async (input) => {
            const url = new URL(String(input));
            if (url.pathname.endsWith(endpoint)) return response({}, status);
            return response({
              data: url.pathname.endsWith('/company/info')
                ? company
                : { regime: 'forfettario_15', default_vat: { id: 3 } },
            });
          });
          expect(
            await verifyActivation('token', '1', '2', fetcher),
          ).toMatchObject({ ok: false, error: { code } });
          expect(fetcher).toHaveBeenCalledTimes(
            endpoint === 'tax_profile' ? 2 : 3,
          );
        },
      );
    },
  );

  describe.each([
    ['issued_documents', 'invoice'],
    ['issued_documents', 'credit_note'],
    ['received_documents', 'expense'],
    ['received_documents', 'passive_credit_note'],
    ['received_documents/pending', 'agyo'],
    ['received_documents/pending', 'mail'],
    ['received_documents/pending', 'browser'],
  ] as const)('sincronizzazione: %s %s', (endpoint, type) => {
    it.each(failures)(
      'propaga HTTP %s come %s senza snapshot parziale',
      async (status, code) => {
        const fetcher = vi.fn<typeof fetch>(async (input) => {
          const url = new URL(String(input));
          if (
            url.pathname.endsWith(`/${endpoint}`) &&
            url.searchParams.get('type') === type
          )
            return response({}, status);
          return url.pathname.endsWith('/company/info')
            ? response({ data: company })
            : response({ data: [], current_page: 1, last_page: 1 });
        });
        const result = await syncFinancialData('1', 'token', fetcher);
        expect(result).toMatchObject({
          ok: false,
          error: { code, source: 'FattureInCloud' },
        });
        const failedCalls = fetcher.mock.calls.filter(([input]) => {
          const url = new URL(String(input));
          return (
            url.pathname.endsWith(`/${endpoint}`) &&
            url.searchParams.get('type') === type
          );
        });
        expect(failedCalls).toHaveLength(1);
      },
    );
  });

  it.each(failures)(
    'mantiene il report di accesso delle sonde HTTP %s',
    async (status, code) => {
      const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        expect(init?.method ?? 'GET').toBe('GET');
        expect(init?.body).toBeUndefined();
        return new URL(String(input)).pathname.endsWith('/company/info')
          ? response({ data: company })
          : response({}, status);
      });
      const result = await verifyPermissions('1', 'token', fetcher);
      if (!result.ok) throw new Error(result.error.message);
      const readAccess = result.value.requiredAccess.filter(
        (access) => access.scope !== 'issued_documents.quotes:a',
      );
      expect(readAccess).toHaveLength(6);
      for (const access of readAccess) {
        expect(access.status).toBe(
          code === 'CREDENTIALS' ? 'unavailable' : 'unverifiable',
        );
        expect(access.detail).toContain(`HTTP ${status}`);
      }
      expect(result.value.requiredAccess.at(-1)).toMatchObject({
        scope: 'issued_documents.quotes:a',
        status: 'unverifiable',
      });
      expect(fetcher).toHaveBeenCalledTimes(7);
    },
  );

  it('preserva gli scope e i permessi azienda nei messaggi di accesso negato', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({}, 403));
    for (const [operation, scope] of [
      [() => getTaxProfile('1', 'token', fetcher), 'settings:r'],
      [() => listConsultingProducts('token', '1', fetcher), 'products:r'],
      [() => getClientDetails('1', '2', 'token', fetcher), 'entity.clients:r'],
    ] as const) {
      const result = await operation();
      if (result.ok) throw new Error('Expected denial');
      expect(result.error.message).toContain(scope);
      expect(result.error.message).toContain('permessi');
    }
  });
});
