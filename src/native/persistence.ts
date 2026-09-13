import { constants } from 'node:fs';
import { access, copyFile, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { CURRENT_SCHEMA_VERSION, err, ok, type CashDocument, type Result } from '../domain/model';
import { cashDocumentSchema, documentHeaderSchema, parseDocument, validationErrorFromIssues } from '../domain/schema';

export interface ConcurrencyToken { documentId: string; revision: number; fingerprint: string }
export interface ArchiveSession { path: string; document?: CashDocument; token: ConcurrencyToken; readOnly: boolean; headerOnly?: true }
export interface MigrationPreview { fromVersion: number; toVersion: number; changes: string[]; blockers: string[]; backupPath: string }

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
    if (!parsed.success) return err(validationErrorFromIssues(parsed.error.issues));
    return ok({ path, document: parsed.data, token, readOnly: false });
  } catch (cause) {
    return err({ code: 'IO', source: 'archive', message: 'Impossibile aprire l’archivio.', details: [String(cause)] });
  }
}

export async function previewMigration(path: string): Promise<Result<MigrationPreview>> {
  const inspection = await inspectArchive(path);
  if (!inspection.ok) return inspection;
  const fromVersion = inspection.value.header.schemaVersion;
  if (fromVersion < 1 || fromVersion > 3)
    return err({ code: 'VALIDATION', source: 'archive', message: 'La migrazione supporta soltanto gli schemi da 1 a 3.' });
  const changes = fromVersion === 1 ? [
    'Aggiunge l’anagrafica Clienti locali vuota.',
    'Imposta Fatture in Cloud su Disattivata conservando i riferimenti non segreti.',
    'Aggiunge fase attività, aliquote 5%/15% e conferme ai profili; i profili diventano Da verificare.',
    'Marca come Fatture in Cloud i riferimenti cliente e gli snapshot esistenti.',
  ] : [];
  if(fromVersion<=2)changes.push('Converte automaticamente i consumi dei carburanti liquidi da l/100 km a km/l.');
  changes.push('Rimuove velocità media e anagrafica clienti locale non previste dalla v0.6.', 'Introduce coordinate delle Sedi, default globali e Trasferte con Partenza/Destinazione.');
  const bytes=await readFile(path);const raw=JSON.parse(bytes.toString('utf8')) as Record<string,unknown>;
  const blockers=findV3Blockers(fromVersion===1?migrateV2Record(migrateV1(raw)):fromVersion===2?migrateV2Record(raw):raw);
  return ok({ fromVersion, toVersion: CURRENT_SCHEMA_VERSION, backupPath: backupPathFor(path), changes, blockers });
}

function migrateV1(raw: Record<string, unknown>): Record<string, unknown> {
  const settings = (raw.settings ?? {}) as Record<string, unknown>;
  const profiles = ((raw.profiles ?? []) as Array<Record<string, unknown>>).map(profile => {
    const fiscal = profile.fiscal as Record<string, unknown>;
    return { ...profile, confirmed: false, fiscal: { ...fiscal, activityPhase: 'ordinary',
      reducedEligibilityConfirmed: false, ordinaryApplicabilityConfirmed: false,
      reducedSubstituteTaxRate: '5', ordinarySubstituteTaxRate: fiscal.substituteTaxRate ?? '15',
      substituteTaxRate: undefined } };
  });
  const migrateRef = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || 'source' in value) return value;
    return { ...value as Record<string, unknown>, source: 'fatture_in_cloud' };
  };
  const sites = ((raw.sites ?? []) as Array<Record<string, unknown>>).map(site => ({ ...site, client: migrateRef(site.client) }));
  const quotes = ((raw.quotes ?? []) as Array<Record<string, unknown>>).map(quote => ({ ...quote, client: migrateRef(quote.client),
    profileSnapshot: quote.profileSnapshot ? { ...quote.profileSnapshot as Record<string, unknown>,
      fiscal: { ...((quote.profileSnapshot as Record<string, unknown>).fiscal as Record<string, unknown>), activityPhase: 'ordinary',
        reducedEligibilityConfirmed: false, ordinaryApplicabilityConfirmed: false, reducedSubstituteTaxRate: '5',
        ordinarySubstituteTaxRate: (((quote.profileSnapshot as Record<string, unknown>).fiscal as Record<string, unknown>).substituteTaxRate ?? '15'),
        substituteTaxRate: undefined } } : undefined }));
  const legacyReferences = {
    ...(typeof settings.ficCompanyId === 'string' ? { companyId: settings.ficCompanyId } : {}),
    ...(typeof settings.ficConsultingProductId === 'string' ? { productId: settings.ficConsultingProductId } : {}),
  };
  return { ...raw, schemaVersion: 2, profiles, sites, quotes, localClients: [],
    settings: { ...(typeof settings.fuelTerritory === 'string' ? { fuelTerritory: settings.fuelTerritory } : {}),
      fic: { enabled: false, ...(Object.keys(legacyReferences).length ? { legacyReferences } : {}) } } };
}

function migrateV2Record(raw: Record<string, unknown>): Record<string, unknown> {
  const vehicles = ((raw.vehicles ?? []) as Array<Record<string, unknown>>).map(vehicle => {
    if (vehicle.consumptionUnit !== 'l/100km') return vehicle;
    const consumption = new Decimal(100).div(String(vehicle.consumption))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
    return { ...vehicle, consumption, consumptionUnit: 'km/l' };
  });
  return { ...raw, schemaVersion: 3, vehicles };
}

function findV3Blockers(raw: Record<string, unknown>): string[] {
  const blockers:string[]=[];
  if(Array.isArray(raw.localClients)&&raw.localClients.length)blockers.push('L’archivio contiene Clienti locali, che non possono essere convertiti automaticamente in Clienti Fatture in Cloud.');
  const sites=Array.isArray(raw.sites)?raw.sites as Array<Record<string,unknown>>:[];
  if(sites.some(site=>site.oneWayKm!==undefined))blockers.push('Una o più Sedi contengono oneWayKm, che non identifica una coppia Partenza/Destinazione.');
  if(sites.some(site=>(site.client as Record<string,unknown>|undefined)?.source==='local'))blockers.push('Una o più Sedi fanno riferimento a Clienti locali.');
  const quotes=Array.isArray(raw.quotes)?raw.quotes as Array<Record<string,unknown>>:[];
  if(quotes.some(quote=>(quote.client as Record<string,unknown>|undefined)?.source==='local'))blockers.push('Uno o più preventivi contengono snapshot di Clienti locali.');
  const hasTravel=quotes.some(quote=>Array.isArray(quote.items)&&(quote.items as Array<Record<string,unknown>>).some(item=>Array.isArray(item.subItems)&&(item.subItems as Array<Record<string,unknown>>).some(sub=>sub.kind==='travel')));
  if(hasTravel)blockers.push('Una o più Trasferte usano il precedente modello a Sede singola/velocità media e non possono essere reinterpretate senza inventare dati.');
  return blockers;
}

function migrateV3(raw: Record<string, unknown>): CashDocument {
  const profiles=(raw.profiles as Array<Record<string,unknown>>??[]).map(profile=>({ ...profile, capacity:{...(profile.capacity as Record<string,unknown>),travelSpeedKmh:undefined} }));
  const sites=(raw.sites as Array<Record<string,unknown>>??[]).map(({oneWayKm:_oneWayKm,...site})=>site);
  const {localClients:_localClients,...withoutClients}=raw;
  return parseDocument({ ...withoutClients, schemaVersion:CURRENT_SCHEMA_VERSION, profiles, sites,
    settings:{...(raw.settings as Record<string,unknown>),defaultDepartureSiteId:undefined,defaultVehicleId:undefined} });
}

export async function migrateArchive(path: string): Promise<Result<ArchiveSession>> {
  let temp: string | undefined;
  try {
    const before = await readFile(path);
    const parsed = parseJson(before); if (!parsed.ok) return parsed;
    const preview = await previewMigration(path); if (!preview.ok) return preview;
    const raw = parsed.value as Record<string, unknown>;
    if(preview.value.blockers.length)return err({code:'MIGRATION_REQUIRED',source:'archive',message:'La migrazione automatica è bloccata per evitare una conversione arbitraria dei dati storici.',action:'Rimuovi o ricostruisci esplicitamente i dati indicati con una versione precedente di Cash, quindi riprova.',details:preview.value.blockers});
    const v3=preview.value.fromVersion===1?migrateV2Record(migrateV1(raw)):preview.value.fromVersion===2?migrateV2Record(raw):raw;
    const migrated = migrateV3(v3);
    await copyFile(path, preview.value.backupPath);
    temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.migration.tmp`);
    const bytes = encode(migrated);
    const handle = await open(temp, 'wx');
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    parseDocument(JSON.parse((await readFile(temp)).toString('utf8')));
    await rename(temp, path); temp = undefined;
    return openArchive(path);
  } catch (cause) {
    if (temp) await rm(temp, { force: true }).catch(() => undefined);
    return err({ code: 'IO', source: 'archive', message: 'Migrazione atomica non riuscita; usare la copia di sicurezza.', details: [String(cause)] });
  }
}

export async function createArchive(path: string, document: CashDocument): Promise<Result<ArchiveSession>> {
  if (!path.toLocaleLowerCase().endsWith('.json')) return err({ code: 'VALIDATION', field: 'path', source: 'archive', message: 'Il nome dell’archivio deve terminare con .json.' });
  try {
    try { await access(path, constants.F_OK); return err({ code: 'CONFLICT', source: 'archive', message: 'Nel percorso scelto esiste già un file.' }); }
    catch { /* expected */ }
    const parsed=cashDocumentSchema.safeParse({ ...document, schemaVersion: CURRENT_SCHEMA_VERSION, revision: 1 });
    if(!parsed.success)return err(validationErrorFromIssues(parsed.error.issues));
    const normalized=parsed.data;
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

    const parsed=cashDocumentSchema.safeParse({ ...structuredClone(document), documentId: token.documentId,
      revision: token.revision + 1, updatedAt: new Date().toISOString() });
    if(!parsed.success)return err(validationErrorFromIssues(parsed.error.issues));
    const next=parsed.data;
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

export async function restoreBackup(path: string, token: ConcurrencyToken): Promise<Result<ArchiveSession>> {
  let temp:string|undefined;
  try {
    const mainBytes=await readFile(path);const header=documentHeaderSchema.safeParse(JSON.parse(mainBytes.toString('utf8')));
    if(!header.success||header.data.documentId!==token.documentId||header.data.revision!==token.revision||sha256(mainBytes)!==token.fingerprint)
      return err({code:'CONFLICT',source:'archive',message:'Il file principale è cambiato: ripristino bloccato.'});
    const backupPath=backupPathFor(path);const backupBytes=await readFile(backupPath);const backup=parseDocument(JSON.parse(backupBytes.toString('utf8')));
    const now=new Date();const iso=now.toISOString();const stamp=iso.replace(/[:.]/g,'-');const extension=extname(path);const base=basename(path,extension);
    await copyFile(path,join(dirname(path),`${base}.prima-ripristino.${stamp}.json`));
    await copyFile(backupPath,join(dirname(path),`${base}.backup-conservato.${stamp}.json`));
    const restored=parseDocument({...structuredClone(backup),documentId:randomUUID(),revision:1,createdAt:iso,updatedAt:iso});
    temp=join(dirname(path),`.${basename(path)}.${randomUUID()}.restore.tmp`);const handle=await open(temp,'wx');
    try{await handle.writeFile(encode(restored));await handle.sync();}finally{await handle.close();}
    parseDocument(JSON.parse((await readFile(temp)).toString('utf8')));await rename(temp,path);temp=undefined;return openArchive(path);
  }catch(cause){if(temp)await rm(temp,{force:true}).catch(()=>undefined);return err({code:'IO',source:'archive',message:'Ripristino della copia di sicurezza non riuscito.',details:[String(cause)]});}
}

export async function archiveMetadata(path: string): Promise<Result<{ modifiedAt: string; size: number }>> {
  try { const info = await stat(path); return ok({ modifiedAt: info.mtime.toISOString(), size: info.size }); }
  catch (cause) { return err({ code: 'IO', source: 'archive', message: 'Impossibile leggere i metadati.', details: [String(cause)] }); }
}
