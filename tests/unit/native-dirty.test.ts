import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  ok,
  type CashDocument,
} from '../../src/domain/model';
import type { ArchiveSession } from '../../src/native/persistence';
import { IPC } from '../../src/shared/ipc';

const native = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  events: new Map<string, (...args: any[]) => void>(),
  windowEvents: new Map<string, (...args: any[]) => void>(),
  send: vi.fn(),
  openArchive: vi.fn(),
  saveArchive: vi.fn(),
}));
vi.mock('electron', () => ({
  app: {
    requestSingleInstanceLock: () => true,
    setAppUserModelId: vi.fn(),
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
  dialog: {},
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
  openArchive: native.openArchive,
  saveArchive: native.saveArchive,
  createArchive: vi.fn(),
  inspectArchive: vi.fn(),
  migrateArchive: vi.fn(),
  previewMigration: vi.fn(),
  restoreBackup: vi.fn(),
  saveRecoveryCopy: vi.fn(),
}));
vi.mock('../../src/native/preferences', () => ({
  readPreferences: async () => ({ lastArchivePath: 'Cash.json' }),
  rememberArchive: vi.fn(),
  setFicClientId: vi.fn(),
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
  vi.stubGlobal('__dirname', 'C:/Cash/dist/native');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  'mantiene la chiusura protetta fino alla conferma renderer (seconda mutazione: %s)',
  async (newerMutation) => {
    const document = createEmptyDocument();
    const session: ArchiveSession = {
      path: 'Cash.json',
      document,
      readOnly: false,
      token: {
        documentId: document.documentId,
        revision: 1,
        fingerprint: 'first',
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
          token: { ...session.token, revision: 2, fingerprint: 'second' },
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
