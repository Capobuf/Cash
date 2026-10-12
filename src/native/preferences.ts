import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { app } from 'electron';
import { z } from 'zod';
import { err, ok, type Result } from '../domain/model';

export const backupConfigSchema = z
  .object({
    installationId: z.uuid(),
    destination: z
      .string()
      .min(1)
      .refine(isAbsolute, 'La destinazione deve essere un percorso assoluto.'),
    enabled: z.boolean(),
    intervalHours: z.union([
      z.literal(6),
      z.literal(12),
      z.literal(24),
      z.literal(168),
    ]),
    retention: z.union([
      z.literal(5),
      z.literal(10),
      z.literal(20),
      z.literal(30),
    ]),
  })
  .passthrough();
const preferencesSchema = z
  .object({
    lastArchivePath: z.string().optional(),
    ficClientId: z.string().optional(),
    backup: backupConfigSchema.optional(),
    backupLast: z
      .object({
        completedAt: z.iso.datetime(),
        path: z.string(),
        documentId: z.uuid(),
        revision: z.number().int().positive(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
type Preferences = z.infer<typeof preferencesSchema>;
const path = (): string => join(app.getPath('userData'), 'preferences.json');

export async function readPreferences(): Promise<Result<Preferences>> {
  let contents: string;
  try {
    contents = await readFile(path(), 'utf8');
  } catch (cause) {
    if (
      cause &&
      typeof cause === 'object' &&
      'code' in cause &&
      cause.code === 'ENOENT'
    )
      return ok({});
    return err({
      code: 'IO',
      field: 'preferences',
      message: 'Impossibile leggere le preferenze locali.',
      details: [String(cause)],
    });
  }
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (cause) {
    return err({
      code: 'VALIDATION',
      field: 'preferences',
      message: 'Il file delle preferenze locali contiene JSON non valido.',
      details: [String(cause)],
    });
  }
  const parsed = preferencesSchema.safeParse(value);
  return parsed.success
    ? ok(parsed.data)
    : err({
        code: 'VALIDATION',
        field: 'preferences',
        message: 'I dati delle preferenze locali non sono validi.',
        details: parsed.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`,
        ),
      });
}
let updatesQueue: Promise<unknown> = Promise.resolve();
export function updatePreferences(
  updates: Partial<Preferences>,
): Promise<Result<void>> {
  const result = updatesQueue.then(() => writePreferences(updates));
  updatesQueue = result.catch(() => undefined);
  return result;
}
async function writePreferences(
  updates: Partial<Preferences>,
): Promise<Result<void>> {
  const existing = await readPreferences();
  if (!existing.ok) return existing;
  const parsed = preferencesSchema.safeParse({
    ...existing.value,
    ...updates,
    ...(updates.backup
      ? { backup: { ...existing.value.backup, ...updates.backup } }
      : {}),
  });
  if (!parsed.success)
    return err({
      code: 'VALIDATION',
      field: 'preferences',
      message: 'Configurazione delle preferenze non valida.',
      details: parsed.error.issues.map((issue) => issue.message),
    });
  const temporary = `${path()}.${randomUUID()}.tmp`;
  let result: Result<void>;
  try {
    await writeFile(temporary, JSON.stringify(parsed.data, null, 2), {
      encoding: 'utf8',
      flag: 'wx',
      flush: true,
    });
    await rename(temporary, path());
    result = ok(undefined);
  } catch (cause) {
    result = err({
      code: 'IO',
      field: 'preferences',
      message: 'Impossibile salvare le preferenze locali.',
      details: [String(cause)],
    });
  } finally {
    try {
      await rm(temporary, { force: true });
    } catch (cause) {
      result = err({
        code: 'IO',
        field: 'preferences',
        message: 'Pulizia del temporaneo delle preferenze non riuscita.',
        details: [String(cause)],
      });
    }
  }
  return result;
}
export function rememberArchive(archivePath: string): Promise<Result<void>> {
  return updatePreferences({ lastArchivePath: archivePath });
}
export function setFicClientId(clientId: string): Promise<Result<void>> {
  return updatePreferences({ ficClientId: clientId.trim() });
}
