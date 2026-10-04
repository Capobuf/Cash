import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  createFiscalPreset2026,
  meta,
} from '../../src/domain/model';
import { snapshotProfile, refreshQuote } from '../../src/domain/refresh';
import { calculateQuote } from '../../src/domain/calculations';
import { AppState } from '../../src/renderer/state';
import { App } from '../../src/renderer/App';
import type { DeleteTarget } from '../../src/renderer/types';

const harness = vi.hoisted(() => ({
  state: undefined as AppState | undefined,
  target: undefined as DeleteTarget | undefined,
  nullStates: 0,
  confirm: undefined as (() => void) | undefined,
}));
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useState: (initial: unknown) => {
      // App owns the first null state (archive decisions); the workspace owns deletion.
      if (initial === null && ++harness.nullStates === 2) {
        return [harness.target, vi.fn()];
      }
      return react.useState(initial);
    },
  };
});
vi.mock('@/hooks/use-app-state', () => ({ useAppState: () => harness.state }));
vi.mock('@/components/Layout', () => ({
  AppShell: () => null,
  Onboarding: () => null,
  DeleteDialog: ({ onConfirm }: { onConfirm: () => void }) => {
    harness.confirm = onConfirm;
    return null;
  },
}));

it('elimina il profilo sorgente conservando calcoli storici e diagnosi di aggiornamento', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', {
    cash: { setDirty: vi.fn() },
    setTimeout,
    clearTimeout,
  });
  try {
    const doc = createEmptyDocument();
    const profile = createFiscalPreset2026();
    Object.assign(profile, { confirmed: true, revenueTarget: '50000.00' });
    doc.profiles.push(profile);
    const snapshot = snapshotProfile(profile, []);
    if (!snapshot.ok) throw new Error(snapshot.error.message);
    doc.quotes.push({
      ...meta(),
      date: '2026-10-02',
      profileId: profile.id,
      profileSnapshot: snapshot.value,
      snapshotRevision: 0,
      exportAttempts: [],
      items: [
        {
          ...meta(),
          name: 'Lavoro',
          chosenPrice: '100.00',
          subItems: [
            { ...meta(), kind: 'time', description: 'Analisi', minutes: 60 },
          ],
          variantGroups: [],
          variantSelections: [],
        },
      ],
    });
    const state = new AppState();
    state.acceptNativeSession({
      path: 'Cash.json',
      document: doc,
      readOnly: false,
      token: {
        documentId: doc.documentId,
        revision: doc.revision,
        fingerprint: 'hash',
      },
    });
    harness.state = state;
    harness.target = { kind: 'profile', id: profile.id, label: 'Profilo' };
    harness.nullStates = 0;
    const before = structuredClone(doc.quotes);
    renderToStaticMarkup(createElement(App));
    expect(harness.confirm).toBeDefined();
    harness.confirm?.();
    expect(state.document?.profiles).toEqual([]);
    expect(state.document?.quotes).toEqual(before);
    const quote = state.document?.quotes[0];
    if (!quote?.profileSnapshot) throw new Error('Snapshot mancante');
    expect(
      calculateQuote(quote.items, quote.profileSnapshot.hourlyTarget),
    ).toMatchObject({ blockers: [], chosenTotal: '100.00', minutes: 60 });
    const unused = vi.fn();
    expect(
      await refreshQuote(quote, {
        profileById: () => undefined,
        costs: [],
        vehicleById: unused,
        fuel: unused,
        foi: unused,
      }),
    ).toMatchObject({
      ok: false,
      error: {
        field: 'profileId',
        message: 'Il profilo di origine non esiste più.',
      },
    });
    expect(unused).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
