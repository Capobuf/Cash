import { describe, expect, it } from 'vitest';
import { buildBankExpenseFlow } from '../../src/domain/bank-expense-flow';
import { createEmptyDocument, meta } from '../../src/domain/model';
import { sumMoney } from '../../src/domain/decimal';

function fixture() {
  const doc = createEmptyDocument();
  const transport = { ...meta(), name: 'Trasporti' };
  const fuel = { ...meta(), name: 'Carburante', parentId: transport.id };
  const train = { ...meta(), name: 'Treno', parentId: transport.id };
  const work = { ...meta(), name: 'Lavoro' };
  doc.bankExpenseCategories.push(transport, fuel, train, work);
  const add = (amount: string, categoryIds: string[], description = 'Spesa', date = '2026-06-01') => {
    doc.bankExpenses.push({ ...meta(), amount, categoryIds, description, date });
  };
  return { doc, transport, fuel, train, work, add };
}

function expectConservation(flow: ReturnType<typeof buildBankExpenseFlow>, total: string) {
  expect(flow.nodes[0]?.amount).toBe(total);
  expect(sumMoney(flow.links.filter(link => link.source === 0).map(link => link.value))).toBe(total);
  flow.nodes.forEach((node, index) => {
    const incoming = flow.links.filter(link => link.target === index);
    const outgoing = flow.links.filter(link => link.source === index);
    if (incoming.length) expect(sumMoney(incoming.map(link => link.value))).toBe(node.amount);
    if (outgoing.length) expect(sumMoney(outgoing.map(link => link.value))).toBe(node.amount);
  });
  expect(flow.links.every(link => link.value > 0 && link.source < link.target)).toBe(true);
}

describe('Sankey del riepilogo spese', () => {
  it('ripartisce categorie, sottocategorie, assegnazioni dirette e spese non categorizzate conservando i centesimi', () => {
    const { doc, transport, fuel, work, add } = fixture();
    add('10.01', [transport.id]); add('20.02', [fuel.id]); add('30.03', [work.id]); add('0.04', []);
    const flow = buildBankExpenseFlow(doc, 2026);
    expectConservation(flow, '60.10');
    expect(flow.nodes).toEqual(expect.arrayContaining([
      { key: `category:${transport.id}`, name: 'Trasporti', amount: '30.03' },
      { key: `direct:${transport.id}`, name: 'Trasporti (senza sottocategoria)', amount: '10.01' },
      { key: `subcategory:${fuel.id}`, name: 'Carburante', amount: '20.02' },
      { key: 'uncategorized', name: 'Senza categoria', amount: '0.04' },
    ]));
  });

  it('raggruppa le categorie sovrapposte senza duplicare né dividere arbitrariamente le spese', () => {
    const { doc, transport, fuel, train, work, add } = fixture();
    add('10.00', [fuel.id, work.id]); add('20.00', [work.id, fuel.id]);
    add('5.00', [fuel.id, train.id]); add('7.00', [transport.id, fuel.id]);
    const flow = buildBankExpenseFlow(doc, 2026);
    expectConservation(flow, '42.00');
    expect(flow.nodes.find(node => node.key === 'multiple')?.amount).toBe('35.00');
    const combinations = flow.nodes.filter(node => node.key.startsWith('combination:'));
    expect(combinations).toHaveLength(2);
    expect(combinations.map(node => node.amount).sort()).toEqual(['30.00', '5.00']);
    expect(flow.nodes.find(node => node.key === `category:${transport.id}`)?.amount).toBe('7.00');
  });

  it('applica le regole automatiche insieme alle categorie manuali e filtra per anno', () => {
    const { doc, transport, fuel, work, add } = fixture();
    doc.bankExpenseRules.push({ ...meta(), matchText: 'benzina', categoryId: fuel.id });
    add('12.34', [transport.id, fuel.id], 'Benzina');
    add('23.45', [work.id], 'Benzina');
    add('999.99', [], 'Altro anno', '2025-01-01');
    const flow = buildBankExpenseFlow(doc, 2026);
    expectConservation(flow, '35.79');
    expect(flow.nodes.find(node => node.key === `subcategory:${fuel.id}`)?.amount).toBe('12.34');
    expect(flow.nodes.find(node => node.key === 'multiple')?.amount).toBe('23.45');
    expect(flow.nodes.some(node => node.key === 'uncategorized')).toBe(false);
  });

  it('gestisce un solo ramo, un anno vuoto e l’assenza di anno senza nodi isolati', () => {
    const { doc, work, add } = fixture();
    add('5.00', [work.id]);
    const flow = buildBankExpenseFlow(doc, 2026);
    expectConservation(flow, '5.00'); expect(flow.nodes).toHaveLength(2);
    expect(buildBankExpenseFlow(doc, 2025)).toEqual({ nodes: [], links: [] });
    expect(buildBankExpenseFlow(doc, undefined)).toEqual({ nodes: [], links: [] });
  });
});
