import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  writeFile,
  rm,
  open,
  link,
  copyFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyDocument, type Result } from '../../src/domain/model';
import { BackupManager } from '../../src/native/backups';
import {
  createArchive,
  closeArchive,
  closeAllArchives,
  backupPathFor,
  saveArchive,
  restoreArchiveCopy,
  verifyArchiveCopy,
} from '../../src/native/persistence';
import * as persistence from '../../src/native/persistence';
import { readPreferences } from '../../src/native/preferences';
import type { ArchiveSession } from '../../src/shared/archive';
import type { BackupState } from '../../src/shared/backup';

const native = vi.hoisted(() => ({ directory: '' }));
vi.mock('electron', () => ({ app: { getPath: () => native.directory } }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...fs,
    open: vi.fn(fs.open),
    link: vi.fn(fs.link),
    copyFile: vi.fn(fs.copyFile),
    rm: vi.fn(fs.rm),
    writeFile: vi.fn(fs.writeFile),
    readdir: vi.fn(fs.readdir),
  };
});
function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.message}: ${r.error.details}`);
  return r.value;
}
let current: ArchiveSession | null;
let dirty: boolean;
let root: string;
let manager: BackupManager;
let onChange: ((state: BackupState) => void) | undefined;
function newManager() {
  return new BackupManager({
    current: () => current,
    dirty: () => dirty,
    blocked: () => false,
    defaultDestination: join(root, 'backups'),
    stagingRoot: join(root, 'staging'),
    changed: (state) => onChange?.(state),
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
  const fs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  vi.mocked(open).mockImplementation(fs.open);
  vi.mocked(link).mockImplementation(fs.link);
  vi.mocked(copyFile).mockImplementation(fs.copyFile);
  vi.mocked(rm).mockImplementation(fs.rm);
  vi.mocked(writeFile).mockImplementation(fs.writeFile);
  vi.mocked(readdir).mockImplementation(fs.readdir);
  root = await mkdtemp(join(tmpdir(), 'cash-backups-'));
  native.directory = root;
  current = unwrap(
    await createArchive(join(root, 'active.sqlite'), createEmptyDocument()),
  );
  dirty = false;
  onChange = undefined;
  manager = newManager();
});
afterEach(async () => {
  await manager.finish(true);
  closeAllArchives();
  vi.restoreAllMocks();
  vi.useRealTimers();
  await rm(root, { recursive: true, force: true });
});

it('creates the first automatic backup with defaults and never creates a backup without an archive', async () => {
  const archive = current;
  current = null;
  await manager.check();
  expect(manager.snapshot.config).toBeNull();
  current = archive;
  await manager.check();
  expect(manager.snapshot.config).toMatchObject({
    enabled: true,
    intervalHours: 24,
    retention: 10,
    destination: join(root, 'backups'),
  });
  expect(manager.snapshot.latest).toMatchObject({
    revision: 1,
    documentId: current!.token.documentId,
    verification: 'valid',
  });
  expect(manager.snapshot.running).toBe(false);
  expect(unwrap(await readPreferences()).backupLast).toMatchObject(
    current!.token,
  );
  const entry = manager.snapshot.latest!;
  expect(unwrap(await verifyArchiveCopy(entry.path)).header).toMatchObject(
    current!.token,
  );
});
it('skips duplicates after days closed, backs up one new revision when overdue and timestamps completion', async () => {
  await manager.check();
  const first = manager.snapshot.latest!;
  vi.setSystemTime(Date.now() + 8 * 24 * 3600_000);
  await manager.check();
  expect(manager.snapshot.entries).toHaveLength(1);
  current = unwrap(
    await saveArchive(current!.path, current!.document!, current!.token),
  );
  await manager.check();
  expect(manager.snapshot.entries).toHaveLength(2);
  expect(manager.snapshot.latest!.revision).toBe(2);
  expect(Date.parse(manager.snapshot.latest!.completedAt)).toBeGreaterThan(
    Date.parse(first.completedAt),
  );
  await manager.check();
  expect(manager.snapshot.entries).toHaveLength(2);
});
it('allows manual identical revisions with automatic disabled and publishes an initial copy on destination change', async () => {
  await manager.check();
  unwrap(
    await manager.configure({ enabled: false, intervalHours: 6, retention: 5 }),
  );
  await manager.check();
  expect(manager.snapshot.entries).toHaveLength(1);
  unwrap(await manager.run());
  expect(manager.snapshot.entries).toHaveLength(2);
  const old = manager.snapshot.entries.map((entry) => entry.path);
  const destination = join(root, 'external');
  await mkdir(destination);
  unwrap(await manager.selectDirectory(destination));
  expect(manager.snapshot.entries).toHaveLength(1);
  for (const path of old)
    expect((await readFile(path)).length).toBeGreaterThan(0);
});
it.each([5, 10] as const)(
  'rotates only verified copies over limit %s, preserving unknown/corrupt/other installation files',
  async (retention) => {
    await manager.check();
    unwrap(
      await manager.configure({ enabled: false, intervalHours: 24, retention }),
    );
    const entry = manager.snapshot.latest!;
    const config = manager.snapshot.config!;
    const folder = join(
      config.destination,
      'Cash-Backups',
      config.installationId,
      entry.documentId,
    );
    const other = join(
      config.destination,
      'Cash-Backups',
      randomUUID(),
      entry.documentId,
    );
    await mkdir(other, { recursive: true });
    const unrelated = join(folder, 'unknown.sqlite');
    await writeFile(unrelated, 'unknown');
    const corrupt = join(
      folder,
      `Cash-20200101T000000000Z-rev1-${randomUUID()}.sqlite`,
    );
    await writeFile(corrupt, 'corrupt');
    const foreign = join(other, entry.id);
    await writeFile(foreign, 'foreign');
    const activeBytes = await readFile(current!.path);
    for (let index = 0; index < retention + 2; index++)
      unwrap(await manager.run());
    expect(
      manager.snapshot.entries.filter(
        (entry) => entry.verification === 'valid',
      ),
    ).toHaveLength(retention);
    expect(await readFile(unrelated, 'utf8')).toBe('unknown');
    expect(await readFile(corrupt, 'utf8')).toBe('corrupt');
    expect(await readFile(foreign, 'utf8')).toBe('foreign');
    expect(await readFile(current!.path)).toEqual(activeBytes);
  },
  // Multiple verified SQLite copies and rotation on hosted Windows storage.
  15000,
);
it.each(['ENOSPC', 'EACCES', 'ENODEV'])(
  'preserves earlier backups and the active database on %s during destination I/O',
  async (code) => {
    await manager.check();
    const previous = manager.snapshot.latest!;
    const bytes = await readFile(previous.path);
    const original = vi.mocked(open).getMockImplementation()!;
    vi.mocked(open).mockImplementation(async (...args) => {
      if (
        String(args[0]).includes('Cash-Backups') &&
        String(args[0]).endsWith('.incomplete')
      )
        throw Object.assign(new Error(code), { code });
      return original(...args);
    });
    expect(await manager.run()).toMatchObject({
      ok: false,
      error: { code: 'IO' },
    });
    expect(await readFile(previous.path)).toEqual(bytes);
    expect(unwrap(await verifyArchiveCopy(current!.path)).header.revision).toBe(
      1,
    );
  },
);

it('preserves previous copies when local SQLite staging runs out of space', async () => {
  await manager.check();
  const previous = manager.snapshot.latest!;
  const bytes = await readFile(previous.path);
  vi.spyOn(persistence, 'snapshotArchive').mockImplementationOnce(
    async (_path, destination) => {
      await writeFile(destination, 'unfinished SQLite');
      return {
        ok: false,
        error: {
          code: 'IO',
          message: 'Spazio staging insufficiente.',
          details: ['ENOSPC'],
        },
      };
    },
  );
  expect((await manager.run()).ok).toBe(false);
  expect(await readFile(previous.path)).toEqual(bytes);
  expect(
    await readdir(
      join(root, 'staging', manager.snapshot.config!.installationId),
    ),
  ).toEqual([]);
});

it('rejects a checksum mismatch without publishing or rotating previous copies', async () => {
  await manager.check();
  const previous = manager.snapshot.latest!;
  const bytes = await readFile(previous.path);
  const original = vi.mocked(open).getMockImplementation()!;
  vi.mocked(open).mockImplementation(async (...args) => {
    const handle = await original(...args);
    if (manager.snapshot.phase === 'copying') {
      const write = handle.writeFile.bind(handle);
      handle.writeFile = async (data) =>
        write(Buffer.alloc((data as Buffer).length));
    }
    return handle;
  });
  expect(await manager.run()).toMatchObject({
    ok: false,
    error: { details: [expect.stringContaining('checksum')] },
  });
  expect(await readFile(previous.path)).toEqual(bytes);
  unwrap(await manager.refresh());
  expect(manager.snapshot.entries).toHaveLength(1);
});

it('verifies a changed copy manually and excludes a corrupted file from valid history and rotation', async () => {
  await manager.check();
  const previous = manager.snapshot.latest!;
  await writeFile(previous.path, 'damaged');
  expect((await manager.verify(previous.id)).ok).toBe(false);
  expect(manager.snapshot.latest).toBeNull();
  expect(manager.snapshot.entries[0]!.verification).toBe('invalid');
  unwrap(await manager.run());
  expect(await readFile(previous.path, 'utf8')).toBe('damaged');
  expect(
    manager.snapshot.entries.filter((entry) => entry.verification === 'valid'),
  ).toHaveLength(1);
});
it('rejects destination filesystems without exclusive publication before changing preferences', async () => {
  await manager.check();
  const previous = manager.snapshot.config!;
  const folder = join(root, 'unsupported');
  await mkdir(folder);
  vi.mocked(link).mockRejectedValueOnce(
    Object.assign(new Error('No hard links'), { code: 'ENOTSUP' }),
  );
  vi.mocked(copyFile).mockRejectedValueOnce(
    Object.assign(new Error('Exclusive copy denied'), { code: 'EACCES' }),
  );
  expect((await manager.selectDirectory(folder)).ok).toBe(false);
  expect(unwrap(await readPreferences()).backup!.destination).toBe(
    previous.destination,
  );
  expect(await readdir(folder)).toEqual([]);
});
it.each(['EISDIR', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EPERM'])(
  'creates verified backups and rotates with exclusive copies when hard links fail with %s',
  async (code) => {
    await manager.check();
    const previous = manager.snapshot.latest!;
    const previousBytes = await readFile(previous.path);
    const destination = join(root, 'drive');
    await mkdir(destination);
    vi.mocked(link).mockRejectedValue(
      Object.assign(new Error('Hard links unavailable'), { code }),
    );
    unwrap(await manager.selectDirectory(destination));
    unwrap(
      await manager.configure({
        enabled: false,
        intervalHours: 24,
        retention: 5,
      }),
    );
    for (let index = 0; index < 5; index++) unwrap(await manager.run());
    expect(manager.snapshot.error).toBeNull();
    expect(manager.snapshot.entries).toHaveLength(5);
    for (const entry of manager.snapshot.entries) {
      expect(entry.verification).toBe('valid');
      expect(unwrap(await verifyArchiveCopy(entry.path)).header).toMatchObject(
        current!.token,
      );
    }
    expect(await readFile(previous.path)).toEqual(previousBytes);
    expect(unwrap(await readPreferences()).backup!.destination).toBe(
      destination,
    );
    expect(vi.mocked(copyFile).mock.calls.length).toBeGreaterThan(0);
    for (const [, , flags] of vi.mocked(copyFile).mock.calls)
      expect(flags).toBe(constants.COPYFILE_EXCL);
    expect(await readdir(destination)).toEqual(['Cash-Backups']);
  },
  15000,
);
it('preserves an existing final file when exclusive copy publication collides', async () => {
  await manager.check();
  const previous = manager.snapshot.latest!;
  const previousBytes = await readFile(previous.path);
  const original = vi.mocked(copyFile).getMockImplementation()!;
  let collision: string | undefined;
  vi.mocked(link).mockRejectedValue(
    Object.assign(new Error('No hard links'), { code: 'EISDIR' }),
  );
  vi.mocked(copyFile).mockImplementation(async (...args) => {
    if (String(args[1]).endsWith('.sqlite')) {
      collision = String(args[1]);
      await writeFile(collision, 'existing file');
    }
    return original(...args);
  });
  expect((await manager.run()).ok).toBe(false);
  expect(collision).toBeDefined();
  expect(await readFile(collision!, 'utf8')).toBe('existing file');
  expect(await readFile(previous.path)).toEqual(previousBytes);
});
it('removes a corrupted exclusive publication without rotating previous backups', async () => {
  await manager.check();
  const previous = manager.snapshot.latest!;
  const previousBytes = await readFile(previous.path);
  const original = vi.mocked(copyFile).getMockImplementation()!;
  vi.mocked(link).mockRejectedValue(
    Object.assign(new Error('No hard links'), { code: 'EISDIR' }),
  );
  vi.mocked(copyFile).mockImplementation(async (...args) => {
    await original(...args);
    if (String(args[1]).endsWith('.sqlite'))
      await writeFile(args[1], 'corrupted publication');
  });
  expect((await manager.run()).ok).toBe(false);
  expect(await readFile(previous.path)).toEqual(previousBytes);
  unwrap(await manager.refresh());
  expect(manager.snapshot.entries).toHaveLength(1);
  expect(manager.snapshot.latest!.path).toBe(previous.path);
});
it('reports rotation failure separately, leaving the new backup and all failed deletions valid', async () => {
  await manager.check();
  unwrap(
    await manager.configure({
      enabled: false,
      intervalHours: 24,
      retention: 5,
    }),
  );
  for (let index = 0; index < 4; index++) unwrap(await manager.run());
  const original = vi.mocked(rm).getMockImplementation()!;
  vi.mocked(rm).mockImplementation(async (...args) => {
    if (
      String(args[0]).includes('Cash-Backups') &&
      String(args[0]).endsWith('.sqlite')
    )
      throw Object.assign(new Error('Denied'), { code: 'EACCES' });
    return original(...args);
  });
  expect((await manager.run()).ok).toBe(true);
  expect(
    manager.snapshot.entries.filter((entry) => entry.verification === 'valid'),
  ).toHaveLength(6);
  expect(manager.snapshot.warning?.message).toContain('rotazione incompleta');
});
it('keeps publication successful when scanning the rotation folder fails afterwards', async () => {
  await manager.check();
  const previous = manager.snapshot.latest!;
  const bytes = await readFile(previous.path);
  let injected = false;
  onChange = (state) => {
    if (state.phase === 'completing' && !injected) {
      injected = true;
      vi.mocked(readdir).mockRejectedValueOnce(
        Object.assign(new Error('Folder inaccessible'), { code: 'EACCES' }),
      );
    }
  };
  expect((await manager.run()).ok).toBe(true);
  expect(manager.snapshot.error).toBeNull();
  expect(manager.snapshot.warning?.message).toContain('Backup riuscito');
  expect(manager.snapshot.latest!.id).not.toBe(previous.id);
  expect(await readFile(previous.path)).toEqual(bytes);
  unwrap(await manager.refresh());
  expect(manager.snapshot.entries).toHaveLength(2);
});

it('detects deletion of copies and the whole destination without recreating it, then allows explicit recovery', async () => {
  await manager.check();
  const first = manager.snapshot.latest!;
  await rm(first.path);
  unwrap(await manager.refresh());
  expect(manager.snapshot.entries).toHaveLength(0);
  expect(manager.snapshot.warning?.code).toBe('FILE_NOT_FOUND');
  await manager.check();
  expect(manager.snapshot.entries).toHaveLength(1);
  const config = manager.snapshot.config!;
  await rm(config.destination, { recursive: true });
  expect((await manager.refresh()).ok).toBe(false);
  expect(manager.snapshot.destinationMissing).toBe(true);
  await manager.check();
  expect(await readdir(root)).not.toContain('backups');
  unwrap(await manager.recreateDirectory());
  expect(manager.snapshot.latest?.verification).toBe('valid');
});
it('waits for saves, protects only persisted changes and prevents simultaneous backups', async () => {
  unwrap(await manager.refresh());
  const saving = saveArchive(
    current!.path,
    current!.document!,
    current!.token,
  ).then((result) => {
    current = unwrap(result);
  });
  const backup = manager.run();
  expect(await manager.run()).toMatchObject({
    ok: false,
    error: { code: 'CONFLICT' },
  });
  await saving;
  unwrap(await backup);
  expect(manager.snapshot.latest?.revision).toBe(2);
  dirty = true;
  expect(await manager.run()).toMatchObject({
    ok: false,
    error: { code: 'CONFLICT' },
  });
});
it('does not retry automatically for an hour after an operation error', async () => {
  unwrap(await manager.refresh());
  vi.mocked(link).mockRejectedValueOnce(
    Object.assign(new Error('Denied'), { code: 'EACCES' }),
  );
  await manager.check();
  expect(manager.snapshot.error).not.toBeNull();
  const calls = vi.mocked(link).mock.calls.length;
  await manager.check();
  expect(vi.mocked(link).mock.calls.length).toBe(calls);
  vi.setSystemTime(Date.now() + 3600_001);
  await manager.check();
  expect(manager.snapshot.latest?.verification).toBe('valid');
});
it('cancels cooperatively before publication and cleans incomplete files', async () => {
  onChange = (state) => {
    if (state.phase === 'copying') void manager.finish(true);
  };
  expect(await manager.run()).toMatchObject({
    ok: false,
    error: { code: 'CANCELLED' },
  });
  const config = manager.snapshot.config!;
  const folder = join(
    config.destination,
    'Cash-Backups',
    config.installationId,
    current!.token.documentId,
  );
  expect(await readdir(folder)).toEqual([]);
  expect(await readdir(join(root, 'staging', config.installationId))).toEqual(
    [],
  );
});
it('reconciles publication before a preferences failure and cleans only owned residual temporaries on reopening', async () => {
  unwrap(await manager.refresh());
  vi.mocked(writeFile).mockRejectedValueOnce(
    Object.assign(new Error('Preferences denied'), { code: 'EACCES' }),
  );
  expect((await manager.run()).ok).toBe(true);
  expect(manager.snapshot.warning?.field).toBe('preferences');
  const config = manager.snapshot.config!;
  const entry = manager.snapshot.latest!;
  const folder = join(
    config.destination,
    'Cash-Backups',
    config.installationId,
    current!.token.documentId,
  );
  await writeFile(join(folder, `.Cash-${randomUUID()}.incomplete`), 'partial');
  await writeFile(join(folder, 'unknown.tmp'), 'unknown');
  const stage = join(root, 'staging', config.installationId);
  await writeFile(join(stage, `.Cash-${randomUUID()}.sqlite`), 'partial');
  await writeFile(
    join(stage, `..Cash-${randomUUID()}.sqlite.${randomUUID()}.tmp`),
    'interrupted SQLite snapshot',
  );
  manager = newManager();
  unwrap(await manager.refresh());
  expect(manager.snapshot.latest!.path).toBe(entry.path);
  expect(await readdir(folder)).toEqual(
    expect.arrayContaining([entry.id, 'unknown.tmp']),
  );
  expect(
    (await readdir(folder)).some((name) => name.endsWith('.incomplete')),
  ).toBe(false);
  expect(await readdir(stage)).toEqual([]);
});
it('keeps origin identity when the current archive changes during transfer', async () => {
  const origin = current!;
  const next = unwrap(
    await createArchive(join(root, 'other.sqlite'), createEmptyDocument()),
  );
  onChange = (state) => {
    if (state.phase === 'copying') current = next;
  };
  unwrap(await manager.run());
  const config = manager.snapshot.config!;
  const files = await readdir(
    join(
      config.destination,
      'Cash-Backups',
      config.installationId,
      origin.token.documentId,
    ),
  );
  expect(files.filter((file) => file.endsWith('.sqlite'))).toHaveLength(1);
  expect(
    unwrap(
      await verifyArchiveCopy(
        join(
          config.destination,
          'Cash-Backups',
          config.installationId,
          origin.token.documentId,
          files[0]!,
        ),
      ),
    ).header,
  ).toMatchObject(origin.token);
  unwrap(await manager.refresh());
  expect(manager.snapshot.entries).toHaveLength(0);
});
it('restores a selected SQLite file when the active archive has no automatic previous-version copy', async () => {
  const active = current!;
  const source = join(root, 'selected-backup.sqlite');
  const selected = unwrap(await createArchive(source, createEmptyDocument()));
  closeArchive(source);
  const sourceBytes = await readFile(source);
  const activeBytes = await readFile(active.path);
  await expect(readFile(backupPathFor(active.path))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  const staged = unwrap(await manager.stageRestore(source));
  const restored = unwrap(
    await restoreArchiveCopy(staged.path, join(root, 'restored.sqlite')),
  );
  expect(restored.document).toEqual(selected.document);
  expect(restored.token).toEqual(selected.token);
  expect(restored.token.documentId).not.toBe(active.token.documentId);
  expect(await readFile(source)).toEqual(sourceBytes);
  expect(await readFile(active.path)).toEqual(activeBytes);
  await manager.releaseRestore(staged.path);
});

it.each([false, true])(
  'restores repeatedly into the default destination and preserves its previous data (already open: %s)',
  async (alreadyOpen) => {
    const destination = current!.path;
    const changed = structuredClone(current!.document!);
    changed.settings.fuelTerritory = 'Lazio';
    current = unwrap(await saveArchive(destination, changed, current!.token));
    const previous = structuredClone(current.document);
    const backupDocument = createEmptyDocument();
    backupDocument.settings.fuelTerritory = 'Sicilia';
    const source = join(root, 'selected.sqlite');
    const selected = unwrap(await createArchive(source, backupDocument));
    closeArchive(source);
    const sourceBytes = await readFile(source);
    if (!alreadyOpen) closeArchive(destination);
    const staged = unwrap(await manager.stageRestore(source));
    const restored = unwrap(
      await restoreArchiveCopy(staged.path, destination, true),
    );
    expect(restored.path).toBe(destination);
    expect(restored.token).toEqual(selected.token);
    expect(restored.document).toEqual(selected.document);
    const safety = (await readdir(root)).find((file) =>
      file.includes('.prima-ripristino.'),
    )!;
    expect(safety).toBeDefined();
    expect(
      unwrap(await persistence.openArchive(join(root, safety))).document,
    ).toEqual(previous);
    expect(unwrap(await persistence.openArchive(destination)).document).toEqual(
      selected.document,
    );
    expect((await restoreArchiveCopy(staged.path, destination, true)).ok).toBe(
      true,
    );
    expect(
      (await readdir(root)).filter(
        (file) =>
          file.includes('.prima-ripristino.') && file.endsWith('.sqlite'),
      ),
    ).toHaveLength(2);
    expect(await readFile(source)).toEqual(sourceBytes);
    expect(unwrap(await verifyArchiveCopy(destination)).header).toMatchObject(
      selected.token,
    );
    await manager.releaseRestore(staged.path);
  },
);

it('rolls back an existing destination if applying the selected backup fails', async () => {
  const destination = current!.path;
  const previous = structuredClone(current!.document);
  const backupDocument = createEmptyDocument();
  backupDocument.settings.fuelTerritory = 'Sicilia';
  const source = join(root, 'selected.sqlite');
  unwrap(await createArchive(source, backupDocument));
  closeArchive(source);
  const sourceBytes = await readFile(source);
  const db = new DatabaseSync(destination);
  db.exec(
    "CREATE TRIGGER fail_restore BEFORE UPDATE ON archive_metadata BEGIN SELECT RAISE(ABORT, 'restore failed'); END",
  );
  const staged = unwrap(await manager.stageRestore(source));
  try {
    expect(
      await restoreArchiveCopy(staged.path, destination, true),
    ).toMatchObject({ ok: false, error: { code: 'IO' } });
    expect(unwrap(await persistence.openArchive(destination)).document).toEqual(
      previous,
    );
    expect(await readFile(source)).toEqual(sourceBytes);
  } finally {
    db.exec('DROP TRIGGER fail_restore');
    db.close();
    await manager.releaseRestore(staged.path);
  }
  expect(
    (await saveArchive(destination, current!.document!, current!.token)).ok,
  ).toBe(true);
});

it('creates the default archive when restoring on a clean installation', async () => {
  const source = current!.path;
  const token = current!.token;
  const sourceBytes = await readFile(source);
  closeArchive(source);
  current = null;
  const staged = unwrap(await manager.stageRestore(source));
  const destination = join(root, 'Cash.sqlite');
  expect(
    unwrap(await restoreArchiveCopy(staged.path, destination, true)).token,
  ).toEqual(token);
  expect(await readFile(source)).toEqual(sourceBytes);
  await manager.releaseRestore(staged.path);
});

it('restores a verified copy with original identity/revision on a clean installation and never overwrites a destination', async () => {
  current = unwrap(
    await saveArchive(current!.path, current!.document!, current!.token),
  );
  unwrap(await manager.run());
  const source = manager.snapshot.latest!.path;
  const bytes = await readFile(source);
  const token = current!.token;
  current = null;
  manager = newManager();
  const stage = unwrap(await manager.stageRestore(source));
  const destination = join(root, 'restored.sqlite');
  const restored = unwrap(await restoreArchiveCopy(stage.path, destination));
  expect(restored.token).toEqual(token);
  expect(await readFile(source)).toEqual(bytes);
  expect(await restoreArchiveCopy(stage.path, destination)).toMatchObject({
    ok: false,
    error: { code: 'CONFLICT' },
  });
  expect(unwrap(await verifyArchiveCopy(destination)).header).toMatchObject(
    token,
  );
  expect(manager.snapshot.config).toBeNull();
  await rm(join(root, 'preferences.json'));
  const cleanManager = newManager();
  const clean = unwrap(await cleanManager.stageRestore(source));
  const cleanArchive = unwrap(
    await restoreArchiveCopy(clean.path, join(root, 'new-installation.sqlite')),
  );
  expect(cleanArchive.token).toEqual(token);
  expect(await readdir(root)).not.toContain('preferences.json');
});
it.each(['corrupt', 'foreign', 'future'] as const)(
  'rejects %s restore sources without modifying source or current archive',
  async (kind) => {
    unwrap(await manager.run());
    const source = manager.snapshot.latest!.path;
    if (kind === 'corrupt') await writeFile(source, 'corrupt');
    else {
      const db = new DatabaseSync(source);
      db.exec(
        kind === 'foreign'
          ? 'PRAGMA application_id=1'
          : 'PRAGMA user_version=999',
      );
      db.close();
    }
    const bytes = await readFile(source);
    const previous = current;
    const result = await manager.stageRestore(source);
    expect(result.ok).toBe(false);
    if (kind === 'future')
      expect(result).toMatchObject({ error: { code: 'SCHEMA_NEWER' } });
    expect(current).toBe(previous);
    expect(await readFile(source)).toEqual(bytes);
  },
);

it('applies the existing SQLite migration only on the restore staging copy', async () => {
  unwrap(await manager.run());
  const source = manager.snapshot.latest!.path;
  const token = current!.token;
  const db = new DatabaseSync(source);
  try {
    db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE old_quotes (id TEXT PRIMARY KEY, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, position INTEGER NOT NULL, date TEXT NOT NULL, payload TEXT NOT NULL) STRICT;
    INSERT INTO old_quotes SELECT id, createdAt, updatedAt, position, date, payload FROM quotes;
    DROP TABLE quotes; ALTER TABLE old_quotes RENAME TO quotes; CREATE INDEX quotes_date ON quotes(date);
    ALTER TABLE archive_metadata DROP COLUMN nextQuoteNumber;
    UPDATE archive_metadata SET schemaVersion=11; PRAGMA user_version=1; COMMIT;`);
  } finally {
    db.close();
  }
  const bytes = await readFile(source);
  const staged = unwrap(await manager.stageRestore(source));
  expect(staged.inspection.storageVersion).toBe(2);
  expect(staged.inspection.header.schemaVersion).toBe(12);
  const restored = unwrap(
    await restoreArchiveCopy(
      staged.path,
      join(root, 'migrated-restore.sqlite'),
    ),
  );
  expect(restored.token).toEqual(token);
  expect(await readFile(source)).toEqual(bytes);
});
