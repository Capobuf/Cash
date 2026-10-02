import { describe, expect, it } from 'vitest';
import { changeBankManualCategories, deleteBankExpenses, prepareBankExpense, prepareBankExpenseCategory, type BankCategoryAction } from '../../src/domain/bank-expense-editing';
import { automaticCategoryIds, deduplicateBankExpenses, summarizeBankExpenses } from '../../src/domain/bank-expenses';
import { createEmptyDocument, meta } from '../../src/domain/model';
import { cashDocumentSchema } from '../../src/domain/schema';

function fixture() {
  const doc = createEmptyDocument();
  const a = { ...meta(), name: 'Software' }; const b = { ...meta(), name: 'Online' };
  doc.bankExpenseCategories = [a, b, ...doc.bankExpenseCategories];
  doc.bankExpenseRules = [{ ...meta(), matchText: 'paypal', categoryId: b.id }];
  doc.bankExpenses = [
    { ...meta(), updatedAt: '2020-01-01T00:00:00.000Z', date: '2026-01-01', description: 'PAYPAL', amount: '10.00', categoryIds: [a.id] },
    { ...meta(), updatedAt: '2020-01-01T00:00:00.000Z', date: '2026-02-01', description: 'Acquisto', amount: '20.00', categoryIds: [b.id] },
    { ...meta(), date: '2025-01-01', description: 'Storico', amount: '30.00', categoryIds: [] },
  ];
  return { doc, a, b };
}

describe('creazione, modifica ed operazioni multiple sulle spese', () => {
  it('crea categorie e sottocategorie con nomi normalizzati senza modificare la selezione o le spese', () => {
    const { doc, a } = fixture(); const before = structuredClone(doc);
    const root = prepareBankExpenseCategory(doc.bankExpenseCategories, '  Trasferte  ');
    const child = prepareBankExpenseCategory(doc.bankExpenseCategories, '  Licenze  ', a.id);
    expect(root.ok && root.value.name).toBe('Trasferte');
    expect(root.ok && root.value.parentId).toBeUndefined();
    expect(child.ok && child.value.parentId).toBe(a.id);
    expect(doc).toEqual(before);
    if (!root.ok || !child.ok) return;
    doc.bankExpenseCategories.push(root.value, child.value);
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('blocca nomi vuoti, duplicati nello stesso livello, padri inesistenti e terzo livello', () => {
    const { doc, a, b } = fixture();
    const child = { ...meta(), name: 'Licenze', parentId: a.id };
    doc.bankExpenseCategories.push(child);
    expect(prepareBankExpenseCategory(doc.bankExpenseCategories, ' ').ok).toBe(false);
    expect(prepareBankExpenseCategory(doc.bankExpenseCategories, ' software ').ok).toBe(false);
    expect(prepareBankExpenseCategory(doc.bankExpenseCategories, ' LICENZE ', a.id).ok).toBe(false);
    expect(prepareBankExpenseCategory(doc.bankExpenseCategories, 'Nuova', child.id).ok).toBe(false);
    expect(prepareBankExpenseCategory(doc.bankExpenseCategories, 'Nuova', meta().id).ok).toBe(false);
    expect(prepareBankExpenseCategory(doc.bankExpenseCategories, 'Licenze', b.id).ok).toBe(true);
    expect(prepareBankExpenseCategory(doc.bankExpenseCategories, 'Licenze').ok).toBe(true);
  });

  it('crea una spesa con decimali italiani e descrizione normalizzata senza persistere categorie automatiche', () => {
    const { doc, a, b } = fixture(); const before = structuredClone(doc);
    const result = prepareBankExpense(doc, { date: '2026-03-01', description: '  PAYPAL   *ADOBE ', amount: '034,9', categoryIds: [a.id] });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.value).toMatchObject({ date: '2026-03-01', description: 'PAYPAL *ADOBE', amount: '34.90', categoryIds: [a.id] });
    expect(automaticCategoryIds(result.value, doc.bankExpenseRules)).toEqual([b.id]);
    expect(doc).toEqual(before);
    doc.bankExpenses.push(result.value);
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('modifica identità e importo mantenendo ID e data di creazione e ricalcola le regole', () => {
    const { doc, a } = fixture(); const expense = doc.bankExpenses[0]!;
    const result = prepareBankExpense(doc, { date: '2027-01-01', description: 'Bonifico', amount: '19.95', categoryIds: [a.id] }, expense.id);
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.value.id).toBe(expense.id); expect(result.value.createdAt).toBe(expense.createdAt);
    expect(result.value.updatedAt).not.toBe(expense.updatedAt);
    expect(automaticCategoryIds(result.value, doc.bankExpenseRules)).toEqual([]);
    doc.bankExpenses[0] = result.value;
    expect(summarizeBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2026, doc.bankExpenseRules).total).toBe('20.00');
    expect(summarizeBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2027, doc.bankExpenseRules).total).toBe('19.95');
  });

  it('rifiuta duplicati nella creazione e nella modifica, ma accetta il salvataggio della stessa spesa', () => {
    const { doc } = fixture(); const row = doc.bankExpenses[0]!;
    expect(prepareBankExpense(doc, row).ok).toBe(false);
    expect(prepareBankExpense(doc, row, doc.bankExpenses[1]!.id).ok).toBe(false);
    expect(prepareBankExpense(doc, row, row.id).ok).toBe(true);
    expect(prepareBankExpense(doc, { ...row, description: '  PAYPAL  ', amount: '010,0' }).ok).toBe(false);
  });

  it('rifiuta importi invalidi, date impossibili, descrizioni vuote e riferimenti rimossi', () => {
    const { doc } = fixture(); const row = doc.bankExpenses[0]!;
    for (const amount of ['', '-1', '0', '0,00', '1.234', 'NaN', 'Infinity', '1e2', '1,2,3'])
      expect(prepareBankExpense(doc, { ...row, amount }, row.id).ok).toBe(false);
    expect(prepareBankExpense(doc, { ...row, date: '2026-02-30' }, row.id).ok).toBe(false);
    expect(prepareBankExpense(doc, { ...row, description: '  ' }, row.id).ok).toBe(false);
    expect(prepareBankExpense(doc, { ...row, categoryIds: [meta().id] }, row.id).ok).toBe(false);
    expect(prepareBankExpense(doc, row, meta().id).ok).toBe(false);
  });

  it.each(['add', 'remove', 'replace', 'clear'] as BankCategoryAction[])('%s modifica solo le categorie manuali delle spese selezionate', action => {
    const { doc, a, b } = fixture(); const before = structuredClone(doc);
    changeBankManualCategories(doc, doc.bankExpenses.slice(0, 2).map(row => row.id), [b.id, b.id], action);
    const expected = { add: [[a.id, b.id], [b.id]], remove: [[a.id], []], replace: [[b.id], [b.id]], clear: [[], []] };
    expect(doc.bankExpenses.slice(0, 2).map(row => row.categoryIds)).toEqual(expected[action]);
    expect(doc.bankExpenses[2]).toEqual(before.bankExpenses[2]);
    expect(doc.bankExpenseRules).toEqual(before.bankExpenseRules);
    expect(automaticCategoryIds(doc.bankExpenses[0]!, doc.bankExpenseRules)).toEqual([b.id]);
    expect(summarizeBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, 2026, doc.bankExpenseRules).total).toBe('30.00');
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('elimina solo gli ID scelti, preserva categorie e regole e consente reimportazione successiva', () => {
    const { doc } = fixture(); const before = structuredClone(doc);
    deleteBankExpenses(doc, [doc.bankExpenses[0]!.id, doc.bankExpenses[1]!.id]);
    expect(doc.bankExpenses).toEqual([before.bankExpenses[2]]);
    expect(doc.bankExpenseCategories).toEqual(before.bankExpenseCategories);
    expect(doc.bankExpenseRules).toEqual(before.bankExpenseRules);
    expect(deduplicateBankExpenses(doc.bankExpenses, [before.bankExpenses[0]!]).added).toHaveLength(1);
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
  });
});
