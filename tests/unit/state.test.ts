import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  meta,
  ok,
  type CashDocument,
} from '../../src/domain/model';
import type { ArchiveSession } from '../../src/native/persistence';
import { AppState, type ArchiveDecision } from '../../src/renderer/state';

const session = (document: CashDocument, revision = 1): ArchiveSession => ({
  path: 'C:\\Cash.data.json',
  document,
  readOnly: false,
  token: {
    documentId: document.documentId,
    revision,
    fingerprint: `hash-${revision}`,
  },
});

describe('coordinatore autosalvataggio', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each(['cancel', 'recovery', 'discard', 'save'] as const)(
    'protegge il ripristino dirty con scelta %s senza sovrascrivere il backup',
    async (choice) => {
      let decide!: (choice: ArchiveDecision) => void;
      const decision = vi.fn(
        () =>
          new Promise<ArchiveDecision>((resolve) => {
            decide = resolve;
          }),
      );
      const restored = createEmptyDocument();
      const restoreBackup = vi.fn(async () => ok(session(restored)));
      const save = vi.fn();
      const saveRecovery = vi.fn(async () => ok('recovery.json'));
      vi.stubGlobal('window', {
        cash: {
          archive: { restoreBackup, save, saveRecovery },
          setDirty: vi.fn(),
        },
        setTimeout,
        clearTimeout,
      });
      try {
        const state = new AppState();
        state.acceptNativeSession(session(createEmptyDocument()));
        state.setArchiveDecisionHandler(decision);
        state.mutate((doc) => {
          doc.settings.fuelTerritory = 'Lazio';
        });
        const local = structuredClone(state.document);
        const restoring = state.restoreBackup();
        await vi.advanceTimersByTimeAsync(1000);
        expect(decision).toHaveBeenCalledWith(false);
        expect(save).not.toHaveBeenCalled();
        expect(restoreBackup).not.toHaveBeenCalled();
        expect(
          state.mutate((doc) => {
            doc.settings.fuelTerritory = 'Sicilia';
          }),
        ).toBe(false);
        decide(choice);
        await restoring;
        expect(save).not.toHaveBeenCalled();
        if (choice === 'discard' || choice === 'recovery') {
          expect(restoreBackup).toHaveBeenCalledOnce();
          expect(state.document).toEqual(restored);
        } else {
          expect(restoreBackup).not.toHaveBeenCalled();
          expect(state.document).toEqual(local);
        }
        if (choice === 'recovery')
          expect(saveRecovery).toHaveBeenCalledWith(local);
        else expect(saveRecovery).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it('ripristina un archivio salvato senza chiedere una scelta sulle modifiche', async () => {
    const restoreBackup = vi.fn(async () => ok(session(createEmptyDocument())));
    vi.stubGlobal('window', {
      cash: { archive: { restoreBackup }, setDirty: vi.fn() },
      setTimeout,
      clearTimeout,
    });
    try {
      const state = new AppState();
      state.acceptNativeSession(session(createEmptyDocument()));
      const decision = vi.fn();
      state.setArchiveDecisionHandler(decision);
      await state.restoreBackup();
      expect(decision).not.toHaveBeenCalled();
      expect(restoreBackup).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('non ripristina se la copia di recupero viene annullata', async () => {
    const restoreBackup = vi.fn();
    const saveRecovery = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'CANCELLED' as const, message: 'Annullato' },
    }));
    vi.stubGlobal('window', {
      cash: { archive: { restoreBackup, saveRecovery }, setDirty: vi.fn() },
      setTimeout,
      clearTimeout,
    });
    try {
      const state = new AppState();
      state.acceptNativeSession(session(createEmptyDocument()));
      state.mutate((doc) => {
        doc.settings.fuelTerritory = 'Lazio';
      });
      state.setArchiveDecisionHandler(async () => 'recovery');
      await state.restoreBackup();
      expect(saveRecovery).toHaveBeenCalledOnce();
      expect(restoreBackup).not.toHaveBeenCalled();
      expect(state.document?.settings.fuelTerritory).toBe('Lazio');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('mantiene dirty dopo un reject IPC e consente un nuovo salvataggio esplicito', async () => {
    const save = vi
      .fn<Window['cash']['archive']['save']>()
      .mockRejectedValueOnce(new Error('IPC interrotto'))
      .mockImplementationOnce(async (_path, document) =>
        ok(session({ ...document, revision: 2 }, 2)),
      );
    const setDirty = vi.fn();
    vi.stubGlobal('window', {
      cash: { archive: { save }, setDirty },
      setTimeout,
      clearTimeout,
    });
    try {
      const state = new AppState();
      state.acceptNativeSession(session(createEmptyDocument()));
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Lazio';
      });
      await expect(state.save()).resolves.toBeUndefined();
      expect(state.status).toBe('Errore di salvataggio');
      expect(state.error).toMatchObject({
        code: 'IO',
        details: ['Error: IPC interrotto'],
      });
      expect(state.document?.settings.fuelTerritory).toBe('Lazio');
      expect(setDirty).toHaveBeenLastCalledWith(true);
      await vi.runAllTimersAsync();
      expect(save).toHaveBeenCalledTimes(1);
      await state.save();
      expect(save).toHaveBeenCalledTimes(2);
      expect(state.status).toBe('Salvato');
      expect(state.document?.settings.fuelTerritory).toBe('Lazio');
      expect(state.error).toBeNull();
      expect(setDirty).toHaveBeenLastCalledWith(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('non applica un reject tardivo alla nuova sessione', async () => {
    let reject!: (cause: Error) => void;
    const save = vi.fn(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const setDirty = vi.fn();
    vi.stubGlobal('window', {
      cash: { archive: { save }, setDirty },
      setTimeout,
      clearTimeout,
    });
    try {
      const state = new AppState();
      state.acceptNativeSession(session(createEmptyDocument()));
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Lazio';
      });
      const saving = state.save();
      await Promise.resolve();
      const other = createEmptyDocument();
      state.acceptNativeSession(session(other));
      reject(new Error('Vecchio IPC interrotto'));
      await expect(saving).resolves.toBeUndefined();
      expect(state.document).toEqual(other);
      expect(state.status).toBe('Salvato');
      expect(state.error).toBeNull();
      expect(setDirty).toHaveBeenLastCalledWith(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('non perde una mutazione arrivata mentre un salvataggio è in corso', async () => {
    let completeFirst!: (value: ReturnType<typeof ok<ArchiveSession>>) => void;
    const first = new Promise<ReturnType<typeof ok<ArchiveSession>>>(
      (resolve) => {
        completeFirst = resolve;
      },
    );
    const save = vi
      .fn()
      .mockImplementationOnce(async (_path: string, document: CashDocument) =>
        first.then(() =>
          ok(session({ ...structuredClone(document), revision: 2 }, 2)),
        ),
      )
      .mockImplementationOnce(async (_path: string, document: CashDocument) =>
        ok(session({ ...structuredClone(document), revision: 3 }, 3)),
      );
    const cash = {
      archive: { save },
      setDirty: vi.fn(),
    } as unknown as Window['cash'];
    vi.stubGlobal('window', {
      cash,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      prompt: vi.fn(),
    });
    const appState = new AppState();
    appState.acceptNativeSession(session(createEmptyDocument()));
    appState.mutate((document) => {
      document.settings.fuelTerritory = 'Lazio';
    });
    const saving = appState.save();
    await Promise.resolve();
    await Promise.resolve();
    appState.mutate((document) => {
      document.settings.fuelTerritory = 'Sicilia';
    });
    vi.mocked(cash.setDirty).mockClear();
    completeFirst(ok(session(createEmptyDocument(), 2)));
    await saving;
    expect(cash.setDirty).toHaveBeenCalledWith(true);
    expect(cash.setDirty).not.toHaveBeenCalledWith(false);
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(2);
    expect(appState.document?.settings.fuelTerritory).toBe('Sicilia');
    expect(appState.session?.token.revision).toBe(3);
    expect(appState.status).toBe('Salvato');
    expect(cash.setDirty).toHaveBeenLastCalledWith(false);
    vi.unstubAllGlobals();
  });

  it('rifiuta una modifica non valida prima che raggiunga l’autosalvataggio', () => {
    const save = vi.fn();
    const cash = {
      archive: { save },
      setDirty: vi.fn(),
    } as unknown as Window['cash'];
    vi.stubGlobal('window', {
      cash,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      prompt: vi.fn(),
    });
    const appState = new AppState();
    appState.acceptNativeSession(session(createEmptyDocument()));
    appState.mutate((document) =>
      document.vehicles.push({
        ...meta(),
        name: '',
        fuel: 'Benzina',
        consumption: '16.67',
        consumptionUnit: 'km/l',
        annualKm: '10000',
        annualInsurance: '0.00',
        annualTax: '0.00',
        annualMaintenance: '0.00',
      }),
    );
    expect(appState.document?.vehicles).toHaveLength(0);
    expect(appState.error?.code).toBe('VALIDATION');
    expect(appState.error?.details).toContain(
      'Veicoli · 1 · nome: campo obbligatorio',
    );
    expect(save).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
