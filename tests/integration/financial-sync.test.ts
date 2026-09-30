import { describe, expect, it, vi } from 'vitest';
import { FIC_SCOPES } from '../../src/domain/integration';
import { syncFinancialData } from '../../src/native/integrations/fatture-in-cloud';

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const company = { data: { id: 1, name: 'Studio', access_info: { permissions: {
  fic_received_documents: 'read', fic_issued_documents_detailed: { invoices: 'read', credit_notes: 'read' },
} } } };
const remote = (type: string, id = 1) => ({ id, type, date: '2026-01-01', amount_gross: 100.25,
  number: 4, numeration: '/A', invoice_number: 'FOR-4', entity: { name: 'Controparte' }, category: 'Software', description: 'Licenza',
  payments_list: [{ id: 10, amount: 50.10, status: 'paid', paid_date: '2026-02-01', due_date: null }, { amount: 50.15, status: 'not_paid', due_date: '2026-04-01', paid_date: null }],
  items_list: [{ secret_unused: 'not stored' }], attachment_url: 'not stored', ei_status: 'rejected',
});

describe('snapshot finanziario FIC completo', () => {
  it('legge tutte le pagine dei quattro tipi, normalizza solo i campi necessari senza filtri anno/SDI', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/company/info')) return response(company);
      const type = url.searchParams.get('type')!; const page = Number(url.searchParams.get('page'));
      expect(url.searchParams.get('per_page')).toBe('100'); expect(url.searchParams.get('fieldset')).toBe('detailed');
      expect(url.searchParams.get('fields')).toBe(`id,type,date,entity,amount_gross,payments_list,${type === 'invoice' || type === 'credit_note' ? 'number,numeration' : 'invoice_number,description,category'}`);
      expect(url.searchParams.has('q')).toBe(false);
      expect(url.pathname).toBe(`/c/1/${type === 'invoice' || type === 'credit_note' ? 'issued_documents' : 'received_documents'}`);
      return response({ current_page: page, last_page: type === 'invoice' ? 2 : 1, data: [remote(type, type === 'invoice' || type === 'expense' ? page : 3)] });
    });
    const result = await syncFinancialData('1', 'token', fetcher as typeof fetch);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.issuedDocuments.map(document => document.type)).toEqual(['invoice', 'invoice', 'credit_note']);
    expect(result.value.receivedDocuments.map(document => document.type)).toEqual(['expense', 'passive_credit_note']);
    expect(result.value.receivedDocuments[0]).toMatchObject({ invoiceNumber: 'FOR-4', entityName: 'Controparte', category: 'Software', description: 'Licenza', amountGross: '100.25' });
    expect(result.value.issuedDocuments[0]?.payments).toEqual([{ id: '10', amount: '50.10', status: 'paid', paidDate: '2026-02-01' }, { amount: '50.15', status: 'not_paid', dueDate: '2026-04-01' }]);
    expect(JSON.stringify(result.value)).not.toContain('not stored'); expect(JSON.stringify(result.value)).not.toContain('ei_status');
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it.each(['invalid_date', 'missing_paid_date', 'invalid_amount', 'wrong_type', 'duplicate_id', 'invalid_page', 'http_error'])('fallisce integralmente su una seconda pagina %s', async failure => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/company/info')) return response(company);
      const page = Number(url.searchParams.get('page'));
      const document = remote('invoice', page);
      if (page === 2) {
        if (failure === 'invalid_date') document.date = '2026-02-30';
        if (failure === 'missing_paid_date') document.payments_list[0]!.paid_date = null;
        if (failure === 'invalid_amount') document.amount_gross = -1;
        if (failure === 'wrong_type') document.type = 'quote';
        if (failure === 'duplicate_id') document.id = 1;
        if (failure === 'http_error') return response({}, 500);
      }
      // Later families are empty, so duplicate validation happens at snapshot completion.
      if (url.searchParams.get('type') !== 'invoice') return response({ current_page: 1, last_page: 1, data: [] });
      return response({ current_page: failure === 'invalid_page' && page === 2 ? 1 : page, last_page: 2, data: [document] });
    });
    const result = await syncFinancialData('1', 'token', fetcher as typeof fetch);
    expect(result.ok).toBe(false); expect(result).not.toHaveProperty('value');
  });

  it('indica i permessi mancanti del vecchio token e non avvia il download', async () => {
    const fetcher = vi.fn(async () => response({ data: { ...company.data, access_info: { permissions: {} } } }));
    const result = await syncFinancialData('1', 'old-token', fetcher as typeof fetch);
    expect(result).toMatchObject({ ok: false, error: { code: 'CREDENTIALS', message: expect.stringContaining('issued_documents.invoices:r'), action: expect.stringContaining('Riconfigura') } });
    if (!result.ok) expect(result.error.message).toContain('received_documents:r');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('traduce il 403 del token nello scope specifico senza fallback', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => String(input).includes('/company/info') ? response(company) : response({}, 403));
    expect(await syncFinancialData('1', 'token', fetcher as typeof fetch)).toMatchObject({ ok: false, error: { code: 'CREDENTIALS', message: expect.stringContaining('issued_documents.invoices:r') } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('richiede esattamente gli scope previsti senza permessi fiscali o scrittura dei documenti finanziari', () => {
    expect(FIC_SCOPES).toEqual(['entity.clients:r', 'products:r', 'settings:r', 'issued_documents.quotes:a', 'issued_documents.invoices:r', 'issued_documents.credit_notes:r', 'received_documents:r']);
  });
});
