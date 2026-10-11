import { describe, expect, it } from 'vitest';
import {
  calculateItem,
  calculateQuote,
  calculateTravel,
  calculateVehicleCost,
  routeValuesRequireOverwriteConfirmation,
  valuesFromRoute,
} from '../../src/domain/calculations';
import {
  meta,
  type FuelEvidence,
  type QuoteItem,
  type Vehicle,
} from '../../src/domain/model';

const evidence: FuelEvidence = {
  fuel: 'Benzina',
  mode: 'SELF',
  territory: 'Lazio',
  network: 'NON_AUTOSTRADALE',
  price: '1.900',
  priceUnit: 'EUR/l',
  referenceDate: '2026-09-07',
  acquiredAt: '2026-09-08T10:00:00.000Z',
};
const vehicle: Vehicle = {
  ...meta(),
  name: 'Auto',
  fuel: 'Benzina',
  consumption: '20.00',
  consumptionUnit: 'km/l',
  annualKm: '10000',
  annualInsurance: '500',
  annualTax: '200',
  annualMaintenance: '300',
};

describe('preventivo', () => {
  it('converte il percorso A/R senza arrotondamenti intermedi', () => {
    expect(
      valuesFromRoute(
        { distanceMeters: '35025', durationSeconds: '2400' },
        true,
      ),
    ).toEqual({
      ok: true,
      value: {
        distanceKmPerOccurrence: '70.1',
        travelMinutesPerOccurrence: 80,
      },
    });
    expect(
      valuesFromRoute({ distanceMeters: '1250', durationSeconds: '75' }, false),
    ).toEqual({
      ok: true,
      value: { distanceKmPerOccurrence: '1.3', travelMinutesPerOccurrence: 1 },
    });
  });
  it('calcola costo veicolo e totali usando i valori per occorrenza', () => {
    const cost = calculateVehicleCost(vehicle, evidence);
    expect(cost).toEqual({
      ok: true,
      value: {
        fuelCostPerKm: '0.095000',
        annualCostPerKm: '0.100000',
        costPerKm: '0.195000',
      },
    });
    expect(
      calculateTravel({
        distanceKmPerOccurrence: '70.0',
        travelMinutesPerOccurrence: 80,
        occurrences: 2,
        vehicleCostPerKm: '0.195000',
      }),
    ).toEqual({
      ok: true,
      value: {
        totalDistanceKm: '140.0',
        totalMinutes: 160,
        totalCost: '27.30',
      },
    });
  });
  it('mantiene disponibili i totali di distanza e tempo offline senza inventare il costo', () => {
    expect(
      calculateTravel({
        distanceKmPerOccurrence: '12.5',
        travelMinutesPerOccurrence: 20,
        occurrences: 3,
      }),
    ).toEqual({
      ok: true,
      value: { totalDistanceKm: '37.5', totalMinutes: 60 },
    });
  });
  it('tratta distanza e tempo manuali in modo indipendente', () => {
    expect(
      calculateTravel({ distanceKmPerOccurrence: '10.0', occurrences: 2 }),
    ).toEqual({ ok: true, value: { totalDistanceKm: '20.0' } });
    expect(
      calculateTravel({
        distanceKmPerOccurrence: '0.0',
        occurrences: 2,
        vehicleCostPerKm: '0.2',
      }),
    ).toEqual({
      ok: true,
      value: { totalDistanceKm: '0.0', totalCost: '0.00' },
    });
    expect(
      calculateTravel({ travelMinutesPerOccurrence: 15, occurrences: 2 }),
    ).toEqual({ ok: true, value: { totalMinutes: 30 } });
  });
  it('richiede conferma prima di sovrascrivere distanza o tempo esistenti', () => {
    expect(routeValuesRequireOverwriteConfirmation('', '')).toBe(false);
    expect(routeValuesRequireOverwriteConfirmation('10.0', '')).toBe(true);
    expect(routeValuesRequireOverwriteConfirmation('', 20)).toBe(true);
  });
  it('blocca una trasferta incompleta invece di inventare valori', () => {
    const item: QuoteItem = {
      ...meta(),
      name: 'Lavoro',
      variantGroups: [],
      variantSelections: [],
      subItems: [
        {
          ...meta(),
          kind: 'travel',
          description: 'Viaggio',
          roundTrip: true,
          occurrences: 1,
        },
      ],
    };
    const result = calculateItem(item, '100');
    expect(result.blockers.join(' ')).toContain('partenza');
    expect(result.blockers.join(' ')).toContain('costo');
  });
  it('deriva analisi voce e disavanzo', () => {
    const item: QuoteItem = {
      ...meta(),
      name: 'Lavoro',
      variantGroups: [],
      variantSelections: [],
      chosenPrice: '50.00',
      subItems: [
        { ...meta(), kind: 'time', description: 'Tecnica', minutes: 60 },
        {
          ...meta(),
          kind: 'expense',
          description: 'Materiale',
          amount: '70.00',
        },
      ],
    };
    const result = calculateItem(item, '100.00');
    expect(result.theoreticalValue).toBe('170.00');
    expect(result.deficit).toBe('20.00');
  });
  it('mostra il teorico disponibile come parziale anche con una voce senza dati tecnici', () => {
    const complete: QuoteItem = {
      ...meta(),
      name: 'A',
      variantGroups: [],
      variantSelections: [],
      chosenPrice: '100',
      subItems: [{ ...meta(), kind: 'time', description: 'T', minutes: 60 }],
    };
    const incomplete: QuoteItem = {
      ...meta(),
      name: 'B',
      variantGroups: [],
      variantSelections: [],
      chosenPrice: '10',
      subItems: [],
    };
    const result = calculateQuote([complete, incomplete], '100');
    expect(result.blockingItems).toEqual([]);
    expect(result.theoreticalValue).toBe('100.00');
    expect(result.theoreticalPartial).toBe(true);
    expect(result.chosenTotal).toBe('110.00');
    expect(result.chosenPartial).toBe(false);
    expect(result.yieldPerHour).toBeUndefined();
  });
});

const commercialItem = (chosenPrice?: string): QuoteItem => ({
  ...meta(),
  name: 'Server',
  chosenPrice,
  subItems: [],
  variantGroups: [],
  variantSelections: [],
});

describe('disponibilità indipendente dei valori economici', () => {
  it('accetta una voce commerciale senza sottovoci e senza profilo', () => {
    const item = calculateItem(commercialItem('400.00'));
    expect(item).toMatchObject({ chosenPrice: '400.00', blockers: [] });
    expect(item.theoreticalValue).toBeUndefined();
    expect(item.minutes).toBeUndefined();
    expect(item.yieldPerHour).toBeUndefined();
    expect(item.deviationPercent).toBeUndefined();
    expect(item.coherentMinutes).toBeUndefined();
    expect(calculateQuote([commercialItem('400.00')])).toMatchObject({
      chosenTotal: '400.00',
      chosenPartial: false,
    });
  });

  it('somma 400, 250 e 150 anche con una voce senza prezzo e senza profilo', () => {
    expect(
      calculateQuote(
        ['400.00', '250.00', '150.00', undefined].map(commercialItem),
      ),
    ).toMatchObject({ chosenTotal: '800.00', chosenPartial: true });
    expect(calculateQuote([commercialItem()]).chosenTotal).toBeUndefined();
    expect(calculateQuote([]).chosenTotal).toBeUndefined();
  });

  it('distingue uno zero esplicito da un prezzo assente', () => {
    expect(calculateQuote([commercialItem('0.00')])).toMatchObject({
      chosenTotal: '0.00',
      chosenPartial: false,
    });
    expect(
      calculateQuote([commercialItem('0.00'), commercialItem()]),
    ).toMatchObject({ chosenTotal: '0.00', chosenPartial: true });
  });

  it('calcola il teorico senza prezzo e lo aggiorna con le sottovoci', () => {
    const item = commercialItem();
    item.subItems.push({
      ...meta(),
      kind: 'time',
      description: 'Lavoro',
      minutes: 285,
    });
    expect(calculateQuote([item], '100')).toMatchObject({
      theoreticalValue: '475.00',
      theoreticalPartial: false,
      timeValue: '475.00',
    });
    item.subItems.push({
      ...meta(),
      kind: 'expense',
      description: 'Materiale',
      amount: '25.00',
    });
    expect(calculateQuote([item, commercialItem()], '100')).toMatchObject({
      theoreticalValue: '500.00',
      theoreticalPartial: true,
    });
    item.subItems[0] = {
      ...meta(),
      kind: 'time',
      description: 'Lavoro',
      minutes: 60,
    };
    expect(calculateItem(item, '100').theoreticalValue).toBe('125.00');
    item.subItems.shift();
    expect(calculateItem(item).theoreticalValue).toBe('25.00');
    item.subItems = [];
    expect(calculateItem(item, '100').theoreticalValue).toBeUndefined();
  });

  it('mantiene spese note e resa senza inventare un obiettivo orario', () => {
    const item = commercialItem('125.00');
    item.subItems = [
      { ...meta(), kind: 'time', description: 'Lavoro', minutes: 60 },
      { ...meta(), kind: 'expense', description: 'Spese', amount: '25.00' },
    ];
    for (const result of [calculateItem(item), calculateQuote([item])]) {
      expect(result).toMatchObject({
        minutes: 60,
        expenses: '25.00',
        theoreticalValue: '25.00',
        theoreticalPartial: true,
        yieldPerHour: '100.00',
      });
      expect(result.timeValue).toBeUndefined();
      expect(result.deviationPercent).toBeUndefined();
      expect(result.coherentMinutes).toBeUndefined();
    }
    item.subItems.pop();
    expect(calculateItem(item).theoreticalValue).toBeUndefined();
    expect(calculateQuote([item]).yieldPerHour).toBe('125.00');
  });

  it('segnala la trasferta incompleta conservando prezzo, tempo e spese indipendenti', () => {
    const item = commercialItem('400.00');
    item.subItems = [
      { ...meta(), kind: 'time', description: 'Lavoro', minutes: 60 },
      { ...meta(), kind: 'expense', description: 'Spese', amount: '20.00' },
      {
        ...meta(),
        kind: 'travel',
        description: 'Visita',
        roundTrip: false,
        occurrences: 1,
      },
    ];
    const result = calculateQuote([item, commercialItem('250.00')], '100');
    expect(result).toMatchObject({
      chosenTotal: '650.00',
      chosenPartial: false,
      theoreticalValue: '120.00',
      theoreticalPartial: true,
      minutes: 60,
      expenses: '20.00',
      minutesPartial: true,
      expensesPartial: true,
    });
    expect(result.blockers.join(' ')).toContain('Trasferta');
    expect(result.yieldPerHour).toBeUndefined();
    expect(result.deviationPercent).toBeUndefined();
  });
});
