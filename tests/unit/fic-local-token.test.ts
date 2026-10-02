import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  meta,
  ok,
  type Quote,
} from '../../src/domain/model';
import { AppState } from '../../src/renderer/state';
import { ClientsView } from '../../src/renderer/views/ClientsView';
import { QuotesView } from '../../src/renderer/views/QuotesView';
import { CustomerDialog } from '../../src/renderer/components/quotes/CustomerDialog';

const effects = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (effect: () => unknown) => {
    effects.push(effect);
  },
}));
vi.mock('@/components/ui/dialog', () => {
  const content = ({ children }: { children: ReactNode }) => children;
  return {
    Dialog: content,
    DialogContent: content,
    DialogHeader: content,
    DialogTitle: content,
    DialogDescription: content,
    DialogFooter: content,
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  effects.length = 0;
});

it.each([false, true])(
  'esegue il caricamento clienti solo con token locale (%s)',
  async (hasToken) => {
    const doc = createEmptyDocument();
    doc.settings.fic = { enabled: true, company: { id: '1', name: 'Studio' } };
    const searchClients = vi.fn(async () => ok([]));
    vi.stubGlobal('window', { cash: { fic: { searchClients } } });
    const markup = renderToStaticMarkup(
      createElement(ClientsView, {
        doc,
        hasToken,
        appState: new AppState(),
        requestDelete: vi.fn(),
      }),
    );
    effects[0]?.();
    await Promise.resolve();
    expect(searchClients).toHaveBeenCalledTimes(hasToken ? 1 : 0);
    expect(markup.includes('Richiede configurazione locale')).toBe(!hasToken);
  },
);

it('mostra gli snapshot e blocca i controlli live senza token', () => {
  const doc = createEmptyDocument();
  doc.settings.fic = { enabled: true, company: { id: '1', name: 'Studio' } };
  const quote: Quote = {
    ...meta(),
    date: '2026-10-02',
    items: [],
    snapshotRevision: 0,
    exportAttempts: [],
    client: {
      source: 'fatture_in_cloud',
      companyId: '1',
      clientId: '2',
      displayName: 'Cliente storico',
    },
  };
  doc.quotes.push(quote);
  const appState = new AppState();
  const markup = renderToStaticMarkup(
    createElement(QuotesView, {
      doc,
      hasToken: false,
      appState,
      activeQuoteId: quote.id,
      setActiveQuoteId: vi.fn(),
      requestDelete: vi.fn(),
    }),
  );
  expect(markup).toContain('Cliente storico');
  const button = markup
    .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
    ?.find((value) => value.includes('Esporta FIC'));
  expect(button).toMatch(/\sdisabled(?:=|\s|>)/);
  const dialog = renderToStaticMarkup(
    createElement(CustomerDialog, {
      quote,
      doc,
      hasToken: false,
      open: true,
      onOpenChange: vi.fn(),
      results: [],
      onSearch: vi.fn(),
      onSelect: () => true,
    }),
  );
  expect(dialog).toContain('Richiede configurazione locale');
  expect(dialog).not.toContain('<form');
  expect(dialog).toContain('Nessun cliente');
});
