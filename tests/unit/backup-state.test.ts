import { afterEach, expect, it, vi } from 'vitest';
import { AppState } from '../../src/renderer/state';
import { toast } from '../../src/renderer/components/ui/toast';
import { createEmptyDocument, err, ok } from '../../src/domain/model';
import type { BackupState } from '../../src/shared/backup';
const empty: BackupState = {
  config: null,
  running: false,
  latest: null,
  entries: [],
  error: null,
  warning: null,
  nextAt: null,
  destinationMissing: false,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('notifies once for an unchanged persistent problem and keeps document save status independent', () => {
  const add = vi.spyOn(toast, 'add');
  const state = new AppState();
  state.status = 'Salvato';
  const backup = {
    ...empty,
    error: {
      code: 'IO' as const,
      source: 'backup' as const,
      message: 'Disco non disponibile.',
    },
  };
  state.acceptBackupState(backup);
  state.acceptBackupState(backup);
  expect(add).toHaveBeenCalledTimes(1);
  expect(state.status).toBe('Salvato');
  state.acceptBackupState(empty);
  state.acceptBackupState(backup);
  expect(add).toHaveBeenCalledTimes(2);
});
it('does not replace a newer pushed backup state with an older IPC response', async () => {
  const state = new AppState();
  let resolve!: (value: ReturnType<typeof ok<BackupState>>) => void;
  vi.stubGlobal('window', {
    cash: {
      backup: {
        getState: () =>
          new Promise((complete) => {
            resolve = complete;
          }),
      },
    },
  });
  const refreshing = state.refreshBackups();
  const newer = { ...empty, running: true, phase: 'snapshot' as const };
  state.acceptBackupState(newer);
  resolve(ok(empty));
  await refreshing;
  expect(state.backup).toEqual(newer);
});
it('uses the existing dirty decision and prevents edits during the native restore preview', async () => {
  const state = new AppState();
  const document = createEmptyDocument();
  state.session = {
    path: 'current.sqlite',
    document,
    token: { documentId: document.documentId, revision: document.revision },
    readOnly: false,
  };
  state.status = 'Errore di salvataggio';
  const decision = vi.fn().mockResolvedValue('cancel');
  state.setArchiveDecisionHandler(decision);
  let complete!: (value: ReturnType<typeof err>) => void;
  const restore = vi.fn(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  vi.stubGlobal('window', { cash: { backup: { restore }, setDirty: vi.fn() } });
  await state.restoreFromBackup();
  expect(decision).toHaveBeenCalledWith(true);
  expect(restore).not.toHaveBeenCalled();
  decision.mockResolvedValue('discard');
  const restoring = state.restoreFromBackup();
  await vi.waitFor(() => expect(restore).toHaveBeenCalledOnce());
  expect(
    state.mutate((doc) => {
      doc.settings.fuelTerritory = 'Lazio';
    }),
  ).toBe(false);
  complete(err({ code: 'CANCELLED', message: 'Annullato.' }));
  await restoring;
  expect(state.session.document!.settings.fuelTerritory).toBeUndefined();
  expect(state.archiveOperationPending).toBe(false);
});
