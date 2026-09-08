import type { ArchiveSession, ConcurrencyToken } from '../native/persistence';
import type { CashDocument, CashError, ClientSnapshot, ExportLine, Fuel, FuelEvidence, FoiEvidence, Result } from '../domain/model';

export const IPC = {
  archiveCreate: 'cash:archive:create', archiveOpen: 'cash:archive:open', archiveOpenLast: 'cash:archive:open-last', archiveSave: 'cash:archive:save',
  archiveRecovery: 'cash:archive:recovery', archiveInspect: 'cash:archive:inspect',
  tokenHas: 'cash:token:has', tokenSet: 'cash:token:set', tokenDelete: 'cash:token:delete',
  mimitFuel: 'cash:mimit:fuel', foiRevalue: 'cash:foi:revalue', ficClients: 'cash:fic:clients',
  ficProduct: 'cash:fic:product', ficExport: 'cash:fic:export', appExternal: 'cash:app:external', appDirty: 'cash:app:dirty',
} as const;

export interface CashNativeApi {
  archive: {
    create(document: CashDocument): Promise<Result<ArchiveSession>>;
    open(): Promise<Result<ArchiveSession>>;
    openLast(): Promise<Result<ArchiveSession | null>>;
    save(path: string, document: CashDocument, token: ConcurrencyToken): Promise<Result<ArchiveSession>>;
    saveRecovery(document: CashDocument): Promise<Result<ArchiveSession>>;
    inspect(path: string): Promise<Result<{ header: { schemaVersion: number; documentId: string; revision: number; createdAt: string; updatedAt: string }; fingerprint: string; size: number }>>;
  };
  credentials: { hasFicToken(): Promise<Result<boolean>>; setFicToken(token: string): Promise<Result<void>>; deleteFicToken(): Promise<Result<void>> };
  mimit: { latestFuelPrice(input: { territory: string; fuel: Fuel }): Promise<Result<FuelEvidence>> };
  istat: { revalue(input: { amount: string; fromPeriod: string }): Promise<Result<FoiEvidence>> };
  fic: {
    searchClients(input: { companyId: string; query: string }): Promise<Result<ClientSnapshot[]>>;
    verifyProduct(input: { companyId: string; productId: string }): Promise<Result<{ id: string; name: string }>>;
    exportQuote(input: { companyId: string; clientId: string; productId: string; lines: ExportLine[]; attemptId: string }): Promise<Result<{ outcome: 'success' | 'rejected' | 'uncertain'; remoteDocumentId?: string; diagnostic?: string }>>;
  };
  setDirty(dirty: boolean): void;
  onExternalChange(listener: (error: CashError) => void): () => void;
}

declare global { interface Window { cash: CashNativeApi } }
