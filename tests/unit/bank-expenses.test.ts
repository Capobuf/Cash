import { describe, expect, it } from 'vitest';
import { bankCategoryDeletionBlocker, deduplicateBankExpenses, filterBankExpenses, summarizeBankExpenses } from '../../src/domain/bank-expenses';
import { createEmptyDocument, createFiscalPreset2026, meta } from '../../src/domain/model';
import { bankExpenseImportSchema, cashDocumentSchema } from '../../src/domain/schema';
import { calculateFinancialAnalysis, financialYears } from '../../src/domain/financial-analysis';

function fixture() {
  const doc = createEmptyDocument();
  const software = { ...meta(), name: 'Software' };
  const hosting = { ...meta(), name: 'Hosting', parentId: software.id };
  const travel = { ...meta(), name: 'Trasferte' };
  doc.bankExpenseCategories = [software, hosting, travel];
  doc.bankExpenses = [
    { ...meta(), date: '2026-01-05', description: 'Licenza', amount: '10.10', categoryId: software.id },
    { ...meta(), date: '2026-02-06', description: 'HOSTING', amount: '20.20', categoryId: hosting.id },
    { ...meta(), date: '2026-02-07', description: 'Spesa da classificare', amount: '30.30' },
    { ...meta(), date: '2025-12-31', description: 'Anno precedente', amount: '99.00', categoryId: travel.id },
  ];
  return { doc, software, hosting, travel };
}

describe('spese bancarie', () => {
  it('deduplica intersezioni e righe ripetute, senza cambiare categorie o distinguere descrizioni per euristica', () => {
    const { doc } = fixture(); const before = structuredClone(doc);
    const added = { date: '2027-01-01', description: '  Nuova\n spesa  ', amount: '1.00' };
    const result = deduplicateBankExpenses(doc.bankExpenses, [doc.bankExpenses[0]!, added, added, { ...added, description: 'nuova spesa' }]);
    expect(result.duplicates).toBe(2); expect(result.added).toHaveLength(2);
    expect(result.added[0]?.description).toBe('Nuova spesa'); expect(result.added[0]).not.toHaveProperty('categoryId');
    expect(doc).toEqual(before);
    expect(deduplicateBankExpenses([...doc.bankExpenses, ...result.added], [added]).added).toHaveLength(0);
  });

  it('filtra anno, descrizione, padre e figlio; solo non categorizzati prevale sul filtro categoria', () => {
    const { doc, software, hosting } = fixture();
    expect(filterBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2026).map(row => row.date)).toEqual(['2026-02-07', '2026-02-06', '2026-01-05']);
    expect(filterBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2026, 'hosting')).toHaveLength(1);
    expect(filterBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2026, '', software.id)).toHaveLength(2);
    expect(filterBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2026, '', hosting.id)).toHaveLength(1);
    expect(filterBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2026, '', software.id, true)).toEqual([doc.bankExpenses[2]]);
    expect(filterBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2026, '', 'none')).toEqual([doc.bankExpenses[2]]);
  });

  it('somma con decimali esatti, produce dodici mesi e aggrega padre e figli senza duplicazioni', () => {
    const { doc, software } = fixture();
    const result = summarizeBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2026);
    expect(result).toMatchObject({ total: '60.60', count: 3, categorized: { amount: '30.30', percentage: '50.0' }, uncategorized: { amount: '30.30', count: 1 } });
    expect(result.monthly).toHaveLength(12); expect(result.monthly[1]?.amount).toBe('50.50');
    expect(result.categories.find(category => category.id === software.id)).toMatchObject({ count: 2, amount: '30.30', children: [{ amount: '20.20' }] });
    doc.bankExpenses[2]!.categoryId = software.id;
    expect(summarizeBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2026).categorized.percentage).toBe('100.0');
    expect(summarizeBankExpenses([], doc.bankExpenseCategories, 2026)).toMatchObject({ total: '0.00', categorized: { percentage: '0.0' } });
  });

  it('impedisce terzo livello, cicli, riferimenti orfani e nomi duplicati nello stesso padre', () => {
    const { doc, software, hosting, travel } = fixture();
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
    const invalid = (change: (copy: typeof doc) => void) => { const copy = structuredClone(doc); change(copy); expect(cashDocumentSchema.safeParse(copy).success).toBe(false); };
    invalid(copy => copy.bankExpenseCategories.push({ ...meta(), name: 'Terzo', parentId: hosting.id }));
    invalid(copy => { copy.bankExpenseCategories[0]!.parentId = hosting.id; });
    invalid(copy => { copy.bankExpenseCategories[0]!.parentId = software.id; });
    invalid(copy => copy.bankExpenseCategories.push({ ...meta(), name: ' software ' }));
    invalid(copy => copy.bankExpenseCategories.push({ ...meta(), name: ' HOSTING ', parentId: software.id }));
    invalid(copy => copy.bankExpenseCategories.push({ ...meta(), name: '   ' }));
    invalid(copy => { copy.bankExpenses[0]!.categoryId = meta().id; });
    invalid(copy => { copy.bankExpenseCategories = []; });
    invalid(copy => copy.bankExpenses.push({ ...copy.bankExpenses[0]!, ...meta() }));
    invalid(copy => { copy.bankExpenses[0]!.amount = '0.00'; });
    invalid(copy => { copy.bankExpenses[0]!.amount = 'invalid'; });
    doc.bankExpenseCategories.push({ ...meta(), name: 'Hosting', parentId: travel.id });
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
    expect(bankCategoryDeletionBlocker(doc.bankExpenseCategories, doc.bankExpenses, software.id)).toBeDefined();
    expect(bankCategoryDeletionBlocker(doc.bankExpenseCategories, doc.bankExpenses, hosting.id)).toBeDefined();
    expect(bankCategoryDeletionBlocker(doc.bankExpenseCategories, doc.bankExpenses, doc.bankExpenseCategories[3]!.id)).toBeUndefined();
  });

  it('include gli anni banca e preserva i calcoli FIC', () => {
    const { doc } = fixture(); doc.profiles.push(createFiscalPreset2026());
    doc.financialSnapshot = { source: 'fatture_in_cloud', company: { id: '1', name: 'Studio' }, acquiredAt: new Date().toISOString(),
      issuedDocuments: [{ id: '1', date: '2024-01-01', type: 'invoice', amountGross: '100.00', payments: [{ amount: '100.00', status: 'paid', paidDate: '2023-12-31' }] }], receivedDocuments: [] };
    const before = calculateFinancialAnalysis(doc.financialSnapshot, 2026, doc.profiles[0], [], '2026-10-01');
    expect(financialYears(doc.financialSnapshot, doc.profiles, doc.bankExpenses)).toEqual([2026, 2025, 2024, 2023]);
    doc.bankExpenses.push({ ...meta(), date: '2027-01-01', amount: '999999.99', description: 'Banca' });
    expect(financialYears(doc.financialSnapshot, doc.profiles, doc.bankExpenses)[0]).toBe(2027);
    expect(calculateFinancialAnalysis(doc.financialSnapshot, 2026, doc.profiles[0], [], '2026-10-01')).toEqual(before);
    expect(bankExpenseImportSchema.safeParse({ rows: [{ date: '2026-02-30', amount: '1.00', description: 'x' }], ignoredIncome: 0 }).success).toBe(false);
  });
});
