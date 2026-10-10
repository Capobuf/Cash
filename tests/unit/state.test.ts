import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  err,
  meta,
  ok,
  type CashDocument,
  type CashError,
} from '../../src/domain/model';
import type { ArchiveSession } from '../../src/shared/archive';
import { AppState, type ArchiveDecision } from '../../src/renderer/state';

const session = (document: CashDocument, revision = 1): ArchiveSession => ({
  path: 'C:\\Cash.data.json',
  document,
  readOnly: false,
  token: {
    documentId: document.documentId,
    revision,
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
      const save = vi.fn(async (_path: string, document: CashDocument) =>
        ok(session({ ...document, revision: 2 }, 2)),
      );
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
        if (choice === 'discard' || choice === 'recovery') {
          expect(save).not.toHaveBeenCalled();
          expect(restoreBackup).toHaveBeenCalledOnce();
          expect(state.document).toEqual(restored);
        } else {
          expect(restoreBackup).not.toHaveBeenCalled();
          expect(state.document).toEqual(local);
          await state.save();
          expect(save).toHaveBeenCalledOnce();
          expect(state.status).toBe('Salvato');
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

  it('persiste due mutazioni rapide in due revisioni senza accorparle', async () => {
    const save = vi.fn<Window['cash']['archive']['save']>(
      async (_path, document, token) => {
        expect(document.settings.fuelTerritory).toBe(
          token.revision === 1 ? 'Lazio' : 'Sicilia',
        );
        return ok(
          session(
            { ...document, revision: token.revision + 1 },
            token.revision + 1,
          ),
        );
      },
    );
    vi.stubGlobal('window', { cash: { archive: { save }, setDirty: vi.fn() } });
    try {
      const state = new AppState();
      state.acceptNativeSession(session(createEmptyDocument()));
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Lazio';
      });
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Sicilia';
      });
      // The mutations schedule saves themselves, without advancing a debounce timer.
      await Promise.resolve();
      expect(save).toHaveBeenCalledTimes(1);
      await state.save();
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls.map((call) => call[2])).toEqual([
        expect.objectContaining({ revision: 1 }),
        expect.objectContaining({ revision: 2 }),
      ]);
      expect(state.document?.revision).toBe(3);
      expect(state.document?.settings.fuelTerritory).toBe('Sicilia');
      expect(state.status).toBe('Salvato');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('waits for a mutation during save and stays dirty until the final revision', async () => {
    const completions: (() => void)[] = [];
    let active = 0;
    const save = vi.fn<Window['cash']['archive']['save']>(
      async (_path, document, token) => {
        active++;
        expect(active).toBe(1);
        await new Promise<void>((resolve) => {
          completions.push(resolve);
        });
        active--;
        return ok(
          session(
            { ...document, revision: token.revision + 1 },
            token.revision + 1,
          ),
        );
      },
    );
    const setDirty = vi.fn();
    vi.stubGlobal('window', { cash: { archive: { save }, setDirty } });
    try {
      const state = new AppState();
      state.acceptNativeSession(session(createEmptyDocument()));
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Lazio';
      });
      let completed = false;
      const saving = state.save().then(() => {
        completed = true;
      });
      await Promise.resolve();
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Sicilia';
      });
      setDirty.mockClear();
      expect(save).toHaveBeenCalledTimes(1);
      completions[0]!();
      await vi.runAllTimersAsync();
      expect(save).toHaveBeenCalledTimes(2);
      expect(
        save.mock.calls.map((call) => call[1].settings.fuelTerritory),
      ).toEqual(['Lazio', 'Sicilia']);
      expect(save.mock.calls[1]?.[2].revision).toBe(2);
      expect(completed).toBe(false);
      expect(setDirty).toHaveBeenCalledWith(true);
      expect(setDirty).not.toHaveBeenCalledWith(false);
      completions[1]!();
      await saving;
      expect(state.document?.settings.fuelTerritory).toBe('Sicilia');
      expect(state.session?.token.revision).toBe(3);
      expect(state.status).toBe('Salvato');
      expect(setDirty).toHaveBeenLastCalledWith(false);
      expect(active).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ferma la coda dopo un errore e riprova ogni snapshot con un save esplicito', async () => {
    const save = vi
      .fn<Window['cash']['archive']['save']>()
      .mockResolvedValueOnce(err({ code: 'IO', message: 'Disco pieno' }))
      .mockImplementation(async (_path, document, token) =>
        ok(
          session(
            { ...document, revision: token.revision + 1 },
            token.revision + 1,
          ),
        ),
      );
    const setDirty = vi.fn();
    vi.stubGlobal('window', { cash: { archive: { save }, setDirty } });
    try {
      const state = new AppState();
      state.acceptNativeSession(session(createEmptyDocument()));
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Lazio';
      });
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Sicilia';
      });
      await state.save();
      await vi.runAllTimersAsync();
      expect(save).toHaveBeenCalledOnce();
      expect(state.status).toBe('Errore di salvataggio');
      expect(state.document?.settings.fuelTerritory).toBe('Sicilia');
      expect(setDirty).toHaveBeenLastCalledWith(true);
      await state.save();
      expect(
        save.mock.calls.map((call) => call[1].settings.fuelTerritory),
      ).toEqual(['Lazio', 'Lazio', 'Sicilia']);
      expect(state.session?.token.revision).toBe(3);
      expect(state.status).toBe('Salvato');
      expect(setDirty).toHaveBeenLastCalledWith(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('blocca gli snapshot successivi dopo un conflitto senza perdere le modifiche locali', async () => {
    const save = vi
      .fn<Window['cash']['archive']['save']>()
      .mockResolvedValue(
        err({ code: 'CONFLICT', message: 'Archivio cambiato' }),
      );
    const setDirty = vi.fn();
    vi.stubGlobal('window', { cash: { archive: { save }, setDirty } });
    try {
      const state = new AppState();
      state.acceptNativeSession(session(createEmptyDocument()));
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Lazio';
      });
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Sicilia';
      });
      await state.save();
      await state.save();
      expect(save).toHaveBeenCalledOnce();
      expect(state.status).toBe('Conflitto esterno');
      expect(state.document?.settings.fuelTerritory).toBe('Sicilia');
      expect(
        state.mutate((document) => {
          document.settings.fuelTerritory = 'Veneto';
        }),
      ).toBe(false);
      expect(setDirty).toHaveBeenLastCalledWith(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([true, false])(
    'mantiene un conflitto esterno arrivato durante un save (successo: %s)',
    async (success) => {
      let complete!: (
        value: Awaited<ReturnType<Window['cash']['archive']['save']>>,
      ) => void;
      let externalChange!: (error: CashError) => void;
      const original = session(createEmptyDocument());
      const save = vi.fn<Window['cash']['archive']['save']>(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      const setDirty = vi.fn();
      vi.stubGlobal('window', {
        cash: {
          archive: { save, openLast: async () => ok(original) },
          onExternalChange: (callback: typeof externalChange) => {
            externalChange = callback;
          },
          onArchiveReloaded: vi.fn(),
          setDirty,
        },
      });
      try {
        const state = new AppState();
        await state.initialize();
        state.mutate((document) => {
          document.settings.fuelTerritory = 'Lazio';
        });
        state.mutate((document) => {
          document.settings.fuelTerritory = 'Sicilia';
        });
        const saving = state.save();
        await Promise.resolve();
        const conflict = {
          code: 'CONFLICT' as const,
          message: 'File modificato esternamente',
        };
        externalChange(conflict);
        complete(
          success
            ? ok(session({ ...save.mock.calls[0]![1], revision: 2 }, 2))
            : err({ code: 'IO', message: 'IPC interrotto' }),
        );
        await saving;
        await state.save();
        expect(save).toHaveBeenCalledOnce();
        expect(state.status).toBe('Conflitto esterno');
        expect(state.error).toEqual(conflict);
        expect(state.document?.settings.fuelTerritory).toBe('Sicilia');
        expect(setDirty).toHaveBeenLastCalledWith(true);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it('scarta gli snapshot del vecchio archivio e salva quello nuovo dopo il save in corso', async () => {
    let complete!: (
      value: Awaited<ReturnType<Window['cash']['archive']['save']>>,
    ) => void;
    const save = vi
      .fn<Window['cash']['archive']['save']>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      )
      .mockImplementation(async (_path, document, token) =>
        ok(
          session(
            { ...document, revision: token.revision + 1 },
            token.revision + 1,
          ),
        ),
      );
    vi.stubGlobal('window', { cash: { archive: { save }, setDirty: vi.fn() } });
    try {
      const state = new AppState();
      state.acceptNativeSession(session(createEmptyDocument()));
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Lazio';
      });
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Sicilia';
      });
      const saving = state.save();
      await Promise.resolve();
      const replacement = createEmptyDocument();
      state.acceptNativeSession(session(replacement));
      state.mutate((document) => {
        document.settings.fuelTerritory = 'Veneto';
      });
      expect(save).toHaveBeenCalledOnce();
      complete(ok(session(save.mock.calls[0]![1], 2)));
      await saving;
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls[1]?.[1].documentId).toBe(replacement.documentId);
      expect(save.mock.calls[1]?.[1].settings.fuelTerritory).toBe('Veneto');
      expect(save.mock.calls[1]?.[2].revision).toBe(1);
      expect(state.document?.documentId).toBe(replacement.documentId);
      expect(state.status).toBe('Salvato');
    } finally {
      vi.unstubAllGlobals();
    }
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
