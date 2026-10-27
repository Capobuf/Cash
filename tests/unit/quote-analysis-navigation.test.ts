import { describe, expect, it } from 'vitest';
import { meta, type QuoteItem } from '../../src/domain/model';
import { missingAnalysisTargets } from '../../src/renderer/lib/quote-analysis-navigation';

const item = (chosenPrice?: string): QuoteItem => ({
  ...meta(),
  name: 'Server',
  chosenPrice,
  subItems: [],
  variantGroups: [],
  variantSelections: [],
});

describe('destinazioni dei totali parziali', () => {
  it('indirizza ai valori mancanti delle attività e spese effettive ancora vuote', () => {
    const incomplete = item('0.00');
    const time = { ...meta(), kind: 'time' as const, description: '' };
    const expense = { ...meta(), kind: 'expense' as const, description: '' };
    incomplete.subItems = [time, expense];
    expect(
      missingAnalysisTargets([incomplete], '50', 'minutes').map(
        (target) => target.id,
      ),
    ).toEqual([`quote-sub-${time.id}`]);
    expect(
      missingAnalysisTargets([incomplete], '50', 'expenses').map(
        (target) => target.id,
      ),
    ).toEqual([`quote-sub-${expense.id}`]);
    expect(
      missingAnalysisTargets([incomplete], '50', 'theoretical'),
    ).toHaveLength(2);
    expect(missingAnalysisTargets([incomplete], '50', 'chosen')).toEqual([]);
  });

  it('indica tutti i prezzi assenti e considera lo zero valorizzato', () => {
    const items = [item('400.00'), item(), item('0.00'), item()];
    expect(
      missingAnalysisTargets(items, undefined, 'chosen').map(
        (target) => target.id,
      ),
    ).toEqual([`chosen-${items[1]!.id}`, `chosen-${items[3]!.id}`]);
    items[1]!.chosenPrice = '0.00';
    expect(missingAnalysisTargets(items, undefined, 'chosen')).toHaveLength(1);
  });

  it('indirizza alle attività e costi delle voci prive di dati tecnici', () => {
    const empty = item('400.00');
    for (const metric of ['theoretical', 'minutes', 'expenses'] as const)
      expect(missingAnalysisTargets([empty], '100', metric)).toMatchObject([
        { id: `quote-technical-${empty.id}`, itemId: empty.id },
      ]);
  });

  it('indirizza al profilo soltanto se manca il valore del tempo', () => {
    const timed = item();
    timed.subItems = [
      { ...meta(), kind: 'time', description: 'Lavoro', minutes: 60 },
    ];
    expect(
      missingAnalysisTargets(
        [timed, { ...timed, ...meta() }],
        undefined,
        'theoretical',
      ),
    ).toMatchObject([{ id: 'quote-profile' }]);
    expect(missingAnalysisTargets([timed], '100', 'theoretical')).toEqual([]);
    expect(missingAnalysisTargets([timed], undefined, 'minutes')).toEqual([]);
    timed.subItems = [
      { ...meta(), kind: 'expense', description: 'Spesa', amount: '25.00' },
    ];
    expect(missingAnalysisTargets([timed], undefined, 'theoretical')).toEqual(
      [],
    );
  });

  it('indica la trasferta e solo i dati mancanti per il totale selezionato', () => {
    const traveled = item();
    const sub = {
      ...meta(),
      kind: 'travel' as const,
      description: 'Visita',
      roundTrip: false,
      occurrences: 1,
    };
    traveled.subItems = [sub];
    expect(missingAnalysisTargets([traveled], '100', 'theoretical')).toEqual([
      {
        id: `quote-sub-${sub.id}`,
        itemId: traveled.id,
        message:
          'Dati trasferta mancanti: partenza, destinazione, veicolo, tempo, costo.',
      },
    ]);
    expect(
      missingAnalysisTargets([traveled], '100', 'minutes')[0]!.message,
    ).toBe('Dati trasferta mancanti: tempo.');
    expect(
      missingAnalysisTargets([traveled], '100', 'expenses')[0]!.message,
    ).toBe('Dati trasferta mancanti: costo.');
    traveled.subItems = [
      {
        ...sub,
        departure: { sourceId: meta().id, name: 'Studio' },
        destination: { sourceId: meta().id, name: 'Cliente' },
        vehicleId: meta().id,
        totalMinutes: 30,
        totalCost: '10.00',
      },
    ];
    for (const metric of ['theoretical', 'minutes', 'expenses'] as const)
      expect(missingAnalysisTargets([traveled], '100', metric)).toEqual([]);
  });
});
