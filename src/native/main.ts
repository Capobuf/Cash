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
import {
  createArchive,
  inspectArchive,
  migrateArchive,
  openArchive,
  previewMigration,
  restoreBackup,
  saveArchive,
  saveRecoveryCopy,
  type ArchiveSession,
  type ConcurrencyToken,
} from './persistence';
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

let window: BrowserWindow | null = null;
let current: ArchiveSession | null = null;
let dirty = false;
let closingApproved = false;
let closePromptOpen = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

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
  save: saveArchive,
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
    filters: [{ name: 'Archivio Cash', extensions: ['json'] }],
  });
  if (choice.canceled || !choice.filePaths[0])
    return err({ code: 'CANCELLED', message: 'Apertura annullata.' });
  const result = await openArchive(choice.filePaths[0]);
  if (!result.ok && result.error.code === 'MIGRATION_REQUIRED') {
    const preview = await previewMigration(choice.filePaths[0]);
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
      message: `Migrare lo schema ${preview.value.fromVersion} allo schema ${preview.value.toVersion}?`,
      detail: `${preview.value.changes.join('\n')}\n\nBackup: ${preview.value.backupPath}`,
      buttons: ['Annulla', 'Crea backup e migra'],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirmation.response !== 1)
      return err({
        code: 'CANCELLED',
        source: 'archive',
        message: 'Migrazione annullata.',
      });
    const migrated = await migrateArchive(choice.filePaths[0]);
    if (migrated.ok) {
      current = migrated.value;
      await rememberArchive(migrated.value.path);
    }
    return migrated;
  }
  if (result.ok) {
    current = result.value;
    await rememberArchive(result.value.path);
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
    const path = (await readPreferences()).lastArchivePath;
    if (!path) return { ok: true, value: null };
    const result = await openArchive(path);
    if (result.ok) current = result.value;
    return result;
  });
  ipcMain.handle(IPC.archiveCreate, async (_event, document: CashDocument) => {
    const choice = await dialog.showSaveDialog({
      title: 'Crea archivio Cash',
      defaultPath: 'Cash.data.json',
      filters: [{ name: 'Archivio Cash', extensions: ['json'] }],
    });
    if (choice.canceled || !choice.filePath)
      return err({ code: 'CANCELLED', message: 'Creazione annullata.' });
    const result = await createArchive(
      choice.filePath,
      document ?? createEmptyDocument(),
    );
    if (result.ok) {
      current = result.value;
      await rememberArchive(result.value.path);
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
      const result = await saveArchive(path, document, token);
      if (result.ok) {
        current = result.value;
      }
      return result;
    },
  );
  ipcMain.handle(
    IPC.archiveRecovery,
    async (_event, document: CashDocument) => {
      const choice = await dialog.showSaveDialog({
        title: 'Salva copia di recupero',
        defaultPath: 'Cash.recovery.json',
        filters: [{ name: 'Archivio Cash', extensions: ['json'] }],
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
      const result = await restoreBackup(path, token);
      if (result.ok) {
        current = result.value;
        dirty = false;
      }
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
  ipcMain.handle(IPC.ficSetupInfo, async () => ({
    clientId: (await readPreferences()).ficClientId?.trim() ?? '',
    requiredScopes: FIC_SCOPES,
  }));
  ipcMain.handle(IPC.ficSetClientId, async (_event, value: unknown) => {
    const clientId = typeof value === 'string' ? value.trim() : '';
    if (!clientId)
      return err({
        code: 'VALIDATION',
        source: 'FattureInCloud',
        field: 'clientId',
        message: 'Il Client ID è obbligatorio.',
      });
    try {
      await setFicClientId(clientId);
      return ok({ clientId });
    } catch (cause) {
      return err({
        code: 'IO',
        source: 'FattureInCloud',
        message: 'Impossibile salvare il Client ID nelle preferenze locali.',
        details: [String(cause)],
      });
    }
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
    IPC.ficWizardActivate,
    async (
      _event,
      input: {
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
      const saved = await commitFicActivation(input, ficLinkServices);
      if (!saved.ok) return saved;
      current = saved.value;
      dirty = false;
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
      const saved = await removeFicLinkAtomically(input, ficLinkServices);
      if (!saved.ok) return saved;
      current = saved.value;
      dirty = false;
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
  const disk = await inspectArchive(current.path);
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
    if (reloaded.ok && reloaded.value.document) {
      current = reloaded.value;
      window.webContents.send(IPC.appArchiveReloaded, reloaded.value);
      return;
    }
  }
  const mismatch =
    disk.value.header.documentId !== current.token.documentId ||
    disk.value.header.revision !== current.token.revision ||
    disk.value.fingerprint !== current.token.fingerprint;
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

if (!hasSingleInstanceLock) app.quit();
else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.whenReady().then(() => {
    registerHandlers();
    void createWindow();
    setInterval(() => void detectExternalChange(), 30_000);
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}
