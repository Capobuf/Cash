import { bankExpenseIdentity, normalizeBankDescription } from './bank-expenses';
import { d, money } from './decimal';
import {
  err,
  meta,
  nowIso,
  ok,
  type BankExpense,
  type BankExpenseCategory,
  type CashDocument,
  type Result,
} from './model';
import { bankExpenseRowSchema } from './schema';

export interface BankExpenseDraft {
  date: string;
  description: string;
  amount: string;
  categoryIds: string[];
}
export type BankCategoryAction = 'add' | 'remove' | 'replace' | 'clear';

export function prepareBankExpenseCategory(
  categories: BankExpenseCategory[],
  nameInput: string,
  parentId?: string,
  id?: string,
  excludedFromCalculations?: boolean,
): Result<BankExpenseCategory> {
  const existing = id
    ? categories.find((category) => category.id === id)
    : undefined;
  if (id && !existing)
    return err({
      code: 'VALIDATION',
      message: 'La categoria non è più presente nell’archivio.',
    });
  const name = nameInput.trim();
  if (!name) return err({ code: 'VALIDATION', message: 'Inserisci un nome.' });
  if (parentId && existing?.systemRole === 'vat_taxes')
    return err({
      code: 'VALIDATION',
      message: 'La categoria di sistema deve restare una categoria principale.',
    });
  if (parentId && id && categories.some((category) => category.parentId === id))
    return err({
      code: 'VALIDATION',
      message:
        'La categoria contiene sottocategorie e deve restare una categoria principale.',
    });
  if (
    parentId &&
    !categories.some(
      (category) =>
        category.id === parentId &&
        category.id !== id &&
        !category.parentId &&
        category.systemRole !== 'vat_taxes',
    )
  )
    return err({
      code: 'VALIDATION',
      message: 'Scegli una categoria principale esistente.',
    });
  if (
    categories.some(
      (category) =>
        category.id !== id &&
        category.parentId === parentId &&
        category.name.trim().toLocaleLowerCase('it') ===
          name.toLocaleLowerCase('it'),
    )
  )
    return err({
      code: 'VALIDATION',
      message:
        'Esiste già una categoria con questo nome nello stesso livello. Selezionala dall’elenco.',
    });
  const value: BankExpenseCategory = {
    ...(existing ?? meta()),
    name,
    updatedAt: nowIso(),
  };
  if (parentId) value.parentId = parentId;
  else delete value.parentId;
  if (excludedFromCalculations !== undefined)
    value.excludedFromCalculations = excludedFromCalculations;
  return ok(value);
}

export function prepareBankExpense(
  document: CashDocument,
  draft: BankExpenseDraft,
  id?: string,
): Result<BankExpense> {
  const existing = id
    ? document.bankExpenses.find((expense) => expense.id === id)
    : undefined;
  if (id && !existing)
    return err({
      code: 'VALIDATION',
      message: 'La spesa non è più presente nell’archivio.',
    });
  const input = draft.amount.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(input) || d(input).lte(0))
    return err({
      code: 'VALIDATION',
      message:
        'Inserisci un importo positivo con massimo due decimali, ad esempio 34,90.',
    });
  const row = bankExpenseRowSchema.safeParse({
    date: draft.date,
    description: normalizeBankDescription(draft.description),
    amount: money(d(input)),
  });
  if (!row.success)
    return err({
      code: 'VALIDATION',
      message: 'Inserisci una data valida e una descrizione non vuota.',
    });
  const categoryIds = [...new Set(draft.categoryIds)];
  if (
    categoryIds.some(
      (categoryId) =>
        !document.bankExpenseCategories.some(
          (category) => category.id === categoryId,
        ),
    )
  )
    return err({
      code: 'VALIDATION',
      message: 'Una delle categorie selezionate non è più disponibile.',
    });
  const identity = bankExpenseIdentity(row.data);
  if (
    document.bankExpenses.some(
      (expense) =>
        expense.id !== id && bankExpenseIdentity(expense) === identity,
    )
  )
    return err({
      code: 'VALIDATION',
      message:
        'Esiste già una spesa con la stessa data, descrizione e importo.',
    });
  return ok({
    ...(existing ?? meta()),
    ...row.data,
    categoryIds,
    updatedAt: nowIso(),
  });
}

export function changeBankManualCategories(
  document: CashDocument,
  expenseIds: string[],
  categoryIds: string[],
  action: BankCategoryAction,
): void {
  const targets = new Set(expenseIds);
  const selected = new Set(categoryIds);
  const updatedAt = nowIso();
  for (const expense of document.bankExpenses) {
    if (!targets.has(expense.id)) continue;
    const next =
      action === 'clear'
        ? []
        : action === 'replace'
          ? [...selected]
          : action === 'add'
            ? [...new Set([...expense.categoryIds, ...selected])]
            : expense.categoryIds.filter((id) => !selected.has(id));
    if (
      next.length === expense.categoryIds.length &&
      next.every((id) => expense.categoryIds.includes(id))
    )
      continue;
    expense.categoryIds = next;
    expense.updatedAt = updatedAt;
  }
}

export function deleteBankExpenses(
  document: CashDocument,
  expenseIds: string[],
): void {
  const targets = new Set(expenseIds);
  document.bankExpenses = document.bankExpenses.filter(
    (expense) => !targets.has(expense.id),
  );
}
