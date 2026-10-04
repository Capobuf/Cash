import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { err, ok, type CashError } from '../../src/domain/model';
import { App } from '../../src/renderer/App';
import { state } from '../../src/renderer/state';

const effects = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useEffect: (effect: () => unknown) => effects.push(effect),
  };
});
vi.mock('@/hooks/use-app-state', () => ({
  useAppState: (appState: typeof state) => appState,
}));

beforeEach(() => {
  effects.length = 0;
  state.session = null;
  state.error = null;
  vi.spyOn(state, 'initialize').mockResolvedValue();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  state.error = null;
});

it.each(['VALIDATION', 'IO'] as const)(
  'shows preference failures received by FIC setup: %s',
  async (code) => {
    const failure: CashError = {
      code,
      field: 'preferences',
      message: 'Preferenze locali non leggibili.',
    };
    const setupInfo = vi.fn(async () => err(failure));
    vi.stubGlobal('window', {
      cash: {
        credentials: { hasFicToken: async () => ok(false) },
        fic: { setupInfo },
        onCloseRequested: vi.fn(),
      },
    });
    renderToStaticMarkup(createElement(App));
    const cleanup = effects[0]!();
    await Promise.resolve();
    expect(setupInfo).toHaveBeenCalledOnce();
    expect(state.error).toEqual(failure);
    const markup = renderToStaticMarkup(createElement(App));
    expect(markup).toContain(failure.message);
    if (typeof cleanup === 'function') cleanup();
  },
);
