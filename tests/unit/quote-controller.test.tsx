import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  createFiscalPreset2026,
  err,
  meta,
  ok,
  type CashDocument,
  type FuelEvidence,
  type Quote,
  type ReusableSubItem,
} from '../../src/domain/model';
import { snapshotProfile } from '../../src/domain/refresh';
import type { ArchiveSession } from '../../src/native/persistence';
import { AppState } from '../../src/renderer/state';
import { useQuoteController } from '../../src/renderer/hooks/use-quote-controller';

function session(document: CashDocument, path = 'Cash.json'): ArchiveSession {
  return {
    path,
    document,
    readOnly: false,
    token: {
      documentId: document.documentId,
      revision: document.revision,
      fingerprint: 'hash',
    },
  };
}

function setup(hasToken = true) {
  const document = createEmptyDocument();
  const profile = createFiscalPreset2026();
  profile.confirmed = true;
  profile.revenueTarget = '50000.00';
  document.profiles.push(profile);
  const snapshot = snapshotProfile(profile, []);
  if (!snapshot.ok) throw new Error(snapshot.error.message);
  const vehicle = {
    ...meta(),
    name: 'Auto',
    fuel: 'Benzina' as const,
    consumption: '20',
    consumptionUnit: 'km/l' as const,
    annualKm: '10000',
    annualInsurance: '500',
    annualTax: '200',
    annualMaintenance: '300',
  };
  document.vehicles.push(vehicle);
  document.settings = {
    fuelTerritory: 'Lazio',
    defaultVehicleId: vehicle.id,
    fic: {
      enabled: true,
      company: { id: '1', name: 'Studio' },
      product: { id: '2', name: 'Consulenza' },
    },
  };
  const travel: Extract<ReusableSubItem, { kind: 'travel' }> = {
    ...meta(),
    kind: 'travel',
    description: 'Visita',
    roundTrip: true,
    occurrences: 1,
    distanceKmPerOccurrence: '40.0',
    travelMinutesPerOccurrence: 60,
  };
  const option = {
    ...meta(),
    name: 'Visita',
    subItems: [
      {
        kind: 'travel' as const,
        description: travel.description,
        roundTrip: true,
        occurrences: 1,
        distanceKmPerOccurrence: '40.0',
        travelMinutesPerOccurrence: 60,
      },
    ],
  };
  const group = {
    ...meta(),
    name: 'Modalità',
    options: [option],
    defaultOptionId: option.id,
  };
  const item = {
    ...meta(),
    name: 'Lavoro',
    chosenPrice: '100.00',
    variantGroups: [group],
    variantSelections: [],
    subItems: [
      {
        ...travel,
        vehicleId: vehicle.id,
        totalDistanceKm: '40.0',
        totalMinutes: 60,
      },
    ],
  };
  const client = {
    source: 'fatture_in_cloud' as const,
    companyId: '1',
    clientId: '3',
    displayName: 'Cliente',
  };
  const quote: Quote = {
    ...meta(),
    date: '2026-10-02',
    profileId: profile.id,
    profileSnapshot: snapshot.value,
    client,
    items: [item],
    snapshotRevision: 0,
    exportAttempts: [],
  };
  document.quotes.push(quote);
  const template = {
    ...meta(),
    name: 'Modello',
    items: [
      { ...meta(), name: 'Lavoro', subItems: [travel], variantGroups: [] },
    ],
  };
  document.catalog.templates.push(template);
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const fuel: FuelEvidence = {
    fuel: 'Benzina',
    mode: 'SELF',
    territory: 'Lazio',
    network: 'NON_AUTOSTRADALE',
    price: '1.900',
    priceUnit: 'EUR/l',
    referenceDate: '2026-10-01',
    acquiredAt: '2026-10-02T10:00:00Z',
  };
  const save = vi.fn<Window['cash']['archive']['save']>(async (path, saved) =>
    ok(session({ ...saved, revision: saved.revision + 1 }, path)),
  );
  const verifyProduct = vi.fn(async () => {
    await pending;
    return ok({ id: '2', name: 'Consulenza' });
  });
  const exportQuote = vi.fn<Window['cash']['fic']['exportQuote']>(async () =>
    ok({ outcome: 'success', remoteDocumentId: 'remote-1' }),
  );
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    cash: {
      setDirty: vi.fn(),
      archive: { save },
      mimit: {
        latestFuelPrice: vi.fn(async () => {
          await pending;
          return ok(fuel);
        }),
      },
      fic: { verifyProduct, exportQuote },
    },
  });
  const state = new AppState();
  state.acceptNativeSession(session(document));
  const setActiveQuoteId = vi.fn();
  let controller!: ReturnType<typeof useQuoteController>;
  function Harness() {
    controller = useQuoteController({
      doc: document,
      hasToken,
      appState: state,
      activeQuoteId: quote.id,
      setActiveQuoteId,
      requestDelete: vi.fn(),
    });
    return null;
  }
  renderToStaticMarkup(<Harness />);
  const operations = {
    saveTravel: () => controller.saveTravel(item.id, travel),
    addReusable: () => controller.addReusable(item.id, travel),
    switchVariant: () =>
      controller.switchVariant(item.id, group.id, option.id, {}, true),
    insertTemplate: () => controller.insertTemplate(template.id, {}, {}),
    performRefresh: () => controller.performRefresh(),
    performExport: () =>
      controller.performExport(client, [
        { itemIds: [item.id], description: item.name },
      ]),
  };
  return {
    state,
    document,
    quote,
    complete,
    operations,
    save,
    verifyProduct,
    exportQuote,
    controller,
    setActiveQuoteId,
    item,
  };
}

describe('contesto delle operazioni asincrone sui preventivi', () => {
  it('senza token locale blocca ricerca ed export ma consente modifiche locali', async () => {
    const { state, controller, operations, verifyProduct, exportQuote } =
      setup(false);
    await controller.searchRemoteClients('Cliente');
    expect(state.error?.code).toBe('CREDENTIALS');
    expect(await operations.performExport()).toBe(false);
    expect(verifyProduct).not.toHaveBeenCalled();
    expect(exportQuote).not.toHaveBeenCalled();
    expect(controller.addItem('Lavoro offline')).toBe(true);
    expect(state.document?.quotes[0]?.client?.displayName).toBe('Cliente');
  });
  it('richiede conferma esplicita per associare un profilo di un altro anno', () => {
    const { state, document, controller, quote } = setup();
    const profile = createFiscalPreset2026();
    Object.assign(profile, {
      year: 2025,
      confirmed: true,
      revenueTarget: '50000.00',
    });
    document.profiles.push(profile);
    expect(controller.updateQuote({ profileId: profile.id })).toBe(
      'year-mismatch',
    );
    expect(state.document?.quotes[0]?.profileId).toBe(quote.profileId);
    expect(controller.updateQuote({ profileId: profile.id }, true)).toBe(
      'updated',
    );
    expect(state.document?.quotes[0]?.profileSnapshot?.year).toBe(2025);
  });
  it.each([false, true])(
    'salva una trasferta verso un fornitore (cliente presente: %s)',
    async (withClient) => {
      const { state, document, quote, complete, controller, item } = setup();
      if (!withClient) delete quote.client;
      const departure = { ...meta(), name: 'Laboratorio' };
      const supplier = { ...meta(), name: 'Fornitore ABC' };
      document.sites.push(departure, supplier);
      complete();
      expect(
        await controller.saveTravel(item.id, {
          description: 'Ritiro server',
          departureSiteId: departure.id,
          destinationSiteId: supplier.id,
          roundTrip: true,
          occurrences: 1,
          distanceKmPerOccurrence: '40.0',
          travelMinutesPerOccurrence: 60,
        }),
      ).toBe(true);
      expect(
        state.document?.quotes[0]?.items[0]?.subItems.at(-1),
      ).toMatchObject({
        kind: 'travel',
        departure: { sourceId: departure.id },
        destination: { sourceId: supplier.id },
      });
    },
  );
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const operations = [
    'saveTravel',
    'addReusable',
    'switchVariant',
    'insertTemplate',
    'performRefresh',
    'performExport',
  ] as const;
  it.each(operations)(
    '%s non modifica un altro archivio neppure con gli stessi UUID entità',
    async (operation) => {
      const test = setup();
      const result = test.operations[operation]();
      const other = {
        ...structuredClone(test.document),
        documentId: meta().id,
      };
      test.state.acceptNativeSession(session(other, 'Other.json'));
      const before = structuredClone(test.state.document);
      test.complete();
      await expect(result).resolves.toBe(false);
      expect(test.state.document).toEqual(before);
      expect(test.state.error?.code).toBe('CONFLICT');
      expect(test.exportQuote).not.toHaveBeenCalled();
    },
  );
  it.each(operations)(
    '%s gestisce la rimozione del preventivo senza eccezioni',
    async (operation) => {
      const test = setup();
      const result = test.operations[operation]();
      test.state.mutate((document) => {
        document.quotes = [];
      });
      test.complete();
      await expect(result).resolves.toBe(false);
      expect(test.state.document?.quotes).toEqual([]);
      expect(test.state.error?.code).toBe('CONFLICT');
    },
  );
  it.each(operations)(
    '%s mantiene il normale flusso nello stesso contesto',
    async (operation) => {
      const test = setup();
      const before = structuredClone(test.state.document);
      const result = test.operations[operation]();
      test.complete();
      await expect(result).resolves.toBe(true);
      expect(test.state.document).not.toEqual(before);
      expect(test.state.error).toBeNull();
    },
  );
  it('non sovrascrive modifiche al preventivo arrivate durante il refresh', async () => {
    const test = setup();
    const result = test.operations.performRefresh();
    test.state.mutate((document) => {
      document.quotes[0]!.items[0]!.name = 'Modificato';
    });
    test.complete();
    await expect(result).resolves.toBe(false);
    expect(test.state.document?.quotes[0]?.items[0]?.name).toBe('Modificato');
  });
  it('rileva un cambio archivio seguito dalla riapertura dello stesso documento', async () => {
    const test = setup();
    const result = test.operations.saveTravel();
    test.state.acceptNativeSession(
      session(createEmptyDocument(), 'Other.json'),
    );
    test.state.acceptNativeSession(session(test.document));
    test.complete();
    await expect(result).resolves.toBe(false);
    expect(test.state.document).toEqual(test.document);
  });
  it('non invia a FIC se cambia archivio durante il salvataggio del tentativo', async () => {
    const test = setup();
    let started!: () => void;
    const saving = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: () => void;
    const pendingSave = new Promise<void>((resolve) => {
      finish = resolve;
    });
    test.save.mockImplementationOnce(async (path, document) => {
      started();
      await pendingSave;
      return ok(session(document, path));
    });
    const result = test.operations.performExport();
    test.complete();
    await saving;
    test.state.acceptNativeSession(
      session(createEmptyDocument(), 'Other.json'),
    );
    const before = structuredClone(test.state.document);
    finish();
    await expect(result).resolves.toBe(false);
    expect(test.exportQuote).not.toHaveBeenCalled();
    expect(test.state.document).toEqual(before);
    expect(test.state.error?.code).toBe('CONFLICT');
  });
  it('non registra la risposta export in un archivio aperto durante l’invio', async () => {
    const test = setup();
    let started!: () => void;
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: () => void;
    const pendingExport = new Promise<void>((resolve) => {
      finish = resolve;
    });
    test.exportQuote.mockImplementationOnce(async () => {
      started();
      await pendingExport;
      return ok({ outcome: 'success', remoteDocumentId: 'remote-1' });
    });
    const result = test.operations.performExport();
    test.complete();
    await sending;
    expect(test.state.document?.quotes[0]?.exportAttempts[0]?.outcome).toBe(
      'pending',
    );
    test.state.acceptNativeSession(
      session(createEmptyDocument(), 'Other.json'),
    );
    const before = structuredClone(test.state.document);
    finish();
    await expect(result).resolves.toBe(false);
    expect(test.state.document).toEqual(before);
    expect(test.state.error?.code).toBe('EXPORT_UNCERTAIN');
    expect(test.state.error?.details).toContain('Documento FIC: remote-1');
    expect(test.exportQuote).toHaveBeenCalledOnce();
  });
});

describe('persistenza dell’esito export', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('restituisce successo solo dopo il salvataggio finale e registra la data della risposta', async () => {
    const test = setup();
    let started!: () => void;
    const saving = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    test.save
      .mockImplementationOnce(async (path, document) =>
        ok(session(document, path)),
      )
      .mockImplementationOnce(async (path, document) => {
        started();
        await pending;
        return ok(session(document, path));
      });
    test.exportQuote.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date('2026-10-02T10:01:00Z'));
      return ok({ outcome: 'success', remoteDocumentId: 'remote-1' });
    });
    let completed = false;
    const result = test.operations.performExport().then((value) => {
      completed = true;
      return value;
    });
    test.complete();
    await saving;
    expect(completed).toBe(false);
    expect(
      test.save.mock.calls[0]?.[1].quotes[0]?.exportAttempts[0]?.outcome,
    ).toBe('pending');
    expect(
      test.save.mock.calls[1]?.[1].quotes[0]?.exportAttempts[0],
    ).toMatchObject({
      outcome: 'success',
      remoteDocumentId: 'remote-1',
      createdAt: '2026-10-02T10:00:00.000Z',
      updatedAt: '2026-10-02T10:01:00.000Z',
    });
    finish();
    await expect(result).resolves.toBe(true);
    expect(test.state.status).toBe('Salvato');
    expect(test.exportQuote).toHaveBeenCalledOnce();
  });

  it.each(['IO', 'CONFLICT'] as const)(
    'conserva la risposta da verificare se il salvataggio finale fallisce con %s',
    async (code) => {
      const test = setup();
      test.save
        .mockImplementationOnce(async (path, document) =>
          ok(session(document, path)),
        )
        .mockResolvedValueOnce(
          err({ code, message: 'Salvataggio non riuscito' }),
        );
      const result = test.operations.performExport();
      test.complete();
      await expect(result).resolves.toBe(false);
      expect(test.state.document?.quotes[0]?.exportAttempts[0]).toMatchObject({
        outcome: 'uncertain',
        remoteDocumentId: 'remote-1',
      });
      expect(test.state.error?.code).toBe('EXPORT_UNCERTAIN');
      expect(test.state.error?.action).toContain('Controlla Fatture in Cloud');
      expect(test.state.error?.details).toContain('Salvataggio non riuscito');
      await vi.runAllTimersAsync();
      expect(test.save).toHaveBeenCalledTimes(2);
      expect(test.exportQuote).toHaveBeenCalledOnce();
    },
  );

  it('persiste un esito remoto incerto e lo mostra senza reinviare', async () => {
    const test = setup();
    test.exportQuote.mockResolvedValueOnce(
      ok({ outcome: 'uncertain', diagnostic: 'Timeout dopo invio' }),
    );
    const result = test.operations.performExport();
    test.complete();
    await expect(result).resolves.toBe(false);
    expect(
      test.save.mock.calls[1]?.[1].quotes[0]?.exportAttempts[0],
    ).toMatchObject({ outcome: 'uncertain', diagnostic: 'Timeout dopo invio' });
    expect(test.state.status).toBe('Salvato');
    expect(test.state.error?.code).toBe('EXPORT_UNCERTAIN');
    expect(test.exportQuote).toHaveBeenCalledOnce();
  });

  it('rende esplicita un’eccezione durante il salvataggio della risposta', async () => {
    const test = setup();
    test.save
      .mockImplementationOnce(async (path, document) =>
        ok(session(document, path)),
      )
      .mockRejectedValueOnce(new Error('IPC interrotto'));
    const result = test.operations.performExport();
    test.complete();
    await expect(result).resolves.toBe(false);
    expect(test.state.document?.quotes[0]?.exportAttempts[0]).toMatchObject({
      outcome: 'uncertain',
      remoteDocumentId: 'remote-1',
    });
    expect(test.state.error?.code).toBe('EXPORT_UNCERTAIN');
    expect(test.exportQuote).toHaveBeenCalledOnce();
  });
});

describe('esito delle modifiche ai preventivi', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('non segnala aggiornamento o seleziona un nuovo preventivo in sola lettura', () => {
    const test = setup();
    test.state.acceptNativeSession({
      ...session(test.document),
      readOnly: true,
    });
    expect(test.controller.updateQuote({ commission: '10' })).toBe('invalid');
    expect(test.controller.newQuote()).toBe(false);
    expect(test.setActiveQuoteId).not.toHaveBeenCalled();
    expect(test.state.document).toEqual(test.document);
  });

  it('propaga il rifiuto dello schema senza alterare il preventivo', () => {
    const test = setup();
    expect(test.controller.updateQuote({ date: '2026-99-99' })).toBe('invalid');
    expect(test.state.error?.code).toBe('VALIDATION');
    expect(test.state.document).toEqual(test.document);
  });

  it('seleziona il nuovo preventivo solo dopo averlo inserito', () => {
    const test = setup();
    expect(test.controller.newQuote()).toBe(true);
    const selected = test.setActiveQuoteId.mock.calls[0]?.[0];
    expect(
      test.state.document?.quotes.some((quote) => quote.id === selected),
    ).toBe(true);
  });

  it('propaga false da tutti i comandi che salvano o chiudono un editor', async () => {
    const test = setup();
    const mutate = vi.spyOn(test.state, 'mutate').mockReturnValue(false);
    const { controller, item } = test;
    const commands = [
      () => controller.addItem('Nuova voce'),
      () => controller.renameItem(item.id, 'Nome aggiornato'),
      () => controller.updateChosenPrice(item.id, '200'),
      () => controller.updateReferencePrice(item.id),
      () => controller.updateReferencePrice(item.id, '100', '2026-01'),
      () =>
        controller.saveSimpleSub(item.id, {
          kind: 'time',
          description: 'Lavoro',
          minutes: 60,
        }),
      () => controller.saveSubToCatalog(item.id, item.subItems[0]!.id),
      () => controller.saveTemplate('Modello', [item.id]),
      ...Object.values(test.operations),
    ];
    test.complete();
    for (const command of commands) {
      mutate.mockClear();
      expect(await command()).toBe(false);
      expect(mutate).toHaveBeenCalledOnce();
    }
    expect(test.state.document).toEqual(test.document);
    expect(test.exportQuote).not.toHaveBeenCalled();
  });
});
