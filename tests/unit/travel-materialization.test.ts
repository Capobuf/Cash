import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  err,
  meta,
  ok,
  type FuelEvidence,
  type Quote,
  type ReusableSubItem,
} from '../../src/domain/model';
import { cloneTemplate } from '../../src/domain/catalog';
import { AppState } from '../../src/renderer/state';
import { useQuoteController } from '../../src/renderer/hooks/use-quote-controller';

function setup() {
  const document = createEmptyDocument();
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
  document.settings.fuelTerritory = 'Lazio';
  document.settings.defaultVehicleId = vehicle.id;
  const travel: Extract<ReusableSubItem, { kind: 'travel' }> = {
    ...meta(),
    kind: 'travel',
    description: 'Visita',
    roundTrip: true,
    occurrences: 2,
    distanceKmPerOccurrence: '40.0',
    travelMinutesPerOccurrence: 60,
  };
  const option = {
    ...meta(),
    name: 'Visita',
    subItems: [structuredClone(travel)],
  };
  const group = {
    ...meta(),
    name: 'Modalita',
    options: [option],
    defaultOptionId: option.id,
  };
  const previous = {
    ...structuredClone(travel),
    ...meta(),
    totalDistanceKm: '80.0',
    totalMinutes: 120,
  };
  const item = {
    ...meta(),
    name: 'Lavoro',
    subItems: [previous],
    variantGroups: [group],
    variantSelections: [],
  };
  const quote: Quote = {
    ...meta(),
    date: '2026-10-02',
    items: [item],
    snapshotRevision: 0,
    exportAttempts: [],
  };
  document.quotes.push(quote);
  const template = {
    ...meta(),
    name: 'Modello',
    items: [
      { ...meta(), name: 'Preparazione', subItems: [], variantGroups: [] },
      {
        ...meta(),
        name: 'Visita',
        subItems: [structuredClone(travel)],
        variantGroups: [],
      },
    ],
  };
  const variantTemplate = cloneTemplate({
    ...meta(),
    name: 'Modello con variante',
    items: [
      { ...meta(), name: 'Visita', subItems: [], variantGroups: [group] },
    ],
  });
  document.catalog.templates.push(template, variantTemplate);
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
  const latestFuelPrice = vi
    .fn<Window['cash']['mimit']['latestFuelPrice']>()
    .mockResolvedValue(ok(fuel));
  const save = vi.fn<Window['cash']['archive']['save']>(
    async (path, saved, token) =>
      ok({
        path,
        document: { ...saved, revision: token.revision + 1 },
        readOnly: false,
        token: { ...token, revision: token.revision + 1 },
      }),
  );
  vi.stubGlobal('window', {
    setTimeout,
    clearTimeout,
    cash: { mimit: { latestFuelPrice }, archive: { save }, setDirty: vi.fn() },
  });
  const state = new AppState();
  state.acceptNativeSession({
    path: 'Cash.json',
    document,
    readOnly: false,
    token: {
      documentId: document.documentId,
      revision: 1,
      fingerprint: 'hash',
    },
  });
  let controller!: ReturnType<typeof useQuoteController>;
  function Harness() {
    controller = useQuoteController({
      doc: document,
      hasToken: false,
      appState: state,
      activeQuoteId: quote.id,
      setActiveQuoteId: vi.fn(),
      requestDelete: vi.fn(),
    });
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  const operations = {
    saveTravel: () => controller.saveTravel(item.id, travel),
    editTravel: () => controller.saveTravel(item.id, travel, previous.id),
    addReusable: () => controller.addReusable(item.id, travel),
    switchVariant: () =>
      controller.switchVariant(item.id, group.id, option.id, {}, true),
    insertTemplate: () => controller.insertTemplate(template.id, {}, {}),
    insertVariantTemplate: () =>
      controller.insertTemplate(variantTemplate.id, {}, {}),
  };
  return {
    state,
    document,
    controller,
    item,
    previous,
    travel,
    option,
    template,
    variantTemplate,
    fuel,
    latestFuelPrice,
    save,
    operations,
  };
}

const operations = [
  'saveTravel',
  'editTravel',
  'addReusable',
  'switchVariant',
  'insertTemplate',
  'insertVariantTemplate',
] as const;
const fuelError = {
  code: 'SOURCE_UNAVAILABLE' as const,
  source: 'MIMIT' as const,
  message: 'Prezzo MIMIT non disponibile.',
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each(operations)(
  'materializzazione atomica della trasferta: %s',
  (operation) => {
    it.each(['MIMIT', 'vehicle-cost', 'territory'] as const)(
      'non modifica il preventivo quando fallisce %s',
      async (failure) => {
        const test = setup();
        if (failure === 'MIMIT')
          test.latestFuelPrice.mockResolvedValueOnce(err(fuelError));
        if (failure === 'vehicle-cost')
          test.latestFuelPrice.mockResolvedValueOnce(
            ok({ ...test.fuel, fuel: 'Gasolio' }),
          );
        if (failure === 'territory')
          delete test.document.settings.fuelTerritory;
        const before = structuredClone(test.state.document);
        const mutate = vi.spyOn(test.state, 'mutate');
        await expect(test.operations[operation]()).resolves.toBe(false);
        expect(test.state.document).toEqual(before);
        expect(mutate).not.toHaveBeenCalled();
        if (failure === 'MIMIT') expect(test.state.error).toEqual(fuelError);
        if (failure === 'vehicle-cost')
          expect(test.state.error).toMatchObject({
            code: 'VALIDATION',
            field: 'fuelEvidence',
          });
        if (failure === 'territory') {
          expect(test.state.error).toMatchObject({
            code: 'MISSING_DATA',
            field: 'fuelTerritory',
          });
          expect(test.state.error?.message).toContain('MIMIT');
          expect(test.latestFuelPrice).not.toHaveBeenCalled();
        }
        await vi.runAllTimersAsync();
        expect(test.save).not.toHaveBeenCalled();
        expect(test.state.error).not.toBeNull();
      },
    );

    it('salva distanza, tempo, costo e prova MIMIT dopo il successo completo', async () => {
      const test = setup();
      const mutate = vi.spyOn(test.state, 'mutate');
      await expect(test.operations[operation]()).resolves.toBe(true);
      const saved = test.state
        .document!.quotes[0]!.items.flatMap((item) => item.subItems)
        .find((sub) => sub.kind === 'travel' && sub.totalCost !== undefined);
      expect(saved).toMatchObject({
        kind: 'travel',
        totalDistanceKm: '80.0',
        totalMinutes: 120,
        vehicleCostPerKm: '0.195000',
        totalCost: '15.60',
        fuelEvidence: test.fuel,
      });
      expect(mutate).toHaveBeenCalledOnce();
      expect(test.state.error).toBeNull();
      await test.state.save();
      expect(test.save).toHaveBeenCalledOnce();
    });
  },
);

it.each(['switchVariant', 'insertTemplate', 'insertVariantTemplate'] as const)(
  'non applica nemmeno la prima trasferta se la seconda fallisce durante %s',
  async (operation) => {
    const test = setup();
    const second = {
      ...structuredClone(test.travel),
      ...meta(),
      description: 'Seconda visita',
    };
    if (operation === 'insertTemplate')
      test.template.items[1]!.subItems.push(second);
    else if (operation === 'insertVariantTemplate')
      test.variantTemplate.items[0]!.variantGroups[0]!.options[0]!.subItems.push(
        second,
      );
    else test.option.subItems.push(second);
    test.latestFuelPrice
      .mockResolvedValueOnce(ok(test.fuel))
      .mockResolvedValueOnce(err(fuelError));
    const before = structuredClone(test.state.document);
    const mutate = vi.spyOn(test.state, 'mutate');
    await expect(test.operations[operation]()).resolves.toBe(false);
    expect(test.latestFuelPrice).toHaveBeenCalledTimes(2);
    expect(test.state.document).toEqual(before);
    expect(mutate).not.toHaveBeenCalled();
    expect(test.state.error).toEqual(fuelError);
  },
);

it.each(['vehicle', 'distance', 'distance-and-time'] as const)(
  'ammette dati parziali senza %s quando il costo non viene richiesto',
  async (missing) => {
    const test = setup();
    delete test.document.settings.fuelTerritory;
    if (missing === 'vehicle') {
      delete test.document.settings.defaultVehicleId;
      test.document.vehicles = [];
    } else {
      delete test.travel.distanceKmPerOccurrence;
      if (missing === 'distance-and-time')
        delete test.travel.travelMinutesPerOccurrence;
    }
    await expect(test.operations.saveTravel()).resolves.toBe(true);
    const saved = test.state.document!.quotes[0]!.items[0]!.subItems.at(-1)!;
    expect(saved).toMatchObject({
      kind: 'travel',
      description: 'Visita',
      occurrences: 2,
    });
    expect(saved).not.toHaveProperty('totalCost');
    expect(saved).not.toHaveProperty('fuelEvidence');
    expect(test.latestFuelPrice).not.toHaveBeenCalled();
    expect(test.state.error).toBeNull();
    await test.state.save();
  },
);

it.each([true, false])(
  'verifica il territorio anche modificando una trasferta con costo gia acquisito (configurato: %s)',
  async (hasTerritory) => {
    const test = setup();
    Object.assign(test.previous, {
      vehicleId: test.document.vehicles[0]!.id,
      vehicleCostPerKm: '0.200000',
      fuelEvidence: test.fuel,
    });
    if (!hasTerritory) delete test.document.settings.fuelTerritory;
    const before = structuredClone(test.state.document);
    const mutate = vi.spyOn(test.state, 'mutate');
    await expect(test.operations.editTravel()).resolves.toBe(hasTerritory);
    expect(test.latestFuelPrice).not.toHaveBeenCalled();
    if (hasTerritory) {
      expect(
        test.state.document!.quotes[0]!.items[0]!.subItems[0],
      ).toMatchObject({
        id: test.previous.id,
        createdAt: test.previous.createdAt,
        vehicleCostPerKm: '0.200000',
        totalCost: '16.00',
        fuelEvidence: test.fuel,
      });
      await test.state.save();
    } else {
      expect(test.state.document).toEqual(before);
      expect(mutate).not.toHaveBeenCalled();
      expect(test.state.error).toMatchObject({
        code: 'MISSING_DATA',
        field: 'fuelTerritory',
      });
    }
  },
);
