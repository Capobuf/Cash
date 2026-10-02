import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  createFiscalPreset2026,
  err,
  meta,
  ok,
  type CashDocument,
} from '../../src/domain/model';
import {
  commitFicActivation,
  removeFicLinkAtomically,
  type FicLinkServices,
} from '../../src/native/fic-link';
import type {
  ArchiveSession,
  ConcurrencyToken,
} from '../../src/native/persistence';
import { confirmProfile } from '../../src/domain/profiles';

const token: ConcurrencyToken = {
  documentId: '6dadb063-1796-429d-9a8a-ad9a0ec9827b',
  revision: 1,
  fingerprint: 'hash',
};
const input = (document: CashDocument) => ({
  token: 'nuovo',
  companyId: '1',
  productId: '2',
  path: 'Cash.data.json',
  document,
  concurrencyToken: token,
});
const session = (document: CashDocument): ArchiveSession => ({
  path: 'Cash.data.json',
  document,
  readOnly: false,
  token: { ...token, revision: 2, fingerprint: 'hash-2' },
});

function services(overrides: Partial<FicLinkServices> = {}): FicLinkServices {
  return {
    verify: vi.fn(async () =>
      ok({
        company: { id: '1', name: 'Studio' },
        product: { id: '2', name: 'Consulenza' },
        taxProfile: {
          acquiredAt: '2026-09-12T10:00:00.000Z',
          regime: 'forfettario_5',
          profitCoefficient: '78',
          contributionsPercentage: '26.07',
          defaultVat: { id: '66', value: 0, description: 'Forfettario' },
        },
      }),
    ),
    hasToken: vi.fn(async () => ok(true)),
    readToken: vi.fn(async () => ok('precedente')),
    writeToken: vi.fn(async () => ok(undefined)),
    deleteToken: vi.fn(async () => ok(undefined)),
    save: vi.fn(async (_path, document) => ok(session(document))),
    ...overrides,
  };
}

describe('collegamento Fatture in Cloud atomico', () => {
  it.each(['forfettario_5', 'forfettario'])(
    'richiede le conferme utente dopo import %s',
    async (regime) => {
      const document = createEmptyDocument();
      const profile = createFiscalPreset2026();
      profile.revenueTarget = '90000.00';
      document.profiles.push(profile);
      const api = services();
      const verified = await api.verify('token', '1', '2');
      if (!verified.ok) throw new Error(verified.error.message);
      verified.value.taxProfile.regime = regime;
      api.verify = vi.fn(async () => verified);
      const result = await commitFicActivation(input(document), api);
      if (!result.ok) throw new Error(result.error.message);
      const imported = result.value.document?.profiles[0];
      if (!imported) throw new Error('Profilo importato mancante');
      expect(imported.fiscal).toMatchObject({
        profitabilityCoefficient: '78',
        activityPhase:
          regime === 'forfettario_5' ? 'reduced_eligible' : 'ordinary',
        reducedEligibilityConfirmed: false,
        ordinaryApplicabilityConfirmed: false,
      });
      if (regime === 'forfettario_5') {
        expect(confirmProfile(imported, [])).toMatchObject({
          ok: false,
          error: { field: 'reducedEligibilityConfirmed' },
        });
        imported.fiscal.reducedEligibilityConfirmed = true;
      }
      expect(confirmProfile(imported, [])).toMatchObject({
        ok: false,
        error: { field: 'ordinaryApplicabilityConfirmed' },
      });
      imported.fiscal.ordinaryApplicabilityConfirmed = true;
      expect(confirmProfile(imported, []).ok).toBe(true);
    },
  );
  it('rimuove solo il collegamento FIC conservando territorio e default globali', async () => {
    const document = createEmptyDocument();
    const site = { ...meta(), name: 'Studio' };
    const vehicle = {
      ...meta(),
      name: 'Auto',
      fuel: 'Benzina' as const,
      consumption: '20',
      consumptionUnit: 'km/l' as const,
      annualKm: '10000',
      annualInsurance: '0',
      annualTax: '0',
      annualMaintenance: '0',
    };
    document.sites.push(site);
    document.vehicles.push(vehicle);
    document.settings = {
      fuelTerritory: 'Lazio',
      defaultDepartureSiteId: site.id,
      defaultVehicleId: vehicle.id,
      fic: {
        enabled: true,
        company: { id: '1', name: 'Studio' },
        product: { id: '2', name: 'Consulenza' },
        taxProfile: {
          acquiredAt: '2026-09-12T10:00:00.000Z',
          regime: 'forfettario_5',
        },
        lastVerification: { at: '2026-09-12T10:00:00.000Z', result: 'success' },
        legacyReferences: { companyId: '1', productId: '2' },
      },
    };
    const original = structuredClone(document);
    const api = services();
    const result = await removeFicLinkAtomically(input(document), api);
    expect(result.ok).toBe(true);
    expect(api.deleteToken).toHaveBeenCalledOnce();
    expect(vi.mocked(api.save).mock.calls[0]?.[1]).toEqual({
      ...original,
      settings: { ...original.settings, fic: { enabled: false } },
    });
    expect(document).toEqual(original);
  });
  it('non cambia credenziali o archivio quando la verifica fallisce o viene annullata prima della conferma', async () => {
    const api = services({
      verify: vi.fn(async () =>
        err({ code: 'CREDENTIALS', message: 'Token non valido' }),
      ),
    });
    const result = await commitFicActivation(input(createEmptyDocument()), api);
    expect(result.ok).toBe(false);
    expect(api.writeToken).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
  });
  it('attiva soltanto dopo verifica e salva insieme azienda e prodotto', async () => {
    const api = services();
    const result = await commitFicActivation(input(createEmptyDocument()), api);
    expect(result.ok).toBe(true);
    expect(api.writeToken).toHaveBeenCalledWith('nuovo');
    const saved = vi.mocked(api.save).mock.calls[0]?.[1];
    expect(saved?.settings.fic.enabled).toBe(true);
    expect(saved?.settings.fic.company?.id).toBe('1');
    expect(saved?.settings.fic.product?.name).toBe('Consulenza');
  });
  it('riporta Da verificare il profilo modificato da FIC con una nuova revisione', async () => {
    const document = createEmptyDocument();
    const profile = createFiscalPreset2026();
    profile.confirmed = true;
    profile.fiscal.contributionRate = '24';
    document.profiles.push(profile);
    const original = structuredClone(document);
    const api = services();
    const result = await commitFicActivation(input(document), api);
    expect(result.ok).toBe(true);
    const saved = vi.mocked(api.save).mock.calls[0]?.[1];
    expect(saved?.profiles[0]).toMatchObject({
      id: profile.id,
      createdAt: profile.createdAt,
      revision: profile.revision + 1,
      confirmed: false,
      fiscal: {
        profitabilityCoefficient: '78',
        contributionRate: '24',
        activityPhase: 'reduced_eligible',
      },
    });
    expect(saved?.settings.fic.taxProfile?.regime).toBe('forfettario_5');
    expect(document).toEqual(original);
  });
  it('conserva conferma e revisione se la nuova verifica FIC non cambia i dati del profilo', async () => {
    const document = createEmptyDocument();
    const profile = createFiscalPreset2026();
    profile.confirmed = true;
    Object.assign(profile.fiscal, {
      profitabilityCoefficient: '78',
      activityPhase: 'reduced_eligible',
      reducedEligibilityConfirmed: true,
      ordinaryApplicabilityConfirmed: true,
    });
    document.profiles.push(profile);
    const api = services();
    expect((await commitFicActivation(input(document), api)).ok).toBe(true);
    expect(vi.mocked(api.save).mock.calls[0]?.[1].profiles).toEqual([profile]);
  });
  it('non inventa i campi fiscali che FIC non restituisce', async () => {
    const api = services();
    await commitFicActivation(input(createEmptyDocument()), api);
    const saved = vi.mocked(api.save).mock.calls[0]?.[1];
    expect(saved?.profiles[0]?.fiscal.atecoCode).toBe('');
    expect(saved?.profiles[0]?.fiscal.contributionRate).toBe('0');
    expect(saved?.profiles[0]?.fiscal.contributionCeiling).toBe('0.00');
    expect(saved?.profiles[0]?.confirmed).toBe(false);
  });
  it('ripristina il token precedente se il salvataggio di attivazione fallisce', async () => {
    const api = services({
      save: vi.fn(async () => err({ code: 'CONFLICT', message: 'Conflitto' })),
    });
    expect(
      (await commitFicActivation(input(createEmptyDocument()), api)).ok,
    ).toBe(false);
    expect(api.writeToken).toHaveBeenNthCalledWith(1, 'nuovo');
    expect(api.writeToken).toHaveBeenNthCalledWith(2, 'precedente');
  });
  it('rimuove configurazione e token insieme e ripristina il token se il file non viene salvato', async () => {
    const document = createEmptyDocument();
    document.settings.fic = {
      enabled: true,
      company: { id: '1', name: 'Studio' },
      product: { id: '2', name: 'Consulenza' },
    };
    const failing = services({
      save: vi.fn(async () =>
        err({ code: 'IO', message: 'Disco non disponibile' }),
      ),
    });
    expect((await removeFicLinkAtomically(input(document), failing)).ok).toBe(
      false,
    );
    expect(failing.writeToken).toHaveBeenCalledWith('precedente');
    const successful = services();
    const result = await removeFicLinkAtomically(input(document), successful);
    expect(result.ok).toBe(true);
    const saved = vi.mocked(successful.save).mock.calls[0]?.[1];
    expect(saved?.settings.fic).toEqual({ enabled: false });
  });
});
