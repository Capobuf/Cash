import {
  mkdtemp,
  readdir,
  readFile,
  link,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyDocument } from '../../src/domain/model';
import { createArchive, closeAllArchives } from '../../src/native/persistence';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, link: vi.fn(actual.link) };
});
const dirs: string[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  closeAllArchives();
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), 'cash-create-cleanup-'));
  dirs.push(dir);
  return dir;
}

it('removes the closed temporary database when publishing fails', async () => {
  const dir = await directory();
  const path = join(dir, 'Cash.sqlite');
  vi.mocked(link).mockRejectedValueOnce(new Error('publish failed'));
  expect(await createArchive(path, createEmptyDocument())).toMatchObject({
    ok: false,
    error: { code: 'IO', details: ['Error: publish failed'] },
  });
  expect(await readdir(dir)).toEqual([]);
});

it('preserves a destination that appears during publication and removes temporary files', async () => {
  const dir = await directory();
  const path = join(dir, 'Cash.sqlite');
  vi.mocked(link).mockImplementationOnce(async () => {
    await writeFile(path, 'existing archive');
    throw Object.assign(new Error('destination exists'), { code: 'EEXIST' });
  });
  expect(await createArchive(path, createEmptyDocument())).toMatchObject({
    ok: false,
    error: { code: 'CONFLICT' },
  });
  expect(await readFile(path, 'utf8')).toBe('existing archive');
  expect(await readdir(dir)).toEqual(['Cash.sqlite']);
});
