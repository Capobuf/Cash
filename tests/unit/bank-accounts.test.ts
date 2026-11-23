import { describe, expect, it } from 'vitest';
import {
  applyBankImport,
  bankAccountDeletionError,
  bankAccountImportStatus,
  prepareBankAccount,
} from '../../src/domain/bank-accounts';
import {
  createEmptyDocument,
  meta,
  type BankAccount,
  type BankExpense,
} from '../../src/domain/model';
import { cashDocumentSchema } from '../../src/domain/schema';

const expense = (date: string, accountId?: string): BankExpense => ({
  ...meta(),
  date,
  description: `Spesa ${date}`,
  amount: '10.00',
  categoryIds: [],
  ...(accountId ? { accountId } : {}),
});
function fixture() {
  const document = createEmptyDocument();
  const fineco: BankAccount = { ...meta(), name: 'Fineco' };
  document.bankAccounts = [fineco];
  return { document, fineco };
}

describe('conti bancari', () => {
  it('valida nome vuoto e duplicato senza distinguere maiuscole, e rinomina mantenendo l’id', () => {
    const { document, fineco } = fixture();
    expect(prepareBankAccount(document.bankAccounts, '  ').ok).toBe(false);
    expect(prepareBankAccount(document.bankAccounts, ' fineco ').ok).toBe(
      false,
    );
    const renamed = prepareBankAccount(
      document.bankAccounts,
      ' Fineco Business ',
      fineco.id,
    );
    expect(renamed).toMatchObject({
      ok: true,
      value: { id: fineco.id, name: 'Fineco Business' },
    });
    expect(
      prepareBankAccount(document.bankAccounts, 'Fineco', fineco.id).ok,
    ).toBe(true);
  });

  it('mostra l’ultima spesa del conto e la data da cui scaricare, considerando i movimenti in attesa', () => {
    const { document, fineco } = fixture();
    document.bankExpenses = [
      expense('2026-11-21', fineco.id),
      expense('2026-11-25'),
      expense('2026-11-10', fineco.id),
    ];
    expect(bankAccountImportStatus(document, fineco.id)).toMatchObject({
      lastExpense: { date: '2026-11-21' },
      exportFrom: '2026-11-21',
    });
    fineco.pendingSince = '2026-11-18';
    expect(bankAccountImportStatus(document, fineco.id).exportFrom).toBe(
      '2026-11-18',
    );
    expect(bankAccountImportStatus(document, meta().id)).toEqual({
      lastExpense: undefined,
      exportFrom: undefined,
    });
  });

  it('collega le spese importate e ricorda i movimenti in attesa finché un file non copre la loro data', () => {
    const { document, fineco } = fixture();
    applyBankImport(document, fineco.id, [expense('2026-10-01')], {
      rows: [{ date: '2026-10-01', description: 'x', amount: '1.00' }],
      pendingFrom: '2026-09-30',
    });
    expect(document.bankExpenses[0]!.accountId).toBe(fineco.id);
    expect(fineco.pendingSince).toBe('2026-09-30');
    // A file starting after the pending date cannot contain it: keep it.
    applyBankImport(document, fineco.id, [], {
      rows: [{ date: '2026-10-05', description: 'x', amount: '1.00' }],
    });
    expect(fineco.pendingSince).toBe('2026-09-30');
    // A file covering the pending date has imported it once booked.
    applyBankImport(document, fineco.id, [], {
      rows: [{ date: '2026-09-29', description: 'x', amount: '1.00' }],
    });
    expect(fineco).not.toHaveProperty('pendingSince');
    expect(cashDocumentSchema.safeParse(document).success).toBe(true);
  });

  it('impedisce di eliminare un conto con movimenti e rifiuta spese con conto inesistente', () => {
    const { document, fineco } = fixture();
    expect(bankAccountDeletionError(document, fineco.id)).toBeUndefined();
    document.bankExpenses = [expense('2026-11-21', fineco.id)];
    expect(bankAccountDeletionError(document, fineco.id)).toContain(
      '1 movimenti',
    );
    document.bankExpenses[0]!.accountId = meta().id;
    expect(cashDocumentSchema.safeParse(document).success).toBe(false);
  });
});
