import { describe, expect, it } from 'vitest';
import { prepareBankExpenseCategory } from '../../src/domain/bank-expense-editing';
import {
  bankCategoryLabel,
  bankCategoryTree,
  filterBankCategoryTree,
  filterBankExpenses,
  summarizeBankExpenses,
} from '../../src/domain/bank-expenses';
import {
  createEmptyDocument,
  meta,
  type BankExpenseCategory,
} from '../../src/domain/model';
import { cashDocumentSchema } from '../../src/domain/schema';

function fixture() {
  const doc = createEmptyDocument();
  const software: BankExpenseCategory = { ...meta(), name: 'Software' };
  const services: BankExpenseCategory = { ...meta(), name: 'Servizi' };
  const hosting: BankExpenseCategory = {
    ...meta(),
    name: 'Hosting',
    parentId: software.id,
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
  const licenses: BankExpenseCategory = {
    ...meta(),
    name: 'Licenze',
    parentId: software.id,
  };
  doc.bankExpenseCategories.push(software, services, hosting, licenses);
  doc.bankExpenses = [
    {
      ...meta(),
      date: '2026-01-01',
      description: 'Pagamento manuale',
      amount: '10.00',
      categoryIds: [hosting.id],
    },
    {
      ...meta(),
      date: '2026-02-01',
      description: 'Rinnovo hosting',
      amount: '20.00',
      categoryIds: [services.id],
    },
  ];
  doc.bankExpenseRules = [
    { ...meta(), matchText: 'hosting', categoryId: hosting.id },
  ];
  return { doc, software, services, hosting, licenses };
}

describe('ricerca categorie bancarie', () => {
  it('mostra l’albero completo per query vuote o solo spazi senza mutare i dati', () => {
    const { doc } = fixture();
    const before = structuredClone(doc);
    for (const query of ['', '  '])
      expect(filterBankCategoryTree(doc.bankExpenseCategories, query)).toEqual(
        bankCategoryTree(doc.bankExpenseCategories),
      );
    expect(doc).toEqual(before);
  });

  it('mantiene tutti i figli se corrisponde il padre, ignorando maiuscole e spazi', () => {
    const { doc, software, hosting, licenses } = fixture();
    expect(
      filterBankCategoryTree(doc.bankExpenseCategories, ' SOFTware '),
    ).toEqual([{ ...software, children: [hosting, licenses] }]);
  });

  it('mantiene il padre come contesto con soltanto i figli corrispondenti', () => {
    const { doc, software, hosting, licenses } = fixture();
    expect(filterBankCategoryTree(doc.bankExpenseCategories, ' HOST ')).toEqual(
      [{ ...software, children: [hosting] }],
    );
    expect(
      filterBankCategoryTree(doc.bankExpenseCategories, 'i'),
    ).toContainEqual({
      ...software,
      children: [hosting, licenses],
    });
    expect(
      filterBankCategoryTree(doc.bankExpenseCategories, 'inesistente'),
    ).toEqual([]);
  });
});

describe('riorganizzazione categorie bancarie', () => {
  it('sposta una sottocategoria aggiornando albero, label, filtri e aggregazioni senza cambiare riferimenti', () => {
    const { doc, software, services, hosting } = fixture();
    const before = structuredClone(doc);
    const prepared = prepareBankExpenseCategory(
      doc.bankExpenseCategories,
      hosting.name,
      services.id,
      hosting.id,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(doc).toEqual(before);
    expect(prepared.value).toEqual({
      ...hosting,
      parentId: services.id,
      updatedAt: expect.any(String),
    });
    expect(prepared.value.updatedAt).not.toBe(hosting.updatedAt);
    doc.bankExpenseCategories = doc.bankExpenseCategories.map((category) =>
      category.id === hosting.id ? prepared.value : category,
    );
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
    expect(doc.schemaVersion).toBe(before.schemaVersion);
    expect(doc.bankExpenses).toEqual(before.bankExpenses);
    expect(doc.bankExpenseRules).toEqual(before.bankExpenseRules);
    expect(bankCategoryTree(doc.bankExpenseCategories)).toContainEqual({
      ...services,
      children: [prepared.value],
    });
    expect(bankCategoryLabel(doc.bankExpenseCategories, hosting.id)).toBe(
      'Servizi → Hosting',
    );
    const filtered = (id: string) =>
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        2026,
        '',
        id,
        false,
        doc.bankExpenseRules,
      );
    expect(filtered(software.id)).toEqual([]);
    expect(filtered(services.id)).toHaveLength(2);
    const summary = summarizeBankExpenses(
      doc.bankExpenses,
      doc.bankExpenseCategories,
      2026,
      doc.bankExpenseRules,
    );
    expect(
      summary.categories.find((category) => category.id === software.id)
        ?.amount,
    ).toBe('0.00');
    expect(
      summary.categories.find((category) => category.id === services.id),
    ).toMatchObject({
      count: 2,
      amount: '30.00',
      children: [{ id: hosting.id, count: 2, amount: '30.00' }],
    });
  });

  it('trasforma una categoria senza figli in sottocategoria e la riporta al livello principale', () => {
    const { doc, software, services } = fixture();
    for (const parentId of [software.id, undefined]) {
      const prepared = prepareBankExpenseCategory(
        doc.bankExpenseCategories,
        services.name,
        parentId,
        services.id,
      );
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      doc.bankExpenseCategories = doc.bankExpenseCategories.map((category) =>
        category.id === services.id ? prepared.value : category,
      );
      if (!parentId) expect(prepared.value).not.toHaveProperty('parentId');
      expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
      expect(services.id).toBe(prepared.value.id);
      expect(bankCategoryLabel(doc.bankExpenseCategories, services.id)).toBe(
        parentId ? 'Software → Servizi' : 'Servizi',
      );
    }
    expect(
      doc.bankExpenseCategories.find((category) => category.id === services.id),
    ).not.toHaveProperty('parentId');
  });

  it('rifiuta categorie con figli spostate, padri invalidi, sé stessa e categoria di sistema', () => {
    const { doc, software, services, hosting } = fixture();
    const tax = doc.bankExpenseCategories[0]!;
    const before = structuredClone(doc);
    for (const [category, parentId] of [
      [software, services.id],
      [services, services.id],
      [services, hosting.id],
      [services, meta().id],
      [services, tax.id],
      [tax, services.id],
    ] as const) {
      expect(
        prepareBankExpenseCategory(
          doc.bankExpenseCategories,
          category.name,
          parentId,
          category.id,
        ).ok,
      ).toBe(false);
      const invalid = structuredClone(doc);
      invalid.bankExpenseCategories.find(
        (item) => item.id === category.id,
      )!.parentId = parentId;
      expect(cashDocumentSchema.safeParse(invalid).success).toBe(false);
    }
    expect(
      prepareBankExpenseCategory(
        doc.bankExpenseCategories,
        'Tributi',
        undefined,
        tax.id,
      ),
    ).toMatchObject({
      ok: true,
      value: { id: tax.id, systemRole: 'vat_taxes' },
    });
    expect(doc).toEqual(before);
  });

  it('rifiuta nomi duplicati nel livello di destinazione ma consente omonimi sotto padri diversi', () => {
    const { doc, software, services, hosting } = fixture();
    const duplicate: BankExpenseCategory = {
      ...meta(),
      name: 'Hosting',
      parentId: services.id,
    };
    doc.bankExpenseCategories.push(duplicate);
    expect(
      prepareBankExpenseCategory(
        doc.bankExpenseCategories,
        ' HOSTING ',
        software.id,
        hosting.id,
      ).ok,
    ).toBe(true);
    expect(
      prepareBankExpenseCategory(
        doc.bankExpenseCategories,
        ' HOSTING ',
        services.id,
        hosting.id,
      ),
    ).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('stesso livello') },
    });
    hosting.parentId = services.id;
    expect(cashDocumentSchema.safeParse(doc).success).toBe(false);
    hosting.parentId = software.id;
    delete duplicate.parentId;
    expect(
      prepareBankExpenseCategory(
        doc.bankExpenseCategories,
        'Hosting',
        undefined,
        hosting.id,
      ).ok,
    ).toBe(false);
    expect(
      prepareBankExpenseCategory(
        doc.bankExpenseCategories,
        'Nuova',
        undefined,
        meta().id,
      ).ok,
    ).toBe(false);
  });
});
