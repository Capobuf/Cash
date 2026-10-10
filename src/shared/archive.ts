import type { CashDocument, Result } from '../domain/model';

export interface ConcurrencyToken {
  documentId: string;
  revision: number;
}

export interface ArchiveSession {
  path: string;
  document?: CashDocument;
  token: ConcurrencyToken;
  readOnly: boolean;
  headerOnly?: true;
  schemaVersion?: number;
  storageVersion?: number;
}

export interface ArchiveInspection {
  header: Pick<
    CashDocument,
    'schemaVersion' | 'documentId' | 'revision' | 'createdAt' | 'updatedAt'
  >;
  storageVersion: number;
  size: number;
}

export interface MigrationPreview {
  fromVersion: number;
  toVersion: number;
  changes: string[];
  blockers: string[];
}

export interface ArchiveStorage {
  create(path: string, document: CashDocument): Promise<Result<ArchiveSession>>;
  open(path: string): Promise<Result<ArchiveSession>>;
  save(
    path: string,
    document: CashDocument,
    token: ConcurrencyToken,
  ): Promise<Result<ArchiveSession>>;
  inspect(path: string): Promise<Result<ArchiveInspection>>;
  recovery(
    path: string,
    document: CashDocument,
  ): Promise<Result<ArchiveSession>>;
  restore(
    path: string,
    token: ConcurrencyToken,
  ): Promise<Result<ArchiveSession>>;
  importJson(
    source: string,
    destination: string,
  ): Promise<Result<ArchiveSession>>;
  close(path: string): void;
}
