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

const migrations: readonly SchemaMigration[] = [
  {
    version: 2,
    sql: `
      CREATE TEMP TABLE numbering_validation (valid INTEGER CHECK(valid=1));
      INSERT INTO numbering_validation SELECT CASE WHEN
        (SELECT schemaVersion FROM archive_metadata WHERE singleton=1)=11
        AND NOT EXISTS (SELECT position FROM quotes GROUP BY position HAVING COUNT(*)>1)
        AND NOT EXISTS (SELECT 1 FROM quotes WHERE json_type(payload, '$.number') IS NOT NULL)
        THEN 1 ELSE 0 END;
      DROP TABLE numbering_validation;
      CREATE TABLE numbered_quotes (
        id TEXT PRIMARY KEY, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        position INTEGER NOT NULL, number INTEGER NOT NULL UNIQUE CHECK(number>0),
        date TEXT NOT NULL, payload TEXT NOT NULL
      ) STRICT;
      INSERT INTO numbered_quotes
        SELECT id, createdAt, updatedAt, position,
          ROW_NUMBER() OVER (ORDER BY position), date, payload FROM quotes;
      DROP TABLE quotes;
      ALTER TABLE numbered_quotes RENAME TO quotes;
      CREATE INDEX quotes_date ON quotes(date);
      ALTER TABLE archive_metadata ADD COLUMN nextQuoteNumber INTEGER NOT NULL DEFAULT 1 CHECK(nextQuoteNumber>0);
      UPDATE archive_metadata SET schemaVersion=12,
        nextQuoteNumber=(SELECT COUNT(*)+1 FROM quotes) WHERE singleton=1;
    `,
  },
];

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
