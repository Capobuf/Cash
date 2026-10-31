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
import {
  createArchive,
  closeAllArchives,
  importJsonArchive,
} from '../../src/native/persistence';

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

it('reports an actionable import collision and preserves all original files if the destination appears during publication', async () => {
  const dir = await directory();
  const source = join(dir, 'Cash.json');
  const backup = join(dir, 'Cash.backup.json');
  const destination = join(dir, 'Cash.sqlite');
  const contents = JSON.stringify(createEmptyDocument());
  await writeFile(source, contents);
  await writeFile(backup, 'JSON backup');
  vi.mocked(link).mockImplementationOnce(async () => {
    await writeFile(destination, 'existing archive');
    throw Object.assign(new Error('destination exists'), { code: 'EEXIST' });
  });
  expect(await importJsonArchive(source, destination)).toMatchObject({
    ok: false,
    error: {
      code: 'CONFLICT',
      field: 'path',
      message: expect.stringContaining('esiste già'),
      action: expect.stringContaining('Scegli un altro nome'),
    },
  });
  expect(await readFile(source, 'utf8')).toBe(contents);
  expect(await readFile(backup, 'utf8')).toBe('JSON backup');
  expect(await readFile(destination, 'utf8')).toBe('existing archive');
  expect((await readdir(dir)).sort()).toEqual([
    'Cash.backup.json',
    'Cash.json',
    'Cash.sqlite',
  ]);
});
