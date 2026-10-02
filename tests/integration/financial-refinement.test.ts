import { describe, expect, it, vi } from 'vitest';
import { companyInfoSchema, syncFinancialData, verifyPermissions } from '../../src/native/integrations/fatture-in-cloud';
import { calculateFinancialAnalysis } from '../../src/domain/financial-analysis';
import { createEmptyDocument } from '../../src/domain/model';
import { parseDocument } from '../../src/domain/schema';
import { FIC_SCOPES } from '../../src/domain/integration';

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const permissions = {
  ...Object.fromEntries(['fic_situation', 'fic_clients', 'fic_suppliers', 'fic_products', 'fic_received_documents', 'fic_receipts',
    'fic_calendar', 'fic_archive', 'fic_taxes', 'fic_stock', 'fic_cashbook', 'fic_settings', 'fic_emails', 'fic_export',
    'fic_import_bankstatements', 'fic_import_clients_suppliers', 'fic_import_issued_documents', 'fic_import_products',
    'fic_recurring', 'fic_riba', 'dic_employees', 'dic_settings', 'dic_timesheet'].map(key => [key, 'read'])),
  fic_issued_documents: 'detailed',
  fic_issued_documents_detailed: Object.fromEntries(['quotes', 'proformas', 'invoices', 'receipts', 'delivery_notes',
    'credit_notes', 'orders', 'work_reports', 'supplier_orders', 'self_invoices'].map(key => [key, 'write'])),
};
const company = { id: 1, name: 'Studio', access_info: { permissions } };
const page = (data: unknown[], current_page = 1, last_page = 1) => response({ data, current_page, last_page });

describe('pending nella sincronizzazione finanziaria', () => {
  function fetchPendingDate(date: unknown) {
    return vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/company/info')) return response({ data: company });
      if (url.pathname.endsWith('/pending')) return page([{ id: 1, date }]);
      return page([]);
    });
  }

  it.each([
    ['2026-03-01', '2026-03-01'],
    ['2026-03-01 14:02:02', '2026-03-01'],
    ['2026-03-01T14:02:02', '2026-03-01'],
    ['2026-03-01T14:02:02.123Z', '2026-03-01'],
    ['2026-03-01T00:30:00+02:00', '2026-03-01'],
    ['2026-03-01T23:30:00-03:00', '2026-03-01'],
    ['2024-02-29 00:00:00', '2024-02-29'],
    [' 2026-03-01 14:02:02 ', '2026-03-01'],
  ])('normalizza la data pending %s senza spostare il giorno per il fuso orario', async (date, expected) => {
    const result = await syncFinancialData('1', 'token', fetchPendingDate(date) as typeof fetch);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.pendingReceivedDocuments).toEqual(['agyo', 'mail', 'browser'].map(source => ({ id: '1', source, date: expected })));
    expect(parseDocument({ ...createEmptyDocument(), financialSnapshot: result.value }).financialSnapshot).toEqual(result.value);
  });

  it.each([undefined, null, '', '   '])('omette la data pending assente o vuota: %j', async date => {
    const result = await syncFinancialData('1', 'token', fetchPendingDate(date) as typeof fetch);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.pendingReceivedDocuments).toEqual(['agyo', 'mail', 'browser'].map(source => ({ id: '1', source })));
  });

  it.each(['2026-02-30', '2026-02-30 12:00:00', '2026-02-29T12:00:00Z',
    '2026-03-01 25:00:00', '2026-03-01T12:60:00Z', '2026-03-01junk', 'not-a-date', 12345])(
    'rifiuta una data pending non valida senza restituire snapshot parziali: %j', async date => {
      const result = await syncFinancialData('1', 'token', fetchPendingDate(date) as typeof fetch);
      expect(result).toMatchObject({ ok: false, error: { code: 'SOURCE_INVALID', message: expect.stringContaining('pending agyo') } });
      expect(result).not.toHaveProperty('value');
    });

  function fetchPending(failure?: string) {
    return vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/company/info')) return response({ data: company });
      if (!url.pathname.endsWith('/pending')) return page([]);
      expect(url.searchParams.get('per_page')).toBe('100');
      expect(url.searchParams.get('fields')).toBe('id,type,document_type,date,subject,supplier_name,amount_gross,category');
      const type = url.searchParams.get('type'); const current = Number(url.searchParams.get('page'));
      if (type === 'browser' && failure === 'http') return response({}, 403);
      const document = { id: current, type, document_type: 'expense', date: '2026-03-01', subject: 'Licenza',
        supplier_name: 'Fornitore', amount_gross: type === 'mail' ? null : 123.45, category: 'Software',
        attachment_url: 'SECRET', other_attachments: ['SECRET'], extracted_data: { mining: 'SECRET' } };
      if (type === 'agyo' && current === 2 && failure === 'duplicate') document.id = 1;
      if (type === 'mail' && failure === 'invalid') document.amount_gross = -1;
      return page([document], failure === 'page' && current === 2 ? 1 : current, type === 'agyo' ? 2 : 1);
    });
  }

  it('acquisisce agyo, mail, browser paginati; normalizza e non conserva payload o allegati', async () => {
    const fetcher = fetchPending();
    const result = await syncFinancialData('1', 'token', fetcher as typeof fetch);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.pendingReceivedDocuments).toEqual([
      ...['1', '2'].map(id => ({ id, source: 'agyo', documentType: 'expense', date: '2026-03-01', subject: 'Licenza', supplierName: 'Fornitore', amountGross: '123.45', category: 'Software' })),
      { id: '1', source: 'mail', documentType: 'expense', date: '2026-03-01', subject: 'Licenza', supplierName: 'Fornitore', category: 'Software' },
      { id: '1', source: 'browser', documentType: 'expense', date: '2026-03-01', subject: 'Licenza', supplierName: 'Fornitore', amountGross: '123.45', category: 'Software' },
    ]);
    const document = parseDocument({ ...createEmptyDocument(), financialSnapshot: result.value });
    expect(JSON.stringify(document)).not.toMatch(/SECRET|attachment|extracted_data|mining/);
    expect(calculateFinancialAnalysis(result.value, 2026, undefined, [], '2026-09-30')).toEqual(
      calculateFinancialAnalysis({ ...result.value, pendingReceivedDocuments: [] }, 2026, undefined, [], '2026-09-30'));
    expect(calculateFinancialAnalysis(result.value, 2026, undefined, [], '2026-09-30')).toMatchObject({ documentedCosts: '0.00', paidCosts: '0.00' });
    expect(fetcher).toHaveBeenCalledTimes(9);
  });

  it.each(['http', 'duplicate', 'invalid', 'page'])('fallisce senza snapshot parziale su pending %s', async failure => {
    expect(await syncFinancialData('1', 'token', fetchPending(failure) as typeof fetch)).toMatchObject({ ok: false });
  });

  function fetchOverlappingPending(failure?: string) {
    return vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/company/info')) return response({ data: company });
      if (!url.pathname.endsWith('/pending')) return page([]);
      const source = url.searchParams.get('type');
      const current = Number(url.searchParams.get('page'));
      if (source === 'agyo') return page([{ id: 1, type: 'agyo', amount_gross: 10 }]);
      if (source === 'browser') return page([]);
      // The mail request may return documents with other declared sources.
      if (current === 1) return page([
        { id: 1, type: 'agyo', amount_gross: failure === 'conflict' ? 20 : 10 },
        { id: 1, type: 'mail', amount_gross: 30 },
      ], current, 2);
      return page([{ id: 1, type: failure === 'duplicate' ? 'mail' : failure === 'invalid' ? 'unknown' : 'browser', amount_gross: 40 }], current, 2);
    });
  }

  it('usa la sorgente restituita e unisce le copie identiche tra richieste senza perdere documenti', async () => {
    const fetcher = fetchOverlappingPending();
    const result = await syncFinancialData('1', 'token', fetcher as typeof fetch);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.pendingReceivedDocuments).toEqual([
      { id: '1', source: 'agyo', amountGross: '10.00' },
      { id: '1', source: 'mail', amountGross: '30.00' },
      { id: '1', source: 'browser', amountGross: '40.00' },
    ]);
    expect(parseDocument({ ...createEmptyDocument(), financialSnapshot: result.value }).financialSnapshot).toEqual(result.value);
    expect(fetcher).toHaveBeenCalledTimes(9);
  });

  it.each(['conflict', 'duplicate', 'invalid'])('rifiuta pending sovrapposti con %s senza snapshot parziale', async failure => {
    const result = await syncFinancialData('1', 'token', fetchOverlappingPending(failure) as typeof fetch);
    expect(result).toMatchObject({ ok: false, error: { code: 'SOURCE_INVALID' } });
    expect(result).not.toHaveProperty('value');
    if (!result.ok) expect(result.error.details?.join(' ')).toContain(
      failure === 'conflict' ? 'discordanti' : failure === 'duplicate' ? 'duplicato' : 'type');
  });

  it('accetta un pending senza campi opzionali e sostituisce i pending dopo registrazione', async () => {
    let registered = false;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/company/info')) return response({ data: company });
      if (!registered && url.pathname.endsWith('/pending') && url.searchParams.get('type') === 'mail') return page([{ id: 7 }]);
      if (registered && url.searchParams.get('type') === 'expense') return page([{ id: 10, type: 'expense', date: '2026-01-01', amount_gross: 50, payments_list: [] }]);
      return page([]);
    });
    const first = await syncFinancialData('1', 'token', fetcher as typeof fetch);
    expect(first).toMatchObject({ ok: true, value: { pendingReceivedDocuments: [{ id: '7', source: 'mail' }] } });
    registered = true;
    const next = await syncFinancialData('1', 'token', fetcher as typeof fetch);
    expect(next).toMatchObject({ ok: true, value: { pendingReceivedDocuments: [], receivedDocuments: [{ id: '10', type: 'expense' }] } });
  });

  it('mantiene valido un vecchio snapshot v5 privo di pending', () => {
    const document = { ...createEmptyDocument(), financialSnapshot: { source: 'fatture_in_cloud', company: { id: '1', name: 'Studio' },
      acquiredAt: '2026-09-30T10:00:00Z', issuedDocuments: [], receivedDocuments: [] } };
    expect(parseDocument(document)).toEqual(document);
    expect(parseDocument(document).schemaVersion).toBe(10);
  });
});

describe('permessi azienda e accessi effettivi distinti', () => {
  it('conserva tutti i permessi ufficiali e tollera nuove chiavi senza persisterle', () => {
    const expanded = { ...permissions, fic_future: { capability: true }, fic_issued_documents_detailed: { ...permissions.fic_issued_documents_detailed, self_supplier_invoices: 'write' } };
    expect(companyInfoSchema.parse({ ...company, access_info: { permissions: expanded } }).access_info.permissions).toEqual(expanded);
    expect(() => companyInfoSchema.parse({ ...company, access_info: { permissions: { fic_clients: 'invalid' } } })).toThrow();
  });

  it('conferma letture con GET minime e rileva 403 senza dedurre gli scope raw', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input)); expect(init?.method ?? 'GET').toBe('GET'); expect(init?.body).toBeUndefined();
      if (url.pathname.endsWith('/company/info')) return response({ data: company });
      if (!url.pathname.endsWith('/tax_profile')) expect(url.searchParams.get('per_page')).toBe('1');
      return response({}, url.searchParams.get('type') === 'invoice' ? 403 : 200);
    });
    const result = await verifyPermissions('1', 'token', fetcher as typeof fetch);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.companyPermissions).toEqual(permissions);
    expect(result.value.requiredAccess.map(access => access.scope).sort()).toEqual([...FIC_SCOPES].sort());
    expect(result.value.requiredAccess.find(access => access.scope === 'issued_documents.invoices:r')).toMatchObject({ status: 'unavailable', detail: expect.stringContaining('permessi dell’utente') });
    expect(result.value.requiredAccess.find(access => access.scope === 'entity.clients:r')?.status).toBe('available');
    expect(result.value.requiredAccess.find(access => access.scope === 'received_documents:r')?.status).toBe('available');
    expect(result.value.requiredAccess.find(access => access.scope === 'issued_documents.quotes:a')).toMatchObject({ status: 'unverifiable', detail: expect.stringContaining('write') });
    expect(result.value).not.toHaveProperty('grantedScopes');
    expect(fetcher).toHaveBeenCalledTimes(11);
  });

  it('non confonde errori temporanei con accessi mancanti', async () => {
    const result = await verifyPermissions('1', 'token', vi.fn(async (input: string | URL | Request) => String(input).endsWith('/company/info') ? response({ data: company }) : response({}, 429)) as typeof fetch);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.requiredAccess.every(access => access.status === 'unverifiable')).toBe(true);
  });

  it('non descrive un 403 come prova certa dello scope mancante e non ritenta', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => String(input).endsWith('/company/info') ? response({ data: company }) : response({}, 403));
    const result = await syncFinancialData('1', 'token', fetcher as typeof fetch);
    if (result.ok) throw new Error('Expected denial');
    expect(result.error.message).toContain('verifica gli scope');
    expect(result.error.message).toContain('permessi dell’utente');
    expect(result.error.action).toContain('non identifica da sola');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
