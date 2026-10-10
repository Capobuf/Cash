import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  err,
  ok,
  type CashDocument,
  type FicFinancialSnapshot,
} from '../../src/domain/model';
import { AppState } from '../../src/renderer/state';
import type { ArchiveSession } from '../../src/shared/archive';
import { syncFinancialData } from '../../src/native/integrations/fatture-in-cloud';
import { financialPaymentSummary } from '../../src/domain/financial-analysis';

const snapshot = (
  acquiredAt = '2026-09-01T00:00:00Z',
): FicFinancialSnapshot => ({
  source: 'fatture_in_cloud',
  company: { id: '1', name: 'Studio' },
  acquiredAt,
  issuedDocuments: [
    {
      id: '1',
      type: 'invoice',
      date: '2026-01-01',
      amountGross: '100.00',
      payments: [],
    },
  ],
  receivedDocuments: [],
});
const session = (document: CashDocument): ArchiveSession => ({
  path: 'C:\\Cash.json',
  document,
  readOnly: false,
  token: {
    documentId: document.documentId,
    revision: document.revision,
  },
});

describe('applicazione atomica dello snapshot', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  function setup() {
    const document = createEmptyDocument();
    document.financialSnapshot = snapshot();
    document.settings.fic = {
      enabled: true,
      company: { id: '1', name: 'Studio' },
      product: { id: '2', name: 'Consulenza' },
    };
    const sync = vi.fn(async () => ok(snapshot('2026-09-30T10:00:00Z')));
    const save = vi.fn(async (_path: string, doc: CashDocument) =>
      ok(session({ ...doc, revision: doc.revision + 1 })),
    );
    vi.stubGlobal('window', {
      cash: {
        fic: { syncFinancialData: sync },
        archive: { save },
        setDirty: vi.fn(),
      },
      setTimeout,
      clearTimeout,
    });
    const state = new AppState();
    state.acceptNativeSession(session(document));
    return { state, sync, save };
  }

  it('applica una sola mutazione e autosalva solo dopo successo completo', async () => {
    const { state, sync, save } = setup();
    const mutate = vi.spyOn(state, 'mutate');
    await state.syncFinancialData();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(state.document?.financialSnapshot?.acquiredAt).toBe(
      '2026-09-30T10:00:00Z',
    );
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
    expect(state.status).toBe('Salvato');
  });

  it.each(['invoice', 'credit_note', 'expense', 'passive_credit_note'])(
    'aggiorna e salva i pagamenti del documento %s già importato da FIC',
    async (type) => {
      const { state, sync, save } = setup();
      let paidAmount = 0;
      const fetcher = vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        const data = url.pathname.endsWith('/company/info')
          ? {
              data: {
                id: 1,
                name: 'Studio',
                access_info: {
                  permissions: {
                    fic_received_documents: 'read',
                    fic_issued_documents: 'read',
                  },
                },
              },
            }
          : {
              current_page: 1,
              last_page: 1,
              data:
                url.searchParams.get('type') === type
                  ? [
                      {
                        id: 1,
                        type,
                        date: '2025-12-01',
                        amount_gross: 100,
                        payments_list: [
                          ...(paidAmount
                            ? [
                                {
                                  amount: paidAmount,
                                  status: 'paid',
                                  paid_date: '2026-10-04',
                                },
                              ]
                            : []),
                          ...(paidAmount < 100
                            ? [
                                {
                                  amount: 100 - paidAmount,
                                  status: 'not_paid',
                                },
                              ]
                            : []),
                        ],
                      },
                    ]
                  : [],
            };
        return new Response(JSON.stringify(data));
      });
      sync.mockImplementation(() =>
        syncFinancialData('1', 'token', fetcher as typeof fetch),
      );
      for (const amount of [0, 40, 100, 0]) {
        paidAmount = amount;
        await state.syncFinancialData();
        await state.save();
        expect(state.error).toBeNull();
        expect(state.status).toBe('Salvato');
        const current = state.document!.financialSnapshot!;
        const documents = [
          ...current.issuedDocuments,
          ...current.receivedDocuments,
        ];
        expect(documents).toHaveLength(1);
        expect(documents[0]).toMatchObject({ id: '1', type });
        expect(
          financialPaymentSummary(documents[0]!, '2026-10-04'),
        ).toMatchObject({
          paid: `${amount}.00`,
          outstanding: `${100 - amount}.00`,
          status:
            amount === 100 ? 'Pagata' : amount ? 'Parziale' : 'Da incassare',
        });
        expect(save.mock.lastCall?.[1].financialSnapshot).toEqual(current);
      }
      expect(sync).toHaveBeenCalledTimes(4);
    },
  );

  it('non modifica né salva nulla quando una pagina remota fallisce', async () => {
    const { state, sync, save } = setup();
    const before = structuredClone(state.document);
    sync.mockResolvedValueOnce(
      err({ code: 'SOURCE_INVALID', message: 'Pagina 2 malformata' }),
    );
    await state.syncFinancialData();
    await vi.runAllTimersAsync();
    expect(state.document).toEqual(before);
    expect(save).not.toHaveBeenCalled();
    expect(state.error?.code).toBe('SOURCE_INVALID');
    expect(state.financialSyncError?.code).toBe('SOURCE_INVALID');
    state.clearError();
    expect(state.financialSyncError?.code).toBe('SOURCE_INVALID');
    await state.syncFinancialData();
    expect(state.financialSyncError).toBeNull();
  });

  it('scarta una risposta arrivata dopo un cambio azienda e blocca richieste concorrenti', async () => {
    const { state, sync } = setup();
    let complete!: (value: ReturnType<typeof ok<FicFinancialSnapshot>>) => void;
    sync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = state.syncFinancialData();
    await Promise.resolve();
    await Promise.resolve();
    await state.syncFinancialData();
    expect(sync).toHaveBeenCalledTimes(1);
    state.mutate((document) => {
      document.settings.fic.company = { id: '2', name: 'Altra azienda' };
    });
    complete(ok(snapshot('2026-09-30T10:00:00Z')));
    await pending;
    expect(state.document?.financialSnapshot).toEqual(snapshot());
    expect(state.error?.code).toBe('CONFLICT');
  });

  it('conserva i documenti eliminati finché non riesce la sostituzione completa, anche cambiando azienda', async () => {
    const { state, sync } = setup();
    state.mutate((document) => {
      document.settings.fic.company = { id: '2', name: 'Altra azienda' };
    });
    const next = {
      ...snapshot('2026-09-30T10:00:00Z'),
      company: { id: '2', name: 'Altra azienda' },
      issuedDocuments: [],
    };
    sync.mockResolvedValueOnce(ok(next));
    await state.syncFinancialData();
    expect(state.document?.financialSnapshot).toEqual(next);
  });

  it('non chiama FIC se disattivato', async () => {
    const { state, sync } = setup();
    state.mutate((document) => {
      document.settings.fic.enabled = false;
    });
    await state.syncFinancialData();
    expect(sync).not.toHaveBeenCalled();
    expect(state.document?.financialSnapshot).toEqual(snapshot());
  });
});
