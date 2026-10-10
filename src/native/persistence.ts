import { open, link, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { DatabaseSync, backup } from 'node:sqlite';
import {
  CURRENT_SCHEMA_VERSION,
  err,
  ok,
  type CashDocument,
  type Result,
} from '../domain/model';
import {
  cashDocumentSchema,
  parseDocument,
  validationErrorFromIssues,
} from '../domain/schema';
import type {
  ArchiveInspection,
  ArchiveSession,
  ArchiveStorage,
  ConcurrencyToken,
} from '../shared/archive';
import { inspectJsonArchive, readLegacyDocument } from './legacy-import';
import { runSchemaMigrations } from './sqlite-migrations';
import {
  APPLICATION_ID,
  STORAGE_VERSION,
  checkIntegrity,
  createSchema,
  documentRows,
  readDocument,
  readHeader,
  writeDocumentRows,
  type DocumentRows,
} from './sqlite-document';

interface Connection {
  db: DatabaseSync;
  rows: DocumentRows;
  document: CashDocument;
  busy: boolean;
  closing: boolean;
}
const connections = new Map<string, Connection>();
let saveQueue: Promise<unknown> = Promise.resolve();

function failure<T>(cause: unknown, message: string): Result<T> {
  return err({
    code:
      (cause as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'FILE_NOT_FOUND'
        : (cause as NodeJS.ErrnoException).code === 'EEXIST'
          ? 'CONFLICT'
          : 'IO',
    source: 'archive',
    message,
    details: [String(cause)],
  });
}
function configure(db: DatabaseSync): void {
  db.exec(
    'PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;',
  );
  if (
    db.prepare('PRAGMA foreign_keys').get()!.foreign_keys !== 1 ||
    db.prepare('PRAGMA busy_timeout').get()!.timeout !== 5000 ||
    db.prepare('PRAGMA journal_mode').get()!.journal_mode !== 'wal' ||
    db.prepare('PRAGMA synchronous').get()!.synchronous !== 2
  )
    throw new Error(
      'Il runtime non supporta le impostazioni SQLite richieste.',
    );
}
function readonly(path: string): DatabaseSync {
  return new DatabaseSync(path, { readOnly: true });
}
function version(db: DatabaseSync): number {
  return Number(db.prepare('PRAGMA user_version').get()!.user_version);
}
function recognize(db: DatabaseSync): void {
  if (
    db.prepare('PRAGMA application_id').get()!.application_id !== APPLICATION_ID
  )
    throw new Error('Il database SQLite non è un archivio Cash.');
}
function session(path: string, document: CashDocument): ArchiveSession {
  return {
    path,
    document,
    token: { documentId: document.documentId, revision: document.revision },
    readOnly: false,
    storageVersion: STORAGE_VERSION,
  };
}
function matches(db: DatabaseSync, token: ConcurrencyToken): boolean {
  const header = readHeader(db);
  return (
    header.documentId === token.documentId && header.revision === token.revision
  );
}
const conflict = (): Result<never> =>
  err({
    code: 'CONFLICT',
    source: 'archive',
    message: 'Archivio modificato o sessione terminata: operazione bloccata.',
    action: 'Salva una copia di recupero oppure scarta e ricarica.',
  });

export function backupPathFor(path: string): string {
  return join(dirname(path), `${basename(path, extname(path))}.backup.sqlite`);
}
export function closeArchive(path: string): void {
  const key = resolve(path);
  const connection = connections.get(key);
  if (connection) {
    connection.closing = true;
    if (!connection.busy) connection.db.close();
    connections.delete(key);
  }
}
export function closeAllArchives(): void {
  for (const path of connections.keys()) closeArchive(path);
}

export async function inspectArchive(
  path: string,
): Promise<Result<ArchiveInspection>> {
  let db: DatabaseSync | undefined;
  try {
    const info = await stat(path);
    db = readonly(path);
    recognize(db);
    return ok({
      header: readHeader(db),
      storageVersion: version(db),
      size: info.size,
    });
  } catch (cause) {
    return failure(cause, 'Impossibile ispezionare l’archivio SQLite.');
  } finally {
    db?.close();
  }
}

export async function openArchive(
  path: string,
): Promise<Result<ArchiveSession>> {
  let db: DatabaseSync | undefined;
  try {
    await stat(path);
    const handle = await open(path, 'r');
    const signature = Buffer.alloc(16);
    try {
      await handle.read(signature, 0, 16, 0);
    } finally {
      await handle.close();
    }
    if (signature.toString('utf8') !== 'SQLite format 3\0') {
      const legacy = await inspectJsonArchive(path);
      return legacy.ok
        ? err({
            code: 'MIGRATION_REQUIRED',
            source: 'archive',
            message:
              'L’archivio JSON deve essere importato in un nuovo SQLite. L’originale verrà conservato.',
          })
        : legacy;
    }
    if (/^(\\\\|\/\/)/.test(path))
      return err({
        code: 'VALIDATION',
        source: 'archive',
        message: 'Il database attivo deve risiedere su disco locale.',
      });
    // Unsupported schemas are inspected read-only before any PRAGMA that writes.
    db = readonly(path);
    recognize(db);
    const storageVersion = version(db);
    const header = readHeader(db);
    checkIntegrity(db);
    if (
      storageVersion > STORAGE_VERSION ||
      header.schemaVersion > CURRENT_SCHEMA_VERSION
    ) {
      return ok({
        path,
        token: { documentId: header.documentId, revision: header.revision },
        readOnly: true,
        headerOnly: true,
        schemaVersion: header.schemaVersion,
        storageVersion,
      });
    }
    db.close();
    db = undefined;
    if (storageVersion < STORAGE_VERSION) await runSchemaMigrations(path);
    let connection = connections.get(resolve(path));
    if (connection?.busy) return conflict();
    if (!connection) {
      db = new DatabaseSync(path);
      recognize(db);
      if (
        version(db) !== STORAGE_VERSION ||
        readHeader(db).schemaVersion !== CURRENT_SCHEMA_VERSION
      )
        throw new Error('Schema archivio cambiato durante l’apertura.');
      configure(db);
      db.exec('BEGIN');
      let document: CashDocument;
      try {
        checkIntegrity(db);
        document = readDocument(db);
        db.exec('COMMIT');
      } catch (cause) {
        db.exec('ROLLBACK');
        throw cause;
      }
      connection = {
        db,
        document,
        rows: documentRows(document),
        busy: false,
        closing: false,
      };
      connections.set(resolve(path), connection);
      db = undefined;
    } else {
      connection.db.exec('BEGIN');
      try {
        const document = readDocument(connection.db);
        connection.db.exec('COMMIT');
        connection.document = document;
        connection.rows = documentRows(document);
      } catch (cause) {
        connection.db.exec('ROLLBACK');
        throw cause;
      }
    }
    return ok(session(path, structuredClone(connection.document)));
  } catch (cause) {
    return failure(
      cause,
      'Impossibile aprire l’archivio SQLite; seleziona un archivio o un backup valido.',
    );
  } finally {
    db?.close();
  }
}

function temporaryPath(path: string): string {
  return join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
}
async function writeNew(path: string, document: CashDocument): Promise<void> {
  let db: DatabaseSync | undefined;
  const temp = temporaryPath(path);
  try {
    const handle = await open(temp, 'wx');
    await handle.close();
    db = new DatabaseSync(temp);
    configure(db);
    db.exec('BEGIN IMMEDIATE');
    try {
      createSchema(db);
      writeDocumentRows(db, documentRows(document));
      checkIntegrity(db, true);
      const reconstructed = readDocument(db);
      if (
        !isDeepStrictEqual(
          JSON.parse(JSON.stringify(document)),
          JSON.parse(JSON.stringify(reconstructed)),
        )
      )
        throw new Error(
          'Il round-trip completo SQLite non corrisponde ai dati di origine.',
        );
      db.exec('COMMIT');
    } catch (cause) {
      db.exec('ROLLBACK');
      throw cause;
    }
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
    db = undefined;
    // An exclusive link publishes a closed file without overwriting a target
    // that appeared during import (rename would overwrite it).
    await link(temp, path);
  } finally {
    db?.close();
    await rm(temp, { force: true });
  }
}
function localPath(path: string): Result<void> {
  if (/^(\\\\|\/\/)/.test(path))
    return err({
      code: 'VALIDATION',
      source: 'archive',
      message:
        'L’archivio attivo deve risiedere su disco locale, fuori da cartelle sincronizzate.',
    });
  if (!path.toLowerCase().endsWith('.sqlite'))
    return err({
      code: 'VALIDATION',
      source: 'archive',
      field: 'path',
      message: 'Il nome dell’archivio deve terminare con .sqlite.',
    });
  return ok(undefined);
}
export async function createArchive(
  path: string,
  document: CashDocument,
): Promise<Result<ArchiveSession>> {
  const valid = localPath(path);
  if (!valid.ok) return valid;
  const parsed = cashDocumentSchema.safeParse({
    ...document,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: 1,
  });
  if (!parsed.success)
    return err(validationErrorFromIssues(parsed.error.issues));
  try {
    await writeNew(path, parsed.data);
    return await openArchive(path);
  } catch (cause) {
    return failure(
      cause,
      'Creazione atomica non riuscita. Nessun file preesistente è stato sovrascritto.',
    );
  }
}

export async function importJsonArchive(
  source: string,
  destination: string,
): Promise<Result<ArchiveSession>> {
  const valid = localPath(destination);
  if (!valid.ok) return valid;
  const document = await readLegacyDocument(source);
  if (!document.ok) return document;
  try {
    await writeNew(destination, document.value);
    return await openArchive(destination);
  } catch (cause) {
    return failure(
      cause,
      'Importazione non riuscita. L’archivio JSON originale e i suoi backup sono stati conservati.',
    );
  }
}

async function consistentBackup(
  path: string,
  destination: string,
  expected?: ConcurrencyToken,
): Promise<void> {
  const temp = temporaryPath(destination);
  let source: DatabaseSync | undefined;
  let copy: DatabaseSync | undefined;
  try {
    source = readonly(path);
    recognize(source);
    await backup(source, temp);
    copy = new DatabaseSync(temp);
    recognize(copy);
    checkIntegrity(copy, true);
    if (expected && !matches(copy, expected))
      throw new Error('Il backup non corrisponde alla revisione attesa.');
    readDocument(copy);
    if (
      copy.prepare('PRAGMA journal_mode=DELETE').get()!.journal_mode !==
      'delete'
    )
      throw new Error(
        'Impossibile chiudere il backup SQLite come copia autonoma.',
      );
    copy.close();
    copy = undefined;
    source.close();
    source = undefined;
    await rename(temp, destination);
  } finally {
    copy?.close();
    source?.close();
    await rm(temp, { force: true });
  }
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = saveQueue.then(task, task);
  saveQueue = result;
  return result;
}
export function saveArchive(
  path: string,
  document: CashDocument,
  token: ConcurrencyToken,
): Promise<Result<ArchiveSession>> {
  const connection = connections.get(resolve(path));
  const snapshot = structuredClone(document);
  return enqueue(async () => {
    if (!connection || connection !== connections.get(resolve(path)))
      return conflict();
    const parsed = cashDocumentSchema.safeParse({
      ...snapshot,
      documentId: token.documentId,
      revision: token.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    if (!parsed.success)
      return err(validationErrorFromIssues(parsed.error.issues));
    const db = connection.db;
    let transaction = false;
    connection.busy = true;
    try {
      await stat(path);
      if (connection.closing) return conflict();
      db.exec('BEGIN IMMEDIATE');
      transaction = true;
      recognize(db);
      if (
        version(db) !== STORAGE_VERSION ||
        readHeader(db).schemaVersion !== CURRENT_SCHEMA_VERSION
      )
        throw new Error(
          'Schema archivio cambiato; riapri con una versione compatibile di Cash.',
        );
      if (!matches(db, token)) {
        db.exec('ROLLBACK');
        transaction = false;
        return conflict();
      }
      await consistentBackup(path, backupPathFor(path), token);
      if (connection.closing) {
        db.exec('ROLLBACK');
        transaction = false;
        return conflict();
      }
      const rows = documentRows(parsed.data);
      writeDocumentRows(db, rows, connection.rows, token);
      db.exec('COMMIT');
      transaction = false;
      connection.document = parsed.data;
      connection.rows = rows;
      return ok(session(path, structuredClone(parsed.data)));
    } catch (cause) {
      if (transaction) {
        try {
          db.exec('ROLLBACK');
        } catch (rollback) {
          return failure(
            new Error(`${String(cause)}; rollback: ${String(rollback)}`),
            'Salvataggio e rollback non riusciti. Riapri l’archivio e verifica il backup.',
          );
        }
      }
      return failure(
        cause,
        'Salvataggio atomico non riuscito; le modifiche restano non salvate.',
      );
    } finally {
      connection.busy = false;
      if (connection.closing) db.close();
    }
  });
}

export async function saveRecoveryCopy(
  path: string,
  document: CashDocument,
): Promise<Result<ArchiveSession>> {
  const now = new Date().toISOString();
  const result = await createArchive(path, {
    ...structuredClone(document),
    documentId: randomUUID(),
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
  if (result.ok) closeArchive(path);
  return result;
}

export function restoreBackup(
  path: string,
  token: ConcurrencyToken,
): Promise<Result<ArchiveSession>> {
  const connection = connections.get(resolve(path));
  return enqueue(async () => {
    if (!connection || connection !== connections.get(resolve(path)))
      return conflict();
    const db = connection.db;
    let copy: DatabaseSync | undefined;
    let transaction = false;
    connection.busy = true;
    try {
      await stat(path);
      if (connection.closing) return conflict();
      copy = readonly(backupPathFor(path));
      recognize(copy);
      checkIntegrity(copy, true);
      if (
        version(copy) > STORAGE_VERSION ||
        readHeader(copy).schemaVersion > CURRENT_SCHEMA_VERSION
      )
        return err({
          code: 'SCHEMA_NEWER',
          source: 'archive',
          message: 'Il backup usa uno schema più recente; aggiorna Cash.',
        });
      if (version(copy) !== STORAGE_VERSION)
        throw new Error('Schema del backup non supportato.');
      const now = new Date().toISOString();
      const restored = parseDocument({
        ...readDocument(copy),
        documentId: randomUUID(),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      });
      copy.close();
      copy = undefined;
      db.exec('BEGIN IMMEDIATE');
      transaction = true;
      recognize(db);
      if (
        version(db) !== STORAGE_VERSION ||
        readHeader(db).schemaVersion !== CURRENT_SCHEMA_VERSION
      )
        throw new Error('Schema archivio cambiato durante il ripristino.');
      if (!matches(db, token)) {
        db.exec('ROLLBACK');
        transaction = false;
        return conflict();
      }
      const base = join(dirname(path), basename(path, extname(path)));
      const stamp = `${now.replace(/[:.]/g, '-')}.${randomUUID()}`;
      await consistentBackup(
        path,
        `${base}.prima-ripristino.${stamp}.sqlite`,
        token,
      );
      await consistentBackup(
        backupPathFor(path),
        `${base}.backup-conservato.${stamp}.sqlite`,
      );
      if (connection.closing) {
        db.exec('ROLLBACK');
        transaction = false;
        return conflict();
      }
      const rows = documentRows(restored);
      writeDocumentRows(db, rows, connection.rows, token);
      checkIntegrity(db, true);
      if (!isDeepStrictEqual(readDocument(db), restored))
        throw new Error('Verifica del ripristino fallita.');
      db.exec('COMMIT');
      transaction = false;
      connection.document = restored;
      connection.rows = rows;
      return ok(session(path, structuredClone(restored)));
    } catch (cause) {
      if (transaction) db.exec('ROLLBACK');
      return failure(
        cause,
        'Ripristino non riuscito; archivio corrente e backup sono stati conservati.',
      );
    } finally {
      copy?.close();
      connection.busy = false;
      if (connection.closing) db.close();
    }
  });
}

export const archiveStorage: ArchiveStorage = {
  create: createArchive,
  open: openArchive,
  save: saveArchive,
  inspect: inspectArchive,
  recovery: saveRecoveryCopy,
  restore: restoreBackup,
  importJson: importJsonArchive,
  close: closeArchive,
};
