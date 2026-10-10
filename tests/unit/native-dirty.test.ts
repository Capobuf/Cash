import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  ok,
  type CashDocument,
} from '../../src/domain/model';
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
}));
vi.mock('electron', () => ({
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
  requireFicToken: vi.fn(),
  requireOrsApiKey: vi.fn(),
  setFicToken: vi.fn(),
  setOrsApiKey: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
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
