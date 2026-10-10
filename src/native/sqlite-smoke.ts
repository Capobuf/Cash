import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createEmptyDocument, meta, type Result } from '../domain/model';
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
    const saved = unwrap(await saveArchive(path, changed, reopened.token));
    assert.equal(saved.token.revision, 2);
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
