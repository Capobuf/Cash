import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createEmptyDocument, meta, type Result } from '../domain/model';
import { addQuote } from '../domain/quotes';
import { BackupManager } from './backups';
import type { ArchiveSession } from '../shared/archive';
import {
  createArchive,
  openArchive,
  closeArchive,
  closeAllArchives,
  saveArchive,
  restoreBackup,
  saveRecoveryCopy,
  importJsonArchive,
  backupPathFor,
  restoreArchiveCopy,
  verifyArchiveCopy,
} from './persistence';

function unwrap<T>(result: Result<T>): T {
  if (!result.ok)
    throw new Error(
      `${result.error.message}: ${result.error.details?.join('; ') ?? ''}`,
    );
  return result.value;
}

export async function runSqliteSmoke(directory: string): Promise<void> {
  try {
    const path = join(directory, 'Cash.sqlite');
    const document = createEmptyDocument();
    assert.equal(addQuote(document).number, 1);
    assert.equal(addQuote(document).number, 2);
    document.bankExpenses.push({
      ...meta(),
      date: '2026-10-01',
      description: 'SQLite smoke',
      amount: '12345678901234567890.01',
      categoryIds: [document.bankExpenseCategories[0]!.id],
      excludedFromCalculations: false,
    });
    const created = unwrap(await createArchive(path, document));
    closeArchive(path);
    const reopened = unwrap(await openArchive(path));
    assert.deepEqual(reopened.document, created.document);
    const changed = structuredClone(reopened.document!);
    changed.settings.fuelTerritory = 'Lazio';
    changed.quotes.pop();
    assert.equal(addQuote(changed).number, 3);
    const saved = unwrap(await saveArchive(path, changed, reopened.token));
    assert.equal(saved.token.revision, 2);
    closeArchive(path);
    const numbered = unwrap(await openArchive(path));
    assert.deepEqual(
      numbered.document!.quotes.map((quote) => quote.number),
      [1, 3],
    );
    assert.equal(numbered.document!.nextQuoteNumber, 4);
    let backupSession: ArchiveSession | null = numbered;
    const manager = new BackupManager({
      current: () => backupSession,
      dirty: () => false,
      blocked: () => false,
      defaultDestination: join(directory, 'backups'),
      stagingRoot: join(directory, 'staging'),
      changed: () => {},
    });
    await manager.check();
    const automatic = manager.snapshot.latest;
    assert.ok(automatic, 'First automatic backup must be available');
    assert.deepEqual(
      unwrap(await verifyArchiveCopy(automatic.path)).header.documentId,
      saved.token.documentId,
    );
    await manager.check();
    assert.equal(manager.snapshot.entries.length, 1);
    unwrap(
      await manager.configure({
        enabled: false,
        intervalHours: 24,
        retention: 5,
      }),
    );
    for (let index = 0; index < 5; index++) unwrap(await manager.run());
    assert.equal(manager.snapshot.entries.length, 5);
    const source = manager.snapshot.latest!;
    backupSession = null;
    const staged = unwrap(await manager.stageRestore(source.path));
    const cleanRestore = unwrap(
      await restoreArchiveCopy(
        staged.path,
        join(directory, 'clean-restored.sqlite'),
      ),
    );
    assert.deepEqual(cleanRestore.document, saved.document);
    assert.deepEqual(cleanRestore.token, saved.token);
    assert.equal(
      (await restoreArchiveCopy(staged.path, cleanRestore.path)).ok,
      false,
    );
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      assert.equal(
        db.prepare('PRAGMA journal_mode').get()!.journal_mode,
        'wal',
      );
      assert.equal(
        db.prepare('SELECT amount FROM bank_expenses').get()!.amount,
        '12345678901234567890.01',
      );
      assert.equal(
        db.prepare('PRAGMA integrity_check').get()!.integrity_check,
        'ok',
      );
    } finally {
      db.close();
    }
    const previous = unwrap(await openArchive(backupPathFor(path)));
    assert.deepEqual(previous.document, created.document);
    closeArchive(previous.path);
    const restored = unwrap(await restoreBackup(path, saved.token));
    assert.equal(restored.token.revision, 1);
    assert.notEqual(restored.token.documentId, created.token.documentId);
    assert.equal(restored.document!.settings.fuelTerritory, undefined);
    const recovery = unwrap(
      await saveRecoveryCopy(join(directory, 'recovery.sqlite'), changed),
    );
    assert.equal(recovery.document!.settings.fuelTerritory, 'Lazio');
    const legacy = join(directory, 'legacy.json');
    await writeFile(legacy, JSON.stringify(changed));
    const imported = unwrap(
      await importJsonArchive(legacy, join(directory, 'imported.sqlite')),
    );
    assert.deepEqual(imported.document, changed);
    closeAllArchives();
    await writeFile(
      join(directory, 'result.json'),
      JSON.stringify(
        {
          result: 'PASS',
          electron: process.versions.electron,
          node: process.versions.node,
          platform: process.platform,
          arch: process.arch,
          checks: [
            'create',
            'write',
            'read',
            'close',
            'reopen',
            'transaction',
            'WAL backup',
            'restore',
            'dirty recovery',
            'JSON import',
            'decimal precision',
            'integrity',
            'quote numbering and non-reuse',
            'automatic current revision backup',
            'manual backup and safe rotation',
            'clean installation restore preserving identity and revision',
            'restore refuses overwrite',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    closeAllArchives();
  }
}
