import type { ArchiveSession, ConcurrencyToken } from '../native/persistence';
import type { CashDocument, CashError, ExportLine, FicClientDetails, FicClientSnapshot, Fuel, FuelEvidence, FoiEvidence, Result } from '../domain/model';

export const IPC = {
  archiveCreate: 'cash:archive:create', archiveOpen: 'cash:archive:open', archiveOpenLast: 'cash:archive:open-last', archiveSave: 'cash:archive:save',
  archiveRecovery: 'cash:archive:recovery', archiveRestore: 'cash:archive:restore', archiveInspect: 'cash:archive:inspect',
  tokenHas: 'cash:token:has', tokenSet: 'cash:token:set',
  mimitFuel: 'cash:mimit:fuel', foiRevalue: 'cash:foi:revalue', ficClients: 'cash:fic:clients', ficClientDetails: 'cash:fic:client-details',
  ficProduct: 'cash:fic:product', ficExport: 'cash:fic:export', ficWizardCompanies: 'cash:fic:wizard-companies',
  ficWizardProducts: 'cash:fic:wizard-products', ficWizardActivate: 'cash:fic:wizard-activate', ficRemoveLink: 'cash:fic:remove-link',
  ficSetupInfo: 'cash:fic:setup-info', ficSetClientId: 'cash:fic:set-client-id',
  appExternal: 'cash:app:external', appArchiveReloaded: 'cash:app:archive-reloaded', appDirty: 'cash:app:dirty', appCloseRequested: 'cash:app:close-requested', appResolveClose: 'cash:app:resolve-close',
} as const;

export interface CashNativeApi {
  archive: {
    create(document: CashDocument): Promise<Result<ArchiveSession>>;
    open(): Promise<Result<ArchiveSession>>;
    openLast(): Promise<Result<ArchiveSession | null>>;
    save(path: string, document: CashDocument, token: ConcurrencyToken): Promise<Result<ArchiveSession>>;
    saveRecovery(document: CashDocument): Promise<Result<ArchiveSession>>;
    restoreBackup(path: string, token: ConcurrencyToken): Promise<Result<ArchiveSession>>;
    inspect(path: string): Promise<Result<{ header: { schemaVersion: number; documentId: string; revision: number; createdAt: string; updatedAt: string }; fingerprint: string; size: number }>>;
  };
  credentials: {
    hasFicToken(): Promise<Result<boolean>>;
    setFicToken(token: string): Promise<Result<void>>;
  };
  mimit: { latestFuelPrice(input: { territory: string; fuel: Fuel }): Promise<Result<FuelEvidence>> };
  istat: { revalue(input: { amount: string; fromPeriod: string }): Promise<Result<FoiEvidence>> };
  fic: {
    setupInfo(): Promise<{ clientId: string; requiredScopes: string[] }>;
    setClientId(clientId: string): Promise<Result<{ clientId: string }>>;
    listCompaniesForActivation(token: string): Promise<Result<Array<{ id: string; name: string }>>>;
    listProductsForActivation(input: { token: string; companyId: string }): Promise<Result<Array<{ id: string; name: string }>>>;
    completeActivation(input: { token: string; companyId: string; productId: string; path: string; document: CashDocument; concurrencyToken: ConcurrencyToken }): Promise<Result<ArchiveSession>>;
    removeLink(input: { path: string; document: CashDocument; concurrencyToken: ConcurrencyToken }): Promise<Result<ArchiveSession>>;
    searchClients(input: { companyId: string; query: string }): Promise<Result<FicClientSnapshot[]>>;
    getClientDetails(input: { companyId: string; clientId: string }): Promise<Result<FicClientDetails>>;
    verifyProduct(input: { companyId: string; productId: string }): Promise<Result<{ id: string; name: string }>>;
    exportQuote(input: { companyId: string; clientId: string; productId: string; lines: ExportLine[]; attemptId: string }): Promise<Result<{ outcome: 'success' | 'rejected' | 'uncertain'; remoteDocumentId?: string; diagnostic?: string }>>;
  };
  setDirty(dirty: boolean): void;
  onExternalChange(listener: (error: CashError) => void): () => void;
  onArchiveReloaded(listener: (session: ArchiveSession) => void): () => void;
  onCloseRequested(listener: () => void): () => void;
  resolveClose(choice: 'discard' | 'cancel'): void;
}

declare global { interface Window { cash: CashNativeApi } }
