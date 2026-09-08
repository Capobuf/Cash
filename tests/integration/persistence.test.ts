import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../../src/domain/model';
import { backupPathFor, createArchive, openArchive, saveArchive } from '../../src/native/persistence';

describe('persistenza atomica',()=>{
  it('crea, incrementa, mantiene backup e blocca conflitto hash',async()=>{const dir=await mkdtemp(join(tmpdir(),'cash-'));const path=join(dir,'Cash.data.json');const created=await createArchive(path,createEmptyDocument('2026-09-08T00:00:00.000Z'));expect(created.ok).toBe(true);if(!created.ok)return;expect(created.value.token.revision).toBe(1);const doc=structuredClone(created.value.document!);doc.settings.fuelTerritory='Lazio';const saved=await saveArchive(path,doc,created.value.token);expect(saved.ok).toBe(true);expect(JSON.parse(await readFile(backupPathFor(path),'utf8')).revision).toBe(1);if(!saved.ok)return;const bytes=await readFile(path,'utf8');await writeFile(path,bytes.replace('"Lazio"','"Lazio "'));const conflict=await saveArchive(path,saved.value.document!,saved.value.token);expect(conflict.ok).toBe(false);if(!conflict.ok)expect(conflict.error.code).toBe('CONFLICT');});
  it('apre uno schema più nuovo in sola lettura',async()=>{const dir=await mkdtemp(join(tmpdir(),'cash-'));const path=join(dir,'future.json');const doc=createEmptyDocument();await writeFile(path,JSON.stringify({...doc,schemaVersion:99}));const opened=await openArchive(path);expect(opened.ok&&opened.value.readOnly).toBe(true);});
});
