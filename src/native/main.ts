import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readBankExpenseFile } from './bank-expense-import';
import { join } from 'node:path';
import {
  createEmptyDocument,
  err,
  ok,
  type CashDocument,
  type Coordinates,
  type Fuel,
  type Result,
} from '../domain/model';
import { archiveStorage, closeAllArchives } from './persistence';
import { previewMigration } from './legacy-import';
import type { ArchiveSession, ConcurrencyToken } from '../shared/archive';
import { runSqliteSmoke } from './sqlite-smoke';
import {
  deleteFicToken,
  hasFicToken,
  hasOrsApiKey,
  requireFicToken,
  requireOrsApiKey,
  setFicToken,
  setOrsApiKey,
} from './credentials';
import { latestFuelPrice } from './integrations/mimit';
import { revalueFoi } from './integrations/foi';
import {
  exportQuote,
  getClientDetails,
  listCompanies,
  listConsultingProducts,
  searchClients,
  syncFinancialData,
  verifyActivation,
  verifyProduct,
  verifyPermissions,
} from './integrations/fatture-in-cloud';
import { IPC } from '../shared/ipc';
import {
  checkCashUpdates,
  downloadCashUpdate,
  getCashUpdateStatus,
  initializeCashUpdates,
  installCashUpdate,
} from './updates';
import { FIC_SCOPES, requireActiveFic } from '../domain/integration';
import {
  commitFicActivation,
  removeFicLinkAtomically,
  type FicLinkServices,
} from './fic-link';
import {
  readPreferences,
  rememberArchive,
  setFicClientId,
} from './preferences';
import {
  calculateRoute,
  reverseCoordinates,
  searchAddress,
  verifyConnection,
} from './integrations/openrouteservice';

const {
  create: createArchive,
  open: openArchive,
  save: saveArchive,
  inspect: inspectArchive,
  recovery: saveRecoveryCopy,
  restore: restoreBackup,
  importJson: importJsonArchive,
  close: closeArchive,
} = archiveStorage;

let window: BrowserWindow | null = null;
let current: ArchiveSession | null = null;
let dirty = false;
let closingApproved = false;
let closePromptOpen = false;
const smokeArgument = process.argv.find((argument) =>
  argument.startsWith('--cash-storage-smoke='),
);
const hasSingleInstanceLock = smokeArgument
  ? true
  : app.requestSingleInstanceLock();

function replaceCurrent(next: ArchiveSession): void {
  if (current && current.path !== next.path) closeArchive(current.path);
  current = next;
}

if (process.platform === 'win32') app.setAppUserModelId('it.cash.desktop');

function selectedPathValid(path: string): boolean {
  return current?.path === path;
}
function activeFicCompany(companyId: string): boolean {
  return current?.document
    ? requireActiveFic(current.document.settings, companyId).ok
    : false;
}
const ficLinkServices: FicLinkServices = {
  verify: verifyActivation,
  hasToken: hasFicToken,
  readToken: requireFicToken,
  writeToken: setFicToken,
  deleteToken: deleteFicToken,
  save: (path, document, token) =>
    selectedPathValid(path) && !current?.readOnly
      ? saveArchive(path, document, token)
      : Promise.resolve(
          err({
            code: 'CONFLICT',
            source: 'archive',
            message: 'Archivio cambiato durante il collegamento.',
          }),
        ),
};
async function observedOrs<T>(
  operation: string,
  task: Promise<Result<T>>,
): Promise<Result<T>> {
  const started = Date.now();
  const result = await task;
  if (!result.ok)
    console.warn('[OpenRouteService] request failed', {
      operation,
      code: result.error.code,
      milliseconds: Date.now() - started,
      diagnostic: result.error.details?.[0],
    });
  return result;
}
async function selectOpen() {
  const choice = await dialog.showOpenDialog({
    title: 'Apri archivio Cash',
    properties: ['openFile'],
    filters: [{ name: 'Archivio Cash', extensions: ['sqlite', 'json'] }],
  });
  if (choice.canceled || !choice.filePaths[0])
    return err({ code: 'CANCELLED', message: 'Apertura annullata.' });
  return openWithMigration(choice.filePaths[0]);
}
async function openWithMigration(path: string) {
  const result = await openArchive(path);
  if (!result.ok && result.error.code === 'MIGRATION_REQUIRED') {
    const preview = await previewMigration(path);
    if (!preview.ok) return preview;
    if (preview.value.blockers.length)
      return err({
        code: 'MIGRATION_REQUIRED',
        source: 'archive',
        message:
          'Migrazione automatica bloccata per preservare i dati storici.',
        action:
          'Apri l’archivio con la versione precedente e correggi i dati indicati.',
        details: preview.value.blockers,
      });
    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      title: 'Migrazione archivio Cash',
      message: `Importare l’archivio JSON (schema ${preview.value.fromVersion}) in SQLite?`,
      detail: `${preview.value.changes.join('\n')}\n\nL’originale JSON e i suoi backup resteranno invariati. Scegli un nuovo file .sqlite su disco locale, fuori da Google Drive/OneDrive.`,
      buttons: ['Annulla', 'Scegli destinazione e importa'],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirmation.response !== 1)
      return err({
        code: 'CANCELLED',
        source: 'archive',
        message: 'Migrazione annullata.',
      });
    const destination = await dialog.showSaveDialog({
      title: 'Importa archivio JSON in SQLite',
      defaultPath: join(app.getPath('userData'), 'Cash.sqlite'),
      filters: [{ name: 'Archivio Cash SQLite', extensions: ['sqlite'] }],
    });
    if (destination.canceled || !destination.filePath)
      return err({ code: 'CANCELLED', message: 'Importazione annullata.' });
    const migrated = await importJsonArchive(path, destination.filePath);
    if (migrated.ok) {
      const remembered = await rememberArchive(migrated.value.path);
      if (!remembered.ok) {
        if (current?.path !== migrated.value.path)
          closeArchive(migrated.value.path);
        return remembered;
      }
      replaceCurrent(migrated.value);
    }
    return migrated;
  }
  if (result.ok) {
    const remembered = await rememberArchive(result.value.path);
    if (!remembered.ok) {
      if (current?.path !== result.value.path) closeArchive(result.value.path);
      return remembered;
    }
    replaceCurrent(result.value);
  }
  return result;
}

function registerHandlers(): void {
  ipcMain.handle(IPC.bankExpenseImport, async () => {
    if (!current?.document || current.readOnly)
      return err({
        code: 'VALIDATION',
        message: 'Apri un archivio modificabile prima di importare.',
      });
    const choice = await dialog.showOpenDialog({
      title: 'Importa uscite dal conto',
      properties: ['openFile'],
      filters: [
        { name: 'Movimenti bancari XLSX e CSV', extensions: ['xlsx', 'csv'] },
      ],
    });
    if (choice.canceled || !choice.filePaths[0])
      return err({ code: 'CANCELLED', message: 'Importazione annullata.' });
    return readBankExpenseFile(choice.filePaths[0]);
  });
  ipcMain.handle(IPC.archiveOpen, () => selectOpen());
  ipcMain.handle(IPC.archiveOpenLast, async () => {
    const preferences = await readPreferences();
    if (!preferences.ok) return preferences;
    const path = preferences.value.lastArchivePath;
    if (!path) return { ok: true, value: null };
    const result = await openWithMigration(path);
    if (!result.ok && result.error.code === 'FILE_NOT_FOUND') return ok(null);
    return result;
  });
  ipcMain.handle(IPC.archiveCreate, async (_event, document: CashDocument) => {
    const choice = await dialog.showSaveDialog({
      title: 'Crea archivio Cash',
      defaultPath: join(app.getPath('userData'), 'Cash.sqlite'),
      filters: [{ name: 'Archivio Cash', extensions: ['sqlite'] }],
    });
    if (choice.canceled || !choice.filePath)
      return err({ code: 'CANCELLED', message: 'Creazione annullata.' });
    const result = await createArchive(
      choice.filePath,
      document ?? createEmptyDocument(),
    );
    if (result.ok) {
      const remembered = await rememberArchive(result.value.path);
      if (!remembered.ok) {
        if (current?.path !== result.value.path)
          closeArchive(result.value.path);
        return remembered;
      }
      replaceCurrent(result.value);
    }
    return result;
  });
  ipcMain.handle(
    IPC.archiveSave,
    async (
      _event,
      path: string,
      document: CashDocument,
      token: ConcurrencyToken,
    ) => {
      if (!selectedPathValid(path) || current?.readOnly)
        return err({
          code: 'CONFLICT',
          source: 'archive',
          message: 'Sessione archivio non valida o in sola lettura.',
        });
      const savingSession = current;
      const result = await saveArchive(path, document, token);
      if (result.ok && current === savingSession) {
        replaceCurrent(result.value);
      }
      return result;
    },
  );
  ipcMain.handle(
    IPC.archiveRecovery,
    async (_event, document: CashDocument) => {
      const choice = await dialog.showSaveDialog({
        title: 'Salva copia di recupero',
        defaultPath: 'Cash.recovery.sqlite',
        filters: [{ name: 'Archivio Cash', extensions: ['sqlite'] }],
      });
      if (choice.canceled || !choice.filePath)
        return err({
          code: 'CANCELLED',
          message: 'Salvataggio copia annullato.',
        });
      return saveRecoveryCopy(choice.filePath, document);
    },
  );
  ipcMain.handle(
    IPC.archiveRestore,
    async (_event, path: string, token: ConcurrencyToken) => {
      if (!selectedPathValid(path) || current?.readOnly)
        return err({
          code: 'CONFLICT',
          source: 'archive',
          message: 'Sessione archivio non valida o in sola lettura.',
        });
      const restoringSession = current;
      const choice = await dialog.showMessageBox({
        type: 'warning',
        title: 'Ripristina copia di sicurezza',
        message: 'Ripristinare la precedente versione valida?',
        detail:
          'Cash conserverà copie datate sia del file corrente sia del backup e creerà una nuova identità archivio.',
        buttons: ['Annulla', 'Ripristina'],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice.response !== 1)
        return err({
          code: 'CANCELLED',
          source: 'archive',
          message: 'Ripristino annullato.',
        });
      if (current !== restoringSession)
        return err({
          code: 'CONFLICT',
          message: 'Archivio cambiato durante la conferma del ripristino.',
        });
      const result = await restoreBackup(path, token);
      if (result.ok && current === restoringSession) current = result.value;
      return result;
    },
  );
  ipcMain.handle(IPC.archiveInspect, (_event, path: string) =>
    selectedPathValid(path)
      ? inspectArchive(path)
      : err({
          code: 'CONFLICT',
          source: 'archive',
          message: 'Percorso non appartenente alla sessione attiva.',
        }),
  );
  ipcMain.handle(IPC.tokenHas, () => hasFicToken());
  ipcMain.handle(IPC.tokenSet, (_event, value: unknown) =>
    setFicToken(typeof value === 'string' ? value : ''),
  );
  ipcMain.handle(
    IPC.mimitFuel,
    (_event, input: { territory: string; fuel: Fuel }) =>
      latestFuelPrice(input.territory, input.fuel),
  );
  ipcMain.handle(
    IPC.foiRevalue,
    (_event, input: { amount: string; fromPeriod: string }) =>
      revalueFoi(input.amount, input.fromPeriod),
  );
  ipcMain.handle(IPC.orsHasKey, () => hasOrsApiKey());
  ipcMain.handle(IPC.orsSetKey, (_event, value: unknown) =>
    setOrsApiKey(typeof value === 'string' ? value : ''),
  );
  ipcMain.handle(IPC.orsVerify, async () => {
    const key = await requireOrsApiKey();
    return key.ok ? observedOrs('verify', verifyConnection(key.value)) : key;
  });
  ipcMain.handle(IPC.orsSearch, async (_event, address: unknown) => {
    const key = await requireOrsApiKey();
    return key.ok
      ? observedOrs(
          'search-address',
          searchAddress(typeof address === 'string' ? address : '', key.value),
        )
      : key;
  });
  ipcMain.handle(IPC.orsReverse, async (_event, coordinates: Coordinates) => {
    const key = await requireOrsApiKey();
    return key.ok
      ? observedOrs(
          'reverse-coordinates',
          reverseCoordinates(coordinates, key.value),
        )
      : key;
  });
  ipcMain.handle(
    IPC.orsRoute,
    async (
      _event,
      input: { departure: Coordinates; destination: Coordinates },
    ) => {
      const key = await requireOrsApiKey();
      return key.ok
        ? observedOrs(
            'route',
            calculateRoute(input.departure, input.destination, key.value),
          )
        : key;
    },
  );
  ipcMain.handle(IPC.ficSetupInfo, async () => {
    const preferences = await readPreferences();
    return preferences.ok
      ? ok({
          clientId: preferences.value.ficClientId?.trim() ?? '',
          requiredScopes: FIC_SCOPES,
        })
      : preferences;
  });
  ipcMain.handle(IPC.ficSetClientId, async (_event, value: unknown) => {
    const clientId = typeof value === 'string' ? value.trim() : '';
    if (!clientId)
      return err({
        code: 'VALIDATION',
        source: 'FattureInCloud',
        field: 'clientId',
        message: 'Il Client ID è obbligatorio.',
      });
    const saved = await setFicClientId(clientId);
    return saved.ok ? ok({ clientId }) : saved;
  });
  ipcMain.handle(IPC.ficWizardCompanies, (_event, token: string) =>
    listCompanies(token),
  );
  ipcMain.handle(
    IPC.ficWizardProducts,
    (_event, input: { token: string; companyId: string }) =>
      listConsultingProducts(input.token, input.companyId),
  );
  ipcMain.handle(
    IPC.ficWizardPreview,
    (_event, input: { token: string; companyId: string; productId: string }) =>
      verifyActivation(input.token, input.companyId, input.productId),
  );
  ipcMain.handle(
    IPC.ficWizardActivate,
    async (
      _event,
      input: {
        preview: import('../domain/integration').FicActivationPreview;
        token: string;
        companyId: string;
        productId: string;
        path: string;
        document: CashDocument;
        concurrencyToken: ConcurrencyToken;
      },
    ) => {
      if (!selectedPathValid(input.path) || current?.readOnly)
        return err({
          code: 'CONFLICT',
          source: 'archive',
          message: 'Sessione archivio non valida o in sola lettura.',
        });
      const linkingSession = current;
      const saved = await commitFicActivation(input, {
        ...ficLinkServices,
        save: (path, document, token) =>
          current === linkingSession
            ? saveArchive(path, document, token)
            : Promise.resolve(
                err({
                  code: 'CONFLICT',
                  message: 'Archivio cambiato durante il collegamento.',
                }),
              ),
      });
      if (!saved.ok) return saved;
      if (current === linkingSession) current = saved.value;
      return saved;
    },
  );
  ipcMain.handle(
    IPC.ficRemoveLink,
    async (
      _event,
      input: {
        path: string;
        document: CashDocument;
        concurrencyToken: ConcurrencyToken;
      },
    ) => {
      if (!selectedPathValid(input.path) || current?.readOnly)
        return err({
          code: 'CONFLICT',
          source: 'archive',
          message: 'Sessione archivio non valida o in sola lettura.',
        });
      const linkingSession = current;
      const saved = await removeFicLinkAtomically(input, {
        ...ficLinkServices,
        save: (path, document, token) =>
          current === linkingSession
            ? saveArchive(path, document, token)
            : Promise.resolve(
                err({
                  code: 'CONFLICT',
                  message: 'Archivio cambiato durante il collegamento.',
                }),
              ),
      });
      if (!saved.ok) return saved;
      if (current === linkingSession) current = saved.value;
      return saved;
    },
  );
  ipcMain.handle(
    IPC.ficFinancialSync,
    async (_event, input: { companyId: string }) => {
      if (
        !input ||
        typeof input.companyId !== 'string' ||
        !activeFicCompany(input.companyId) ||
        current?.readOnly
      )
        return err({
          code: 'VALIDATION',
          source: 'FattureInCloud',
          message:
            'Aggiornamento non disponibile: verificare archivio e azienda Fatture in Cloud attiva.',
        });
      const session = current;
      const token = await requireFicToken();
      if (!token.ok) return token;
      const result = await syncFinancialData(input.companyId, token.value);
      if (
        current?.path !== session?.path ||
        current?.token.documentId !== session?.token.documentId ||
        !activeFicCompany(input.companyId)
      )
        return err({
          code: 'CONFLICT',
          source: 'archive',
          message:
            'Archivio o collegamento cambiato durante la sincronizzazione. Ripetere l’aggiornamento.',
        });
      return result;
    },
  );
  ipcMain.handle(
    IPC.ficVerifyPermissions,
    async (_event, input: { companyId: string }) => {
      if (
        !input ||
        typeof input.companyId !== 'string' ||
        !activeFicCompany(input.companyId)
      )
        return err({
          code: 'VALIDATION',
          source: 'FattureInCloud',
          message:
            'Verifica non disponibile: attiva il collegamento all’azienda.',
        });
      const session = current;
      const token = await requireFicToken();
      if (!token.ok) return token;
      const result = await verifyPermissions(input.companyId, token.value);
      if (
        current?.path !== session?.path ||
        current?.token.documentId !== session?.token.documentId ||
        !activeFicCompany(input.companyId)
      )
        return err({
          code: 'CONFLICT',
          message:
            'Archivio o azienda cambiato durante la verifica. Ripeti l’operazione.',
        });
      return result;
    },
  );
  ipcMain.handle(
    IPC.ficClients,
    async (_event, input: { companyId: string; query: string }) => {
      if (!activeFicCompany(input.companyId))
        return err({
          code: 'VALIDATION',
          source: 'FattureInCloud',
          message:
            'Integrazione Fatture in Cloud disattivata o azienda non configurata.',
        });
      const token = await requireFicToken();
      return token.ok
        ? searchClients(input.companyId, input.query, token.value)
        : token;
    },
  );
  ipcMain.handle(
    IPC.ficClientDetails,
    async (_event, input: { companyId: string; clientId: string }) => {
      if (!activeFicCompany(input.companyId))
        return err({
          code: 'VALIDATION',
          source: 'FattureInCloud',
          message:
            'Integrazione Fatture in Cloud disattivata o azienda non configurata.',
        });
      const token = await requireFicToken();
      return token.ok
        ? getClientDetails(input.companyId, input.clientId, token.value)
        : token;
    },
  );
  ipcMain.handle(
    IPC.ficProduct,
    async (_event, input: { companyId: string; productId: string }) => {
      if (
        !activeFicCompany(input.companyId) ||
        current?.document?.settings.fic.product?.id !== input.productId
      )
        return err({
          code: 'VALIDATION',
          source: 'FattureInCloud',
          message:
            'Integrazione Fatture in Cloud disattivata o prodotto non configurato.',
        });
      const token = await requireFicToken();
      return token.ok
        ? verifyProduct(input.companyId, input.productId, token.value)
        : token;
    },
  );
  ipcMain.handle(IPC.ficExport, async (_event, input) => {
    if (
      !activeFicCompany(input.companyId) ||
      current?.document?.settings.fic.product?.id !== input.productId
    )
      return err({
        code: 'VALIDATION',
        source: 'FattureInCloud',
        message:
          'Integrazione Fatture in Cloud disattivata o configurazione incoerente.',
      });
    const token = await requireFicToken();
    if (!token.ok) return token;
    const product = await verifyProduct(
      input.companyId,
      input.productId,
      token.value,
    );
    return product.ok
      ? exportQuote({ ...input, product: product.value }, token.value)
      : product;
  });
  ipcMain.handle(IPC.updateStatus, () => getCashUpdateStatus());
  ipcMain.handle(IPC.updateCheck, () => checkCashUpdates());
  ipcMain.handle(IPC.updateDownload, () => downloadCashUpdate());
  ipcMain.handle(IPC.updateInstall, () => {
    if (dirty)
      return err({
        code: 'CONFLICT',
        message: 'Salva le modifiche all’archivio prima di aggiornare Cash.',
      });
    return installCashUpdate();
  });
  ipcMain.on(IPC.appDirty, (_event, value: boolean) => {
    dirty = value;
  });
  ipcMain.on(IPC.appResolveClose, (_event, choice: 'discard' | 'cancel') => {
    closePromptOpen = false;
    if (choice === 'discard') {
      closingApproved = true;
      window?.close();
    }
  });
}

async function detectExternalChange(): Promise<void> {
  if (!current || !window) return;
  const observed = current;
  const disk = await inspectArchive(observed.path);
  if (current !== observed) return;
  if (!disk.ok) {
    window.webContents.send(IPC.appExternal, disk.error);
    return;
  }
  if (
    !dirty &&
    disk.value.header.documentId === current.token.documentId &&
    disk.value.header.revision > current.token.revision
  ) {
    const reloaded = await openArchive(current.path);
    if (current !== observed) return;
    if (reloaded.ok && reloaded.value.document) {
      current = reloaded.value;
      window.webContents.send(IPC.appArchiveReloaded, reloaded.value);
      return;
    }
  }
  const mismatch =
    disk.value.header.documentId !== current.token.documentId ||
    disk.value.header.revision !== current.token.revision;
  if (mismatch)
    window.webContents.send(IPC.appExternal, {
      code: 'CONFLICT',
      source: 'archive',
      message: dirty
        ? 'Il file è cambiato altrove mentre esistono modifiche locali.'
        : 'È disponibile una versione diversa del file.',
      action: dirty
        ? 'Salvare una copia di recupero o scartare e ricaricare.'
        : 'Confrontare i metadati e riaprire esplicitamente l’archivio.',
      details: [
        `Caricato: ${current.token.documentId} rev. ${current.token.revision}`,
        `Disco: ${disk.value.header.documentId} rev. ${disk.value.header.revision}`,
      ],
    });
}

async function createWindow(): Promise<void> {
  const createdWindow = (window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#f5f2ea',
    icon: join(__dirname, '../renderer/assets/app-icon.ico'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  }));
  createdWindow.removeMenu();
  createdWindow.once('ready-to-show', () => {
    if (!createdWindow.isDestroyed()) createdWindow.show();
  });
  await createdWindow.loadFile(join(__dirname, '../renderer/index.html'));
  if (!createdWindow.isDestroyed() && !createdWindow.isVisible())
    createdWindow.show();
  createdWindow.on('focus', () => void detectExternalChange());
  createdWindow.on('close', (event) => {
    if (!dirty || closingApproved) return;
    event.preventDefault();
    if (!closePromptOpen) {
      closePromptOpen = true;
      window?.webContents.send(IPC.appCloseRequested);
    }
  });
}

if (smokeArgument) {
  app.whenReady().then(async () => {
    try {
      await runSqliteSmoke(smokeArgument.slice('--cash-storage-smoke='.length));
      app.exit(0);
    } catch (cause) {
      console.error(cause);
      app.exit(1);
    }
  });
} else if (!hasSingleInstanceLock) app.quit();
else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.whenReady().then(() => {
    initializeCashUpdates((status) => {
      if (window && !window.isDestroyed())
        window.webContents.send(IPC.updateChanged, status);
    });
    registerHandlers();
    void createWindow().then(() => {
      // One startup check only. Subsequent checks are explicitly requested.
      void checkCashUpdates();
    });
    setInterval(() => void detectExternalChange(), 30_000);
  });
  app.on('before-quit', () => closeAllArchives());
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}
