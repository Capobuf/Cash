import { app } from 'electron';
import electronUpdater from 'electron-updater';
import { err, ok, type Result } from '../domain/model';
import type { CashUpdateStatus } from '../shared/ipc';

const { autoUpdater } = electronUpdater;
const supported =
  process.platform === 'win32' &&
  app.isPackaged &&
  !process.env.PORTABLE_EXECUTABLE_FILE;

let status: CashUpdateStatus = {
  phase: supported ? 'idle' : 'unsupported',
  currentVersion: app.getVersion(),
};
let initialized = false;
let notify: ((status: CashUpdateStatus) => void) | undefined;

function setStatus(change: Partial<CashUpdateStatus>): void {
  status = { ...status, ...change };
  notify?.({ ...status });
}

function updateFailed(cause: unknown): Result<never> {
  const message =
    cause instanceof Error ? cause.message : 'Errore non identificato.';
  setStatus({
    phase: 'error',
    message: `Impossibile completare l'aggiornamento: ${message}`,
  });
  return err({ code: 'SOURCE_UNAVAILABLE', message: status.message! });
}

export function getCashUpdateStatus(): CashUpdateStatus {
  return { ...status };
}

export function initializeCashUpdates(
  onStatus: (status: CashUpdateStatus) => void,
): void {
  notify = onStatus;
  if (!supported || initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    setStatus({
      phase: 'checking',
      availableVersion: undefined,
      progressPercent: undefined,
      message: undefined,
    });
  });
  autoUpdater.on('update-available', (info) => {
    setStatus({
      phase: 'available',
      availableVersion: info.version,
      message: undefined,
    });
  });
  autoUpdater.on('update-not-available', () => {
    setStatus({
      phase: 'up-to-date',
      availableVersion: undefined,
      progressPercent: undefined,
      message: undefined,
    });
  });
  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      phase: 'downloading',
      progressPercent: Math.round(progress.percent),
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({
      phase: 'ready',
      availableVersion: info.version,
      progressPercent: 100,
      message: undefined,
    });
  });
  autoUpdater.on('error', (cause) => {
    updateFailed(cause);
  });
}

function available(): Result<void> {
  return supported
    ? ok(undefined)
    : err({
        code: 'VALIDATION',
        message:
          'Gli aggiornamenti integrati richiedono Cash installato su Windows.',
      });
}

export async function checkCashUpdates(): Promise<Result<CashUpdateStatus>> {
  const support = available();
  if (!support.ok) return support;
  if (status.phase === 'ready') return ok(getCashUpdateStatus());
  if (status.phase === 'checking' || status.phase === 'downloading')
    return err({
      code: 'CONFLICT',
      message: 'È già in corso una verifica o un download.',
    });
  try {
    setStatus({ phase: 'checking', message: undefined });
    await autoUpdater.checkForUpdates();
    return ok(getCashUpdateStatus());
  } catch (cause) {
    return updateFailed(cause);
  }
}

export async function downloadCashUpdate(): Promise<Result<CashUpdateStatus>> {
  const support = available();
  if (!support.ok) return support;
  if (status.phase !== 'available')
    return err({
      code: 'VALIDATION',
      message: 'Nessun aggiornamento pronto per il download.',
    });
  try {
    setStatus({ phase: 'downloading', progressPercent: 0, message: undefined });
    await autoUpdater.downloadUpdate();
    return ok(getCashUpdateStatus());
  } catch (cause) {
    return updateFailed(cause);
  }
}

export function installCashUpdate(): Result<void> {
  const support = available();
  if (!support.ok) return support;
  if (status.phase !== 'ready')
    return err({
      code: 'VALIDATION',
      message: 'Scarica prima l’aggiornamento disponibile.',
    });

  // Return the IPC response before the updater closes the Electron windows.
  setImmediate(() => {
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (cause) {
      updateFailed(cause);
    }
  });
  return ok(undefined);
}
