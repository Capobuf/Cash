import {
  createElement,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDocument, meta } from '../../src/domain/model';
import {
  VehicleDialog,
  SiteDialog,
} from '../../src/renderer/components/EntityDialogs';
import { AppState } from '../../src/renderer/state';

const form = vi.hoisted(() => ({
  submit: undefined as
    ((event: FormEvent<HTMLFormElement>) => void) | undefined,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => children,
  DialogContent: ({
    children,
  }: {
    children: ReactElement<{ onSubmit: typeof form.submit }>;
  }) => {
    form.submit = children.props.onSubmit;
    return null;
  },
  DialogHeader: () => null,
  DialogTitle: () => null,
  DialogDescription: () => null,
  DialogFooter: () => null,
}));

describe('salvataggio dal dialogo veicolo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      cash: { setDirty: vi.fn() },
    });
    vi.stubGlobal(
      'FormData',
      class {
        get(key: string) {
          const values: Record<string, string> = {
            name: 'Auto',
            fuel: 'Benzina',
            consumption: '20',
            annualKm: '10000',
            annualInsurance: '500',
            annualTax: '200',
            annualMaintenance: '300',
          };
          return values[key] ?? null;
        }
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('modifica una sede associata offline preservando il riferimento cliente', () => {
    const document = createEmptyDocument();
    const site = {
      ...meta(),
      name: 'Sede',
      address: 'Via Roma 1',
      client: {
        source: 'fatture_in_cloud' as const,
        companyId: '1',
        clientId: '2',
        displayName: 'Cliente storico',
      },
    };
    document.sites.push(site);
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
    const onOpenChange = vi.fn();
    renderToStaticMarkup(
      createElement(SiteDialog, {
        open: true,
        appState: state,
        doc: document,
        site,
        onOpenChange,
      }),
    );
    form.submit!({
      preventDefault: vi.fn(),
      currentTarget: {},
    } as unknown as FormEvent<HTMLFormElement>);
    expect(state.document?.sites[0]).toMatchObject({
      name: 'Auto',
      client: site.client,
      address: site.address,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('salva una sede con il solo nome senza inventare indirizzo o coordinate', () => {
    const document = createEmptyDocument();
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
    const onOpenChange = vi.fn();
    renderToStaticMarkup(
      createElement(SiteDialog, {
        open: true,
        appState: state,
        doc: document,
        onOpenChange,
      }),
    );
    form.submit!({
      preventDefault: vi.fn(),
      currentTarget: {},
    } as unknown as FormEvent<HTMLFormElement>);
    expect(state.document?.sites).toHaveLength(1);
    expect(state.document?.sites[0]?.name).toBe('Auto');
    expect(state.document?.sites[0]?.address).toBeUndefined();
    expect(state.document?.sites[0]?.location).toBeUndefined();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([true, false])(
    'con archivio in sola lettura %s chiude solo dopo una modifica accettata',
    (readOnly) => {
      const document = createEmptyDocument();
      const state = new AppState();
      state.acceptNativeSession({
        path: 'Cash.json',
        document,
        readOnly,
        token: {
          documentId: document.documentId,
          revision: document.revision,
          fingerprint: 'hash',
        },
      });
      const onSaved = vi.fn();
      const onOpenChange = vi.fn();
      renderToStaticMarkup(
        createElement(VehicleDialog, {
          open: true,
          appState: state,
          onSaved,
          onOpenChange,
        }),
      );
      form.submit!({
        preventDefault: vi.fn(),
        currentTarget: {},
      } as unknown as FormEvent<HTMLFormElement>);
      if (readOnly) {
        expect(onSaved).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(state.document?.vehicles).toEqual([]);
      } else {
        expect(onSaved).toHaveBeenCalledWith(state.document?.vehicles[0]?.id);
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(state.document?.vehicles[0]?.name).toBe('Auto');
      }
    },
  );
});
