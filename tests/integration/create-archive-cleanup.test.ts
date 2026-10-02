import {
  access,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyDocument } from '../../src/domain/model';
import { createArchive } from '../../src/native/persistence';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    access: vi.fn(actual.access),
    rename: vi.fn(actual.rename),
    rm: vi.fn(actual.rm),
  };
});

afterEach(() => vi.clearAllMocks());

it('removes the created temporary file when publishing fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cash-create-cleanup-'));
  const path = join(dir, 'Cash.json');
  vi.mocked(rename).mockRejectedValueOnce(new Error('rename failed'));
  const result = await createArchive(path, createEmptyDocument());
  expect(result).toMatchObject({
    ok: false,
    error: { code: 'IO', details: ['Error: rename failed'] },
  });
  expect(await readdir(dir)).toEqual([]);
});

it('preserves a newly appeared destination even if conflict cleanup fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cash-create-conflict-'));
  const path = join(dir, 'Cash.json');
  vi.mocked(access)
    .mockRejectedValueOnce(
      Object.assign(new Error('absent'), { code: 'ENOENT' }),
    )
    .mockImplementationOnce(async () => {
      await writeFile(path, 'existing archive');
    });
  vi.mocked(rm).mockRejectedValueOnce(new Error('cleanup failed'));
  const result = await createArchive(path, createEmptyDocument());
  expect(result).toMatchObject({ ok: false, error: { code: 'IO' } });
  expect(rename).not.toHaveBeenCalled();
  expect(await readFile(path, 'utf8')).toBe('existing archive');
  expect(await readdir(dir)).toEqual(['Cash.json']);
});
