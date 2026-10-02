import { bankCategoryLabel, effectiveCategoryIds } from './bank-expenses';
import { d, money, sumMoney } from './decimal';
import type { CashDocument } from './model';

export function buildBankExpenseFlow(
  doc: CashDocument,
  year: number | undefined,
) {
  const nodes: { key: string; name: string; amount: string }[] = [];
  const links: { source: number; target: number; value: number }[] = [];
  const expenses = doc.bankExpenses.filter(
    (expense) => expense.date.slice(0, 4) === String(year),
  );
  if (!expenses.length) return { nodes, links };
  const categories = new Map(
    doc.bankExpenseCategories.map((category) => [category.id, category]),
  );
  type Detail = { key: string; name: string; amount: string };
  const groups = new Map<
    string,
    Detail & { expand: boolean; details: Map<string, Detail> }
  >();
  for (const expense of expenses) {
    const effective = effectiveCategoryIds(expense, doc.bankExpenseRules);
    // A parent plus its child is a single branch, not two separate allocations.
    const leaves = effective
      .filter(
        (id) =>
          categories.has(id) &&
          !effective.some((other) => categories.get(other)?.parentId === id),
      )
      .sort();
    let key = 'uncategorized',
      name = 'Senza categoria',
      detailKey = key,
      detailName = name,
      expand = false;
    if (leaves.length > 1) {
      key = 'multiple';
      name = 'Più categorie';
      expand = true;
      detailKey = `combination:${JSON.stringify(leaves)}`;
      detailName = leaves
        .map((id) => bankCategoryLabel(doc.bankExpenseCategories, id))
        .sort((a, b) => a.localeCompare(b, 'it'))
        .join(' + ');
    } else if (leaves.length === 1) {
      const category = categories.get(leaves[0]!)!;
      const parent = category.parentId
        ? categories.get(category.parentId)
        : undefined;
      key = `category:${parent?.id ?? category.id}`;
      name = parent?.name ?? category.name;
      expand = Boolean(parent);
      detailKey = parent
        ? `subcategory:${category.id}`
        : `direct:${category.id}`;
      detailName = parent
        ? category.name
        : `${category.name} (senza sottocategoria)`;
    }
    const group = groups.get(key) ?? {
      key,
      name,
      amount: '0.00',
      expand: false,
      details: new Map<string, Detail>(),
    };
    group.amount = money(d(group.amount).plus(expense.amount));
    group.expand ||= expand;
    const detail = group.details.get(detailKey) ?? {
      key: detailKey,
      name: detailName,
      amount: '0.00',
    };
    detail.amount = money(d(detail.amount).plus(expense.amount));
    group.details.set(detailKey, detail);
    groups.set(key, group);
  }
  const descending = (a: Detail, b: Detail) =>
    d(b.amount).cmp(a.amount) || a.name.localeCompare(b.name, 'it');
  nodes.push({
    key: 'total',
    name: 'Totale spese',
    amount: sumMoney(expenses.map((expense) => expense.amount)),
  });
  for (const group of [...groups.values()].sort(descending)) {
    const index =
      nodes.push({ key: group.key, name: group.name, amount: group.amount }) -
      1;
    links.push({ source: 0, target: index, value: Number(group.amount) });
    if (group.expand)
      for (const detail of [...group.details.values()].sort(descending)) {
        const target = nodes.push(detail) - 1;
        links.push({ source: index, target, value: Number(detail.amount) });
      }
  }
  return { nodes, links };
}
