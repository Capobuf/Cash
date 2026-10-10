import { DatabaseSync, backup } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  checkIntegrity,
  readDocument,
  STORAGE_VERSION,
} from './sqlite-document';

export interface SchemaMigration {
  version: number;
  sql: string;
}

// Version 1 is the first shipped SQL schema. Add only real future migrations.
const migrations: readonly SchemaMigration[] = [];

export async function runSchemaMigrations(
  path: string,
  steps: readonly SchemaMigration[] = migrations,
  target = STORAGE_VERSION,
  validate: (db: DatabaseSync) => void = readDocument,
): Promise<string | undefined> {
  const source = new DatabaseSync(path, { readOnly: true });
  let backupPath: string | undefined;
  let from: number;
  try {
    from = Number(source.prepare('PRAGMA user_version').get()!.user_version);
    if (from === target) return undefined;
    if (from > target)
      throw new Error(`Schema SQLite ${from} più recente di ${target}.`);
    for (let next = from + 1; next <= target; next++) {
      if (!steps.some((step) => step.version === next))
        throw new Error(
          `Migrazione SQLite ${next} non disponibile. Archivio conservato.`,
        );
    }
    checkIntegrity(source, true);
    backupPath = `${path}.schema-v${from}.${randomUUID()}.sqlite`;
    await backup(source, backupPath);
    const copy = new DatabaseSync(backupPath);
    try {
      checkIntegrity(copy, true);
      if (
        copy.prepare('PRAGMA journal_mode=DELETE').get()!.journal_mode !==
        'delete'
      )
        throw new Error('Backup di migrazione non autonomo.');
    } finally {
      copy.close();
    }
  } finally {
    source.close();
  }
  const db = new DatabaseSync(path);
  let transaction = false;
  try {
    db.exec(
      'PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE',
    );
    transaction = true;
    if (Number(db.prepare('PRAGMA user_version').get()!.user_version) !== from)
      throw new Error('Schema SQLite cambiato durante il backup preventivo.');
    for (let next = from + 1; next <= target; next++) {
      db.exec(steps.find((step) => step.version === next)!.sql);
      db.exec(`PRAGMA user_version=${next}`);
    }
    checkIntegrity(db, true);
    validate(db);
    db.exec('COMMIT');
    transaction = false;
    return backupPath;
  } catch (cause) {
    if (transaction) db.exec('ROLLBACK');
    throw new Error(
      `Migrazione SQLite non riuscita. Originale conservato; backup: ${backupPath}. Apri esplicitamente il backup per recuperare.`,
      { cause },
    );
  } finally {
    db.close();
  }
}
