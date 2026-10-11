import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyDocument, type Result } from '../../src/domain/model';
import { addQuote } from '../../src/domain/quotes';
import {
  createArchive,
  saveArchive,
  openArchive,
  closeArchive,
  closeAllArchives,
  importJsonArchive,
} from '../../src/native/persistence';
import {
  comprehensiveDocument,
  legacyDocument,
} from '../fixtures/sqlite-document';

const directories: string[] = [];
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'cash-quote-numbering-'));
  directories.push(path);
  return path;
}
function unwrap<T>(result: Result<T>): T {
  if (!result.ok)
    throw new Error(
      `${result.error.message} ${result.error.details?.join(' ')}`,
    );
  return result.value;
}
afterEach(async () => {
  closeAllArchives();
  for (const path of directories.splice(0))
    if (resolve(path).startsWith(resolve(tmpdir()) + sep))
      await rm(path, { recursive: true, force: true });
});

function downgrade(path: string) {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE old_quotes (id TEXT PRIMARY KEY, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, position INTEGER NOT NULL, date TEXT NOT NULL, payload TEXT NOT NULL) STRICT;
      INSERT INTO old_quotes SELECT id, createdAt, updatedAt, position, date, payload FROM quotes;
      DROP TABLE quotes;
      ALTER TABLE old_quotes RENAME TO quotes;
      CREATE INDEX quotes_date ON quotes(date);
      ALTER TABLE archive_metadata DROP COLUMN nextQuoteNumber;
      UPDATE archive_metadata SET schemaVersion=11;
      PRAGMA user_version=1;
      COMMIT;
    `);
  } finally {
    db.close();
  }
}

describe('numerazione persistente dei preventivi', () => {
  it('migra un archivio SQLite precedente vuoto con il primo numero disponibile pari a 1', async () => {
    const path = join(await directory(), 'Cash.sqlite');
    unwrap(await createArchive(path, createEmptyDocument()));
    closeArchive(path);
    downgrade(path);
    const migrated = unwrap(await openArchive(path));
    expect(migrated.document).toMatchObject({
      schemaVersion: 12,
      nextQuoteNumber: 1,
      quotes: [],
    });
    const document = structuredClone(migrated.document!);
    expect(addQuote(document).number).toBe(1);
    unwrap(await saveArchive(path, document, migrated.token));
  });
  it('conserva numero e progressivo alla riapertura e dopo eliminazione del numero più alto', async () => {
    const path = join(await directory(), 'Cash.sqlite');
    let session = unwrap(await createArchive(path, createEmptyDocument()));
    let document = structuredClone(session.document!);
    addQuote(document);
    addQuote(document);
    session = unwrap(await saveArchive(path, document, session.token));
    closeArchive(path);
    session = unwrap(await openArchive(path));
    expect(session.document).toMatchObject({
      nextQuoteNumber: 3,
      quotes: [{ number: 1 }, { number: 2 }],
    });
    document = structuredClone(session.document!);
    document.quotes.pop();
    session = unwrap(await saveArchive(path, document, session.token));
    closeArchive(path);
    session = unwrap(await openArchive(path));
    document = structuredClone(session.document!);
    expect(addQuote(document).number).toBe(3);
    session = unwrap(await saveArchive(path, document, session.token));
    expect(session.document).toMatchObject({
      nextQuoteNumber: 4,
      quotes: [{ number: 1 }, { number: 3 }],
    });
    const invalid = structuredClone(session.document!);
    invalid.quotes[1]!.number = 1;
    expect(await saveArchive(path, invalid, session.token)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    invalid.quotes.pop();
    invalid.nextQuoteNumber = 2;
    expect(await saveArchive(path, invalid, session.token)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    const db = new DatabaseSync(path);
    try {
      expect(() => db.exec('UPDATE quotes SET number=1')).toThrow();
      expect(() => db.exec('UPDATE quotes SET number=0')).toThrow();
    } finally {
      db.close();
    }
  });

  it('annulla insieme inserimento e incremento quando la scrittura fallisce', async () => {
    const path = join(await directory(), 'Cash.sqlite');
    const session = unwrap(await createArchive(path, createEmptyDocument()));
    const document = structuredClone(session.document!);
    addQuote(document);
    const db = new DatabaseSync(path);
    try {
      db.exec(
        "CREATE TRIGGER fail_quote BEFORE INSERT ON quotes BEGIN SELECT RAISE(ABORT, 'write failure'); END;",
      );
    } finally {
      db.close();
    }
    expect((await saveArchive(path, document, session.token)).ok).toBe(false);
    closeArchive(path);
    const reopened = unwrap(await openArchive(path));
    expect(reopened.document).toMatchObject({ nextQuoteNumber: 1, quotes: [] });
    const retryDb = new DatabaseSync(path);
    try {
      retryDb.exec('DROP TRIGGER fail_quote');
    } finally {
      retryDb.close();
    }
    const saved = unwrap(await saveArchive(path, document, reopened.token));
    expect(saved.document).toMatchObject({
      nextQuoteNumber: 2,
      quotes: [{ number: 1 }],
    });
  });

  it('migra SQLite 1/schema 11 nell’ordine persistente conservando tutto lo storico, una sola volta', async () => {
    const dir = await directory();
    const path = join(dir, 'Cash.sqlite');
    const document = comprehensiveDocument();
    document.revision = 1;
    document.quotes[0]!.date = '2027-01-01';
    addQuote(document).date = '2025-01-01';
    unwrap(await createArchive(path, document));
    closeArchive(path);
    downgrade(path);
    const migrated = unwrap(await openArchive(path));
    expect(migrated.document).toEqual(document);
    expect(migrated.storageVersion).toBe(2);
    const backups = (await readdir(dir)).filter((name) =>
      name.includes('.schema-v1.'),
    );
    expect(backups).toHaveLength(1);
    const backup = new DatabaseSync(join(dir, backups[0]!), { readOnly: true });
    try {
      expect(backup.prepare('PRAGMA user_version').get()!.user_version).toBe(1);
      expect(
        backup.prepare('SELECT schemaVersion FROM archive_metadata').get()!
          .schemaVersion,
      ).toBe(11);
      expect(
        backup.prepare('SELECT payload FROM quotes ORDER BY position').all(),
      ).toHaveLength(2);
    } finally {
      backup.close();
    }
    closeArchive(path);
    expect(unwrap(await openArchive(path)).document).toEqual(document);
    expect(
      (await readdir(dir)).filter((name) => name.includes('.schema-v1.')),
    ).toEqual(backups);
  });

  it.each(['duplicate-position', 'number-in-payload', 'invalid-item'])(
    'rifiuta lo storico corrotto (%s) con rollback',
    async (corruption) => {
      const path = join(await directory(), 'Cash.sqlite');
      const document = comprehensiveDocument();
      addQuote(document);
      unwrap(await createArchive(path, document));
      closeArchive(path);
      downgrade(path);
      const db = new DatabaseSync(path);
      try {
        if (corruption === 'duplicate-position')
          db.exec('UPDATE quotes SET position=0');
        else if (corruption === 'number-in-payload')
          db.exec("UPDATE quotes SET payload=json_set(payload, '$.number', 4)");
        else
          db.exec(
            "UPDATE quotes SET payload=json_set(payload, '$.items', 'invalid')",
          );
      } finally {
        db.close();
      }
      expect((await openArchive(path)).ok).toBe(false);
      const unchanged = new DatabaseSync(path, { readOnly: true });
      try {
        expect(
          unchanged.prepare('PRAGMA user_version').get()!.user_version,
        ).toBe(1);
        expect(
          unchanged
            .prepare('PRAGMA table_info(quotes)')
            .all()
            .some((column) => column.name === 'number'),
        ).toBe(false);
        expect(
          unchanged.prepare('SELECT schemaVersion FROM archive_metadata').get()!
            .schemaVersion,
        ).toBe(11);
      } finally {
        unchanged.close();
      }
    },
  );

  it.each([4, 10, 11])(
    'importa JSON schema %s conservando ordine e dati storici',
    async (version) => {
      const dir = await directory();
      const source = join(dir, 'Cash.json');
      const document = comprehensiveDocument();
      addQuote(document).date = '2025-01-01';
      const bytes = JSON.stringify(legacyDocument(document, version));
      await writeFile(source, bytes);
      const imported = unwrap(
        await importJsonArchive(source, join(dir, 'Cash.sqlite')),
      );
      expect(imported.document).toEqual(document);
      expect(await readFile(source, 'utf8')).toBe(bytes);
    },
  );

  it('rifiuta un JSON corrente senza numeri e uno storico con numerazione arbitraria', async () => {
    const dir = await directory();
    const source = join(dir, 'Cash.json');
    const document = comprehensiveDocument();
    await writeFile(
      source,
      JSON.stringify({ ...legacyDocument(document, 11), schemaVersion: 12 }),
    );
    expect(
      (await importJsonArchive(source, join(dir, 'missing.sqlite'))).ok,
    ).toBe(false);
    await writeFile(source, JSON.stringify({ ...document, schemaVersion: 11 }));
    expect(
      (await importJsonArchive(source, join(dir, 'corrupt.sqlite'))).ok,
    ).toBe(false);
  });
});
