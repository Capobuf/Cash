import { describe, expect, it } from 'vitest';
import {
  automaticCategoryIds,
  bankCategoryDeletionBlocker,
  bankRuleMatches,
  deduplicateBankExpenses,
  effectiveCategoryIds,
  filterBankExpenses,
  normalizeBankRuleText,
  summarizeBankExpenses,
} from '../../src/domain/bank-expenses';
import {
  createEmptyDocument,
  createFiscalPreset2026,
  meta,
} from '../../src/domain/model';
import {
  bankExpenseImportSchema,
  cashDocumentSchema,
} from '../../src/domain/schema';
import {
  calculateFinancialAnalysis,
  financialYears,
} from '../../src/domain/financial-analysis';

function fixture() {
  const doc = createEmptyDocument();
  const software = { ...meta(), name: 'Software' };
  const hosting = { ...meta(), name: 'Hosting', parentId: software.id };
  const travel = { ...meta(), name: 'Trasferte' };
  doc.bankExpenseCategories = [
    software,
    hosting,
    travel,
    ...doc.bankExpenseCategories,
  ];
  doc.bankExpenses = [
    {
      ...meta(),
      date: '2026-01-05',
      description: 'Licenza',
      amount: '10.10',
      categoryIds: [software.id],
    },
    {
      ...meta(),
      date: '2026-02-06',
      description: 'HOSTING',
      amount: '20.20',
      categoryIds: [hosting.id],
    },
    {
      ...meta(),
      date: '2026-02-07',
      description: 'Spesa da classificare',
      amount: '30.30',
      categoryIds: [],
    },
    {
      ...meta(),
      date: '2025-12-31',
      description: 'Anno precedente',
      amount: '99.00',
      categoryIds: [travel.id],
    },
  ];
  return { doc, software, hosting, travel };
}

describe('uscite dal conto', () => {
  it.each(['OLD WAY', 'Oldway', 'old-way', 'OLD_WAY', ' old. / WAY '])(
    'riconosce %s ignorando solo le differenze grafiche',
    (value) => {
      expect(normalizeBankRuleText(value)).toBe('oldway');
      expect(
        bankRuleMatches('OLD WAY DI VINCENZO F. CAMPOBASSO IT...', value),
      ).toBe(true);
      expect(bankRuleMatches('Oldwey', value)).toBe(false);
    },
  );

  it('conserva lettere Unicode e numeri e non applica testi privi di lettere o numeri', () => {
    expect(normalizeBankRuleText('CAFÈ_42 / 東京')).toBe('cafè42東京');
    expect(bankRuleMatches('caffè', 'caffe')).toBe(false);
    for (const text of ['', '   ', '---_.*'])
      expect(bankRuleMatches('qualsiasi descrizione', text)).toBe(false);
  });

  it('deriva tutte le categorie corrispondenti senza persistirle e ricalcola creazione, modifica ed eliminazione', () => {
    const { doc, software, hosting, travel } = fixture();
    const expense = doc.bankExpenses[0]!;
    expense.description = 'PAYPAL *ADOBE';
    expense.categoryIds = [software.id];
    const before = structuredClone(expense);
    doc.bankExpenseRules = [
      { ...meta(), matchText: 'paypal', categoryId: travel.id },
      { ...meta(), matchText: 'adobe', categoryId: hosting.id },
      { ...meta(), matchText: 'paypaladobe', categoryId: software.id },
      { ...meta(), matchText: 'adobe', categoryId: hosting.id },
    ];
    expect(automaticCategoryIds(expense, doc.bankExpenseRules)).toEqual([
      travel.id,
      hosting.id,
      software.id,
    ]);
    expect(
      new Set(effectiveCategoryIds(expense, doc.bankExpenseRules)),
    ).toEqual(new Set([software.id, travel.id, hosting.id]));
    expect(
      new Set(
        effectiveCategoryIds(expense, [...doc.bankExpenseRules].reverse()),
      ),
    ).toEqual(new Set([software.id, travel.id, hosting.id]));
    doc.bankExpenseRules[0]!.matchText = 'oldway';
    expect(effectiveCategoryIds(expense, doc.bankExpenseRules)).not.toContain(
      travel.id,
    );
    doc.bankExpenseRules[0]!.matchText = 'paypal';
    doc.bankExpenseRules[0]!.categoryId = hosting.id;
    expect(effectiveCategoryIds(expense, doc.bankExpenseRules)).not.toContain(
      travel.id,
    );
    doc.bankExpenseRules = [];
    expect(effectiveCategoryIds(expense, doc.bankExpenseRules)).toEqual([
      software.id,
    ]);
    expect(expense).toEqual(before);
  });

  it('conta una spesa una volta per padre e nei KPI anche con padre, fratelli e regole sovrapposte', () => {
    const { doc, software, hosting, travel } = fixture();
    const license = { ...meta(), name: 'Licenze', parentId: software.id };
    doc.bankExpenseCategories.push(license);
    const expense = doc.bankExpenses[0]!;
    expense.categoryIds = [software.id, hosting.id, license.id, travel.id];
    doc.bankExpenses = [expense];
    doc.bankExpenseRules = [
      { ...meta(), matchText: 'licenza', categoryId: hosting.id },
    ];
    const result = summarizeBankExpenses(
      doc.bankExpenses,
      doc.bankExpenseCategories,
      2026,
      doc.bankExpenseRules,
    );
    expect(result).toMatchObject({
      total: '10.10',
      count: 1,
      categorized: { amount: '10.10', percentage: '100.0' },
      uncategorized: { count: 0, amount: '0.00' },
    });
    expect(
      result.categories.find((category) => category.id === software.id),
    ).toMatchObject({
      count: 1,
      amount: '10.10',
      percentage: '100.0',
      children: [
        { count: 1, amount: '10.10' },
        { count: 1, amount: '10.10' },
      ],
    });
    expect(
      result.categories.find((category) => category.id === travel.id),
    ).toMatchObject({ count: 1, amount: '10.10', percentage: '100.0' });
  });

  it('usa categorie automatiche per filtri, appartenenza al padre e KPI senza categoria', () => {
    const { doc, software, hosting } = fixture();
    doc.bankExpenses.forEach((expense) => {
      expense.categoryIds = [];
    });
    const rules = [{ ...meta(), matchText: 'hosting', categoryId: hosting.id }];
    for (const category of [software.id, hosting.id]) {
      expect(
        filterBankExpenses(
          doc.bankExpenses,
          doc.bankExpenseCategories,
          2026,
          '',
          category,
          false,
          rules,
        ),
      ).toEqual([doc.bankExpenses[1]]);
    }
    expect(
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        '',
        'none',
        false,
        rules,
      ),
    ).toHaveLength(2);
    expect(
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        '',
        software.id,
        true,
        rules,
      ),
    ).toHaveLength(2);
    expect(
      summarizeBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        rules,
      ),
    ).toMatchObject({
      total: '60.60',
      categorized: { count: 1, amount: '20.20' },
      uncategorized: { count: 2, amount: '40.40' },
    });
    expect(
      summarizeBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        [],
      ).uncategorized.count,
    ).toBe(3);
    const imported = deduplicateBankExpenses(doc.bankExpenses, [
      { date: '2027-01-01', description: 'HOSTING', amount: '5.00' },
    ]).added[0]!;
    expect(imported.categoryIds).toEqual([]);
    expect(effectiveCategoryIds(imported, rules)).toEqual([hosting.id]);
  });

  it('blocca categorie usate dalle regole e rifiuta regole vuote, orfane, ID duplicati e categorie manuali duplicate', () => {
    const { doc, software, hosting } = fixture();
    doc.bankExpenses.forEach((expense) => {
      expense.categoryIds = [];
    });
    const rule = { ...meta(), matchText: 'paypal', categoryId: hosting.id };
    doc.bankExpenseRules = [rule];
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
    expect(
      bankCategoryDeletionBlocker(
        doc.bankExpenseCategories,
        doc.bankExpenses,
        hosting.id,
        doc.bankExpenseRules,
      ),
    ).toContain('regola automatica');
    const invalid = (change: (copy: typeof doc) => void) => {
      const copy = structuredClone(doc);
      change(copy);
      expect(cashDocumentSchema.safeParse(copy).success).toBe(false);
    };
    for (const matchText of ['', ' ', '.*_-'])
      invalid((copy) => {
        copy.bankExpenseRules[0]!.matchText = matchText;
      });
    invalid((copy) => {
      copy.bankExpenseRules[0]!.categoryId = meta().id;
    });
    invalid((copy) => {
      copy.bankExpenseRules.push({ ...rule });
    });
    invalid((copy) => {
      copy.bankExpenseRules[0]!.id = software.id;
    });
    invalid((copy) => {
      copy.bankExpenseCategories = copy.bankExpenseCategories.filter(
        (category) => category.id !== hosting.id,
      );
    });
    invalid((copy) => {
      copy.bankExpenses[0]!.categoryIds = [software.id, software.id];
    });
    doc.bankExpenseRules = [];
    expect(
      bankCategoryDeletionBlocker(
        doc.bankExpenseCategories,
        doc.bankExpenses,
        hosting.id,
        [],
      ),
    ).toBeUndefined();
  });

  it('deduplica intersezioni e righe ripetute, senza cambiare categorie o distinguere descrizioni per euristica', () => {
    const { doc } = fixture();
    const before = structuredClone(doc);
    const added = {
      date: '2027-01-01',
      description: '  Nuova\n spesa  ',
      amount: '1.00',
    };
    const result = deduplicateBankExpenses(doc.bankExpenses, [
      doc.bankExpenses[0]!,
      added,
      added,
      { ...added, description: 'nuova spesa' },
    ]);
    expect(result.duplicates).toBe(2);
    expect(result.added).toHaveLength(2);
    expect(result.added[0]?.description).toBe('Nuova spesa');
    expect(result.added[0]?.categoryIds).toEqual([]);
    expect(doc).toEqual(before);
    expect(
      deduplicateBankExpenses([...doc.bankExpenses, ...result.added], [added])
        .added,
    ).toHaveLength(0);
  });

  it('filtra anno, descrizione, padre e figlio; solo non categorizzati prevale sul filtro categoria', () => {
    const { doc, software, hosting } = fixture();
    expect(
      filterBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2026).map(
        (row) => row.date,
      ),
    ).toEqual(['2026-02-07', '2026-02-06', '2026-01-05']);
    expect(
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        'hosting',
      ),
    ).toHaveLength(1);
    expect(
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        '',
        software.id,
      ),
    ).toHaveLength(2);
    expect(
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        '',
        hosting.id,
      ),
    ).toHaveLength(1);
    expect(
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        '',
        software.id,
        true,
      ),
    ).toEqual([doc.bankExpenses[2]]);
    expect(
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        '',
        'none',
      ),
    ).toEqual([doc.bankExpenses[2]]);
  });

  it('somma con decimali esatti, produce dodici mesi e aggrega padre e figli senza duplicazioni', () => {
    const { doc, software } = fixture();
    const result = summarizeBankExpenses(
      doc.bankExpenses,
      doc.bankExpenseCategories,
      2026,
    );
    expect(result).toMatchObject({
      total: '60.60',
      count: 3,
      categorized: { amount: '30.30', percentage: '50.0' },
      uncategorized: { amount: '30.30', count: 1 },
    });
    expect(result.monthly).toHaveLength(12);
    expect(result.monthly[1]?.amount).toBe('50.50');
    expect(
      result.categories.find((category) => category.id === software.id),
    ).toMatchObject({
      count: 2,
      amount: '30.30',
      children: [{ amount: '20.20' }],
    });
    doc.bankExpenses[2]!.categoryIds = [software.id];
    expect(
      summarizeBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2026)
        .categorized.percentage,
    ).toBe('100.0');
    expect(
      summarizeBankExpenses([], doc.bankExpenseCategories, 2026),
    ).toMatchObject({ total: '0.00', categorized: { percentage: '0.0' } });
  });

  it('impedisce terzo livello, cicli, riferimenti orfani e nomi duplicati nello stesso padre', () => {
    const { doc, software, hosting, travel } = fixture();
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
    const invalid = (change: (copy: typeof doc) => void) => {
      const copy = structuredClone(doc);
      change(copy);
      expect(cashDocumentSchema.safeParse(copy).success).toBe(false);
    };
    invalid((copy) =>
      copy.bankExpenseCategories.push({
        ...meta(),
        name: 'Terzo',
        parentId: hosting.id,
      }),
    );
    invalid((copy) => {
      copy.bankExpenseCategories[0]!.parentId = hosting.id;
    });
    invalid((copy) => {
      copy.bankExpenseCategories[0]!.parentId = software.id;
    });
    invalid((copy) =>
      copy.bankExpenseCategories.push({ ...meta(), name: ' software ' }),
    );
    invalid((copy) =>
      copy.bankExpenseCategories.push({
        ...meta(),
        name: ' HOSTING ',
        parentId: software.id,
      }),
    );
    invalid((copy) =>
      copy.bankExpenseCategories.push({ ...meta(), name: '   ' }),
    );
    invalid((copy) => {
      copy.bankExpenses[0]!.categoryIds = [meta().id];
    });
    invalid((copy) => {
      copy.bankExpenseCategories = [];
    });
    invalid((copy) =>
      copy.bankExpenses.push({ ...copy.bankExpenses[0]!, ...meta() }),
    );
    invalid((copy) => {
      copy.bankExpenses[0]!.amount = '0.00';
    });
    invalid((copy) => {
      copy.bankExpenses[0]!.amount = 'invalid';
    });
    doc.bankExpenseCategories.push({
      ...meta(),
      name: 'Hosting',
      parentId: travel.id,
    });
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
    expect(
      bankCategoryDeletionBlocker(
        doc.bankExpenseCategories,
        doc.bankExpenses,
        software.id,
      ),
    ).toBeDefined();
    expect(
      bankCategoryDeletionBlocker(
        doc.bankExpenseCategories,
        doc.bankExpenses,
        hosting.id,
      ),
    ).toBeDefined();
    expect(
      bankCategoryDeletionBlocker(
        doc.bankExpenseCategories,
        doc.bankExpenses,
        doc.bankExpenseCategories[4]!.id,
      ),
    ).toBeUndefined();
  });

  it('include gli anni banca e preserva i calcoli FIC', () => {
    const { doc } = fixture();
    doc.profiles.push(createFiscalPreset2026());
    doc.financialSnapshot = {
      source: 'fatture_in_cloud',
      company: { id: '1', name: 'Studio' },
      acquiredAt: new Date().toISOString(),
      issuedDocuments: [
        {
          id: '1',
          date: '2024-01-01',
          type: 'invoice',
          amountGross: '100.00',
          payments: [
            { amount: '100.00', status: 'paid', paidDate: '2023-12-31' },
          ],
        },
      ],
      receivedDocuments: [],
    };
    const before = calculateFinancialAnalysis(
      doc.financialSnapshot,
      2026,
      doc.profiles[0],
      [],
      '2026-10-01',
    );
    expect(
      financialYears(doc.financialSnapshot, doc.profiles, doc.bankExpenses),
    ).toEqual([2026, 2025, 2024, 2023]);
    doc.bankExpenses.push({
      ...meta(),
      date: '2027-01-01',
      amount: '999999.99',
      description: 'Banca',
      categoryIds: [],
    });
    expect(
      financialYears(doc.financialSnapshot, doc.profiles, doc.bankExpenses)[0],
    ).toBe(2027);
    expect(
      calculateFinancialAnalysis(
        doc.financialSnapshot,
        2026,
        doc.profiles[0],
        [],
        '2026-10-01',
      ),
    ).toEqual(before);
    expect(
      bankExpenseImportSchema.safeParse({
        rows: [{ date: '2026-02-30', amount: '1.00', description: 'x' }],
        ignoredIncome: 0,
      }).success,
    ).toBe(false);
  });
});
