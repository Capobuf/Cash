import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { join } from 'node:path';
import { createEmptyDocument, err, type CashDocument, type Fuel } from '../domain/model';
import { createArchive, inspectArchive, openArchive, saveArchive, saveRecoveryCopy, type ArchiveSession, type ConcurrencyToken } from './persistence';
import { deleteFicToken, hasFicToken, requireFicToken, setFicToken } from './credentials';
import { latestFuelPrice } from './integrations/mimit';
import { revalueFoi } from './integrations/foi';
import { exportQuote, searchClients, verifyProduct } from './integrations/fatture-in-cloud';
import { IPC } from '../shared/ipc';
import { readPreferences, rememberArchive } from './preferences';

let window: BrowserWindow | null = null;
let current: ArchiveSession | null = null;
let dirty = false;
let closingApproved = false;

function selectedPathValid(path: string): boolean { return current?.path === path; }
async function selectOpen() {
  const choice = await dialog.showOpenDialog({ title: 'Apri archivio Cash', properties: ['openFile'], filters: [{ name: 'Archivio Cash', extensions: ['json'] }] });
  if (choice.canceled || !choice.filePaths[0]) return err({ code: 'CANCELLED', message: 'Apertura annullata.' });
  const result = await openArchive(choice.filePaths[0]);
  if (result.ok) { current = result.value; await rememberArchive(result.value.path); }
  return result;
}

function registerHandlers(): void {
  ipcMain.handle(IPC.archiveOpen, () => selectOpen());
  ipcMain.handle(IPC.archiveOpenLast, async () => {
    const path = (await readPreferences()).lastArchivePath;
    if (!path) return { ok: true, value: null };
    const result = await openArchive(path);
    if (result.ok) current = result.value;
    return result;
  });
  ipcMain.handle(IPC.archiveCreate, async (_event, document: CashDocument) => {
    const choice = await dialog.showSaveDialog({ title: 'Crea archivio Cash', defaultPath: 'Cash.data.json', filters: [{ name: 'Archivio Cash', extensions: ['json'] }] });
    if (choice.canceled || !choice.filePath) return err({ code: 'CANCELLED', message: 'Creazione annullata.' });
    const result = await createArchive(choice.filePath, document ?? createEmptyDocument());
    if (result.ok) { current = result.value; await rememberArchive(result.value.path); }
    return result;
  });
  ipcMain.handle(IPC.archiveSave, async (_event, path: string, document: CashDocument, token: ConcurrencyToken) => {
    if (!selectedPathValid(path) || current?.readOnly) return err({ code: 'CONFLICT', source: 'archive', message: 'Sessione archivio non valida o in sola lettura.' });
    const result = await saveArchive(path, document, token);
    if (result.ok) { current = result.value; dirty = false; }
    return result;
  });
  ipcMain.handle(IPC.archiveRecovery, async (_event, document: CashDocument) => {
    const choice = await dialog.showSaveDialog({ title: 'Salva copia di recupero', defaultPath: 'Cash.recovery.json', filters: [{ name: 'Archivio Cash', extensions: ['json'] }] });
    if (choice.canceled || !choice.filePath) return err({ code: 'CANCELLED', message: 'Salvataggio copia annullato.' });
    return saveRecoveryCopy(choice.filePath, document);
  });
  ipcMain.handle(IPC.archiveInspect, (_event, path: string) => selectedPathValid(path)
    ? inspectArchive(path) : err({ code: 'CONFLICT', source: 'archive', message: 'Percorso non appartenente alla sessione attiva.' }));
  ipcMain.handle(IPC.tokenHas, () => hasFicToken());
  ipcMain.handle(IPC.tokenSet, (_event, token: string) => setFicToken(token));
  ipcMain.handle(IPC.tokenDelete, () => deleteFicToken());
  ipcMain.handle(IPC.mimitFuel, (_event, input: { territory: string; fuel: Fuel }) => latestFuelPrice(input.territory, input.fuel));
  ipcMain.handle(IPC.foiRevalue, (_event, input: { amount: string; fromPeriod: string }) => revalueFoi(input.amount, input.fromPeriod));
  ipcMain.handle(IPC.ficClients, async (_event, input: { companyId: string; query: string }) => {
    const token = await requireFicToken(); return token.ok ? searchClients(input.companyId, input.query, token.value) : token;
  });
  ipcMain.handle(IPC.ficProduct, async (_event, input: { companyId: string; productId: string }) => {
    const token = await requireFicToken(); return token.ok ? verifyProduct(input.companyId, input.productId, token.value) : token;
  });
  ipcMain.handle(IPC.ficExport, async (_event, input) => {
    const token = await requireFicToken(); return token.ok ? exportQuote(input, token.value) : token;
  });
  ipcMain.on(IPC.appDirty, (_event, value: boolean) => { dirty = value; });
}

async function detectExternalChange(): Promise<void> {
  if (!current || !window) return;
  const disk = await inspectArchive(current.path);
  if (!disk.ok) { window.webContents.send(IPC.appExternal, disk.error); return; }
  const mismatch = disk.value.header.documentId !== current.token.documentId || disk.value.header.revision !== current.token.revision || disk.value.fingerprint !== current.token.fingerprint;
  if (mismatch) window.webContents.send(IPC.appExternal, { code: 'CONFLICT', source: 'archive', message: dirty
    ? 'Il file è cambiato altrove mentre esistono modifiche locali.' : 'È disponibile una versione diversa del file.',
    action: dirty ? 'Salvare una copia di recupero o scartare e ricaricare.' : 'Riaprire esplicitamente l’archivio.' });
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({ width: 1360, height: 900, minWidth: 1024, minHeight: 700, show: false,
    backgroundColor: '#f5f2ea', webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true } });
  window.removeMenu();
  await window.loadFile(join(__dirname, '../renderer/index.html'));
  window.once('ready-to-show', () => window?.show());
  window.on('focus', () => void detectExternalChange());
  window.on('close', event => {
    if (!dirty || closingApproved) return;
    event.preventDefault();
    void dialog.showMessageBox(window!, { type: 'warning', title: 'Modifiche non salvate',
      message: 'Esistono modifiche non salvate. Riprova il salvataggio o crea una copia di recupero prima di chiudere.',
      buttons: ['Annulla', 'Chiudi senza salvare'], defaultId: 0, cancelId: 0 }).then(choice => {
        if (choice.response === 1) { closingApproved = true; window?.close(); }
      });
  });
}

app.whenReady().then(() => { registerHandlers(); void createWindow(); setInterval(() => void detectExternalChange(), 30_000); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
