import { bankCategoryLabel, bankRuleMatches } from '../../domain/bank-expenses';
import type { CashDocument } from '../../domain/model';

export type BankRuleSortColumn = 'text' | 'category' | 'matches';
export type BankRuleSort = {
  column: BankRuleSortColumn;
  direction: 'ascending' | 'descending';
};
export type BankRuleMatchFilter = 'all' | 'matched' | 'unmatched';

export function bankRuleList(
  doc: CashDocument,
  query: string,
  categoryId: string,
  matches: BankRuleMatchFilter,
  sort: BankRuleSort,
) {
  const needle = query.trim().toLocaleLowerCase('it');
  const categoryIds = new Set([
    categoryId,
    ...doc.bankExpenseCategories
      .filter((category) => category.parentId === categoryId)
      .map((category) => category.id),
  ]);
  return doc.bankExpenseRules
    .map((rule) => ({
      rule,
      categoryLabel: bankCategoryLabel(
        doc.bankExpenseCategories,
        rule.categoryId,
      ),
      count: doc.bankExpenses.filter((expense) =>
        bankRuleMatches(expense.description, rule.matchText),
      ).length,
    }))
    .filter(
      ({ rule, categoryLabel, count }) =>
        (categoryId === 'all' || categoryIds.has(rule.categoryId)) &&
        (matches === 'all' ||
          (matches === 'matched' ? count > 0 : count === 0)) &&
        `${rule.matchText} ${categoryLabel} ${count}`
          .toLocaleLowerCase('it')
          .includes(needle),
    )
    .sort((a, b) => {
      const comparison =
        sort.column === 'matches'
          ? a.count - b.count
          : sort.column === 'category'
            ? a.categoryLabel.localeCompare(b.categoryLabel, 'it', {
                sensitivity: 'base',
              })
            : a.rule.matchText.localeCompare(b.rule.matchText, 'it', {
                sensitivity: 'base',
              });
      return comparison * (sort.direction === 'ascending' ? 1 : -1);
    });
}
