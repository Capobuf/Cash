import { d, money } from './decimal';
import { meta, type BankExpense, type BankExpenseCategory, type BankExpenseRow } from './model';

export const normalizeBankDescription = (value: string): string => value.trim().replace(/\s+/g, ' ');
// A tuple avoids collisions when bank descriptions contain separators.
export const bankExpenseIdentity = (row: BankExpenseRow): string => JSON.stringify([row.date, normalizeBankDescription(row.description), row.amount]);

export function deduplicateBankExpenses(existing: BankExpense[], rows: BankExpenseRow[]) {
  const seen = new Set(existing.map(bankExpenseIdentity));
  const added: BankExpense[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const key = bankExpenseIdentity(row);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    added.push({ ...meta(), date: row.date, description: normalizeBankDescription(row.description), amount: row.amount });
  }
  return { added, duplicates };
}

export function bankCategoryTree(categories: BankExpenseCategory[]) {
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  return sorted.filter(category => !category.parentId).map(category => ({
    ...category, children: sorted.filter(child => child.parentId === category.id),
  }));
}

export function bankCategoryDeletionBlocker(categories: BankExpenseCategory[], expenses: BankExpense[], id: string): string | undefined {
  if (categories.some(category => category.parentId === id)) return 'La categoria contiene sottocategorie.';
  if (expenses.some(expense => expense.categoryId === id)) return 'La categoria è assegnata ad almeno un movimento.';
  return undefined;
}

export function filterBankExpenses(expenses: BankExpense[], categories: BankExpenseCategory[], year: number | undefined,
  query = '', category = 'all', uncategorizedOnly = false): BankExpense[] {
  const categoryIds = new Set([category, ...categories.filter(item => item.parentId === category).map(item => item.id)]);
  const needle = query.trim().toLocaleLowerCase('it');
  return expenses.filter(expense => expense.date.slice(0, 4) === String(year)
    && expense.description.toLocaleLowerCase('it').includes(needle)
    && (uncategorizedOnly ? !expense.categoryId : category === 'all' || (category === 'none' ? !expense.categoryId : categoryIds.has(expense.categoryId ?? ''))))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function summarizeBankExpenses(expenses: BankExpense[], categories: BankExpenseCategory[], year: number | undefined) {
  const annual = expenses.filter(expense => expense.date.slice(0, 4) === String(year));
  const total = annual.reduce((sum, expense) => sum.plus(expense.amount), d(0));
  const percentage = (amount: string) => total.isZero() ? '0.0' : d(amount).div(total).mul(100).toFixed(1);
  const aggregate = (rows: BankExpense[]) => {
    const amount = money(rows.reduce((sum, expense) => sum.plus(expense.amount), d(0)));
    return { count: rows.length, amount, percentage: percentage(amount) };
  };
  const direct = new Map<string, BankExpense[]>();
  for (const expense of annual) {
    const key = expense.categoryId ?? '';
    const bucket = direct.get(key) ?? [];
    bucket.push(expense); direct.set(key, bucket);
  }
  return {
    total: money(total), count: annual.length,
    categorized: aggregate(annual.filter(expense => expense.categoryId)),
    uncategorized: aggregate(direct.get('') ?? []),
    monthly: Array.from({ length: 12 }, (_, index) => ({ month: index + 1,
      ...aggregate(annual.filter(expense => Number(expense.date.slice(5, 7)) === index + 1)) })),
    categories: bankCategoryTree(categories).map(category => ({ id: category.id, name: category.name,
      ...aggregate([...(direct.get(category.id) ?? []), ...category.children.flatMap(child => direct.get(child.id) ?? [])]),
      children: category.children.map(child => ({ id: child.id, name: child.name, ...aggregate(direct.get(child.id) ?? []) })),
    })),
  };
}
