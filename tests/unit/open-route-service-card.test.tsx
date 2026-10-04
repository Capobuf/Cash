import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { err, ok } from '../../src/domain/model';
import { OpenRouteServiceCard } from '../../src/renderer/components/integrations/OpenRouteServiceCard';
import { AppState } from '../../src/renderer/state';

const hooks = vi.hoisted(() => ({
  active: false,
  index: 0,
  values: [] as unknown[],
  effects: [] as Array<() => void | (() => void)>,
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      if (hooks.active) hooks.effects.push(effect);
    },
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

afterEach(() => {
  hooks.active = false;
  hooks.values = [];
  hooks.effects = [];
  vi.unstubAllGlobals();
});

interface ControlProps {
  children?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  id?: string;
  onChange?: (event: { target: { value: string } }) => void;
  value?: string;
}

function findProps(
  node: ReactNode,
  match: (props: ControlProps) => boolean,
): ControlProps | undefined {
  if (Array.isArray(node))
    return node.map((child) => findProps(child, match)).find(Boolean);
  if (!isValidElement<ControlProps>(node)) return undefined;
  return match(node.props) ? node.props : findProps(node.props.children, match);
}

function renderCard(appState: AppState) {
  let tree: ReactNode;
  function Harness() {
    hooks.index = 0;
    hooks.active = true;
    try {
      tree = OpenRouteServiceCard({ appState });
    } finally {
      hooks.active = false;
    }
    return tree;
  }
  return {
    markup: renderToStaticMarkup(createElement(Harness)),
    verifyButton: findProps(
      tree,
      (props) =>
        typeof props.disabled === 'boolean' &&
        typeof props.onClick === 'function',
    )!,
    keyInput: findProps(tree, (props) => props.id === 'ors-key')!,
  };
}

it.each([true, false])(
  'distingue presenza e assenza della chiave dopo una lettura riuscita (%s)',
  async (present) => {
    const hasApiKey = vi.fn(async () => ok(present));
    const verify = vi.fn(async () => ok(undefined));
    vi.stubGlobal('window', { cash: { ors: { hasApiKey, verify } } });
    const state = new AppState();
    const initial = renderCard(state);
    expect(initial.markup).toContain('Verifica credenziali…');
    expect(initial.markup).not.toContain('Da configurare');
    expect(initial.verifyButton.disabled).toBe(true);
    hooks.effects[0]!();
    await vi.waitFor(() => expect(hooks.values[1]).toBe(present));
    const ready = renderCard(state);
    expect(ready.markup).toContain(
      present ? 'Chiave presente' : 'Da configurare',
    );
    expect(ready.markup).not.toContain('Non verificabile');
    expect(ready.verifyButton.disabled).toBe(!present);
    expect(hasApiKey).toHaveBeenCalledOnce();
    expect(state.error).toBeNull();
    expect(verify).not.toHaveBeenCalled();
    if (present) {
      ready.verifyButton.onClick!();
      await vi.waitFor(() => expect(hooks.values[3]).toBe(false));
      expect(verify).toHaveBeenCalledOnce();
      expect(renderCard(state).markup).toContain('Verificata');
    }
  },
);

it('mostra una lettura credenziali fallita senza inventare una chiave assente e permette di sostituirla', async () => {
  const error = {
    code: 'CREDENTIALS' as const,
    message: 'Gestore credenziali non accessibile.',
  };
  const hasApiKey = vi.fn(async () => err(error));
  const setApiKey = vi.fn(async () => ok(undefined));
  const verify = vi.fn(async () => ok(undefined));
  vi.stubGlobal('window', {
    cash: { ors: { hasApiKey, setApiKey, verify } },
  });
  const state = new AppState();
  renderCard(state);
  hooks.effects[0]!();
  await vi.waitFor(() => expect(state.error).toEqual(error));
  const failed = renderCard(state);
  expect(failed.markup).toContain('Non verificabile');
  expect(failed.markup).toContain(error.message);
  expect(failed.markup).not.toContain('Da configurare');
  expect(failed.markup).not.toContain('Chiave presente');
  expect(failed.verifyButton.disabled).toBe(true);
  expect(verify).not.toHaveBeenCalled();
  failed.keyInput.onChange!({ target: { value: 'nuova-chiave' } });
  const replacement = renderCard(state);
  expect(replacement.verifyButton.disabled).toBe(false);
  replacement.verifyButton.onClick!();
  await vi.waitFor(() => expect(hooks.values[3]).toBe(false));
  expect(setApiKey).toHaveBeenCalledWith('nuova-chiave');
  expect(verify).toHaveBeenCalledOnce();
  const recovered = renderCard(state);
  expect(recovered.markup).toContain('Verificata');
  expect(recovered.markup).not.toContain('Non verificabile');
  expect(recovered.keyInput.value).toBe('');
});

it('ignora il risultato della lettura quando la card è già stata smontata', async () => {
  let resolve!: (result: ReturnType<typeof err>) => void;
  const hasApiKey = vi.fn(
    () => new Promise<ReturnType<typeof err>>((done) => (resolve = done)),
  );
  vi.stubGlobal('window', { cash: { ors: { hasApiKey } } });
  const state = new AppState();
  renderCard(state);
  const cleanup = hooks.effects[0]!();
  expect(typeof cleanup).toBe('function');
  if (cleanup) cleanup();
  resolve(err({ code: 'CREDENTIALS', message: 'Errore tardivo' }));
  await Promise.resolve();
  expect(state.error).toBeNull();
  expect(hooks.values[1]).toBeUndefined();
  expect(hooks.values[2]).toBe(false);
});
