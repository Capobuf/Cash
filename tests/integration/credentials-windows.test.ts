import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe.skipIf(process.platform !== 'win32')(
  'Windows Credential Manager',
  () => {
    it('preserva Unicode, separazione degli account e cancellazione con il modulo nativo', async () => {
      const { keyring } = await import('@zowe/secrets-for-zowe-sdk');
      // Never read or modify credentials belonging to a real Cash installation.
      const service = `it.cash.test.${randomUUID()}`;
      const fic = 'fatture-in-cloud-token';
      const ors = 'openrouteservice-api-key';
      try {
        expect(await keyring.getPassword(service, fic)).toBeNull();
        await keyring.setPassword(service, fic, 'token-test-à-🔑');
        await keyring.setPassword(service, ors, 'ors-test');
        expect(await keyring.getPassword(service, fic)).toBe('token-test-à-🔑');
        expect(await keyring.getPassword(service, ors)).toBe('ors-test');
        await keyring.setPassword(service, fic, 'token-aggiornato');
        expect(await keyring.getPassword(service, fic)).toBe(
          'token-aggiornato',
        );
        expect(await keyring.deletePassword(service, fic)).toBe(true);
        expect(await keyring.getPassword(service, fic)).toBeNull();
        expect(await keyring.deletePassword(service, fic)).toBe(false);
        expect(await keyring.getPassword(service, ors)).toBe('ors-test');
      } finally {
        await keyring.deletePassword(service, fic);
        await keyring.deletePassword(service, ors);
      }
    });
  },
);
