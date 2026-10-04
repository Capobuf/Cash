import { d, money } from './decimal';
import {
  meta,
  type BankExpense,
  type BankExpenseCategory,
  type BankExpenseRow,
  type BankExpenseRule,
} from './model';

export const normalizeBankDescription = (value: string): string =>
  value.trim().replace(/\s+/g, ' ');
// Rule matching is independent from the normalization used for import identity.
export const normalizeBankRuleText = (value: string): string =>
  value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function bankRuleMatches(
  description: string,
  matchText: string,
): boolean {
  const key = normalizeBankRuleText(matchText);
  return key.length > 0 && normalizeBankRuleText(description).includes(key);
}

export function automaticCategoryIds(
  expense: Pick<BankExpense, 'description'>,
  rules: BankExpenseRule[],
): string[] {
  const description = normalizeBankRuleText(expense.description);
  return [
    ...new Set(
      rules
        .filter((rule) => {
          const key = normalizeBankRuleText(rule.matchText);
          return key.length > 0 && description.includes(key);
        })
        .map((rule) => rule.categoryId),
    ),
  ];
}

export function effectiveCategoryIds(
  expense: BankExpense,
  rules: BankExpenseRule[],
): string[] {
  return [
    ...new Set([
      ...expense.categoryIds,
      ...automaticCategoryIds(expense, rules),
    ]),
  ];
}

export function bankCategoryLabel(
  categories: BankExpenseCategory[],
  id: string,
): string {
  const category = categories.find((item) => item.id === id);
  const parent = categories.find((item) => item.id === category?.parentId);
  const label = parent
    ? `${parent.name} → ${category!.name}`
    : (category?.name ?? '');
  return category?.systemRole === 'vat_taxes'
    ? `${label} (sistema · Imposte P.IVA)`
    : label;
}
// A tuple avoids collisions when bank descriptions contain separators.
export const bankExpenseIdentity = (row: BankExpenseRow): string =>
  JSON.stringify([
    row.date,
    normalizeBankDescription(row.description),
    row.amount,
  ]);

export function deduplicateBankExpenses(
  existing: BankExpense[],
  rows: BankExpenseRow[],
) {
  const seen = new Set(existing.map(bankExpenseIdentity));
  const added: BankExpense[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const key = bankExpenseIdentity(row);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    added.push({
      ...meta(),
      date: row.date,
      description: normalizeBankDescription(row.description),
      amount: row.amount,
      categoryIds: [],
    });
  }
  return { added, duplicates };
}

export function bankCategoryTree(categories: BankExpenseCategory[]) {
  const sorted = [...categories].sort((a, b) =>
    a.name.localeCompare(b.name, 'it'),
  );
  return sorted
    .filter((category) => !category.parentId)
    .map((category) => ({
      ...category,
      children: sorted.filter((child) => child.parentId === category.id),
    }));
}

export function filterBankCategoryTree(
  categories: BankExpenseCategory[],
  query: string,
) {
  const needle = query.trim().toLocaleLowerCase('it');
  return bankCategoryTree(categories).flatMap((category) => {
    if (category.name.toLocaleLowerCase('it').includes(needle))
      return [category];
    const children = category.children.filter((child) =>
      child.name.toLocaleLowerCase('it').includes(needle),
    );
    return children.length ? [{ ...category, children }] : [];
  });
}

export function bankCategoryDeletionBlocker(
  categories: BankExpenseCategory[],
  expenses: BankExpense[],
  id: string,
  rules: BankExpenseRule[] = [],
): string | undefined {
  if (
    categories.some(
      (category) => category.id === id && category.systemRole === 'vat_taxes',
    )
  )
    return 'La categoria di sistema non può essere eliminata.';
  if (categories.some((category) => category.parentId === id))
    return 'La categoria contiene sottocategorie.';
  if (expenses.some((expense) => expense.categoryIds.includes(id)))
    return 'La categoria è assegnata manualmente ad almeno un movimento.';
  if (rules.some((rule) => rule.categoryId === id))
    return 'La categoria è utilizzata da almeno una regola automatica.';
  return undefined;
}

export function filterBankExpenses(
  expenses: BankExpense[],
  categories: BankExpenseCategory[],
  year: number | undefined,
  query = '',
  category = 'all',
  uncategorizedOnly = false,
  rules: BankExpenseRule[] = [],
): BankExpense[] {
  const categoryIds = new Set([
    category,
    ...categories
      .filter((item) => item.parentId === category)
      .map((item) => item.id),
  ]);
  const needle = query.trim().toLocaleLowerCase('it');
  return expenses
    .filter((expense) => {
      if (
        expense.date.slice(0, 4) !== String(year) ||
        !expense.description.toLocaleLowerCase('it').includes(needle)
      )
        return false;
      const effective = effectiveCategoryIds(expense, rules);
      return uncategorizedOnly || category === 'none'
        ? effective.length === 0
        : category === 'all' || effective.some((id) => categoryIds.has(id));
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function summarizeBankExpenses(
  expenses: BankExpense[],
  categories: BankExpenseCategory[],
  year: number | undefined,
  rules: BankExpenseRule[] = [],
) {
  const annual = expenses.filter(
    (expense) => expense.date.slice(0, 4) === String(year),
  );
  const total = annual.reduce((sum, expense) => sum.plus(expense.amount), d(0));
  const percentage = (amount: string) =>
    total.isZero() ? '0.0' : d(amount).div(total).mul(100).toFixed(1);
  const aggregate = (rows: BankExpense[]) => {
    const amount = money(
      rows.reduce((sum, expense) => sum.plus(expense.amount), d(0)),
    );
    return { count: rows.length, amount, percentage: percentage(amount) };
  };
  const direct = new Map<string, BankExpense[]>();
  for (const expense of annual) {
    const effective = effectiveCategoryIds(expense, rules);
    for (const key of effective.length ? effective : ['']) {
      const bucket = direct.get(key) ?? [];
      bucket.push(expense);
      direct.set(key, bucket);
    }
  }
  const uncategorized = direct.get('') ?? [];
  const uncategorizedIds = new Set(uncategorized.map((expense) => expense.id));
  return {
    total: money(total),
    count: annual.length,
    categorized: aggregate(
      annual.filter((expense) => !uncategorizedIds.has(expense.id)),
    ),
    uncategorized: aggregate(uncategorized),
    monthly: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      ...aggregate(
        annual.filter(
          (expense) => Number(expense.date.slice(5, 7)) === index + 1,
        ),
      ),
    })),
    categories: bankCategoryTree(categories).map((category) => ({
      id: category.id,
      name: category.name,
      ...aggregate([
        ...new Set([
          ...(direct.get(category.id) ?? []),
          ...category.children.flatMap((child) => direct.get(child.id) ?? []),
        ]),
      ]),
      children: category.children.map((child) => ({
        id: child.id,
        name: child.name,
        ...aggregate(direct.get(child.id) ?? []),
      })),
    })),
  };
}
