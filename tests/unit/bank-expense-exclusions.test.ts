import { describe, expect, it } from 'vitest';
import {
  deduplicateBankExpenses,
  filterBankExpenses,
  isBankExpenseExcluded,
  summarizeBankExpenses,
} from '../../src/domain/bank-expenses';
import { buildBankExpenseFlow } from '../../src/domain/bank-expense-flow';
import {
  buildFinancialOverviewFlow,
  calculateFinancialOverview,
} from '../../src/domain/financial-overview';
import { financialYears } from '../../src/domain/financial-analysis';
import {
  prepareBankExpense,
  prepareBankExpenseCategory,
} from '../../src/domain/bank-expense-editing';
import {
  createEmptyDocument,
  meta,
  type BankExpense,
  type BankExpenseCategory,
} from '../../src/domain/model';
import { sumMoney } from '../../src/domain/decimal';
import { cashDocumentSchema } from '../../src/domain/schema';

const expense = (overrides: Partial<BankExpense> = {}): BankExpense => ({
  ...meta(),
  date: '2026-10-04',
  description: 'Pagamento',
  amount: '10.00',
  categoryIds: [],
  ...overrides,
});
function fixture() {
  const doc = createEmptyDocument();
  const parent: BankExpenseCategory = { ...meta(), name: 'Auto' };
  const child: BankExpenseCategory = {
    ...meta(),
    name: 'Carburante',
    parentId: parent.id,
  };
  const personal: BankExpenseCategory = {
    ...meta(),
    name: 'Spese personali',
    excludedFromCalculations: true,
  };
  doc.bankExpenseCategories.push(parent, child, personal);
  return { doc, parent, child, personal };
}

describe('ricerca completa dei movimenti', () => {
  it.each([
    'pagAMENTO',
    '1234.56',
    '1234,56',
    '1.234,56',
    '1.234,56 €',
    '1.234,56\u00a0€',
    '2026-10-04',
    '04/10/2026',
    '04 ott 2026',
    'Auto',
    'Carburante',
    'Auto → Carburante',
    'Spese personali',
    'esclusa dai conteggi',
    'ignora nei conteggi',
  ])(
    'trova descrizione, importo, data, categorie effettive e stato per %s',
    (query) => {
      const { doc, child, personal } = fixture();
      const row = expense({ amount: '1234.56', categoryIds: [child.id] });
      doc.bankExpenses = [
        row,
        expense({ description: 'Altra', date: '2025-01-01' }),
      ];
      doc.bankExpenseRules = [
        { ...meta(), matchText: 'pagamento', categoryId: personal.id },
      ];
      expect(
        filterBankExpenses(
          doc.bankExpenses,
          doc.bankExpenseCategories,
          2026,
          ` ${query} `,
          'all',
          false,
          doc.bankExpenseRules,
        ),
      ).toEqual([row]);
    },
  );
  it('combina ricerca e filtro categoria mantenendo visibili le spese escluse', () => {
    const { doc, parent, child, personal } = fixture();
    const row = expense({
      categoryIds: [child.id],
      excludedFromCalculations: true,
    });
    doc.bankExpenses = [row];
    expect(
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        'esclusa',
        parent.id,
      ),
    ).toEqual([row]);
    expect(
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        'esclusa',
        personal.id,
      ),
    ).toEqual([]);
    expect(
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        'esclusa',
        'all',
        true,
      ),
    ).toEqual([]);
    row.excludedFromCalculations = false;
    expect(
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        'inclusa',
      ),
    ).toEqual([row]);
    expect(
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        'esclusa',
      ),
    ).toEqual([]);
  });
});

describe('esclusione dai conteggi bancari', () => {
  it('considera flag diretto, categorie multiple, padre e regole automatiche senza modificare i movimenti', () => {
    const { doc, parent, child, personal } = fixture();
    const rows = [
      expense(),
      expense({ excludedFromCalculations: true }),
      expense({ categoryIds: [personal.id] }),
      expense({ categoryIds: [child.id, personal.id] }),
      expense({ categoryIds: [child.id] }),
      expense({ description: 'Personale' }),
      expense({ categoryIds: [parent.id] }),
    ];
    const before = structuredClone(rows);
    doc.bankExpenseRules = [
      { ...meta(), matchText: 'personale', categoryId: personal.id },
    ];
    const excluded = () =>
      rows.map((row) =>
        isBankExpenseExcluded(
          row,
          doc.bankExpenseCategories,
          doc.bankExpenseRules,
        ),
      );
    expect(excluded()).toEqual([false, true, true, true, false, true, false]);
    child.excludedFromCalculations = true;
    expect(excluded()).toEqual([false, true, true, true, true, true, false]);
    child.excludedFromCalculations = false;
    parent.excludedFromCalculations = true;
    expect(excluded()).toEqual([false, true, true, true, true, true, true]);
    expect(rows).toEqual(before);
  });

  it('ricalcola dopo modifiche a regole, gerarchia e categorie preservando l’esclusione diretta', () => {
    const { doc, parent, child, personal } = fixture();
    const row = expense({ categoryIds: [child.id] });
    const excluded = () =>
      isBankExpenseExcluded(
        row,
        doc.bankExpenseCategories,
        doc.bankExpenseRules,
      );
    doc.bankExpenseRules = [
      { ...meta(), matchText: 'pagamento', categoryId: personal.id },
    ];
    expect(excluded()).toBe(true);
    doc.bankExpenseRules[0]!.matchText = 'altro';
    expect(excluded()).toBe(false);
    doc.bankExpenseRules[0]!.matchText = 'pagamento';
    doc.bankExpenseRules[0]!.categoryId = parent.id;
    expect(excluded()).toBe(false);
    doc.bankExpenseRules = [];
    child.parentId = personal.id;
    expect(excluded()).toBe(true);
    personal.excludedFromCalculations = false;
    expect(excluded()).toBe(false);
    row.excludedFromCalculations = true;
    expect(excluded()).toBe(true);
    row.excludedFromCalculations = false;
    expect(excluded()).toBe(false);
  });

  it('esclude da totali, count, mensile e categorie e conserva i flussi Sankey', () => {
    const { doc, parent, child, personal } = fixture();
    const included = [
      expense({ categoryIds: [child.id] }),
      expense({ description: 'Non classificata', amount: '20.00' }),
    ];
    doc.bankExpenses = [
      ...included,
      expense({
        description: 'Ignorata',
        amount: '30.00',
        excludedFromCalculations: true,
      }),
      expense({
        description: 'Personale',
        amount: '40.00',
        categoryIds: [personal.id],
      }),
      expense({ description: 'Automatica', amount: '50.00' }),
    ];
    doc.bankExpenseRules = [
      { ...meta(), matchText: 'automatica', categoryId: personal.id },
    ];
    const summary = summarizeBankExpenses(
      doc.bankExpenses,
      doc.bankExpenseCategories,
      2026,
      doc.bankExpenseRules,
    );
    expect(summary).toMatchObject({
      total: '30.00',
      count: 2,
      categorized: { count: 1, amount: '10.00' },
      uncategorized: { count: 1, amount: '20.00' },
    });
    expect(summary.monthly[9]).toMatchObject({ count: 2, amount: '30.00' });
    expect(
      summary.categories.find((item) => item.id === parent.id),
    ).toMatchObject({
      count: 1,
      amount: '10.00',
      children: [{ id: child.id, count: 1, amount: '10.00' }],
    });
    expect(
      summary.categories.find((item) => item.id === personal.id),
    ).toMatchObject({ count: 0, amount: '0.00' });
    const flow = buildBankExpenseFlow(doc, 2026);
    expect(flow).toEqual(
      buildBankExpenseFlow({ ...doc, bankExpenses: included }, 2026),
    );
    expect(flow.nodes[0]?.amount).toBe('30.00');
    expect(
      sumMoney(
        flow.links
          .filter((link) => link.source === 0)
          .map((link) => link.value),
      ),
    ).toBe('30.00');
    included.forEach((row) => {
      row.excludedFromCalculations = true;
    });
    expect(buildBankExpenseFlow(doc, 2026)).toEqual({ nodes: [], links: [] });
    expect(
      summarizeBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        doc.bankExpenseRules,
      ),
    ).toMatchObject({ total: '0.00', count: 0 });
  });

  it.each(['spesa', 'categoria', 'automatica'] as const)(
    'esclude imposte e uscite da panoramica e Sankey tramite %s',
    (source) => {
      const { doc, personal } = fixture();
      const tax = doc.bankExpenseCategories[0]!;
      const taxExpense = expense({
        description: 'F24',
        amount: '200.00',
        categoryIds: [tax.id],
      });
      doc.financialSnapshot = {
        source: 'fatture_in_cloud',
        company: { id: '1', name: 'Studio' },
        acquiredAt: '2026-10-04T00:00:00Z',
        issuedDocuments: [
          {
            id: 'invoice',
            type: 'invoice',
            date: '2026-01-01',
            amountGross: '1000.00',
            payments: [
              { amount: '1000.00', status: 'paid', paidDate: '2026-01-01' },
            ],
          },
        ],
        receivedDocuments: [],
      };
      doc.fiscalPaymentOverrides = [{ year: 2026, total: '300.00' }];
      doc.bankExpenses = [
        expense({ description: 'Inclusa', amount: '100.00' }),
        taxExpense,
        expense({
          description: 'Ignorata',
          amount: '500.00',
          excludedFromCalculations: true,
        }),
        expense({
          description: 'Personale',
          amount: '30.00',
          categoryIds: [personal.id],
        }),
      ];
      const calculate = () =>
        calculateFinancialOverview(doc, 2026, '2026-10-04');
      expect(calculate()).toMatchObject({
        bankExpenses: '300.00',
        marginAfterOutflows: '700.00',
        fiscalSituation: { paid: '200.00', remaining: '100.00' },
        estimatedAvailability: '600.00',
        bankExpenseShareOfCollections: '30.00',
      });
      if (source === 'spesa') taxExpense.excludedFromCalculations = true;
      else if (source === 'categoria') tax.excludedFromCalculations = true;
      else
        doc.bankExpenseRules = [
          { ...meta(), matchText: 'f24', categoryId: personal.id },
        ];
      const result = calculate();
      expect(result).toMatchObject({
        bankExpenses: '100.00',
        marginAfterOutflows: '900.00',
        fiscalSituation: { paid: '0.00', remaining: '300.00' },
        estimatedAvailability: '600.00',
        bankExpenseShareOfCollections: '10.00',
      });
      expect(result.monthly[9]).toMatchObject({ bankExpenses: '100.00' });
      const flow = buildFinancialOverviewFlow(result);
      expect(flow.nodes.find((node) => node.key === 'bank')?.amount).toBe(
        '100.00',
      );
      expect(
        flow.nodes.some((node) => node.name === 'Imposte P.IVA già pagate'),
      ).toBe(false);
      if (source === 'spesa') taxExpense.excludedFromCalculations = false;
      else if (source === 'categoria') tax.excludedFromCalculations = false;
      else doc.bankExpenseRules = [];
      expect(calculate().fiscalSituation.paid).toBe('200.00');
    },
  );

  it('conserva anni, identità di import e flag durante modifica di spesa o categoria', () => {
    const { doc, parent, personal } = fixture();
    const row = expense({ date: '2024-01-01', excludedFromCalculations: true });
    doc.bankExpenses = [
      row,
      expense({ date: '2023-01-01', categoryIds: [personal.id] }),
    ];
    expect(financialYears(undefined, [], doc.bankExpenses)).toEqual([
      2024, 2023,
    ]);
    expect(deduplicateBankExpenses(doc.bankExpenses, [row])).toMatchObject({
      added: [],
      duplicates: 1,
    });
    expect(
      prepareBankExpense(doc, { ...row, amount: '15.00' }, row.id),
    ).toMatchObject({
      ok: true,
      value: { id: row.id, excludedFromCalculations: true },
    });
    expect(
      prepareBankExpenseCategory(
        doc.bankExpenseCategories,
        personal.name,
        parent.id,
        personal.id,
      ),
    ).toMatchObject({
      ok: true,
      value: { id: personal.id, excludedFromCalculations: true },
    });
    expect(
      prepareBankExpenseCategory(
        doc.bankExpenseCategories,
        personal.name,
        parent.id,
        personal.id,
        false,
      ),
    ).toMatchObject({
      ok: true,
      value: { id: personal.id, excludedFromCalculations: false },
    });
  });

  it('valida nello schema 11 solo flag booleani opzionali su spese e categorie', () => {
    const { doc, personal } = fixture();
    doc.bankExpenses = [
      expense({ excludedFromCalculations: false }),
      expense({ description: 'Ignorata', excludedFromCalculations: true }),
      expense({ description: 'Assente' }),
    ];
    expect(doc.schemaVersion).toBe(11);
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
    for (const invalid of ['true', 1, null]) {
      expect(
        cashDocumentSchema.safeParse({
          ...doc,
          bankExpenses: [
            { ...doc.bankExpenses[0], excludedFromCalculations: invalid },
          ],
        }).success,
      ).toBe(false);
      expect(
        cashDocumentSchema.safeParse({
          ...doc,
          bankExpenseCategories: [
            { ...personal, excludedFromCalculations: invalid },
            doc.bankExpenseCategories[0],
          ],
        }).success,
      ).toBe(false);
    }
  });
});
