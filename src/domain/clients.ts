import { err, meta, nowIso, ok, type CashDocument, type ClientSnapshot, type FicClientSnapshot,
  type LocalClient, type Result } from './model';

const vatPattern = /^(?:IT)?\d{11}$/i;

export function normalizeVatNumber(value?: string): Result<string | undefined> {
  const normalized = value?.replace(/[\s.-]/g, '').toUpperCase() || undefined;
  if (normalized && !vatPattern.test(normalized))
    return err({ code: 'VALIDATION', field: 'vatNumber', message: 'La partita IVA deve contenere 11 cifre, con prefisso IT facoltativo.' });
  return ok(normalized);
}

export function createLocalClient(displayName: string, vatNumber?: string): Result<LocalClient> {
  const name = displayName.trim();
  if (!name) return err({ code: 'VALIDATION', field: 'displayName', message: 'La denominazione del cliente è obbligatoria.' });
  const vat = normalizeVatNumber(vatNumber); if (!vat.ok) return vat;
  return ok({ ...meta(), displayName: name, ...(vat.value ? { vatNumber: vat.value } : {}) });
}

export function updateLocalClient(client: LocalClient, displayName: string, vatNumber?: string): Result<LocalClient> {
  const updated = createLocalClient(displayName, vatNumber); if (!updated.ok) return updated;
  return ok({ ...client, displayName: updated.value.displayName,
    ...(updated.value.vatNumber ? { vatNumber: updated.value.vatNumber } : { vatNumber: undefined }), updatedAt: nowIso() });
}

export function searchLocalClients(clients: LocalClient[], query: string): LocalClient[] {
  const needle = query.trim().toLocaleLowerCase('it');
  if (!needle) return [...clients];
  return clients.filter(client => `${client.displayName} ${client.vatNumber ?? ''}`.toLocaleLowerCase('it').includes(needle));
}

export function previewRemoteClientCopy(snapshot: FicClientSnapshot, clients: LocalClient[]): {
  displayName: string; vatNumber?: string; homonyms: LocalClient[]
} {
  return { displayName: snapshot.displayName, ...(snapshot.vatNumber ? { vatNumber: snapshot.vatNumber } : {}),
    homonyms: clients.filter(client => client.displayName.localeCompare(snapshot.displayName, 'it', { sensitivity: 'base' }) === 0) };
}

export function localClientDeletionReferences(document: CashDocument, clientId: string): string[] {
  return document.sites.filter(site => site.client?.source === 'local' && site.client.localClientId === clientId).map(site => site.name);
}

export function deleteLocalClient(document: CashDocument, clientId: string): Result<CashDocument> {
  const refs = localClientDeletionReferences(document, clientId);
  if (refs.length) return err({ code: 'CONFLICT', field: 'localClient', message: 'Il cliente è ancora associato a una o più Sedi.', details: refs });
  if (!document.localClients.some(client => client.id === clientId))
    return err({ code: 'MISSING_DATA', field: 'localClient', message: 'Cliente locale non trovato.' });
  return ok({ ...document, localClients: document.localClients.filter(client => client.id !== clientId) });
}

export function snapshotLocalClient(client: LocalClient): ClientSnapshot {
  return { source: 'local', localClientId: client.id, displayName: client.displayName,
    ...(client.vatNumber ? { vatNumber: client.vatNumber } : {}) };
}
