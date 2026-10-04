import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { z } from 'zod';
import { err, ok, type Result } from '../domain/model';

const preferencesSchema = z
  .object({
    lastArchivePath: z.string().optional(),
    ficClientId: z.string().optional(),
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
async function updatePreferences(
  updates: Partial<Preferences>,
): Promise<Result<void>> {
  const existing = await readPreferences();
  if (!existing.ok) return existing;
  try {
    await writeFile(
      path(),
      JSON.stringify({ ...existing.value, ...updates }, null, 2),
      'utf8',
    );
    return ok(undefined);
  } catch (cause) {
    return err({
      code: 'IO',
      field: 'preferences',
      message: 'Impossibile salvare le preferenze locali.',
      details: [String(cause)],
    });
  }
}
export function rememberArchive(archivePath: string): Promise<Result<void>> {
  return updatePreferences({ lastArchivePath: archivePath });
}
export function setFicClientId(clientId: string): Promise<Result<void>> {
  return updatePreferences({ ficClientId: clientId.trim() });
}
