import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyDocument, meta, type Result } from '../../src/domain/model';
import {
  closeAllArchives,
  closeArchive,
  createArchive,
  openArchive,
  saveArchive,
} from '../../src/native/persistence';
import { downgradeToStorageV2 } from '../fixtures/storage-v2';

const directories: string[] = [];
afterEach(async () => {
  closeAllArchives();
  for (const path of directories.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function archivePath() {
  const directory = await mkdtemp(join(tmpdir(), 'cash-bank-accounts-'));
  directories.push(directory);
  return join(directory, 'Cash.sqlite');
}
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
function documentWithExpense() {
  const document = createEmptyDocument();
  document.bankExpenses = [
    {
      ...meta(),
      date: '2026-11-21',
      description: 'Negozio',
      amount: '57.03',
      categoryIds: [],
    },
  ];
  return document;
}

describe('conti bancari nell’archivio SQLite', () => {
  it('salva e rilegge conti, conto della spesa e movimenti in attesa', async () => {
    const path = await archivePath();
    const document = documentWithExpense();
    const account = { ...meta(), name: 'Fineco', pendingSince: '2026-11-20' };
    document.bankAccounts = [account];
    document.bankExpenses[0]!.accountId = account.id;
    unwrap(await createArchive(path, document));
    closeArchive(path);
    const reopened = unwrap(await openArchive(path)).document!;
    expect(reopened.bankAccounts).toEqual([account]);
    expect(reopened.bankExpenses[0]!.accountId).toBe(account.id);
  });

  it('migra un archivio senza conti conservando le spese, poi accetta i conti', async () => {
    const path = await archivePath();
    const created = unwrap(await createArchive(path, documentWithExpense()));
    closeArchive(path);
    const db = new DatabaseSync(path);
    try {
      downgradeToStorageV2(db);
    } finally {
      db.close();
    }
    const migrated = unwrap(await openArchive(path));
    expect(migrated.storageVersion).toBe(3);
    expect(migrated.document!.bankAccounts).toEqual([]);
    expect(migrated.document!.bankExpenses).toEqual(
      created.document!.bankExpenses,
    );
    const next = structuredClone(migrated.document!);
    const account = { ...meta(), name: 'Revolut' };
    next.bankAccounts.push(account);
    next.bankExpenses[0]!.accountId = account.id;
    const saved = unwrap(await saveArchive(path, next, migrated.token));
    closeArchive(path);
    const reopened = unwrap(await openArchive(path)).document!;
    expect(reopened.revision).toBe(saved.token.revision);
    expect(reopened.bankExpenses[0]!.accountId).toBe(account.id);
  });
});
