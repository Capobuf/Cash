import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BankRulesTable } from '../../src/renderer/components/BankRulesTable';
import { createEmptyDocument, meta } from '../../src/domain/model';
import {
  bankRuleList,
  type BankRuleSort,
} from '../../src/renderer/lib/bank-rule-list';

const alphabetical: BankRuleSort = { column: 'text', direction: 'ascending' };
function fixture() {
  const doc = createEmptyDocument();
  const costs = { ...meta(), name: 'Costi' };
  const subscriptions = { ...meta(), name: 'Abbonamenti', parentId: costs.id };
  const car = { ...meta(), name: 'Auto' };
  doc.bankExpenseCategories.push(costs, subscriptions, car);
  doc.bankExpenseRules = [
    { ...meta(), matchText: 'Zeta', categoryId: costs.id },
    { ...meta(), matchText: 'adobe', categoryId: subscriptions.id },
    { ...meta(), matchText: 'benzina', categoryId: car.id },
    { ...meta(), matchText: 'PAYPAL', categoryId: subscriptions.id },
  ];
  doc.bankExpenses = [
    {
      ...meta(),
      date: '2026-01-01',
      description: 'ADOBE',
      amount: '10.00',
      categoryIds: [],
    },
    {
      ...meta(),
      date: '2025-01-01',
      description: 'Pay Pal *ADOBE',
      amount: '20.00',
      categoryIds: [],
      excludedFromCalculations: true,
    },
    {
      ...meta(),
      date: '2026-01-02',
      description: 'Benzina',
      amount: '30.00',
      categoryIds: [],
    },
  ];
  return { doc, costs, subscriptions, car };
}

describe('ricerca, filtri e ordinamento delle regole bancarie', () => {
  it('espone controlli accessibili anche in sola lettura, disabilitando solo le modifiche', () => {
    const { doc } = fixture();
    const html = renderToStaticMarkup(
      createElement(BankRulesTable, {
        doc,
        readOnly: true,
        onEdit: () => undefined,
        onDelete: () => undefined,
      }),
    );
    expect(html).toContain('Cerca testo o categoria...');
    expect(html).toContain('Con corrispondenze');
    expect(html).toContain('Senza corrispondenze');
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain('4 di 4 regole');
    expect(
      html.match(/<button[^>]*aria-label="Modifica regola adobe"[^>]*>/)?.[0],
    ).toContain('disabled=""');
    expect(
      html.match(/<input[^>]*id="bank-rule-search"[^>]*>/)?.[0],
    ).not.toContain('disabled=""');
    expect(
      html.match(/<button[^>]*aria-label="Ordina per categoria"[^>]*>/)?.[0],
    ).not.toContain('disabled=""');
  });
  it('cerca testo, percorso categoria e numero di corrispondenze senza mutare l’archivio', () => {
    const { doc } = fixture();
    const before = structuredClone(doc);
    const search = (query: string) =>
      bankRuleList(doc, query, 'all', 'all', alphabetical).map(
        ({ rule }) => rule.matchText,
      );
    expect(search('  pAyPaL  ')).toEqual(['PAYPAL']);
    expect(search('COSTI → ABBONAMENTI')).toEqual(['adobe', 'PAYPAL']);
    expect(search('2')).toEqual(['adobe']);
    expect(search('   ')).toEqual(['adobe', 'benzina', 'PAYPAL', 'Zeta']);
    expect(search('inesistente')).toEqual([]);
    expect(doc).toEqual(before);
  });

  it('combina ricerca, categoria principale con figli e presenza di corrispondenze', () => {
    const { doc, costs, subscriptions } = fixture();
    const list = (categoryId: string) =>
      bankRuleList(doc, '', categoryId, 'all', alphabetical).map(
        ({ rule }) => rule.matchText,
      );
    expect(list(costs.id)).toEqual(['adobe', 'PAYPAL', 'Zeta']);
    expect(list(subscriptions.id)).toEqual(['adobe', 'PAYPAL']);
    expect(
      bankRuleList(doc, '', costs.id, 'matched', alphabetical).map(
        ({ rule }) => rule.matchText,
      ),
    ).toEqual(['adobe', 'PAYPAL']);
    expect(
      bankRuleList(doc, '', costs.id, 'unmatched', alphabetical).map(
        ({ rule }) => rule.matchText,
      ),
    ).toEqual(['Zeta']);
    expect(
      bankRuleList(doc, 'adobe', costs.id, 'unmatched', alphabetical),
    ).toEqual([]);
  });

  it.each([
    ['text', 'ascending', ['adobe', 'benzina', 'PAYPAL', 'Zeta']],
    ['text', 'descending', ['Zeta', 'PAYPAL', 'benzina', 'adobe']],
    ['category', 'ascending', ['benzina', 'Zeta', 'adobe', 'PAYPAL']],
    ['category', 'descending', ['adobe', 'PAYPAL', 'Zeta', 'benzina']],
    ['matches', 'ascending', ['Zeta', 'benzina', 'PAYPAL', 'adobe']],
    ['matches', 'descending', ['adobe', 'benzina', 'PAYPAL', 'Zeta']],
  ] as const)(
    'ordina %s in direzione %s senza modificare le regole',
    (column, direction, expected) => {
      const { doc } = fixture();
      const original = [...doc.bankExpenseRules];
      const rows = bankRuleList(doc, '', 'all', 'all', { column, direction });
      expect(rows.map(({ rule }) => rule.matchText)).toEqual(expected);
      expect(doc.bankExpenseRules).toEqual(original);
      rows.forEach(({ rule }) => expect(original).toContain(rule));
    },
  );

  it('conta tutti gli anni e le spese escluse e ricalcola dopo modifica della regola o della categoria', () => {
    const { doc, costs } = fixture();
    const rule = doc.bankExpenseRules[1]!;
    const list = () =>
      bankRuleList(doc, '', 'all', 'all', alphabetical).find(
        (row) => row.rule.id === rule.id,
      )!;
    expect(list().count).toBe(2);
    rule.matchText = 'NON PRESENTE';
    expect(list().count).toBe(0);
    rule.categoryId = costs.id;
    costs.name = 'Servizi';
    expect(list().categoryLabel).toBe('Servizi');
  });
});
