import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyDocument, err, ok } from '../../src/domain/model';
import { FicWizard } from '../../src/renderer/components/integrations/FicWizard';
import { AppState } from '../../src/renderer/state';

const hooks = vi.hoisted(() => ({
  active: false,
  index: 0,
  values: [] as unknown[],
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.index++;
      if (!(index in hooks.values))
        hooks.values[index] =
          typeof initial === 'function' ? initial() : initial;
      return [
        hooks.values[index],
        (value: unknown) => {
          hooks.values[index] =
            typeof value === 'function' ? value(hooks.values[index]) : value;
        },
      ];
    },
  };
});
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
  hooks.values = [];
  vi.unstubAllGlobals();
});

function findProps(
  node: ReactNode,
  match: (props: Record<string, any>) => boolean,
): Record<string, any> | undefined {
  if (Array.isArray(node))
    return node.map((child) => findProps(child, match)).find(Boolean);
  if (!isValidElement<Record<string, any>>(node)) return undefined;
  return match(node.props) ? node.props : findProps(node.props.children, match);
}

function renderWizard(appState = new AppState()) {
  let tree: ReactNode;
  function Harness() {
    hooks.index = 0;
    hooks.active = true;
    try {
      tree = FicWizard({
        open: true,
        onOpenChange: vi.fn(),
        appState,
        ficUi: {
          hasToken: true,
          connectionError: false,
          setupInfo: { clientId: 'client', requiredScopes: [] },
          setSetupInfo: vi.fn(),
          setHasToken: vi.fn(),
          setConnectionError: vi.fn(),
        },
      });
    } finally {
      hooks.active = false;
    }
    return tree;
  }
  const markup = renderToStaticMarkup(createElement(Harness));
  return {
    markup,
    next: findProps(
      tree,
      (props) =>
        typeof props.disabled === 'boolean' &&
        typeof props.onClick === 'function',
    )!,
    choice: findProps(tree, (props) => Array.isArray(props.entries)),
  };
}

it.each([true, false])(
  'shows verification before committing and blocks errors (%s)',
  async (success) => {
    const preview = {
      company: { id: 'A', name: 'Studio' },
      product: { id: 'P', name: 'Consulenza' },
      taxProfile: {
        acquiredAt: '2026-10-02T10:00:00Z',
        regime: 'forfettario_5',
        profitCoefficient: '78',
        contributionsPercentage: '26.07',
      },
    };
    hooks.values = [
      5,
      'token',
      [preview.company],
      'A',
      [preview.product],
      'P',
      false,
      'client',
    ];
    const previewActivation = vi.fn(async () =>
      success
        ? ok(preview)
        : err({ code: 'CREDENTIALS' as const, message: 'Permessi mancanti' }),
    );
    const completeActivation = vi.fn(async () =>
      err({ code: 'IO' as const, message: 'Simulated commit failure' }),
    );
    vi.stubGlobal('window', {
      cash: { fic: { previewActivation, completeActivation } },
    });
    const state = new AppState();
    const doc = createEmptyDocument();
    state.session = {
      path: 'Cash.json',
      document: doc,
      readOnly: false,
      token: { documentId: doc.documentId, revision: 1 },
    };
    state.status = 'Salvato';
    const save = vi.spyOn(state, 'save').mockResolvedValue();
    renderWizard(state).next.onClick();
    await vi.waitFor(() => expect(hooks.values[6]).toBe(false));
    expect(previewActivation).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
    expect(completeActivation).not.toHaveBeenCalled();
    if (!success) {
      expect(hooks.values[0]).toBe(5);
      expect(state.error?.message).toBe('Permessi mancanti');
      return;
    }
    const view = renderWizard(state);
    expect(view.markup).toContain('Forfettario 5%');
    expect(view.markup).toContain('78%');
    expect(view.markup).toContain('26.07%');
    expect(view.markup).toContain(
      'Permessi azienda, fiscalità e prodotto verificati',
    );
    view.next.onClick();
    expect(completeActivation).not.toHaveBeenCalled();
    renderWizard(state).next.onClick();
    await vi.waitFor(() => expect(completeActivation).toHaveBeenCalledOnce());
    expect(completeActivation).toHaveBeenCalledWith(
      expect.objectContaining({ preview }),
    );
  },
);

it.each([0, 1, 2])(
  'requires explicit company and ambiguous product selection (%s products)',
  async (count) => {
    hooks.values = [3, 'token'];
    const products = Array.from({ length: count }, (_, index) => ({
      id: String(index),
      name: 'Consulenza',
    }));
    vi.stubGlobal('window', {
      cash: {
        fic: {
          listCompaniesForActivation: vi.fn(async () =>
            ok([
              { id: 'A', name: 'A' },
              { id: 'B', name: 'B' },
            ]),
          ),
          listProductsForActivation: vi.fn(async () => ok(products)),
        },
      },
    });
    renderWizard().next.onClick();
    await vi.waitFor(() => expect(hooks.values[0]).toBe(4));
    let view = renderWizard();
    expect(view.choice!.value).toBe('');
    expect(view.next.disabled).toBe(true);
    view.choice!.onChange('B');
    view = renderWizard();
    expect(view.next.disabled).toBe(false);
    view.next.onClick();
    await vi.waitFor(() => expect(hooks.values[0]).toBe(5));
    view = renderWizard();
    expect(view.choice!.value).toBe(count === 1 ? '0' : '');
    expect(view.next.disabled).toBe(count !== 1);
    if (count > 1) {
      view.choice!.onChange('1');
      expect(renderWizard().next.disabled).toBe(false);
    }
  },
);
