import {
  err,
  meta,
  nowIso,
  ok,
  type BankAccount,
  type BankExpense,
  type BankExpenseImport,
  type BankImportConfig,
  type CashDocument,
  type Result,
} from './model';
import { bankImportConfigSchema } from './schema';

// The formats Cash read before import rules were configurable.
export const bankImportPresets = {
  Fineco: {
    headers: [
      'Data_Operazione',
      'Data_Valuta',
      'Entrate',
      'Uscite',
      'Descrizione',
      'Descrizione_Completa',
      'Stato',
    ],
    date: 'Data_Valuta',
    description: 'Descrizione_Completa',
    descriptionFallback: 'Descrizione',
    amount: { kind: 'debit', debit: 'Uscite', credit: 'Entrate' },
    decimal: ',',
    status: { column: 'Stato', booked: ['Contabilizzato'] },
  },
  Revolut: {
    headers: [
      'Tipo',
      'Prodotto',
      'Data di inizio',
      'Data di completamento',
      'Descrizione',
      'Importo',
      'Costo',
      'Valuta',
      'State',
      'Saldo',
    ],
    date: 'Data di completamento',
    dateFallback: 'Data di inizio',
    description: 'Descrizione',
    amount: { kind: 'signed', amount: 'Importo', fee: 'Costo' },
    decimal: '.',
    status: { column: 'State', booked: ['COMPLETATO'] },
    currency: { column: 'Valuta', value: 'EUR' },
  },
} satisfies Record<string, BankImportConfig>;

export function bankImportPresetName(
  config: BankImportConfig | undefined,
): string | undefined {
  if (!config) return undefined;
  // Parsing fixes the key order, so equal rules compare equal as JSON.
  const json = (value: BankImportConfig) =>
    JSON.stringify(bankImportConfigSchema.parse(value));
  return (
    Object.entries(bankImportPresets).find(
      ([, preset]) => json(preset) === json(config),
    )?.[0] ?? 'Personalizzato'
  );
}

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

/** Form state for the import rules: empty strings mean "no column". */
export interface BankImportDraft {
  headers: string[];
  date: string;
  dateFallback: string;
  time: string;
  description: string;
  descriptionFallback: string;
  kind: 'debit' | 'signed';
  /** debit: outflows column; signed: amount column. */
  amount: string;
  /** debit: income column; signed: fee column. */
  extra: string;
  decimal: ',' | '.';
  status: string;
  booked: string[];
  currency: string;
  currencyValue: string;
}

export const bankImportDraft = (
  config?: BankImportConfig,
): BankImportDraft => ({
  headers: config?.headers ?? [],
  date: config?.date ?? '',
  dateFallback: config?.dateFallback ?? '',
  time: config?.time ?? '',
  description: config?.description ?? '',
  descriptionFallback: config?.descriptionFallback ?? '',
  kind: config?.amount.kind ?? 'debit',
  amount:
    config?.amount.kind === 'signed'
      ? config.amount.amount
      : (config?.amount.debit ?? ''),
  extra:
    (config?.amount.kind === 'signed'
      ? config.amount.fee
      : config?.amount.credit) ?? '',
  decimal: config?.decimal ?? ',',
  status: config?.status?.column ?? '',
  booked: config?.status?.booked ?? [],
  currency: config?.currency?.column ?? '',
  currencyValue: config?.currency?.value ?? '',
});

export function bankImportConfigFromDraft(
  draft: BankImportDraft,
): BankImportConfig | undefined {
  const optional = (value: string) => value || undefined;
  const parsed = bankImportConfigSchema.safeParse({
    headers: draft.headers,
    date: draft.date,
    dateFallback: optional(draft.dateFallback),
    time: optional(draft.time),
    description: draft.description,
    descriptionFallback: optional(draft.descriptionFallback),
    amount:
      draft.kind === 'debit'
        ? { kind: 'debit', debit: draft.amount, credit: optional(draft.extra) }
        : { kind: 'signed', amount: draft.amount, fee: optional(draft.extra) },
    decimal: draft.decimal,
    status: draft.status
      ? { column: draft.status, booked: draft.booked }
      : undefined,
    currency: draft.currency
      ? { column: draft.currency, value: draft.currencyValue }
      : undefined,
  });
  return parsed.success ? parsed.data : undefined;
}
