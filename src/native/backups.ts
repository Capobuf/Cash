import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { constants } from 'node:fs';
import { err, ok, type CashError, type Result } from '../domain/model';
import type { ArchiveSession } from '../shared/archive';
import type { BackupConfig, BackupEntry, BackupState } from '../shared/backup';
import {
  backupConfigSchema,
  readPreferences,
  updatePreferences,
} from './preferences';
import {
  snapshotArchive,
  verifyArchiveCopy,
  waitForArchiveSaves,
  prepareRestoreCopy,
} from './persistence';

const managedName = /^Cash-(\d{8}T\d{9}Z)-rev(\d+)-([a-f0-9-]{36})\.sqlite$/;
const partialName = /^\.Cash-[a-f0-9-]{36}\.incomplete$/;
const stageName =
  /^\.{1,2}Cash-[a-f0-9-]{36}\.sqlite(?:\.[a-f0-9-]{36}\.tmp|\.schema-v\d+\.[a-f0-9-]{36}\.sqlite)?(?:-wal|-shm)?$/;
const cancelled = () =>
  err({
    code: 'CANCELLED',
    source: 'backup',
    message: 'Backup interrotto. Le copie precedenti sono conservate.',
  });
function error(cause: unknown, message: string): CashError {
  return {
    code:
      (cause as NodeJS.ErrnoException)?.code === 'ENOENT'
        ? 'FILE_NOT_FOUND'
        : 'IO',
    source: 'backup',
    message,
    action:
      'Verifica spazio, permessi e disponibilità della cartella, poi riprova o cambia destinazione.',
    details: [String(cause)],
  };
}
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}
function caught(cause: unknown, message: string): CashError {
  return cause &&
    typeof cause === 'object' &&
    'message' in cause &&
    'code' in cause &&
    !('stack' in cause)
    ? { ...(cause as CashError), source: 'backup' }
    : error(cause, message);
}
export async function checksum(
  path: string,
): Promise<{ size: number; hash: string }> {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { size, hash: hash.digest('hex') };
}
async function directoryExists(path: string): Promise<void> {
  const info = await stat(path);
  if (!info.isDirectory())
    throw new Error('La destinazione non è una cartella.');
}

async function publishBackup(
  source: string,
  destination: string,
): Promise<void> {
  try {
    await link(source, destination);
  } catch (cause) {
    // Virtual/external filesystems can reject hard links even for ordinary files.
    const code = (cause as NodeJS.ErrnoException).code;
    if (
      !code ||
      !['EISDIR', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EPERM'].includes(
        code,
      )
    )
      throw cause;
    // This copy is not atomic. Only a successfully verified file is a valid backup.
    await copyFile(source, destination, constants.COPYFILE_EXCL);
  }
}

export async function validateBackupDirectory(path: string): Promise<void> {
  await directoryExists(path);
  const first = join(path, `.Cash-${randomUUID()}.incomplete`);
  const second = join(path, `.Cash-${randomUUID()}.incomplete`);
  const published = join(path, `.Cash-${randomUUID()}.incomplete`);
  const bytes = Buffer.from(randomUUID());
  try {
    const handle = await open(first, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (!(await readFile(first)).equals(bytes))
      throw new Error('La cartella non conserva i dati scritti.');
    await rename(first, second);
    if (!(await readFile(second)).equals(bytes))
      throw new Error('Rinomina nella cartella non verificabile.');
    // Both publication methods must refuse to overwrite an existing file.
    try {
      await publishBackup(second, published);
      let refusedOverwrite = false;
      try {
        await publishBackup(second, published);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
        refusedOverwrite = true;
      }
      if (!refusedOverwrite)
        throw new Error('La cartella non impedisce le sovrascritture.');
    } catch (cause) {
      throw {
        code: 'IO',
        source: 'backup',
        message:
          'La destinazione non consente di creare un backup senza sovrascrivere file esistenti.',
        action:
          'Verifica i permessi e la disponibilità della cartella oppure scegli un’altra destinazione.',
        details: [String(cause)],
      } satisfies CashError;
    }
    if (!(await readFile(published)).equals(bytes))
      throw new Error('Pubblicazione esclusiva non verificabile.');
    await rm(published);
    await rm(second);
  } finally {
    await rm(first, { force: true });
    await rm(second, { force: true });
    await rm(published, { force: true });
  }
}

async function managedDirectory(
  root: string,
  installationId: string,
  documentId: string,
  create: boolean,
): Promise<string> {
  let directory = root;
  for (const part of ['Cash-Backups', installationId, documentId]) {
    directory = join(directory, part);
    if (create) {
      try {
        await mkdir(directory);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
      }
    }
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error(
        'Una cartella interna dei backup non è una directory ordinaria. Seleziona un’altra destinazione.',
      );
  }
  return directory;
}

interface BackupServices {
  current(): ArchiveSession | null;
  dirty(): boolean;
  blocked(): boolean;
  defaultDestination: string;
  stagingRoot: string;
  changed(state: BackupState): void;
}

export class BackupManager {
  private state: BackupState = {
    config: null,
    running: false,
    latest: null,
    nextAt: null,
    entries: [],
    error: null,
    warning: null,
    destinationMissing: false,
  };
  private active: Promise<Result<BackupState>> | null = null;
  private abort = false;
  private configurationBusy = false;
  private refreshQueue: Promise<unknown> = Promise.resolve();
  private retryAfter = new Map<string, number>();
  private verified = new Map<
    string,
    { signature: string; entry: BackupEntry }
  >();
  private lastScanContext = '';
  private initialPending = false;
  private initializingErrorAt = 0;
  private registeredLast: Pick<
    BackupEntry,
    'path' | 'completedAt' | 'documentId' | 'revision'
  > | null = null;
  constructor(private services: BackupServices) {}
  get running(): boolean {
    return this.active !== null;
  }
  get busy(): boolean {
    return this.running || this.configurationBusy;
  }
  get snapshot(): BackupState {
    return structuredClone(this.state);
  }
  private emit(): void {
    this.services.changed(this.snapshot);
  }
  private folder(config: BackupConfig, documentId: string): string {
    if (!/^[a-f0-9-]{36}$/i.test(documentId))
      throw new Error('Identità archivio non valida.');
    return join(
      config.destination,
      'Cash-Backups',
      config.installationId,
      documentId,
    );
  }
  private staging(config: BackupConfig): string {
    return join(this.services.stagingRoot, config.installationId);
  }
  private recalculate(): void {
    const session = this.services.current();
    this.state.currentRevision = session?.token.revision;
    const { config, latest } = this.state;
    this.state.nextAt =
      config?.enabled &&
      session?.document &&
      !session.readOnly &&
      (!latest || latest.revision !== session.token.revision)
        ? new Date(
            Math.max(
              latest
                ? Date.parse(latest.completedAt) +
                    config.intervalHours * 3600_000
                : 0,
              this.retryAfter.get(session.token.documentId) ?? 0,
              Date.now(),
            ),
          ).toISOString()
        : null;
  }
  private async initialize(destination?: string): Promise<BackupConfig> {
    if (this.state.config) return this.state.config;
    const preferences = unwrap(await readPreferences());
    this.registeredLast = preferences.backupLast ?? null;
    if (preferences.backup) {
      this.state.config = preferences.backup;
      return preferences.backup;
    }
    if (!destination && !this.services.defaultDestination)
      throw new Error(
        'LOCALAPPDATA non disponibile: seleziona esplicitamente una destinazione backup.',
      );
    const config: BackupConfig = {
      installationId: randomUUID(),
      destination: destination ?? this.services.defaultDestination,
      enabled: true,
      intervalHours: 24,
      retention: 10,
    };
    if (!destination) await mkdir(config.destination, { recursive: true });
    await validateBackupDirectory(config.destination);
    unwrap(await updatePreferences({ backup: { ...config } }));
    this.state.config = config;
    return config;
  }
  refresh(): Promise<Result<BackupState>> {
    const result = this.refreshQueue.then(() => this.refreshNow());
    this.refreshQueue = result.catch(() => undefined);
    return result;
  }
  private async refreshNow(): Promise<Result<BackupState>> {
    if (this.busy) {
      this.recalculate();
      return ok(this.snapshot);
    }
    if (!this.services.current()) return ok(this.snapshot);
    try {
      const config = await this.initialize();
      const session = this.services.current();
      if (!session) return ok(this.snapshot);
      const context = `${config.destination}|${session.token.documentId}`;
      const previousLatest =
        context === this.lastScanContext ? this.state.latest : null;
      if (context !== this.lastScanContext) {
        this.state.entries = [];
        this.state.latest = null;
        this.state.warning = null;
        this.lastScanContext = context;
      }
      await directoryExists(config.destination);
      this.state.destinationMissing = false;
      if (this.state.error?.field === 'backup.destination')
        this.state.error = null;
      const stage = this.staging(config);
      await mkdir(stage, { recursive: true });
      await this.cleanup(stage, stageName);
      const restoreStage = join(this.services.stagingRoot, 'restore');
      if (!this.services.blocked()) {
        try {
          await this.cleanup(restoreStage, stageName);
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
        }
      }
      const entries = await this.scan(config, session.token.documentId);
      this.state.entries = entries;
      this.state.latest =
        entries.find((entry) => entry.verification === 'valid') ?? null;
      if (
        (previousLatest &&
          !entries.some((entry) => entry.id === previousLatest.id)) ||
        (this.registeredLast?.documentId === session.token.documentId &&
          dirname(this.registeredLast.path) ===
            this.folder(config, session.token.documentId) &&
          !entries.some((entry) => entry.path === this.registeredLast!.path))
      )
        this.state.warning = {
          code: 'FILE_NOT_FOUND',
          source: 'backup',
          message: 'L’ultimo backup non è più presente.',
          action:
            'Esegui un nuovo backup oppure verifica le copie ancora disponibili.',
        };
      if (entries.some((entry) => entry.verification === 'invalid'))
        this.state.warning = {
          code: 'VALIDATION',
          source: 'backup',
          message:
            'Una copia non supera la verifica. Non verrà eliminata dalla rotazione.',
          action:
            'Verifica la copia e scegli una copia valida per il ripristino.',
        };
      if (
        this.state.latest &&
        this.registeredLast?.path !== this.state.latest.path
      ) {
        const { path, completedAt, documentId, revision } = this.state.latest;
        const metadata = { path, completedAt, documentId, revision };
        const saved = await updatePreferences({ backupLast: metadata });
        if (saved.ok) this.registeredLast = metadata;
        else
          this.state.warning = {
            ...saved.error,
            source: 'backup',
            action:
              'La copia è valida. Correggi le preferenze e aggiorna la cronologia.',
          };
      }
      this.recalculate();
      this.emit();
      return ok(this.snapshot);
    } catch (cause) {
      const problem = caught(cause, 'Destinazione backup non disponibile.');
      this.state.error = problem;
      this.state.error.field = 'backup.destination';
      this.state.destinationMissing = problem.code === 'FILE_NOT_FOUND';
      this.state.entries = [];
      this.state.latest = null;
      this.recalculate();
      this.emit();
      return err(problem);
    }
  }
  private async cleanup(directory: string, pattern: RegExp): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && pattern.test(entry.name)) {
        try {
          await rm(join(directory, entry.name));
        } catch (cause) {
          this.state.warning = error(
            cause,
            'Pulizia di un file temporaneo interrotto non riuscita. Riprova aggiornando la cronologia.',
          );
        }
      }
    }
  }
  private async scan(
    config: BackupConfig,
    documentId: string,
  ): Promise<BackupEntry[]> {
    const folder = this.folder(config, documentId);
    let files;
    try {
      await managedDirectory(
        config.destination,
        config.installationId,
        documentId,
        false,
      );
      files = await readdir(folder, { withFileTypes: true });
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw cause;
    }
    await this.cleanup(folder, partialName);
    const entries: BackupEntry[] = [];
    for (const file of files) {
      const match = managedName.exec(file.name);
      if (!file.isFile() || !match) continue;
      const stamp = match[1]!;
      const completedAt = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}.${stamp.slice(15, 18)}Z`;
      if (
        !Number.isFinite(Date.parse(completedAt)) ||
        new Date(completedAt).toISOString().replace(/[-:.]/g, '') !== stamp
      )
        continue;
      const path = join(folder, file.name);
      let info;
      try {
        info = await stat(path);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw cause;
      }
      const signature = `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
      const cached = this.verified.get(path);
      if (cached?.signature === signature) {
        entries.push(cached.entry);
        continue;
      }
      const revision = Number(match[2]);
      const verified = await verifyArchiveCopy(path, { documentId, revision });
      const entry: BackupEntry = {
        id: file.name,
        path,
        completedAt:
          this.registeredLast?.path === path
            ? this.registeredLast.completedAt
            : completedAt,
        documentId,
        revision,
        size: info.size,
        verification: verified.ok ? 'valid' : 'invalid',
        ...(!verified.ok ? { error: verified.error } : {}),
      };
      this.verified.set(path, { signature, entry });
      entries.push(entry);
    }
    return entries.sort(
      (a, b) =>
        b.completedAt.localeCompare(a.completedAt) || b.id.localeCompare(a.id),
    );
  }
  async check(): Promise<void> {
    if (this.busy || this.services.blocked()) return;
    const session = this.services.current();
    if (!session?.document || session.readOnly) return;
    if (!this.state.config && this.initializingErrorAt > Date.now()) return;
    const refreshed = await this.refresh();
    if (!refreshed.ok) {
      if (!this.state.config) this.initializingErrorAt = Date.now() + 3600_000;
      this.retryAfter.set(session.token.documentId, Date.now() + 3600_000);
      return;
    }
    if (
      this.busy ||
      this.services.blocked() ||
      this.services.current()?.token.documentId !== session.token.documentId
    )
      return;
    const config = this.state.config!;
    const latest = this.state.latest;
    if (
      this.services.dirty() ||
      (this.retryAfter.get(session.token.documentId) ?? 0) > Date.now()
    )
      return;
    if (this.initialPending) {
      this.initialPending = false;
      await this.run(false);
      return;
    }
    if (!config.enabled) return;
    if (
      latest &&
      (latest.revision === session.token.revision ||
        Date.parse(latest.completedAt) + config.intervalHours * 3600_000 >
          Date.now())
    )
      return;
    await this.run(false);
  }
  run(manual = true): Promise<Result<BackupState>> {
    if (this.busy || this.services.blocked())
      return Promise.resolve(
        err({
          code: 'CONFLICT',
          source: 'backup',
          message: 'Un’operazione incompatibile è già in corso.',
          action: 'Attendi il completamento e riprova.',
        }),
      );
    this.abort = false;
    this.state.running = true;
    this.state.phase = 'preparing';
    this.state.error = null;
    this.state.warning = null;
    delete this.state.operationDocumentId;
    // Deferring gives active a value before the operation can emit callbacks.
    this.active = Promise.resolve()
      .then(() => this.execute(manual))
      .then((result) => {
        this.active = null;
        this.state.running = false;
        delete this.state.phase;
        delete this.state.bytesCopied;
        delete this.state.totalBytes;
        this.recalculate();
        this.emit();
        return result.ok ? ok(this.snapshot) : result;
      });
    this.emit();
    return this.active;
  }
  async finish(cancel: boolean): Promise<void> {
    if (cancel) this.abort = true;
    await this.active;
  }
  private cancellation(): void {
    if (this.abort) throw unwrap(cancelled());
  }
  private phase(phase: BackupState['phase']): void {
    this.state.phase = phase;
    this.emit();
  }
  private async execute(manual: boolean): Promise<Result<BackupState>> {
    let local: string | undefined;
    let partial: string | undefined;
    let origin: ArchiveSession | null = null;
    try {
      await this.refreshQueue;
      await waitForArchiveSaves();
      this.cancellation();
      origin = this.services.current();
      if (!origin?.document || origin.readOnly || this.services.dirty())
        throw {
          code: 'CONFLICT',
          source: 'backup',
          message: 'Il backup richiede un archivio salvato senza conflitti.',
          action:
            'Attendi “Salvato” oppure risolvi l’errore di salvataggio e riprova.',
        } satisfies CashError;
      const token = { ...origin.token };
      this.state.operationDocumentId = token.documentId;
      const config = { ...(await this.initialize()) };
      await directoryExists(config.destination);
      this.state.destinationMissing = false;
      this.folder(config, token.documentId);
      const folder = await managedDirectory(
        config.destination,
        config.installationId,
        token.documentId,
        true,
      );
      await validateBackupDirectory(folder);
      const stage = this.staging(config);
      await mkdir(stage, { recursive: true });
      local = join(stage, `.Cash-${randomUUID()}.sqlite`);
      this.phase('snapshot');
      unwrap(await snapshotArchive(origin.path, local, token));
      this.cancellation();
      this.phase('verifying');
      unwrap(await verifyArchiveCopy(local, token));
      const original = await checksum(local);
      this.cancellation();
      partial = join(folder, `.Cash-${randomUUID()}.incomplete`);
      this.state.totalBytes = original.size;
      this.state.bytesCopied = 0;
      this.phase('copying');
      const target = await open(partial, 'wx');
      try {
        let lastUpdate = 0;
        for await (const chunk of createReadStream(local)) {
          this.cancellation();
          await target.writeFile(chunk);
          this.state.bytesCopied! += chunk.length;
          if (Date.now() - lastUpdate >= 100) {
            this.emit();
            lastUpdate = Date.now();
          }
        }
        await target.sync();
        this.emit();
      } finally {
        await target.close();
      }
      this.phase('verifying');
      const copied = await checksum(partial);
      if (copied.size !== original.size || copied.hash !== original.hash)
        throw new Error(
          'Dimensione o checksum SHA-256 della copia diverso dallo snapshot.',
        );
      unwrap(await verifyArchiveCopy(partial, token));
      this.cancellation();
      this.phase('completing');
      const publicationAt = new Date().toISOString();
      const id = `Cash-${publicationAt.replace(/[-:.]/g, '')}-rev${token.revision}-${randomUUID()}.sqlite`;
      const finalPath = join(folder, id);
      await publishBackup(partial, finalPath);
      try {
        const published = await checksum(finalPath);
        unwrap(await verifyArchiveCopy(finalPath, token));
        if (
          published.size !== original.size ||
          published.hash !== original.hash
        )
          throw new Error('Verifica del file pubblicato non riuscita.');
      } catch (cause) {
        await rm(finalPath);
        throw cause;
      }
      const completedAt = new Date().toISOString();
      const entry: BackupEntry = {
        id,
        path: finalPath,
        completedAt,
        ...token,
        size: original.size,
        verification: 'valid',
      };
      const registration = await updatePreferences({
        backupLast: { completedAt, path: finalPath, ...token },
      });
      if (registration.ok) this.registeredLast = entry;
      if (!registration.ok)
        this.state.warning = {
          ...registration.error,
          source: 'backup',
          action:
            'La copia è valida. Correggi le preferenze e aggiorna la cronologia per riconciliarla.',
        };
      this.retryAfter.delete(token.documentId);
      this.state.error = null;
      try {
        const entries = await this.scan(config, token.documentId);
        // Rotate only after exclusive publication and verification of the new copy.
        const obsolete = entries
          .filter((item) => item.verification === 'valid')
          .slice(config.retention);
        for (const item of obsolete) {
          if (this.abort) {
            this.state.warning = {
              code: 'CANCELLED',
              source: 'backup',
              message: 'Backup completato; rotazione interrotta.',
              action: 'Esegui un nuovo backup per completare la rotazione.',
            };
            break;
          }
          if (
            resolve(item.path) === resolve(origin.path) ||
            resolve(item.path) ===
              resolve(this.services.current()?.path ?? origin.path) ||
            item.path === finalPath
          )
            continue;
          const checked = await verifyArchiveCopy(item.path, {
            documentId: item.documentId,
            revision: item.revision,
          });
          if (!checked.ok) continue;
          try {
            await rm(item.path);
            this.verified.delete(item.path);
          } catch (cause) {
            this.state.warning = error(
              cause,
              'Backup riuscito; rotazione incompleta. Esegui un nuovo backup per riprovare la rotazione.',
            );
          }
        }
        if (this.services.current()?.token.documentId === token.documentId) {
          this.state.entries = await this.scan(config, token.documentId);
          this.state.latest =
            this.state.entries.find((item) => item.verification === 'valid') ??
            null;
          if (!this.state.entries.some((item) => item.id === entry.id))
            this.state.warning = {
              code: 'FILE_NOT_FOUND',
              source: 'backup',
              message: 'La copia appena creata non è più disponibile.',
              action: 'Verifica la cartella e aggiorna la cronologia.',
            };
          else if (
            this.state.entries.some((item) => item.verification === 'invalid')
          )
            this.state.warning ??= {
              code: 'VALIDATION',
              source: 'backup',
              message:
                'Una copia non supera la verifica. Non verrà eliminata dalla rotazione.',
              action:
                'Verifica la copia e scegli una copia valida per il ripristino.',
            };
        }
      } catch (cause) {
        this.state.warning = error(
          cause,
          'Backup riuscito; rotazione o aggiornamento della cronologia non completato. Aggiorna la cronologia per riprovare.',
        );
        if (this.services.current()?.token.documentId === token.documentId) {
          this.state.entries = [
            entry,
            ...this.state.entries.filter((item) => item.id !== entry.id),
          ];
          this.state.latest = entry;
        }
      }
      this.recalculate();
      this.emit();
      return ok(this.snapshot);
    } catch (cause) {
      const problem = caught(
        cause,
        manual
          ? 'Backup manuale non riuscito.'
          : 'Backup automatico non riuscito.',
      );
      this.state.error = problem;
      this.state.destinationMissing = problem.code === 'FILE_NOT_FOUND';
      if (origin)
        this.retryAfter.set(origin.token.documentId, Date.now() + 3600_000);
      this.emit();
      return err(problem);
    } finally {
      for (const path of [partial, local])
        if (path) {
          try {
            await rm(path, { force: true });
          } catch (cause) {
            this.state.warning = error(
              cause,
              'Pulizia del file temporaneo non riuscita. Aggiorna la cronologia per riprovare.',
            );
          }
        }
    }
  }
  private async change(
    operation: (config: BackupConfig) => Promise<BackupConfig>,
    initial = false,
    initializationDestination?: string,
  ): Promise<Result<BackupState>> {
    if (this.busy || this.services.blocked())
      return err({
        code: 'CONFLICT',
        source: 'backup',
        message: 'Attendi la conclusione dell’operazione corrente.',
      });
    await this.refreshQueue;
    if (this.busy || this.services.blocked())
      return err({
        code: 'CONFLICT',
        source: 'backup',
        message: 'Attendi la conclusione dell’operazione corrente.',
      });
    this.configurationBusy = true;
    try {
      const config = await operation(
        await this.initialize(initializationDestination),
      );
      unwrap(await updatePreferences({ backup: { ...config } }));
      this.state.config = config;
      this.state.error = null;
      this.state.warning = null;
      this.retryAfter.clear();
      this.verified.clear();
    } catch (cause) {
      const problem = caught(cause, 'Configurazione backup non salvata.');
      this.state.error = problem;
      this.emit();
      return err(problem);
    } finally {
      this.configurationBusy = false;
    }
    const refreshed = await this.refresh();
    if (!refreshed.ok) return refreshed;
    if (initial && this.services.current()?.document) {
      if (!this.services.dirty()) return this.run(true);
      this.initialPending = true;
    }
    await this.check();
    return ok(this.snapshot);
  }
  configure(
    input: Pick<BackupConfig, 'enabled' | 'intervalHours' | 'retention'>,
  ): Promise<Result<BackupState>> {
    const parsed = backupConfigSchema
      .pick({ enabled: true, intervalHours: true, retention: true })
      .safeParse(input);
    if (!parsed.success)
      return Promise.resolve(
        err({
          code: 'VALIDATION',
          source: 'backup',
          message: 'Configurazione backup non valida.',
          action:
            'Scegli frequenza e numero di copie fra i valori disponibili.',
        }),
      );
    return this.change(async (config) =>
      backupConfigSchema.parse({
        ...config,
        enabled: parsed.data.enabled,
        intervalHours: parsed.data.intervalHours,
        retention: parsed.data.retention,
      }),
    );
  }
  selectDirectory(path: string): Promise<Result<BackupState>> {
    return this.change(
      async (config) => {
        await validateBackupDirectory(path);
        return { ...config, destination: path };
      },
      true,
      path,
    );
  }
  recreateDirectory(): Promise<Result<BackupState>> {
    return this.change(async (config) => {
      await mkdir(config.destination, { recursive: true });
      await validateBackupDirectory(config.destination);
      return config;
    }, true);
  }
  async managedEntry(id: string): Promise<Result<BackupEntry>> {
    if (typeof id !== 'string' || !managedName.test(id))
      return err({
        code: 'VALIDATION',
        source: 'backup',
        message: 'Seleziona una copia nella cronologia.',
      });
    const refreshed = await this.refresh();
    if (!refreshed.ok) return refreshed;
    const entry = this.state.entries.find((entry) => entry.id === id);
    return entry
      ? ok(entry)
      : err({
          code: 'FILE_NOT_FOUND',
          source: 'backup',
          message: 'La copia selezionata non è più disponibile.',
          action: 'Aggiorna la cronologia o seleziona un’altra copia.',
        });
  }
  async verify(id: string): Promise<Result<BackupState>> {
    if (this.busy)
      return err({
        code: 'CONFLICT',
        source: 'backup',
        message: 'Attendi il completamento del backup.',
      });
    const selected = await this.managedEntry(id);
    if (!selected.ok) return selected;
    if (this.busy)
      return err({
        code: 'CONFLICT',
        source: 'backup',
        message: 'Attendi il completamento del backup.',
      });
    this.configurationBusy = true;
    try {
      const entry = selected.value;
      this.verified.delete(entry.path);
      const verified = await verifyArchiveCopy(entry.path, {
        documentId: entry.documentId,
        revision: entry.revision,
      });
      if (!verified.ok && verified.error.code === 'FILE_NOT_FOUND')
        this.state.entries = this.state.entries.filter(
          (item) => item.id !== id,
        );
      else
        this.state.entries = this.state.entries.map((item) =>
          item.id === id
            ? {
                ...item,
                verification: verified.ok ? 'valid' : 'invalid',
                error: verified.ok ? undefined : verified.error,
                size: verified.ok ? verified.value.size : item.size,
              }
            : item,
        );
      this.state.latest =
        this.state.entries.find((item) => item.verification === 'valid') ??
        null;
      if (!verified.ok) {
        this.state.warning = {
          ...verified.error,
          source: 'backup',
          action: 'Seleziona una copia valida o esegui un nuovo backup.',
        };
        return err(this.state.warning);
      }
      if (
        !this.state.entries.some((item) => item.verification === 'invalid') &&
        this.state.warning?.code === 'VALIDATION'
      )
        this.state.warning = null;
      return ok(this.snapshot);
    } finally {
      this.configurationBusy = false;
      this.recalculate();
      this.emit();
    }
  }
  async destination(): Promise<Result<string>> {
    try {
      const config = await this.initialize();
      await directoryExists(config.destination);
      return ok(config.destination);
    } catch (cause) {
      return err(caught(cause, 'Cartella backup non disponibile.'));
    }
  }
  async stageRestore(source: string): Promise<
    Result<{
      path: string;
      inspection: import('../shared/archive').ArchiveInspection;
    }>
  > {
    let path: string | undefined;
    try {
      try {
        const wal = await stat(`${source}-wal`);
        if (wal.size > 0)
          throw new Error(
            'Il file selezionato ha un WAL attivo. Seleziona una copia di backup chiusa e autonoma.',
          );
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
      }
      // A clean installation can restore before an archive/configuration exists.
      const root = join(this.services.stagingRoot, 'restore');
      await mkdir(root, { recursive: true });
      await this.cleanup(root, stageName);
      path = join(root, `.Cash-${randomUUID()}.sqlite`);
      await copyFile(source, path, constants.COPYFILE_EXCL);
      const [original, copied] = await Promise.all([
        checksum(source),
        checksum(path),
      ]);
      if (original.size !== copied.size || original.hash !== copied.hash)
        throw new Error(
          'La copia di ripristino non corrisponde al file selezionato.',
        );
      const inspection = unwrap(await prepareRestoreCopy(path));
      return ok({ path, inspection });
    } catch (cause) {
      if (path) await this.releaseRestore(path);
      return err(
        caught(cause, 'Il file selezionato non è un backup Cash valido.'),
      );
    }
  }
  async releaseRestore(path: string): Promise<void> {
    try {
      await rm(path, { force: true });
    } catch (cause) {
      this.state.warning = error(
        cause,
        'Pulizia della copia temporanea di ripristino non riuscita. Riprova la verifica per eseguire la pulizia.',
      );
      this.emit();
    }
  }
}
