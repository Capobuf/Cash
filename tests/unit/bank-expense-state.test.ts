import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  err,
  meta,
  ok,
  type BankExpenseImport,
  type CashDocument,
  type Result,
} from '../../src/domain/model';
import type { ArchiveSession } from '../../src/shared/archive';
import { AppState } from '../../src/renderer/state';
import {
  changeBankManualCategories,
  deleteBankExpenses,
} from '../../src/domain/bank-expense-editing';

const session = (
  document: CashDocument,
  path = 'C:\\cash.json',
): ArchiveSession => ({
  path,
  document,
  readOnly: false,
  token: {
    documentId: document.documentId,
    revision: document.revision,
  },
});
const imported: BankExpenseImport = {
  rows: [{ date: '2026-09-30', description: 'Servizio', amount: '10.00' }],
  ignoredIncome: 2,
};
function setup() {
  const importFile = vi.fn<() => Promise<Result<BankExpenseImport>>>(async () =>
    ok(structuredClone(imported)),
  );
  const save = vi.fn(async (_path: string, document: CashDocument) =>
    ok(session({ ...document, revision: document.revision + 1 })),
  );
  vi.stubGlobal('window', {
    cash: {
      bankExpenses: { importFile },
      archive: { save },
      setDirty: vi.fn(),
    },
    setTimeout,
    clearTimeout,
  });
  const state = new AppState();
  state.acceptNativeSession(session(createEmptyDocument()));
  return { state, importFile, save };
}

describe('import atomico e autosalvataggio spese', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('autosalva operazioni di massa in un solo passaggio e respinge mutazioni invalide o in sola lettura', async () => {
    const { state, save } = setup();
    await state.importBankExpenses();
    await vi.runAllTimersAsync();
    const category = { ...meta(), name: 'Software' };
    state.mutate((document) => {
      document.bankExpenseCategories.push(category);
      document.bankExpenses.push({
        ...meta(),
        date: '2026-01-01',
        description: 'Altra',
        amount: '5.00',
        categoryIds: [],
      });
    });
    await vi.runAllTimersAsync();
    save.mockClear();
    const ids = state.document!.bankExpenses.map((expense) => expense.id);
    expect(
      state.mutate((document) =>
        changeBankManualCategories(document, ids, [category.id], 'add'),
      ),
    ).toBe(true);
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      state.document!.bankExpenses.every((row) =>
        row.categoryIds.includes(category.id),
      ),
    ).toBe(true);
    const before = structuredClone(state.document);
    expect(
      state.mutate((document) =>
        changeBankManualCategories(document, ids, [meta().id], 'replace'),
      ),
    ).toBe(false);
    expect(state.document).toEqual(before);
    state.session!.readOnly = true;
    expect(state.mutate((document) => deleteBankExpenses(document, ids))).toBe(
      false,
    );
    state.session!.readOnly = false;
    state.status = 'Conflitto esterno';
    expect(state.mutate((document) => deleteBankExpenses(document, ids))).toBe(
      false,
    );
    expect(state.document).toEqual(before);
    state.status = 'Salvato';
    save.mockClear();
    expect(state.mutate((document) => deleteBankExpenses(document, ids))).toBe(
      true,
    );
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
    expect(state.document!.bankExpenses).toEqual([]);
  });

  it('applica una sola mutazione, autosalva, ignora reimportazioni e preserva le categorie', async () => {
    const { state, save } = setup();
    const mutate = vi.spyOn(state, 'mutate');
    await state.importBankExpenses();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(state.bankExpenseImportSummary).toEqual({
      imported: 1,
      duplicates: 0,
      ignoredIncome: 2,
    });
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
    expect(state.status).toBe('Salvato');
    state.mutate((document) => {
      const category = { ...meta(), name: 'Software' };
      document.bankExpenseCategories.push(category);
      document.bankExpenses[0]!.categoryIds = [category.id];
    });
    await vi.runAllTimersAsync();
    const before = structuredClone(state.document);
    mutate.mockClear();
    save.mockClear();
    await state.importBankExpenses();
    await vi.runAllTimersAsync();
    expect(state.bankExpenseImportSummary).toEqual({
      imported: 0,
      duplicates: 1,
      ignoredIncome: 2,
    });
    expect(state.document).toEqual(before);
    expect(mutate).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it.each(['CANCELLED', 'SOURCE_INVALID'] as const)(
    'non muta nulla per %s',
    async (code) => {
      const { state, importFile, save } = setup();
      const before = structuredClone(state.document);
      importFile.mockResolvedValueOnce(err({ code, message: 'Errore file' }));
      await state.importBankExpenses();
      await vi.runAllTimersAsync();
      expect(state.document).toEqual(before);
      expect(save).not.toHaveBeenCalled();
      expect(state.error?.code).toBe(code === 'CANCELLED' ? undefined : code);
    },
  );

  it('valida tutte le righe ricevute prima di mutare, anche una riga dopo un duplicato', async () => {
    const { state, importFile, save } = setup();
    importFile.mockResolvedValueOnce(
      ok({
        rows: [
          ...imported.rows,
          { date: '2026-02-30', description: 'Errore', amount: '1.00' },
        ],
        ignoredIncome: 0,
      }),
    );
    await state.importBankExpenses();
    await vi.runAllTimersAsync();
    expect(state.document?.bankExpenses).toEqual([]);
    expect(save).not.toHaveBeenCalled();
    expect(state.error?.code).toBe('VALIDATION');
  });

  it('blocca import concorrenti e scarta risultati dopo un cambio archivio', async () => {
    const { state, importFile } = setup();
    let complete!: (value: Result<BankExpenseImport>) => void;
    importFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = state.importBankExpenses();
    await state.importBankExpenses();
    expect(importFile).toHaveBeenCalledTimes(1);
    state.acceptNativeSession(session(createEmptyDocument(), 'C:\\altro.json'));
    complete(ok(imported));
    await pending;
    expect(state.document?.bankExpenses).toEqual([]);
    expect(state.error?.code).toBe('CONFLICT');
  });

  it('non importa in sola lettura o durante un conflitto, anche se il conflitto arriva dopo il dialog', async () => {
    const { state, importFile } = setup();
    state.session!.readOnly = true;
    await state.importBankExpenses();
    expect(importFile).not.toHaveBeenCalled();
    state.session!.readOnly = false;
    state.status = 'Conflitto esterno';
    await state.importBankExpenses();
    expect(importFile).not.toHaveBeenCalled();
    state.status = 'Salvato';
    let complete!: (value: Result<BankExpenseImport>) => void;
    importFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = state.importBankExpenses();
    state.status = 'Conflitto esterno';
    complete(ok(imported));
    await pending;
    expect(state.document?.bankExpenses).toEqual([]);
    expect(state.bankExpenseImportSummary).toBeNull();
  });

  it('deduplica sull’archivio corrente senza perdere modifiche durante il dialog o un autosalvataggio', async () => {
    const { state, importFile } = setup();
    let complete!: (value: Result<BankExpenseImport>) => void;
    importFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = state.importBankExpenses();
    state.mutate((document) => {
      document.bankExpenseCategories.push({
        ...meta(),
        name: 'Durante import',
      });
    });
    await vi.runAllTimersAsync();
    complete(ok(imported));
    await pending;
    expect(
      state.document?.bankExpenseCategories.find(
        (category) => category.name === 'Durante import',
      )?.name,
    ).toBe('Durante import');
    expect(state.document?.bankExpenses).toHaveLength(1);
  });
});
