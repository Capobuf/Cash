import { isValidElement, type ReactNode, type ReactElement } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  ok,
  type CashDocument,
} from '../../src/domain/model';
import { SiteDialog } from '../../src/renderer/components/EntityDialogs';
import { SettingsView } from '../../src/renderer/views/SettingsView';
import { AppState } from '../../src/renderer/state';

const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values))
      hooks.values[index] = typeof initial === 'function' ? initial() : initial;
    return [
      hooks.values[index],
      (value: unknown) => {
        hooks.values[index] =
          typeof value === 'function' ? value(hooks.values[index]) : value;
      },
    ];
  },
}));
function find(
  node: ReactNode,
  predicate: (element: ReactElement<any>) => boolean,
): ReactElement<any> | undefined {
  if (Array.isArray(node))
    return node.map((child) => find(child, predicate)).find(Boolean);
  if (!isValidElement<any>(node)) return;
  if (predicate(node)) return node;
  return find(node.props.children, predicate);
}
function setup() {
  const document = createEmptyDocument();
  const state = new AppState();
  const session = (doc: CashDocument) => ({
    path: 'Cash.json',
    document: doc,
    readOnly: false,
    token: {
      documentId: doc.documentId,
      revision: doc.revision,
      fingerprint: 'hash',
    },
  });
  vi.stubGlobal('window', {
    cash: {
      setDirty: vi.fn(),
      archive: {
        save: vi.fn(
          async (
            _path: string,
            doc: CashDocument,
            token: { revision: number },
          ) => ok(session({ ...doc, revision: token.revision + 1 })),
        ),
      },
      ors: {
        reverseCoordinates: vi.fn(async () =>
          ok([
            {
              id: 'roma',
              label: 'Roma',
              coordinates: { latitude: '41.9028', longitude: '12.4964' },
            },
          ]),
        ),
      },
    },
    setTimeout,
    clearTimeout,
  });
  state.acceptNativeSession(session(document));
  return { state, document };
}
beforeEach(() => {
  hooks.cursor = 0;
  hooks.values = [];
  vi.stubGlobal(
    'FormData',
    class {
      get() {
        return 'Sede Roma';
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('site coordinate submission', () => {
  it.each([false, true])(
    'preserves entered coordinates with reverse geocoding %s',
    async (search) => {
      const { state, document } = setup();
      const render = () => {
        hooks.cursor = 0;
        return SiteDialog({
          open: true,
          onOpenChange: vi.fn(),
          appState: state,
          doc: document,
        });
      };
      let tree = render();
      find(tree, (e) => e.props.id === 'site-mode')!.props.onChange({
        target: { value: 'coordinates' },
      });
      tree = render();
      find(tree, (e) => e.props.id === 'site-coordinates')!.props.onChange({
        target: { value: '41.9028, 12.4964' },
      });
      tree = render();
      if (search) {
        find(tree, (e) => e.props.children === 'Cerca')!.props.onClick();
        await Promise.resolve();
        await Promise.resolve();
        tree = render();
      }
      find(tree, (e) => e.type === 'form')!.props.onSubmit({
        preventDefault() {},
        currentTarget: {},
      });
      await state.save();
      expect(state.document?.sites[0]?.location).toEqual({
        inputKind: 'coordinates',
        inputValue: '41.9028, 12.4964',
        coordinates: { latitude: '41.9028', longitude: '12.4964' },
      });
      expect(state.document?.sites[0]?.address).toBe(
        search ? 'Roma' : undefined,
      );
      expect(window.cash.ors.reverseCoordinates).toHaveBeenCalledTimes(
        search ? 1 : 0,
      );
    },
  );
  it('rejects invalid coordinates without adding a partial site', () => {
    const { state, document } = setup();
    hooks.values = ['coordinates', '', '91, 12'];
    const tree = SiteDialog({
      open: true,
      onOpenChange: vi.fn(),
      appState: state,
      doc: document,
    });
    find(tree, (e) => e.type === 'form')!.props.onSubmit({
      preventDefault() {},
      currentTarget: {},
    });
    expect(state.document?.sites).toEqual([]);
    expect(state.error?.code).toBe('VALIDATION');
  });
});

it('sets, changes and removes MIMIT territory without a redundant mutation', async () => {
  const { state } = setup();
  const mutate = vi.spyOn(state, 'mutate');
  const blur = (value: string) => {
    hooks.cursor = 0;
    const tree = SettingsView({
      doc: state.document!,
      appState: state,
      ficUi: {
        hasToken: false,
        connectionError: false,
        setupInfo: { clientId: '', requiredScopes: [] },
        setSetupInfo() {},
        setHasToken() {},
        setConnectionError() {},
      },
      onEditProfile() {},
      onCopyProfile() {},
      requestDelete() {},
    });
    find(tree, (e) => e.props.id === 'fuel-territory')!.props.onBlur({
      currentTarget: { value },
    });
  };
  blur(' Lazio ');
  await state.save();
  expect(state.document?.settings.fuelTerritory).toBe('Lazio');
  blur('Veneto');
  await state.save();
  expect(state.document?.settings.fuelTerritory).toBe('Veneto');
  blur('   ');
  await state.save();
  expect(state.document?.settings.fuelTerritory).toBeUndefined();
  blur('');
  expect(mutate).toHaveBeenCalledTimes(3);
});
