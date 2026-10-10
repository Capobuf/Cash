import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyDocument } from '../../src/domain/model';
import { AppState } from '../../src/renderer/state';
import { SettingsView } from '../../src/renderer/views/SettingsView';

const actions = vi.hoisted(() => new Map<string, (() => void) | undefined>());
vi.mock('@/components/ui/tabs', () => {
  const content = ({ children }: { children: ReactNode }) => children;
  return {
    Tabs: content,
    TabsContent: content,
    TabsList: content,
    TabsTrigger: content,
  };
});
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => {
    if (typeof children === 'string') actions.set(children, onClick);
    return children;
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  actions.clear();
});

it.each([true, false])(
  'riattiva con la configurazione esistente solo con token locale (%s)',
  (hasToken) => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      cash: { setDirty: vi.fn() },
      setTimeout,
      clearTimeout,
    });
    const doc = createEmptyDocument();
    doc.settings.fic = {
      enabled: true,
      company: { id: '1', name: 'Studio' },
      product: { id: '2', name: 'Consulenza' },
    };
    const original = structuredClone(doc.settings.fic);
    const state = new AppState();
    state.acceptNativeSession({
      path: 'Cash.json',
      document: doc,
      readOnly: false,
      token: {
        documentId: doc.documentId,
        revision: doc.revision,
      },
    });
    const render = () => {
      actions.clear();
      const document = state.document;
      if (!document) throw new Error('Archivio mancante');
      return renderToStaticMarkup(
        createElement(SettingsView, {
          doc: document,
          appState: state,
          tab: 'profiles',
          onTabChange: vi.fn(),
          ficUi: {
            hasToken,
            connectionError: false,
            setupInfo: { clientId: '', requiredScopes: [] },
            setSetupInfo: vi.fn(),
            setHasToken: vi.fn(),
            setConnectionError: vi.fn(),
          },
          onEditProfile: vi.fn(),
          onCopyProfile: vi.fn(),
          requestDelete: vi.fn(),
        }),
      );
    };
    render();
    actions.get('Disattiva')?.();
    expect(state.document?.settings.fic).toEqual({
      ...original,
      enabled: false,
    });
    const markup = render();
    if (hasToken) {
      expect(actions.has('Riattiva')).toBe(true);
      actions.get('Riattiva')?.();
      expect(state.document?.settings.fic).toEqual(original);
    } else {
      expect(actions.has('Riattiva')).toBe(false);
      expect(markup).toContain('Configura questa postazione');
    }
  },
);
