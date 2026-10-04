import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readPreferences,
  rememberArchive,
  setFicClientId,
} from '../../src/native/preferences';

const native = vi.hoisted(() => ({ directory: '' }));
vi.mock('electron', () => ({ app: { getPath: () => native.directory } }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...fs,
    readFile: vi.fn(fs.readFile),
    writeFile: vi.fn(fs.writeFile),
  };
});

describe('preferenze locali', () => {
  let file: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    native.directory = await mkdtemp(join(tmpdir(), 'cash-preferences-'));
    file = join(native.directory, 'preferences.json');
  });
  afterEach(async () => rm(native.directory, { recursive: true, force: true }));

  it('usa lo stato iniziale solo quando il file non esiste', async () => {
    expect(await readPreferences()).toEqual({ ok: true, value: {} });
    expect(writeFile).not.toHaveBeenCalled();
    expect(await rememberArchive('Cash.json')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      lastArchivePath: 'Cash.json',
    });
  });

  it.each([
    '{',
    'null',
    '[]',
    '"text"',
    '{"lastArchivePath":12}',
    '{"ficClientId":false}',
  ])(
    'rifiuta JSON o dati non validi senza sovrascrivere: %s',
    async (contents) => {
      await writeFile(file, contents, 'utf8');
      vi.mocked(writeFile).mockClear();
      for (const operation of [
        readPreferences,
        () => rememberArchive('New.json'),
        () => setFicClientId('new-client'),
      ])
        expect(await operation()).toMatchObject({
          ok: false,
          error: { code: 'VALIDATION', field: 'preferences' },
        });
      expect(writeFile).not.toHaveBeenCalled();
      expect(await readFile(file, 'utf8')).toBe(contents);
    },
  );

  it.each(['EACCES', 'EIO'])(
    'propaga %s senza riscrivere le preferenze',
    async (code) => {
      const contents = '{"lastArchivePath":"Cash.json","ficClientId":"client"}';
      await writeFile(file, contents, 'utf8');
      vi.mocked(writeFile).mockClear();
      for (const operation of [
        readPreferences,
        () => rememberArchive('New.json'),
        () => setFicClientId('new-client'),
      ]) {
        vi.mocked(readFile).mockRejectedValueOnce(
          Object.assign(new Error('Lettura fallita'), { code }),
        );
        expect(await operation()).toMatchObject({
          ok: false,
          error: {
            code: 'IO',
            field: 'preferences',
            details: [expect.stringContaining('Lettura fallita')],
          },
        });
      }
      expect(writeFile).not.toHaveBeenCalled();
      expect(await readFile(file, 'utf8')).toBe(contents);
    },
  );

  it('preserva il Client ID e le altre preferenze quando ricorda un archivio', async () => {
    await writeFile(
      file,
      JSON.stringify({
        lastArchivePath: 'Old.json',
        ficClientId: 'client',
        window: { width: 1200 },
      }),
      'utf8',
    );
    expect(await rememberArchive('New.json')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      lastArchivePath: 'New.json',
      ficClientId: 'client',
      window: { width: 1200 },
    });
  });

  it('preserva l’archivio e le altre preferenze quando aggiorna il Client ID', async () => {
    await writeFile(
      file,
      JSON.stringify({
        lastArchivePath: 'Cash.json',
        ficClientId: 'old',
        theme: 'dark',
      }),
      'utf8',
    );
    expect(await setFicClientId(' new-client ')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      lastArchivePath: 'Cash.json',
      ficClientId: 'new-client',
      theme: 'dark',
    });
  });

  it('propaga un errore di scrittura dopo una lettura valida', async () => {
    await writeFile(file, '{"lastArchivePath":"Cash.json"}', 'utf8');
    vi.mocked(writeFile).mockRejectedValueOnce(
      Object.assign(new Error('Scrittura fallita'), { code: 'EACCES' }),
    );
    expect(await setFicClientId('client')).toMatchObject({
      ok: false,
      error: { code: 'IO', field: 'preferences' },
    });
    expect(await readFile(file, 'utf8')).toBe(
      '{"lastArchivePath":"Cash.json"}',
    );
  });
});
