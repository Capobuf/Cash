import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  createEmptyDocument,
  ok,
} from '../../src/domain/model';
import type { ArchiveSession } from '../../src/native/persistence';
import { AppState } from '../../src/renderer/state';

describe('apertura archivio con schema più recente', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['open', 'initialize'] as const)(
    'mostra l’incompatibilità durante %s e permette di aprire un altro archivio',
    async (operation) => {
      const document = createEmptyDocument();
      const future: ArchiveSession = {
        path: 'C:\\Cash.data.json',
        readOnly: true,
        headerOnly: true,
        schemaVersion: CURRENT_SCHEMA_VERSION + 1,
        token: {
          documentId: document.documentId,
          revision: 113,
          fingerprint: 'future',
        },
      };
      const supported: ArchiveSession = {
        ...future,
        document,
        readOnly: false,
        headerOnly: undefined,
        schemaVersion: undefined,
      };
      const open = vi.fn().mockResolvedValue(ok(future));
      const save = vi.fn();
      vi.stubGlobal('window', {
        cash: {
          archive: {
            open,
            openLast: vi.fn().mockResolvedValue(ok(future)),
            save,
          },
          setDirty: vi.fn(),
          onExternalChange: vi.fn(),
          onArchiveReloaded: vi.fn(),
        },
      });
      const state = new AppState();
      await state[operation]();
      expect(state.status).toBe('Sola lettura');
      expect(state.error?.code).toBe('SCHEMA_NEWER');
      expect(state.error?.message).toContain(`(${CURRENT_SCHEMA_VERSION + 1})`);
      expect(state.error?.message).toContain(`(${CURRENT_SCHEMA_VERSION})`);
      expect(state.error?.details).toContain(future.path);
      expect(state.document).toBeUndefined();
      state.mutate((doc) => {
        doc.settings.fuelTerritory = 'Lazio';
      });
      await state.save();
      expect(save).not.toHaveBeenCalled();
      open.mockResolvedValue(ok(supported));
      await state.open();
      expect(state.document).toEqual(document);
      expect(state.status).toBe('Salvato');
      expect(state.error).toBeNull();
    },
  );
});
