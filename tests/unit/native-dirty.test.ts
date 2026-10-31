import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import {
  createEmptyDocument,
  meta,
  ok,
  type CashDocument,
} from '../../src/domain/model';
import { createPendingAttempt } from '../../src/domain/export';
import type { ArchiveSession } from '../../src/shared/archive';
import { IPC } from '../../src/shared/ipc';

const native = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  events: new Map<string, (...args: any[]) => void>(),
  windowEvents: new Map<string, (...args: any[]) => void>(),
  send: vi.fn(),
  openArchive: vi.fn(),
  previewMigration: vi.fn(),
  importJsonArchive: vi.fn(),
  showMessageBox: vi.fn(),
  saveArchive: vi.fn(),
  restoreBackup: vi.fn(),
  inspectArchive: vi.fn(),
  readPreferences: vi.fn(),
  rememberArchive: vi.fn(),
  setFicClientId: vi.fn(),
  createArchive: vi.fn(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  requireFicToken: vi.fn(),
  backupRunning: false,
  backupFinish: vi.fn(),
  backupCheck: vi.fn(),
  closeWindow: vi.fn(),
  backupStage: vi.fn(),
  backupRelease: vi.fn(),
  restoreArchiveCopy: vi.fn(),
  existsSync: vi.fn(),
}));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: native.existsSync,
}));
vi.mock('../../src/native/backups', () => ({
  BackupManager: class {
    get running() {
      return native.backupRunning;
    }
    get busy() {
      return native.backupRunning;
    }
    check = native.backupCheck;
    finish = native.backupFinish;
    stageRestore = native.backupStage;
    releaseRestore = native.backupRelease;
  },
}));
vi.mock('electron', () => ({
  powerMonitor: { on: vi.fn() },
  app: {
    requestSingleInstanceLock: () => true,
    setAppUserModelId: vi.fn(),
    getPath: () => 'C:/Cash',
    whenReady: () => Promise.resolve(),
    on: vi.fn(),
    quit: vi.fn(),
  },
  ipcMain: {
    handle: (name: string, callback: (...args: any[]) => any) =>
      native.handlers.set(name, callback),
    on: (name: string, callback: (...args: any[]) => void) =>
      native.events.set(name, callback),
  },
  dialog: {
    showMessageBox: native.showMessageBox,
    showOpenDialog: native.showOpenDialog,
    showSaveDialog: native.showSaveDialog,
  },
  BrowserWindow: class {
    webContents = { send: native.send };
    removeMenu() {}
    once() {}
    async loadFile() {}
    isDestroyed() {
      return false;
    }
    isVisible() {
      return true;
    }
    on(name: string, callback: (...args: any[]) => void) {
      native.windowEvents.set(name, callback);
    }
    close() {
      native.closeWindow();
      native.windowEvents.get('close')?.({ preventDefault: vi.fn() });
    }
  },
}));
vi.mock('../../src/native/persistence', () => ({
  archiveStorage: {
    open: native.openArchive,
    save: native.saveArchive,
    create: native.createArchive,
    inspect: native.inspectArchive,
    importJson: native.importJsonArchive,
    close: vi.fn(),
    restore: native.restoreBackup,
    recovery: vi.fn(),
  },
  closeAllArchives: vi.fn(),
  waitForArchiveSaves: vi.fn(async () => {}),
  restoreArchiveCopy: native.restoreArchiveCopy,
}));
vi.mock('../../src/native/legacy-import', () => ({
  previewMigration: native.previewMigration,
}));
vi.mock('../../src/native/sqlite-smoke', () => ({ runSqliteSmoke: vi.fn() }));
vi.mock('../../src/native/updates', () => ({
  initializeCashUpdates: vi.fn(),
  checkCashUpdates: vi.fn(),
  downloadCashUpdate: vi.fn(),
  getCashUpdateStatus: vi.fn(),
  installCashUpdate: vi.fn(),
}));
vi.mock('../../src/native/bank-expense-import', () => ({
  readBankExpenseFile: vi.fn(),
}));
vi.mock('../../src/native/preferences', () => ({
  readPreferences: native.readPreferences,
  rememberArchive: native.rememberArchive,
  setFicClientId: native.setFicClientId,
}));
vi.mock('../../src/native/credentials', () => ({
  deleteFicToken: vi.fn(),
  hasFicToken: vi.fn(),
  hasOrsApiKey: vi.fn(),
  requireFicToken: native.requireFicToken,
  requireOrsApiKey: vi.fn(),
  setFicToken: vi.fn(),
  setOrsApiKey: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  native.existsSync.mockReturnValue(false);
  vi.useFakeTimers();
  native.backupRunning = false;
  native.backupCheck.mockResolvedValue(undefined);
  native.backupFinish.mockImplementation(async () => {
    native.backupRunning = false;
  });
  native.handlers.clear();
  native.events.clear();
  native.windowEvents.clear();
  native.readPreferences.mockResolvedValue(
    ok({ lastArchivePath: 'Cash.sqlite' }),
  );
  native.rememberArchive.mockResolvedValue(ok(undefined));
  native.setFicClientId.mockResolvedValue(ok(undefined));
  native.showSaveDialog.mockResolvedValue({
    canceled: false,
    filePath: 'C:/Cash/imported.sqlite',
  });
  vi.stubGlobal('__dirname', 'C:/Cash/dist/native');
});

it.each(['VALIDATION', 'IO'] as const)(
  'propagates preference read failures through startup and FIC setup: %s',
  async (code) => {
    const failure = {
      ok: false,
      error: {
        code,
        field: 'preferences',
        message: 'Preferenze non leggibili.',
      },
    };
    native.readPreferences.mockResolvedValue(failure);
    await import('../../src/native/main');
    expect(await native.handlers.get(IPC.archiveOpenLast)!()).toEqual(failure);
    expect(await native.handlers.get(IPC.ficSetupInfo)!()).toEqual(failure);
    expect(native.openArchive).not.toHaveBeenCalled();
    expect(native.rememberArchive).not.toHaveBeenCalled();
  },
);

it('returns successful FIC setup and exposes preference update errors', async () => {
  native.readPreferences.mockResolvedValue(ok({ ficClientId: ' client ' }));
  const failure = {
    ok: false,
    error: {
      code: 'VALIDATION',
      field: 'preferences',
      message: 'Preferenze corrotte.',
    },
  };
  native.setFicClientId.mockResolvedValue(failure);
  await import('../../src/native/main');
  expect(await native.handlers.get(IPC.ficSetupInfo)!()).toMatchObject({
    ok: true,
    value: { clientId: 'client', requiredScopes: expect.any(Array) },
  });
  expect(await native.handlers.get(IPC.ficSetClientId)!({}, ' nuovo ')).toEqual(
    failure,
  );
  expect(native.setFicClientId).toHaveBeenCalledWith('nuovo');
});

it.each(['open', 'create', 'migrate'] as const)(
  'does not replace the active archive if preferences cannot be updated during %s',
  async (operation) => {
    const document = createEmptyDocument();
    const previous: ArchiveSession = {
      path: 'Cash.sqlite',
      document,
      readOnly: false,
      token: {
        documentId: document.documentId,
        revision: document.revision,
      },
    };
    const next = { ...previous, path: 'New.sqlite' };
    native.openArchive.mockResolvedValue(ok(previous));
    await import('../../src/native/main');
    await native.handlers.get(IPC.archiveOpenLast)!();
    const failure = {
      ok: false,
      error: {
        code: 'IO',
        field: 'preferences',
        message: 'Salvataggio preferenze non riuscito.',
      },
    };
    native.rememberArchive.mockResolvedValue(failure);
    native.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [next.path],
    });
    native.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: next.path,
    });
    native.createArchive.mockResolvedValue(ok(next));
    if (operation === 'migrate') {
      native.openArchive.mockResolvedValue({
        ok: false,
        error: { code: 'MIGRATION_REQUIRED', message: 'Legacy' },
      });
      native.previewMigration.mockResolvedValue(
        ok({
          fromVersion: 9,
          toVersion: 11,
          changes: ['Schema'],
          blockers: [],
          backupPath: 'New.backup.json',
        }),
      );
      native.showMessageBox.mockResolvedValue({ response: 1 });
      native.importJsonArchive.mockResolvedValue(ok(next));
    } else native.openArchive.mockResolvedValue(ok(next));
    const result =
      operation === 'create'
        ? await native.handlers.get(IPC.archiveCreate)!({}, document)
        : await native.handlers.get(IPC.archiveOpen)!();
    expect(result).toEqual(failure);
    native.inspectArchive.mockResolvedValue(ok({}));
    expect(
      (await native.handlers.get(IPC.archiveInspect)!({}, previous.path)).ok,
    ).toBe(true);
    expect(
      (await native.handlers.get(IPC.archiveInspect)!({}, next.path)).ok,
    ).toBe(false);
  },
);
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([0, 1, 2])(
  'handles close choice %s during backup and still protects dirty changes',
  async (response) => {
    await import('../../src/native/main');
    await Promise.resolve();
    native.backupRunning = true;
    native.events.get(IPC.appDirty)!({}, true);
    native.showMessageBox.mockResolvedValue({ response });
    const preventDefault = vi.fn();
    native.windowEvents.get('close')!({ preventDefault });
    native.windowEvents.get('close')!({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(native.showMessageBox).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      response === 2
        ? expect(native.backupFinish).not.toHaveBeenCalled()
        : expect(native.closeWindow).toHaveBeenCalledOnce(),
    );
    if (response === 2)
      expect(native.send).not.toHaveBeenCalledWith(IPC.appCloseRequested);
    else {
      expect(native.backupFinish).toHaveBeenCalledWith(response === 1);
      expect(native.send).toHaveBeenCalledWith(IPC.appCloseRequested);
    }
  },
);
it('refuses update installation while a backup is active', async () => {
  await import('../../src/native/main');
  native.backupRunning = true;
  expect(await native.handlers.get(IPC.updateInstall)!()).toMatchObject({
    ok: false,
    error: { code: 'CONFLICT', message: expect.stringContaining('backup') },
  });
});

it.each(['cancel', 'invalid', 'success'] as const)(
  'preserves the current native session until restore %s and releases staging',
  async (outcome) => {
    const document = createEmptyDocument();
    const original: ArchiveSession = {
      path: 'current.sqlite',
      document,
      token: { documentId: document.documentId, revision: 1 },
      readOnly: false,
    };
    const restored = { ...original, path: join('C:/Cash', 'Cash.sqlite') };
    native.openArchive.mockResolvedValue(ok(original));
    native.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['selected-backup.sqlite'],
    });
    native.showMessageBox.mockResolvedValue({
      response: outcome === 'cancel' ? 0 : 1,
    });
    native.backupStage.mockResolvedValue(
      outcome === 'invalid'
        ? {
            ok: false,
            error: { code: 'SCHEMA_NEWER', message: 'Aggiorna Cash.' },
          }
        : ok({
            path: 'private-staging.sqlite',
            inspection: { header: document, storageVersion: 2, size: 4096 },
          }),
    );
    native.backupRelease.mockResolvedValue(undefined);
    native.restoreArchiveCopy.mockResolvedValue(ok(restored));
    await import('../../src/native/main');
    await native.handlers.get(IPC.archiveOpenLast)!();
    native.rememberArchive.mockClear();
    const result = await native.handlers.get(IPC.backupRestore)!({});
    expect(result.ok).toBe(outcome === 'success');
    expect(native.restoreBackup).not.toHaveBeenCalled();
    expect(native.showSaveDialog).not.toHaveBeenCalled();
    if (outcome === 'success') {
      expect(native.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({
          buttons: ['Annulla', 'Ripristina'],
          detail: expect.stringContaining(restored.path),
        }),
      );
      expect(native.restoreArchiveCopy).toHaveBeenCalledWith(
        'private-staging.sqlite',
        restored.path,
        true,
      );
      expect(native.rememberArchive).toHaveBeenCalledWith(restored.path);
    } else {
      expect(native.restoreArchiveCopy).not.toHaveBeenCalled();
      expect(native.rememberArchive).not.toHaveBeenCalled();
      native.inspectArchive.mockResolvedValue(ok({}));
      expect(
        (await native.handlers.get(IPC.archiveInspect)!({}, original.path)).ok,
      ).toBe(true);
    }
    expect(native.backupRelease).toHaveBeenCalledTimes(
      outcome === 'invalid' ? 0 : 1,
    );
  },
);

it.each([
  'archive-folder',
  'configured-root',
  'last-backup',
  'unconfigured',
] as const)(
  'opens the restore source picker in the backup location: %s',
  async (location) => {
    const document = createEmptyDocument();
    const archive: ArchiveSession = {
      path: 'current.sqlite',
      document,
      readOnly: false,
      token: { documentId: document.documentId, revision: document.revision },
    };
    const backup = {
      destination: join('G:/', 'Cash Backup'),
      installationId: meta().id,
      enabled: true,
      intervalHours: 24,
      retention: 5,
    };
    const archiveFolder = join(
      backup.destination,
      'Cash-Backups',
      backup.installationId,
      archive.token.documentId,
    );
    const lastFolder = join('G:/', 'Backup precedenti');
    native.readPreferences.mockResolvedValue(
      ok({
        lastArchivePath: archive.path,
        ...(location === 'archive-folder' || location === 'configured-root'
          ? { backup }
          : {}),
        ...(location === 'last-backup'
          ? {
              backupLast: {
                path: join(lastFolder, 'Cash.sqlite'),
                documentId: document.documentId,
              },
            }
          : {}),
      }),
    );
    native.openArchive.mockResolvedValue(ok(archive));
    native.existsSync.mockImplementation(
      (path: string) => location === 'archive-folder' && path === archiveFolder,
    );
    native.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await import('../../src/native/main');
    await native.handlers.get(IPC.archiveOpenLast)!();
    expect(await native.handlers.get(IPC.backupRestore)!({})).toMatchObject({
      ok: false,
      error: { code: 'CANCELLED' },
    });
    expect(native.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Ripristina da backup',
        defaultPath:
          location === 'archive-folder'
            ? archiveFolder
            : location === 'configured-root'
              ? backup.destination
              : location === 'last-backup'
                ? lastFolder
                : undefined,
      }),
    );
    expect(native.showSaveDialog).not.toHaveBeenCalled();
    expect(native.backupStage).not.toHaveBeenCalled();
  },
);

it('uses the last backup archive folder when restoring without an open archive', async () => {
  const backup = {
    destination: join('G:/', 'Cash Backup'),
    installationId: meta().id,
  };
  const documentId = meta().id;
  const archiveFolder = join(
    backup.destination,
    'Cash-Backups',
    backup.installationId,
    documentId,
  );
  native.readPreferences.mockResolvedValue(
    ok({
      backup,
      backupLast: { documentId, path: join(archiveFolder, 'Cash.sqlite') },
    }),
  );
  native.existsSync.mockImplementation(
    (path: string) => path === archiveFolder,
  );
  native.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
  await import('../../src/native/main');
  await native.handlers.get(IPC.backupRestore)!({});
  expect(native.showOpenDialog).toHaveBeenCalledWith(
    expect.objectContaining({ defaultPath: archiveFolder }),
  );
});

it('reports unreadable backup preferences before opening the restore picker', async () => {
  const failure = {
    ok: false,
    error: { code: 'IO', message: 'Preferenze non leggibili.' },
  };
  native.readPreferences.mockResolvedValueOnce(failure);
  await import('../../src/native/main');
  expect(await native.handlers.get(IPC.backupRestore)!({})).toEqual(failure);
  expect(native.showOpenDialog).not.toHaveBeenCalled();
});

it('keeps the restored default archive session usable if saving preferences fails after restore', async () => {
  const document = createEmptyDocument();
  const original: ArchiveSession = {
    path: join('C:/Cash', 'Cash.sqlite'),
    document,
    readOnly: false,
    token: { documentId: document.documentId, revision: document.revision },
  };
  const restoredDocument = createEmptyDocument();
  const restored: ArchiveSession = {
    ...original,
    document: restoredDocument,
    token: {
      documentId: restoredDocument.documentId,
      revision: restoredDocument.revision,
    },
  };
  native.openArchive.mockResolvedValue(ok(original));
  native.showOpenDialog.mockResolvedValue({
    canceled: false,
    filePaths: ['selected.sqlite'],
  });
  native.showMessageBox.mockResolvedValue({ response: 1 });
  native.backupStage.mockResolvedValue(
    ok({
      path: 'private-staging.sqlite',
      inspection: { header: restoredDocument, storageVersion: 2, size: 4096 },
    }),
  );
  native.backupRelease.mockResolvedValue(undefined);
  native.restoreArchiveCopy.mockResolvedValue(ok(restored));
  await import('../../src/native/main');
  await native.handlers.get(IPC.archiveOpenLast)!();
  const failure = {
    ok: false,
    error: { code: 'IO', message: 'Preferenze non salvate.' },
  };
  native.rememberArchive.mockResolvedValueOnce(failure);
  expect(await native.handlers.get(IPC.backupRestore)!({})).toEqual(failure);
  expect(native.send).toHaveBeenCalledWith(IPC.appArchiveReloaded, restored);
  expect(native.showSaveDialog).not.toHaveBeenCalled();
  native.saveArchive.mockResolvedValue(ok(restored));
  expect(
    await native.handlers.get(IPC.archiveSave)!(
      {},
      restored.path,
      restored.document,
      restored.token,
    ),
  ).toEqual(ok(restored));
});

it.each(['save', 'restore'] as const)(
  'keeps the replacement archive current when an earlier %s finishes',
  async (operation) => {
    const document = createEmptyDocument();
    const session: ArchiveSession = {
      path: 'A.sqlite',
      document,
      readOnly: false,
      token: { documentId: document.documentId, revision: 1 },
    };
    const replacement = { ...session, path: 'B.sqlite' };
    native.openArchive
      .mockResolvedValueOnce(ok(session))
      .mockResolvedValueOnce(ok(replacement));
    let finish!: (value: ReturnType<typeof ok<ArchiveSession>>) => void;
    const action =
      operation === 'save' ? native.saveArchive : native.restoreBackup;
    action.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    native.inspectArchive.mockResolvedValue(ok({}));
    await import('../../src/native/main');
    await native.handlers.get(IPC.archiveOpenLast)!();
    native.showMessageBox.mockResolvedValue({ response: 1 });
    const saving =
      operation === 'save'
        ? native.handlers.get(IPC.archiveSave)!(
            {},
            session.path,
            document,
            session.token,
          )
        : native.handlers.get(IPC.archiveRestore)!(
            {},
            session.path,
            session.token,
          );
    await Promise.resolve();
    await native.handlers.get(IPC.archiveOpenLast)!();
    finish(ok({ ...session, token: { ...session.token, revision: 2 } }));
    expect((await saving).ok).toBe(true);
    expect(
      (await native.handlers.get(IPC.archiveInspect)!({}, replacement.path)).ok,
    ).toBe(true);
    expect(
      (await native.handlers.get(IPC.archiveInspect)!({}, session.path)).ok,
    ).toBe(false);
    const saved = {
      ...replacement,
      token: { ...replacement.token, revision: 2 },
    };
    native.saveArchive.mockResolvedValueOnce(ok(saved));
    expect(
      await native.handlers.get(IPC.archiveSave)!(
        {},
        replacement.path,
        document,
        replacement.token,
      ),
    ).toEqual(ok(saved));
  },
);

it.each([false, true])(
  'mantiene la chiusura protetta fino alla conferma renderer (seconda mutazione: %s)',
  async (newerMutation) => {
    const document = createEmptyDocument();
    const session: ArchiveSession = {
      path: 'Cash.sqlite',
      document,
      readOnly: false,
      token: {
        documentId: document.documentId,
        revision: 1,
      },
    };
    native.openArchive.mockResolvedValue(ok(session));
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    native.saveArchive.mockImplementation(
      async (_path: string, snapshot: CashDocument) => {
        await pending;
        return ok({
          ...session,
          document: { ...snapshot, revision: 2 },
          token: { ...session.token, revision: 2 },
        });
      },
    );
    await import('../../src/native/main');
    await native.handlers.get(IPC.archiveOpenLast)!();
    const setDirty = (value: boolean) =>
      native.events.get(IPC.appDirty)!({}, value);
    const close = () => {
      const event = { preventDefault: vi.fn() };
      native.windowEvents.get('close')!(event);
      return event.preventDefault;
    };
    setDirty(true);
    const saving = native.handlers.get(IPC.archiveSave)!(
      {},
      session.path,
      document,
      session.token,
    );
    if (newerMutation) setDirty(true);
    expect(close()).toHaveBeenCalledOnce();
    finish();
    await saving;
    // The IPC has completed, but the renderer has not accepted its response yet.
    expect(close()).toHaveBeenCalledOnce();
    expect(native.send).toHaveBeenCalledWith(IPC.appCloseRequested);
    setDirty(newerMutation);
    expect(close()).toHaveBeenCalledTimes(newerMutation ? 1 : 0);
    if (newerMutation) {
      setDirty(false);
      expect(close()).not.toHaveBeenCalled();
    }
  },
);

it.each([0, 1])(
  'offers migration of the last archive without another file selection (choice %s)',
  async (response) => {
    native.readPreferences.mockResolvedValue(
      ok({ lastArchivePath: 'Cash.json' }),
    );
    native.openArchive.mockResolvedValue({
      ok: false,
      error: { code: 'MIGRATION_REQUIRED', message: 'Legacy' },
    });
    native.previewMigration.mockResolvedValue(
      ok({
        fromVersion: 9,
        toVersion: 11,
        changes: ['Schema'],
        blockers: [],
        backupPath: 'Cash.backup.json',
      }),
    );
    native.showMessageBox.mockResolvedValue({ response });
    native.importJsonArchive.mockResolvedValue(ok({ path: 'Cash.sqlite' }));
    await import('../../src/native/main');
    const result = await native.handlers.get(IPC.archiveOpenLast)!();
    expect(native.previewMigration).toHaveBeenCalledWith('Cash.json');
    expect(native.showMessageBox).toHaveBeenCalledOnce();
    expect(native.importJsonArchive).toHaveBeenCalledTimes(response);
    if (response) expect(result.ok).toBe(true);
    else expect(result.error.code).toBe('CANCELLED');
  },
);
function prepareJsonImport() {
  native.readPreferences.mockResolvedValue(
    ok({ lastArchivePath: 'Cash.json' }),
  );
  native.openArchive.mockResolvedValue({
    ok: false,
    error: { code: 'MIGRATION_REQUIRED', message: 'Legacy' },
  });
  native.previewMigration.mockResolvedValue(
    ok({ fromVersion: 9, toVersion: 11, changes: ['Schema'], blockers: [] }),
  );
  native.showMessageBox.mockResolvedValue({ response: 1 });
}

it.each([0, 1, 2])(
  'suggests an unused import destination with %s existing names',
  async (occupied) => {
    prepareJsonImport();
    const candidates = [
      'Cash.sqlite',
      'Cash-importato.sqlite',
      'Cash-importato-2.sqlite',
    ].map((name) => join('C:/Cash', name));
    native.existsSync.mockImplementation((path: string) =>
      candidates.slice(0, occupied).includes(path),
    );
    native.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: candidates[occupied],
    });
    native.importJsonArchive.mockResolvedValue(
      ok({ path: candidates[occupied] }),
    );
    await import('../../src/native/main');
    expect((await native.handlers.get(IPC.archiveOpenLast)!()).ok).toBe(true);
    expect(native.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: candidates[occupied],
      }),
    );
  },
);

it('reopens the destination picker after an import collision and remembers only the successful import', async () => {
  prepareJsonImport();
  const occupied = join('C:/Cash', 'Cash.sqlite');
  const available = join('C:/Cash', 'Cash-importato.sqlite');
  native.existsSync.mockImplementation((path: string) => path === occupied);
  native.showSaveDialog
    .mockResolvedValueOnce({ canceled: false, filePath: occupied })
    .mockResolvedValueOnce({ canceled: false, filePath: available });
  const migrated = ok({ path: available });
  native.importJsonArchive
    .mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'CONFLICT',
        field: 'path',
        message: 'File già esistente.',
        action: 'Scegli un altro nome.',
      },
    })
    .mockResolvedValueOnce(migrated);
  await import('../../src/native/main');
  expect(await native.handlers.get(IPC.archiveOpenLast)!()).toEqual(migrated);
  expect(native.previewMigration).toHaveBeenCalledOnce();
  expect(native.importJsonArchive.mock.calls).toEqual([
    ['Cash.json', occupied],
    ['Cash.json', available],
  ]);
  expect(native.showSaveDialog).toHaveBeenLastCalledWith(
    expect.objectContaining({ defaultPath: available }),
  );
  expect(native.showMessageBox).toHaveBeenLastCalledWith(
    expect.objectContaining({ buttons: ['Annulla', 'Scegli un altro file'] }),
  );
  expect(native.rememberArchive).toHaveBeenCalledExactlyOnceWith(available);
});

it.each(['collision-dialog', 'destination-picker'] as const)(
  'can cancel an import collision at the %s without changing the active archive',
  async (cancelAt) => {
    const document = createEmptyDocument();
    const previous: ArchiveSession = {
      path: 'Cash.sqlite',
      document,
      readOnly: false,
      token: { documentId: document.documentId, revision: document.revision },
    };
    native.openArchive.mockResolvedValue(ok(previous));
    await import('../../src/native/main');
    await native.handlers.get(IPC.archiveOpenLast)!();
    native.rememberArchive.mockClear();
    prepareJsonImport();
    native.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['Cash.json'],
    });
    native.showMessageBox
      .mockResolvedValueOnce({ response: 1 })
      .mockResolvedValueOnce({
        response: cancelAt === 'collision-dialog' ? 0 : 1,
      });
    native.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: 'Cash.sqlite',
    });
    if (cancelAt === 'destination-picker')
      native.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    native.importJsonArchive.mockResolvedValue({
      ok: false,
      error: {
        code: 'CONFLICT',
        field: 'path',
        message: 'File già esistente.',
        action: 'Scegli un altro nome.',
      },
    });
    expect(await native.handlers.get(IPC.archiveOpen)!()).toMatchObject({
      ok: false,
      error: { code: 'CANCELLED' },
    });
    expect(native.importJsonArchive).toHaveBeenCalledOnce();
    expect(native.rememberArchive).not.toHaveBeenCalled();
    native.inspectArchive.mockResolvedValue(ok({}));
    expect(
      (await native.handlers.get(IPC.archiveInspect)!({}, previous.path)).ok,
    ).toBe(true);
  },
);

it.each(['IO', 'CONFLICT'] as const)(
  'does not retry an import failure unrelated to an existing destination: %s',
  async (code) => {
    prepareJsonImport();
    const failure = {
      ok: false,
      error: { code, message: 'Importazione non riuscita.' },
    };
    native.importJsonArchive.mockResolvedValue(failure);
    await import('../../src/native/main');
    expect(await native.handlers.get(IPC.archiveOpenLast)!()).toEqual(failure);
    expect(native.showSaveDialog).toHaveBeenCalledOnce();
    expect(native.showMessageBox).toHaveBeenCalledOnce();
    expect(native.rememberArchive).not.toHaveBeenCalled();
  },
);

it.each(['FILE_NOT_FOUND', 'IO', 'VALIDATION'])(
  'only treats a missing last archive as no selection: %s',
  async (code) => {
    const failure = {
      ok: false,
      error: { code, message: 'Cannot open archive' },
    };
    native.openArchive.mockResolvedValue(failure);
    await import('../../src/native/main');
    expect(await native.handlers.get(IPC.archiveOpenLast)!()).toEqual(
      code === 'FILE_NOT_FOUND' ? ok(null) : failure,
    );
  },
);

async function prepareFicExport() {
  const document = createEmptyDocument();
  document.settings.fic = {
    enabled: true,
    company: { id: '1', name: 'Studio' },
    product: { id: '2', name: 'Consulenza' },
  };
  const attempt = await createPendingAttempt('1', [
    {
      itemIds: ['item'],
      description: 'Servizio',
      amount: '100.00',
      quantity: 1,
    },
  ]);
  document.quotes.push({
    ...meta(),
    number: 1,
    date: '2026-10-12',
    items: [],
    snapshotRevision: 0,
    exportAttempts: [attempt],
    client: {
      source: 'fatture_in_cloud',
      companyId: '1',
      clientId: '3',
      displayName: 'Cliente',
    },
  });
  const session: ArchiveSession = {
    path: 'Cash.sqlite',
    document,
    readOnly: false,
    token: { documentId: document.documentId, revision: document.revision },
  };
  native.openArchive.mockResolvedValue(ok(session));
  native.requireFicToken.mockResolvedValue(ok('secret'));
  await import('../../src/native/main');
  await native.handlers.get(IPC.archiveOpenLast)!();
  const input = {
    companyId: '1',
    clientId: '3',
    productId: '2',
    lines: attempt.lines,
    attemptId: attempt.id,
  };
  return { input, document };
}

it('esporta con una sola verifica prodotto e una POST, con IVA corrente', async () => {
  const { input } = await prepareFicExport();
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === 'POST') {
      expect(JSON.parse(String(init.body)).data.items_list[0].vat.id).toBe(8);
      return new Response(JSON.stringify({ data: { id: 90 } }));
    }
    return new Response(
      JSON.stringify({
        data: { id: 2, name: 'Consulenza', default_vat: { id: 8 } },
      }),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  expect(await native.handlers.get(IPC.ficExport)!({}, input)).toMatchObject({
    ok: true,
    value: { outcome: 'success', remoteDocumentId: '90' },
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([404, 422, 403])(
  'nessuna POST e rifiuto certo dopo verifica preliminare HTTP %s',
  async (status) => {
    const { input } = await prepareFicExport();
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response('{}', { status }),
    );
    vi.stubGlobal('fetch', fetcher);
    expect(await native.handlers.get(IPC.ficExport)!({}, input)).toMatchObject({
      ok: true,
      value: {
        outcome: 'rejected',
        requestSent: false,
        diagnostic: expect.stringContaining('Non inviato'),
      },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  },
);

it('validazione locale prima della rete e lettura quote senza HTTP', async () => {
  const { input } = await prepareFicExport();
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
  expect(
    await native.handlers.get(IPC.ficExport)!({}, { ...input, lines: [] }),
  ).toMatchObject({
    ok: true,
    value: { outcome: 'rejected', requestSent: false },
  });
  expect(await native.handlers.get(IPC.ficQuota)!()).toEqual(ok(null));
  expect(fetcher).not.toHaveBeenCalled();
});
