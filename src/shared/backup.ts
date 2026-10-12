import type { CashError, Result } from '../domain/model';
import type { ArchiveSession } from './archive';

export interface BackupConfig {
  installationId: string;
  destination: string;
  enabled: boolean;
  intervalHours: 6 | 12 | 24 | 168;
  retention: 5 | 10 | 20 | 30;
}
export interface BackupEntry {
  id: string;
  path: string;
  completedAt: string;
  documentId: string;
  revision: number;
  size: number;
  verification: 'valid' | 'invalid';
  error?: CashError;
}
export interface BackupState {
  config: BackupConfig | null;
  running: boolean;
  phase?: 'preparing' | 'snapshot' | 'verifying' | 'copying' | 'completing';
  bytesCopied?: number;
  totalBytes?: number;
  operationDocumentId?: string;
  currentRevision?: number;
  latest: BackupEntry | null;
  nextAt: string | null;
  entries: BackupEntry[];
  error: CashError | null;
  warning: CashError | null;
  destinationMissing: boolean;
}
export interface BackupApi {
  getState(): Promise<Result<BackupState>>;
  configure(
    input: Pick<BackupConfig, 'enabled' | 'intervalHours' | 'retention'>,
  ): Promise<Result<BackupState>>;
  selectDirectory(): Promise<Result<BackupState>>;
  recreateDirectory(): Promise<Result<BackupState>>;
  run(): Promise<Result<BackupState>>;
  verify(id: string): Promise<Result<BackupState>>;
  verifyFile(): Promise<Result<import('./archive').ArchiveInspection>>;
  restore(id?: string): Promise<Result<ArchiveSession>>;
  openFolder(): Promise<Result<void>>;
  reveal(id: string): Promise<Result<void>>;
  onState(listener: (state: BackupState) => void): () => void;
}
