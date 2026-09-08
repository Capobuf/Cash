import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';

interface Preferences { lastArchivePath?: string }
const path = (): string => join(app.getPath('userData'), 'preferences.json');

export async function readPreferences(): Promise<Preferences> {
  try { return JSON.parse(await readFile(path(), 'utf8')) as Preferences; } catch { return {}; }
}
export async function rememberArchive(archivePath: string): Promise<void> {
  await writeFile(path(), JSON.stringify({ lastArchivePath: archivePath }, null, 2), 'utf8');
}
