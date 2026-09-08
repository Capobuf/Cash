import { constants } from 'node:fs';
import { access, copyFile, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION, err, ok, type CashDocument, type Result } from '../domain/model';
import { cashDocumentSchema, documentHeaderSchema, parseDocument } from '../domain/schema';

export interface ConcurrencyToken { documentId: string; revision: number; fingerprint: string }
export interface ArchiveSession { path: string; document?: CashDocument; token: ConcurrencyToken; readOnly: boolean; headerOnly?: true }

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const encode = (document: CashDocument): Buffer => Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8');

export function backupPathFor(path: string): string {
  const extension = extname(path);
  return join(dirname(path), `${basename(path, extension)}.backup.json`);
}

function parseJson(bytes: Buffer): Result<unknown> {
  try { return ok(JSON.parse(bytes.toString('utf8'))); }
  catch { return err({ code: 'VALIDATION', source: 'archive', message: 'Il file non contiene JSON UTF-8 valido.', action: 'Selezionare esplicitamente un archivio o una copia di sicurezza valida.' }); }
}

export async function inspectArchive(path: string): Promise<Result<{ header: { schemaVersion: number; documentId: string; revision: number; createdAt: string; updatedAt: string }; fingerprint: string; size: number }>> {
  try {
    const bytes = await readFile(path);
    const raw = parseJson(bytes); if (!raw.ok) return raw;
    const header = documentHeaderSchema.safeParse(raw.value);
    if (!header.success) return err({ code: 'VALIDATION', source: 'archive', message: 'Intestazione archivio non valida.', details: header.error.issues.map(issue => issue.message) });
    return ok({ header: header.data, fingerprint: sha256(bytes), size: bytes.byteLength });
  } catch (cause) {
    return err({ code: 'IO', source: 'archive', message: 'Impossibile leggere l’archivio.', details: [String(cause)] });
  }
}

export async function openArchive(path: string): Promise<Result<ArchiveSession>> {
  try {
    const bytes = await readFile(path);
    const raw = parseJson(bytes); if (!raw.ok) return raw;
    const headerResult = documentHeaderSchema.safeParse(raw.value);
    if (!headerResult.success) return err({ code: 'VALIDATION', source: 'archive', message: 'Intestazione archivio non valida.', details: headerResult.error.issues.map(issue => issue.message) });
    const header = headerResult.data;
    const token = { documentId: header.documentId, revision: header.revision, fingerprint: sha256(bytes) };
    if (header.schemaVersion > CURRENT_SCHEMA_VERSION)
      return ok({ path, token, readOnly: true, headerOnly: true });
    if (header.schemaVersion < CURRENT_SCHEMA_VERSION)
      return err({ code: 'MIGRATION_REQUIRED', source: 'archive', message: `Lo schema ${header.schemaVersion} richiede una migrazione esplicita con backup.`, action: 'Aggiornare l’archivio dopo conferma.' });
    const parsed = cashDocumentSchema.safeParse(raw.value);
    if (!parsed.success) return err({ code: 'VALIDATION', source: 'archive', message: 'Struttura archivio non valida.', details: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) });
    return ok({ path, document: parsed.data, token, readOnly: false });
  } catch (cause) {
    return err({ code: 'IO', source: 'archive', message: 'Impossibile aprire l’archivio.', details: [String(cause)] });
  }
}

export async function createArchive(path: string, document: CashDocument): Promise<Result<ArchiveSession>> {
  if (!path.toLocaleLowerCase().endsWith('.json')) return err({ code: 'VALIDATION', field: 'path', source: 'archive', message: 'Il nome dell’archivio deve terminare con .json.' });
  try {
    try { await access(path, constants.F_OK); return err({ code: 'CONFLICT', source: 'archive', message: 'Nel percorso scelto esiste già un file.' }); }
    catch { /* expected */ }
    const normalized = parseDocument({ ...document, schemaVersion: CURRENT_SCHEMA_VERSION, revision: 1 });
    const bytes = encode(normalized);
    const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
    const handle = await open(temp, 'wx');
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    parseDocument(JSON.parse((await readFile(temp)).toString('utf8')));
    try { await access(path, constants.F_OK); await rm(temp, { force: true }); return err({ code: 'CONFLICT', source: 'archive', message: 'Il file è comparso durante la creazione.' }); }
    catch { /* still absent */ }
    await rename(temp, path);
    const persisted = await readFile(path);
    return ok({ path, document: normalized, token: { documentId: normalized.documentId, revision: 1, fingerprint: sha256(persisted) }, readOnly: false });
  } catch (cause) {
    return err({ code: 'IO', source: 'archive', message: 'Creazione atomica non riuscita.', details: [String(cause)] });
  }
}

let saveQueue: Promise<unknown> = Promise.resolve();
export function saveArchive(path: string, document: CashDocument, token: ConcurrencyToken): Promise<Result<ArchiveSession>> {
  const task = saveQueue.then(() => saveArchiveNow(path, document, token), () => saveArchiveNow(path, document, token));
  saveQueue = task;
  return task;
}

async function saveArchiveNow(path: string, document: CashDocument, token: ConcurrencyToken): Promise<Result<ArchiveSession>> {
  let temp: string | undefined;
  try {
    const disk = await readFile(path);
    const raw = parseJson(disk); if (!raw.ok) return raw;
    const header = documentHeaderSchema.safeParse(raw.value);
    if (!header.success) return err({ code: 'CONFLICT', source: 'archive', message: 'L’archivio su disco non ha più un’intestazione valida.' });
    const diskFingerprint = sha256(disk);
    if (header.data.documentId !== token.documentId || header.data.revision !== token.revision || diskFingerprint !== token.fingerprint)
      return err({ code: 'CONFLICT', source: 'archive', message: 'Archivio modificato esternamente: salvataggio bloccato.', action: 'Salvare una copia di recupero oppure scartare e ricaricare.' });

    const next = parseDocument({ ...structuredClone(document), documentId: token.documentId,
      revision: token.revision + 1, updatedAt: new Date().toISOString() });
    const nextBytes = encode(next);
    await copyFile(path, backupPathFor(path));
    temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
    const handle = await open(temp, 'wx');
    try { await handle.writeFile(nextBytes); await handle.sync(); } finally { await handle.close(); }
    const tempBytes = await readFile(temp);
    const verified = parseDocument(JSON.parse(tempBytes.toString('utf8')));
    if (verified.documentId !== token.documentId || verified.revision !== token.revision + 1) throw new Error('Verifica del file temporaneo fallita.');
    await rename(temp, path);
    temp = undefined;
    const persisted = await readFile(path);
    const final = parseDocument(JSON.parse(persisted.toString('utf8')));
    if (final.revision !== next.revision || final.documentId !== next.documentId) throw new Error('Verifica dopo sostituzione fallita.');
    return ok({ path, document: final, token: { documentId: final.documentId, revision: final.revision, fingerprint: sha256(persisted) }, readOnly: false });
  } catch (cause) {
    if (temp) await rm(temp, { force: true }).catch(() => undefined);
    return err({ code: 'IO', source: 'archive', message: 'Salvataggio atomico non riuscito; le modifiche restano non salvate.', details: [String(cause)] });
  }
}

export async function saveRecoveryCopy(path: string, document: CashDocument): Promise<Result<ArchiveSession>> {
  const now = new Date().toISOString();
  return createArchive(path, { ...structuredClone(document), documentId: randomUUID(), revision: 1, createdAt: now, updatedAt: now });
}

export async function archiveMetadata(path: string): Promise<Result<{ modifiedAt: string; size: number }>> {
  try { const info = await stat(path); return ok({ modifiedAt: info.mtime.toISOString(), size: info.size }); }
  catch (cause) { return err({ code: 'IO', source: 'archive', message: 'Impossibile leggere i metadati.', details: [String(cause)] }); }
}
