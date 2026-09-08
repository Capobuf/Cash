import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type CashNativeApi } from '../shared/ipc';

const api: CashNativeApi = {
  archive: {
    create: document => ipcRenderer.invoke(IPC.archiveCreate, document),
    open: () => ipcRenderer.invoke(IPC.archiveOpen),
    openLast: () => ipcRenderer.invoke(IPC.archiveOpenLast),
    save: (path, document, token) => ipcRenderer.invoke(IPC.archiveSave, path, document, token),
    saveRecovery: document => ipcRenderer.invoke(IPC.archiveRecovery, document),
    inspect: path => ipcRenderer.invoke(IPC.archiveInspect, path),
  },
  credentials: {
    hasFicToken: () => ipcRenderer.invoke(IPC.tokenHas),
    setFicToken: token => ipcRenderer.invoke(IPC.tokenSet, token),
    deleteFicToken: () => ipcRenderer.invoke(IPC.tokenDelete),
  },
  mimit: { latestFuelPrice: input => ipcRenderer.invoke(IPC.mimitFuel, input) },
  istat: { revalue: input => ipcRenderer.invoke(IPC.foiRevalue, input) },
  fic: {
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
};

contextBridge.exposeInMainWorld('cash', api);
