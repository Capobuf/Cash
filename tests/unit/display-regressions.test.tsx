import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  meta,
  type Quote,
  type FicFinancialSnapshot,
  type FicReceivedDocument,
} from '../../src/domain/model';
import { FinancialDocuments } from '../../src/renderer/components/FinancialDocuments';
import { ExportDialog } from '../../src/renderer/components/quotes/ExportDialog';
import { ResourcesView } from '../../src/renderer/views/ResourcesView';
import { AppState } from '../../src/renderer/state';
import { eur } from '../../src/renderer/lib/format';

const selection = vi.hoisted(() => ({
  value: undefined as unknown,
  inject: false,
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (selection.inject) {
        selection.inject = false;
        return [selection.value, vi.fn()];
      }
      return actual.useState(initial);
    },
  };
});
vi.mock('@/lib/format', async (original) => {
  const actual =
    await original<typeof import('../../src/renderer/lib/format')>();
  return { ...actual, eur: vi.fn(actual.eur) };
});
vi.mock('@/components/ui/dialog', () => {
  const pass = ({ children }: { children: ReactNode }) => children;
  return Object.fromEntries(
    [
      'Dialog',
      'DialogContent',
      'DialogHeader',
      'DialogTitle',
      'DialogDescription',
      'DialogFooter',
    ].map((name) => [name, pass]),
  );
});
vi.mock('@/components/ui/sheet', () => {
  const pass = ({ children }: { children: ReactNode }) => children;
  return Object.fromEntries(
    [
      'Sheet',
      'SheetContent',
      'SheetHeader',
      'SheetTitle',
      'SheetDescription',
    ].map((name) => [name, pass]),
  );
});
afterEach(() => {
  selection.inject = false;
  vi.clearAllMocks();
});

it.each([
  'invoice',
  'credit_note',
  'expense',
  'passive_credit_note',
  'pending',
] as const)('shows the remote identifier in %s details', (type) => {
  selection.value = {
    companyId: '1',
    id: 'fic-908172',
    type,
    source: 'agyo',
    kind: type === 'pending' ? 'pending' : 'registered',
  };
  const document = {
    id: 'fic-908172',
    date: '2026-01-01',
    amountGross: '10.00',
    payments: [],
  };
  selection.inject = true;
  const markup = renderToStaticMarkup(
    createElement(FinancialDocuments, {
      snapshot: {
        source: 'fatture_in_cloud',
        company: { id: '1', name: 'Studio' },
        acquiredAt: '2026-01-01T00:00:00Z',
        issuedDocuments:
          type === 'invoice' || type === 'credit_note'
            ? [{ ...document, type }]
            : [],
        receivedDocuments:
          type === 'expense' || type === 'passive_credit_note'
            ? [{ ...document, type }]
            : [],
        pendingReceivedDocuments:
          type === 'pending' ? [{ ...document, source: 'agyo' }] : [],
      },
      year: 2026,
      today: '2026-01-01',
    }),
  );
  expect(markup).toContain('ID FIC');
  expect(markup).toContain('fic-908172');
});

it('refreshes open invoice details when the FIC payment changes', () => {
  selection.value = {
    companyId: '1',
    id: 'expense-1',
    kind: 'registered',
    type: 'expense',
  };
  const document: FicReceivedDocument = {
    id: 'expense-1',
    type: 'expense',
    date: '2026-01-01',
    amountGross: '100.00',
    payments: [{ amount: '100.00', status: 'not_paid' }],
  };
  const snapshot: FicFinancialSnapshot = {
    source: 'fatture_in_cloud',
    company: { id: '1', name: 'Studio' },
    acquiredAt: '2026-01-01T00:00:00Z',
    issuedDocuments: [],
    receivedDocuments: [document],
  };
  const render = (current: FicFinancialSnapshot) => {
    selection.inject = true;
    return renderToStaticMarkup(
      createElement(FinancialDocuments, {
        snapshot: current,
        year: 2026,
        today: '2026-10-04',
      }),
    );
  };
  expect(render(snapshot)).toContain('Da pagare');
  const next = structuredClone(snapshot);
  next.receivedDocuments[0]!.payments = [
    { amount: '100.00', status: 'paid', paidDate: '2026-10-04' },
  ];
  const updated = render(next);
  expect(updated).toContain('Pagata');
  expect(updated).toContain('04 ott 2026');
  expect(updated).not.toContain('Da pagare');
  expect(updated).not.toContain('not_paid');
  expect(render({ ...next, receivedDocuments: [] })).not.toContain('ID FIC');
  expect(
    render({ ...next, company: { id: '2', name: 'Altra azienda' } }),
  ).not.toContain('ID FIC');
});

it('keeps provider diagnostics visible inside the export dialog', () => {
  const quote: Quote = {
    ...meta(),
    date: '2026-01-01',
    snapshotRevision: 0,
    exportAttempts: [],
    items: [],
  };
  const markup = renderToStaticMarkup(
    createElement(ExportDialog, {
      quote,
      doc: createEmptyDocument(),
      results: [],
      onSearch: vi.fn(),
      onClose: vi.fn(),
      onExport: vi.fn(),
      error: {
        code: 'EXPORT_UNCERTAIN',
        message: 'Esito non verificabile.',
        action: 'Controlla Fatture in Cloud prima di ripetere.',
        details: ['HTTP 500: provider unavailable'],
      },
    }),
  );
  expect(markup).toContain('role="alert"');
  expect(markup).toContain('Esito non verificabile.');
  expect(markup).toContain('Controlla Fatture in Cloud prima di ripetere.');
  expect(markup).toContain('HTTP 500: provider unavailable');
});

it('passes the exact decimal annual cost total to currency formatting', () => {
  const doc = createEmptyDocument();
  doc.businessCosts = [
    {
      ...meta(),
      description: 'Primo costo',
      monthlyAmount: '0.10',
      category: 'Servizi',
    },
    {
      ...meta(),
      description: 'Secondo costo',
      monthlyAmount: '0.20',
      category: 'Servizi',
    },
  ];
  renderToStaticMarkup(
    createElement(ResourcesView, {
      doc,
      appState: new AppState(),
      requestDelete: vi.fn(),
    }),
  );
  expect(eur).toHaveBeenCalledWith('3.60');
});
