import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  listeners: new Map<string, (value?: unknown) => void>(),
  check: vi.fn(async () => {}),
  download: vi.fn(async () => {}),
  install: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: () => '0.1.0',
  },
}));
vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: {
      on: (name: string, callback: (value?: unknown) => void) =>
        mock.listeners.set(name, callback),
      autoDownload: true,
      autoInstallOnAppQuit: true,
      allowPrerelease: true,
      allowDowngrade: true,
      checkForUpdates: mock.check,
      downloadUpdate: mock.download,
      quitAndInstall: mock.install,
    },
  },
}));

beforeEach(() => {
  vi.resetModules();
  mock.listeners.clear();
  mock.check.mockReset();
  mock.download.mockReset();
  mock.install.mockReset();
  delete process.env.PORTABLE_EXECUTABLE_FILE;
});

it.skipIf(process.platform !== 'win32')(
  'does not download without consent and installs only after download',
  async () => {
    const updates = await import('../../src/native/updates');
    const received: string[] = [];
    updates.initializeCashUpdates((state) => received.push(state.phase));
    expect(updates.getCashUpdateStatus().phase).toBe('idle');
    expect(mock.download).not.toHaveBeenCalled();

    mock.check.mockImplementation(async () => {
      mock.listeners.get('update-available')?.({ version: '0.1.1' });
    });
    const checked = await updates.checkCashUpdates();
    expect(checked.ok).toBe(true);
    expect(updates.getCashUpdateStatus().phase).toBe('available');
    expect(mock.download).not.toHaveBeenCalled();

    const rejected = updates.installCashUpdate();
    expect(rejected.ok).toBe(false);
    mock.download.mockImplementation(async () => {
      mock.listeners.get('update-downloaded')?.({ version: '0.1.1' });
    });
    const downloaded = await updates.downloadCashUpdate();
    expect(downloaded.ok).toBe(true);
    expect(updates.getCashUpdateStatus().phase).toBe('ready');
    expect(mock.install).not.toHaveBeenCalled();

    expect(updates.installCashUpdate().ok).toBe(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mock.install).toHaveBeenCalledWith(true, true);
    expect(received).toContain('available');
    expect(received).toContain('ready');
  },
);

it.skipIf(process.platform !== 'win32')(
  'reports a network error rather than hiding it',
  async () => {
    const updates = await import('../../src/native/updates');
    updates.initializeCashUpdates(() => {});
    mock.check.mockRejectedValueOnce(new Error('Connection failed'));
    const result = await updates.checkCashUpdates();
    expect(result.ok).toBe(false);
    expect(updates.getCashUpdateStatus()).toMatchObject({
      phase: 'error',
      message: expect.stringContaining('Connection failed'),
    });
  },
);
