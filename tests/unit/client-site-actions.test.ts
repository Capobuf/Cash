import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyDocument, meta } from '../../src/domain/model';
import { AppState } from '../../src/renderer/state';
import { ClientDetailsDialog } from '../../src/renderer/views/ClientsView';

const actions = vi.hoisted(() => new Map<string, () => void>());
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => children,
  DialogContent: ({ children }: { children: ReactNode }) => children,
  DialogHeader: () => null,
  DialogTitle: () => null,
  DialogDescription: () => null,
  DialogFooter: () => null,
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => children,
  DropdownMenuTrigger: () => null,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: string;
    onClick: () => void;
  }) => {
    actions.set(children, onClick);
    return null;
  },
}));

beforeEach(() => {
  actions.clear();
  vi.useFakeTimers();
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    cash: { setDirty: vi.fn() },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('imposta la partenza dalla scheda cliente senza aprire o modificare la sede', () => {
  const document = createEmptyDocument();
  const client = {
    source: 'fatture_in_cloud' as const,
    companyId: '1',
    clientId: '2',
    displayName: 'Cliente',
  };
  const site = {
    ...meta(),
    name: 'Sede cliente',
    address: 'Roma',
    client,
    location: {
      inputKind: 'coordinates' as const,
      inputValue: '41.9028, 12.4964',
      coordinates: { latitude: '41.9028', longitude: '12.4964' },
    },
  };
  const previous = { ...meta(), name: 'Ufficio', address: 'Milano' };
  document.sites.push(previous, site);
  document.settings.defaultDepartureSiteId = previous.id;
  const state = new AppState();
  state.acceptNativeSession({
    path: 'Cash.json',
    document,
    readOnly: false,
    token: {
      documentId: document.documentId,
      revision: document.revision,
      fingerprint: 'hash',
    },
  });
  const onEditSite = vi.fn();
  const onClose = vi.fn();
  const markup = renderToStaticMarkup(
    createElement(ClientDetailsDialog, {
      appState: state,
      doc: document,
      client,
      details: { ...client, fields: [] },
      loading: false,
      onClose,
      onAddSite: vi.fn(),
      onEditSite,
      requestDelete: vi.fn(),
    }),
  );
  expect(markup).toContain('41.9028, 12.4964');
  expect(markup).not.toContain('12.4964, 41.9028');
  actions.get('Imposta come partenza predefinita')!();
  expect(state.document?.settings.defaultDepartureSiteId).toBe(site.id);
  expect(state.document?.sites).toEqual(document.sites);
  expect(onEditSite).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  actions.get('Modifica')!();
  expect(onEditSite).toHaveBeenCalledWith(client, site);

  state.mutate((current) => {
    current.settings.defaultDepartureSiteId = previous.id;
    current.sites = [previous];
  });
  actions.get('Imposta come partenza predefinita')!();
  expect(state.document?.settings.defaultDepartureSiteId).toBe(previous.id);
  expect(state.error?.code).toBe('VALIDATION');
});
