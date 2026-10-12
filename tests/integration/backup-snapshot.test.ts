import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  closeAllArchives,
  createArchive,
  openArchive,
  saveArchive,
  snapshotArchive,
} from '../../src/native/persistence';
import { comprehensiveDocument } from '../fixtures/sqlite-document';
import type { Result } from '../../src/domain/model';
const directories: string[] = [];
function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
afterEach(async () => {
  closeAllArchives();
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true });
});
it('acquires the committed WAL revision, preserving every field without creating a revision', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cash-snapshot-'));
  directories.push(dir);
  const path = join(dir, 'active.sqlite');
  const created = unwrap(await createArchive(path, comprehensiveDocument()));
  const document = structuredClone(created.document!);
  document.settings.fuelTerritory = 'Lazio';
  const saved = unwrap(await saveArchive(path, document, created.token));
  expect(await readdir(dir)).toContain('active.sqlite-wal');
  const copy = join(dir, 'snapshot.sqlite');
  unwrap(await snapshotArchive(path, copy, saved.token));
  const db = new DatabaseSync(copy, { readOnly: true });
  expect(db.prepare('PRAGMA journal_mode').get()!.journal_mode).toBe('delete');
  db.close();
  expect(await readdir(dir)).not.toContain('snapshot.sqlite-wal');
  expect(unwrap(await openArchive(copy)).document).toEqual(saved.document);
  expect(unwrap(await openArchive(path)).token).toEqual(saved.token);
});
it('serializes acquisition after a pending save and rejects stale or externally changed tokens', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cash-snapshot-'));
  directories.push(dir);
  const path = join(dir, 'active.sqlite');
  const created = unwrap(await createArchive(path, comprehensiveDocument()));
  const saving = saveArchive(path, created.document!, created.token);
  const copy = snapshotArchive(path, join(dir, 'snapshot.sqlite'), {
    ...created.token,
    revision: 2,
  });
  expect((await saving).ok).toBe(true);
  expect((await copy).ok).toBe(true);
  expect(
    await snapshotArchive(path, join(dir, 'stale.sqlite'), created.token),
  ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  const db = new DatabaseSync(path);
  db.exec('UPDATE archive_metadata SET revision=99');
  db.close();
  expect(
    await snapshotArchive(path, join(dir, 'external.sqlite'), {
      ...created.token,
      revision: 2,
    }),
  ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
});
