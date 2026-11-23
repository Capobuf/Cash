import {
  err,
  meta,
  nowIso,
  ok,
  type BankAccount,
  type BankExpense,
  type BankExpenseImport,
  type CashDocument,
  type Result,
} from './model';

const minDate = (...dates: (string | undefined)[]): string | undefined =>
  dates.filter((date): date is string => !!date).sort()[0];

export function prepareBankAccount(
  accounts: BankAccount[],
  nameInput: string,
  id?: string,
): Result<BankAccount> {
  const existing = id
    ? accounts.find((account) => account.id === id)
    : undefined;
  if (id && !existing)
    return err({
      code: 'VALIDATION',
      message: 'Il conto non è più presente nell’archivio.',
    });
  const name = nameInput.trim();
  if (!name) return err({ code: 'VALIDATION', message: 'Inserisci un nome.' });
  const key = name.toLocaleLowerCase('it');
  if (
    accounts.some(
      (account) =>
        account.id !== id &&
        account.name.trim().toLocaleLowerCase('it') === key,
    )
  )
    return err({
      code: 'VALIDATION',
      message: 'Esiste già un conto con questo nome.',
    });
  return ok(
    existing ? { ...existing, name, updatedAt: nowIso() } : { ...meta(), name },
  );
}

export function bankAccountDeletionError(
  document: CashDocument,
  id: string,
): string | undefined {
  const used = document.bankExpenses.filter(
    (expense) => expense.accountId === id,
  ).length;
  return used
    ? `Il conto ha ${used} movimenti importati: eliminali prima di eliminare il conto.`
    : undefined;
}

export function bankAccountImportStatus(
  document: CashDocument,
  accountId: string,
): { lastExpense?: BankExpense; exportFrom?: string } {
  const lastExpense = document.bankExpenses
    .filter((expense) => expense.accountId === accountId)
    .reduce<BankExpense | undefined>(
      (last, expense) =>
        !last ||
        expense.date > last.date ||
        (expense.date === last.date && expense.createdAt > last.createdAt)
          ? expense
          : last,
      undefined,
    );
  const pendingSince = document.bankAccounts.find(
    (account) => account.id === accountId,
  )?.pendingSince;
  return { lastExpense, exportFrom: minDate(lastExpense?.date, pendingSince) };
}

// Links imported expenses to their account and remembers skipped pending
// movements until a later file covers their date again.
export function applyBankImport(
  document: CashDocument,
  accountId: string,
  added: BankExpense[],
  imported: Pick<BankExpenseImport, 'rows' | 'pendingFrom'>,
): void {
  const account = document.bankAccounts.find((entry) => entry.id === accountId);
  if (!account) throw new Error('Conto inesistente.');
  document.bankExpenses = document.bankExpenses.concat(
    added.map((expense) => ({ ...expense, accountId })),
  );
  const fileFrom = minDate(
    ...imported.rows.map((row) => row.date),
    imported.pendingFrom,
  );
  const stillPending =
    account.pendingSince && (!fileFrom || fileFrom > account.pendingSince)
      ? account.pendingSince
      : undefined;
  const pendingSince = minDate(stillPending, imported.pendingFrom);
  if (pendingSince === account.pendingSince) return;
  if (pendingSince) account.pendingSince = pendingSince;
  else delete account.pendingSince;
  account.updatedAt = nowIso();
}
