import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { join } from 'node:path';
import { createEmptyDocument, err, ok, type CashDocument, type Fuel } from '../domain/model';
import { createArchive, inspectArchive, migrateArchive, openArchive, previewMigration, restoreBackup, saveArchive, saveRecoveryCopy, type ArchiveSession, type ConcurrencyToken } from './persistence';
import { deleteFicToken, hasFicToken, requireFicToken, setFicToken } from './credentials';
import { latestFuelPrice } from './integrations/mimit';
import { revalueFoi } from './integrations/foi';
import { exportQuote, getClientDetails, listCompanies, listConsultingProducts, searchClients, verifyActivation, verifyProduct } from './integrations/fatture-in-cloud';
import { IPC } from '../shared/ipc';
import { requireActiveFic } from '../domain/integration';
import { commitFicActivation, removeFicLinkAtomically, type FicLinkServices } from './fic-link';
import { readPreferences, rememberArchive, setFicClientId } from './preferences';

const FIC_SCOPES = ['entity.clients:r', 'products:r', 'settings:r', 'issued_documents.quotes:a'];

let window: BrowserWindow | null = null;
let current: ArchiveSession | null = null;
let dirty = false;
let closingApproved = false;
let closePromptOpen = false;

function selectedPathValid(path: string): boolean { return current?.path === path; }
function activeFicCompany(companyId: string): boolean {
  return current?.document ? requireActiveFic(current.document.settings, companyId).ok : false;
}
const ficLinkServices:FicLinkServices={verify:verifyActivation,hasToken:hasFicToken,readToken:requireFicToken,writeToken:setFicToken,deleteToken:deleteFicToken,save:saveArchive};
async function selectOpen() {
  const choice = await dialog.showOpenDialog({ title: 'Apri archivio Cash', properties: ['openFile'], filters: [{ name: 'Archivio Cash', extensions: ['json'] }] });
  if (choice.canceled || !choice.filePaths[0]) return err({ code: 'CANCELLED', message: 'Apertura annullata.' });
  const result = await openArchive(choice.filePaths[0]);
  if (!result.ok && result.error.code === 'MIGRATION_REQUIRED') {
    const preview = await previewMigration(choice.filePaths[0]);
    if (!preview.ok) return preview;
    const confirmation = await dialog.showMessageBox({ type: 'warning', title: 'Migrazione archivio Cash',
      message: `Migrare lo schema ${preview.value.fromVersion} allo schema ${preview.value.toVersion}?`,
      detail: `${preview.value.changes.join('\n')}\n\nBackup: ${preview.value.backupPath}`,
      buttons: ['Annulla', 'Crea backup e migra'], defaultId: 0, cancelId: 0 });
    if (confirmation.response !== 1) return err({ code: 'CANCELLED', source: 'archive', message: 'Migrazione annullata.' });
    const migrated = await migrateArchive(choice.filePaths[0]);
    if (migrated.ok) { current = migrated.value; await rememberArchive(migrated.value.path); }
    return migrated;
  }
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
  ipcMain.handle(IPC.archiveRestore, async (_event, path:string, token:ConcurrencyToken) => {
    if(!selectedPathValid(path)||current?.readOnly)return err({code:'CONFLICT',source:'archive',message:'Sessione archivio non valida o in sola lettura.'});
    const choice=await dialog.showMessageBox({type:'warning',title:'Ripristina copia di sicurezza',message:'Ripristinare la precedente versione valida?',detail:'Cash conserverà copie datate sia del file corrente sia del backup e creerà una nuova identità archivio.',buttons:['Annulla','Ripristina'],defaultId:0,cancelId:0});
    if(choice.response!==1)return err({code:'CANCELLED',source:'archive',message:'Ripristino annullato.'});const result=await restoreBackup(path,token);if(result.ok){current=result.value;dirty=false;}return result;
  });
  ipcMain.handle(IPC.archiveInspect, (_event, path: string) => selectedPathValid(path)
    ? inspectArchive(path) : err({ code: 'CONFLICT', source: 'archive', message: 'Percorso non appartenente alla sessione attiva.' }));
  ipcMain.handle(IPC.tokenHas, () => hasFicToken());
  ipcMain.handle(IPC.tokenSet, (_event, value: unknown) => setFicToken(typeof value === 'string' ? value : ''));
  ipcMain.handle(IPC.mimitFuel, (_event, input: { territory: string; fuel: Fuel }) => latestFuelPrice(input.territory, input.fuel));
  ipcMain.handle(IPC.foiRevalue, (_event, input: { amount: string; fromPeriod: string }) => revalueFoi(input.amount, input.fromPeriod));
  ipcMain.handle(IPC.ficSetupInfo, async () => ({ clientId: (await readPreferences()).ficClientId?.trim() ?? '', requiredScopes: FIC_SCOPES }));
  ipcMain.handle(IPC.ficSetClientId, async (_event, value: unknown) => {
    const clientId = typeof value === 'string' ? value.trim() : '';
    if (!clientId) return err({ code: 'VALIDATION', source: 'FattureInCloud', field: 'clientId', message: 'Il Client ID è obbligatorio.' });
    try { await setFicClientId(clientId); return ok({ clientId }); }
    catch (cause) { return err({ code: 'IO', source: 'FattureInCloud', message: 'Impossibile salvare il Client ID nelle preferenze locali.', details: [String(cause)] }); }
  });
  ipcMain.handle(IPC.ficWizardCompanies, (_event, token: string) => listCompanies(token));
  ipcMain.handle(IPC.ficWizardProducts, (_event, input: { token: string; companyId: string }) => listConsultingProducts(input.token, input.companyId));
  ipcMain.handle(IPC.ficWizardActivate, async (_event, input: { token: string; companyId: string; productId: string; path: string; document: CashDocument; concurrencyToken: ConcurrencyToken }) => {
    if (!selectedPathValid(input.path) || current?.readOnly)
      return err({ code: 'CONFLICT', source: 'archive', message: 'Sessione archivio non valida o in sola lettura.' });
    const saved = await commitFicActivation(input,ficLinkServices);
    if (!saved.ok) return saved;
    current = saved.value;
    dirty = false;
    return saved;
  });
  ipcMain.handle(IPC.ficRemoveLink, async (_event, input: { path: string; document: CashDocument; concurrencyToken: ConcurrencyToken }) => {
    if (!selectedPathValid(input.path) || current?.readOnly)
      return err({ code: 'CONFLICT', source: 'archive', message: 'Sessione archivio non valida o in sola lettura.' });
    const saved = await removeFicLinkAtomically(input,ficLinkServices);
    if (!saved.ok) return saved;
    current = saved.value;
    dirty = false;
    return saved;
  });
  ipcMain.handle(IPC.ficClients, async (_event, input: { companyId: string; query: string }) => {
    if (!activeFicCompany(input.companyId)) return err({ code: 'VALIDATION', source: 'FattureInCloud', message: 'Integrazione Fatture in Cloud disattivata o azienda non configurata.' });
    const token = await requireFicToken(); return token.ok ? searchClients(input.companyId, input.query, token.value) : token;
  });
  ipcMain.handle(IPC.ficClientDetails, async (_event, input: { companyId: string; clientId: string }) => {
    if (!activeFicCompany(input.companyId)) return err({ code: 'VALIDATION', source: 'FattureInCloud', message: 'Integrazione Fatture in Cloud disattivata o azienda non configurata.' });
    const token = await requireFicToken(); return token.ok ? getClientDetails(input.companyId, input.clientId, token.value) : token;
  });
  ipcMain.handle(IPC.ficProduct, async (_event, input: { companyId: string; productId: string }) => {
    if (!activeFicCompany(input.companyId) || current?.document?.settings.fic.product?.id !== input.productId)
      return err({ code: 'VALIDATION', source: 'FattureInCloud', message: 'Integrazione Fatture in Cloud disattivata o prodotto non configurato.' });
    const token = await requireFicToken(); return token.ok ? verifyProduct(input.companyId, input.productId, token.value) : token;
  });
  ipcMain.handle(IPC.ficExport, async (_event, input) => {
    if (!activeFicCompany(input.companyId) || current?.document?.settings.fic.product?.id !== input.productId)
      return err({ code: 'VALIDATION', source: 'FattureInCloud', message: 'Integrazione Fatture in Cloud disattivata o configurazione incoerente.' });
    const token = await requireFicToken();if(!token.ok)return token;const product=await verifyProduct(input.companyId,input.productId,token.value);return product.ok?exportQuote({...input,product:product.value},token.value):product;
  });
  ipcMain.on(IPC.appDirty, (_event, value: boolean) => { dirty = value; });
  ipcMain.on(IPC.appResolveClose, (_event, choice: 'discard' | 'cancel') => {
    closePromptOpen = false;
    if (choice === 'discard') { closingApproved = true; window?.close(); }
  });
}

async function detectExternalChange(): Promise<void> {
  if (!current || !window) return;
  const disk = await inspectArchive(current.path);
  if (!disk.ok) { window.webContents.send(IPC.appExternal, disk.error); return; }
  if (!dirty && disk.value.header.documentId === current.token.documentId && disk.value.header.revision > current.token.revision) {
    const reloaded = await openArchive(current.path);
    if (reloaded.ok && reloaded.value.document) { current = reloaded.value; window.webContents.send(IPC.appArchiveReloaded, reloaded.value); return; }
  }
  const mismatch = disk.value.header.documentId !== current.token.documentId || disk.value.header.revision !== current.token.revision || disk.value.fingerprint !== current.token.fingerprint;
  if (mismatch) window.webContents.send(IPC.appExternal, { code: 'CONFLICT', source: 'archive', message: dirty
    ? 'Il file è cambiato altrove mentre esistono modifiche locali.' : 'È disponibile una versione diversa del file.',
    action: dirty ? 'Salvare una copia di recupero o scartare e ricaricare.' : 'Confrontare i metadati e riaprire esplicitamente l’archivio.',
    details: [`Caricato: ${current.token.documentId} rev. ${current.token.revision}`, `Disco: ${disk.value.header.documentId} rev. ${disk.value.header.revision}`] });
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
    if (!closePromptOpen) { closePromptOpen = true; window?.webContents.send(IPC.appCloseRequested); }
  });
}

app.whenReady().then(() => { registerHandlers(); void createWindow(); setInterval(() => void detectExternalChange(), 30_000); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
