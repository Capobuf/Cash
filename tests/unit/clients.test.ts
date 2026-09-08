import { describe, expect, it } from 'vitest';
import { createLocalClient, deleteLocalClient, previewRemoteClientCopy, searchLocalClients, snapshotLocalClient, updateLocalClient } from '../../src/domain/clients';
import { createEmptyDocument, meta, type FicClientSnapshot } from '../../src/domain/model';

describe('Clienti locali v0.6', () => {
  it('valida, normalizza, cerca e modifica senza cambiare UUID', () => {
    const created = createLocalClient('  Rossi Srl ', 'IT 12345678901');
    expect(created.ok).toBe(true); if (!created.ok) return;
    expect(created.value.vatNumber).toBe('IT12345678901');
    expect(searchLocalClients([created.value], 'rossi')).toHaveLength(1);
    const updated = updateLocalClient(created.value, 'Rossi Uno', '12345678901');
    expect(updated.ok && updated.value.id).toBe(created.value.id);
    expect(createLocalClient('', '').ok).toBe(false);
    expect(createLocalClient('X', '123').ok).toBe(false);
  });

  it('segnala omonimi e produce snapshot indipendente', () => {
    const local = createLocalClient('Rossi Srl', '12345678901'); if (!local.ok) throw new Error('fixture');
    const remote: FicClientSnapshot = { source: 'fatture_in_cloud', companyId: '1', clientId: '2', displayName: 'ROSSI SRL', vatNumber: '12345678901' };
    expect(previewRemoteClientCopy(remote, [local.value]).homonyms).toHaveLength(1);
    const snapshot = snapshotLocalClient(local.value); local.value.displayName = 'Modificato';
    expect(snapshot.displayName).toBe('Rossi Srl');
  });

  it('blocca eliminazione su Sedi ma ignora snapshot preventivo', () => {
    const doc = createEmptyDocument(); const client = { ...meta(), displayName: 'Cliente' }; doc.localClients.push(client);
    doc.sites.push({ ...meta(), name: 'Sede', address: 'Via Roma', client: { source: 'local', localClientId: client.id, displayName: client.displayName } });
    expect(deleteLocalClient(doc, client.id).ok).toBe(false);
    doc.sites=[]; doc.quotes.push({ ...meta(), date:'2026-09-08', client:snapshotLocalClient(client), items:[], snapshotRevision:0, exportAttempts:[] });
    expect(deleteLocalClient(doc, client.id).ok).toBe(true);
  });
});
