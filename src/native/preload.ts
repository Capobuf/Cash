import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type CashNativeApi } from '../shared/ipc';

const api: CashNativeApi = {
  archive: {
    create: document => ipcRenderer.invoke(IPC.archiveCreate, document),
    open: () => ipcRenderer.invoke(IPC.archiveOpen),
    openLast: () => ipcRenderer.invoke(IPC.archiveOpenLast),
    save: (path, document, token) => ipcRenderer.invoke(IPC.archiveSave, path, document, token),
    saveRecovery: document => ipcRenderer.invoke(IPC.archiveRecovery, document),
    restoreBackup: (path, token) => ipcRenderer.invoke(IPC.archiveRestore, path, token),
    inspect: path => ipcRenderer.invoke(IPC.archiveInspect, path),
  },
  credentials: {
    hasFicToken: () => ipcRenderer.invoke(IPC.tokenHas),
    setFicToken: token => ipcRenderer.invoke(IPC.tokenSet, token),
  },
  mimit: { latestFuelPrice: input => ipcRenderer.invoke(IPC.mimitFuel, input) },
  istat: { revalue: input => ipcRenderer.invoke(IPC.foiRevalue, input) },
  fic: {
    setupInfo: () => ipcRenderer.invoke(IPC.ficSetupInfo),
    setClientId: clientId => ipcRenderer.invoke(IPC.ficSetClientId, clientId),
    listCompaniesForActivation: token => ipcRenderer.invoke(IPC.ficWizardCompanies, token),
    listProductsForActivation: input => ipcRenderer.invoke(IPC.ficWizardProducts, input),
    completeActivation: input => ipcRenderer.invoke(IPC.ficWizardActivate, input),
    removeLink: input => ipcRenderer.invoke(IPC.ficRemoveLink, input),
    searchClients: input => ipcRenderer.invoke(IPC.ficClients, input),
    verifyProduct: input => ipcRenderer.invoke(IPC.ficProduct, input),
    exportQuote: input => ipcRenderer.invoke(IPC.ficExport, input),
  },
  setDirty: dirty => ipcRenderer.send(IPC.appDirty, dirty),
  onExternalChange: listener => {
    const wrapped = (_event: Electron.IpcRendererEvent, error: Parameters<typeof listener>[0]) => listener(error);
    ipcRenderer.on(IPC.appExternal, wrapped);
    return () => ipcRenderer.removeListener(IPC.appExternal, wrapped);
  },
  onArchiveReloaded: listener => {
    const wrapped = (_event: Electron.IpcRendererEvent, session: Parameters<typeof listener>[0]) => listener(session);
    ipcRenderer.on(IPC.appArchiveReloaded, wrapped); return () => ipcRenderer.removeListener(IPC.appArchiveReloaded, wrapped);
  },
  onCloseRequested: listener => {
    const wrapped = () => listener(); ipcRenderer.on(IPC.appCloseRequested, wrapped);
    return () => ipcRenderer.removeListener(IPC.appCloseRequested, wrapped);
  },
  resolveClose: choice => ipcRenderer.send(IPC.appResolveClose, choice),
};

contextBridge.exposeInMainWorld('cash', api);
