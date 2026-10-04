import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  meta,
  type BankExpenseCategory,
} from '../../src/domain/model';
import { BankCategoriesView } from '../../src/renderer/views/BankCategoriesView';
import { BankMovementsView } from '../../src/renderer/views/BankMovementsView';
import { AppState } from '../../src/renderer/state';

const editor = vi.hoisted(() => ({
  inject: false,
  value: undefined as BankExpenseCategory | undefined,
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (editor.inject) {
        editor.inject = false;
        return [editor.value, vi.fn()];
      }
      return actual.useState(initial);
    },
  };
});
vi.mock('@/components/ui/dialog', () => {
  const pass = ({ children }: { children: ReactNode }) => children;
  return {
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? children : null,
    ...Object.fromEntries(
      [
        'DialogContent',
        'DialogHeader',
        'DialogTitle',
        'DialogDescription',
        'DialogFooter',
      ].map((name) => [name, pass]),
    ),
  };
});
afterEach(() => {
  editor.inject = false;
});

it('mantiene visibili le spese escluse e distingue il flag diretto dall’esclusione derivata', () => {
  const doc = createEmptyDocument();
  const parent = {
    ...meta(),
    name: 'Personali',
    excludedFromCalculations: true,
  };
  doc.bankExpenseCategories.push(parent);
  doc.bankExpenses = [
    {
      ...meta(),
      date: '2026-10-04',
      description: 'Diretta',
      amount: '10.00',
      categoryIds: [],
      excludedFromCalculations: true,
    },
    {
      ...meta(),
      date: '2026-10-04',
      description: 'Derivata',
      amount: '20.00',
      categoryIds: [parent.id],
    },
  ];
  const html = renderToStaticMarkup(
    createElement(BankMovementsView, {
      doc,
      appState: new AppState(),
      year: 2026,
    }),
  );
  expect(html).toContain('Cerca movimenti...');
  expect(html).toContain('2 movimenti');
  expect(html.match(/Esclusa dai conteggi/g)).toHaveLength(2);
  expect(html).toContain('Esclusione derivata dalla categoria.');
  const checkbox = (name: string) =>
    html.match(
      new RegExp(`<[^>]*aria-label="Ignora nei conteggi ${name}[^>]*>`),
    )?.[0];
  expect(checkbox('Diretta')).toContain('aria-checked="true"');
  expect(checkbox('Derivata')).toContain('aria-checked="false"');
});

it('indica l’esclusione ereditata nell’editor sottocategoria senza attivarne il flag diretto', () => {
  const doc = createEmptyDocument();
  const parent = {
    ...meta(),
    name: 'Personali',
    excludedFromCalculations: true,
  };
  const child = { ...meta(), name: 'Acquisti', parentId: parent.id };
  doc.bankExpenseCategories.push(parent, child);
  editor.value = child;
  editor.inject = true;
  const html = renderToStaticMarkup(
    createElement(BankCategoriesView, { doc, appState: new AppState() }),
  );
  expect(html).toContain('Esclusa dal padre');
  expect(html).toContain('Esclusione ereditata dalla categoria principale');
  expect(html).toContain('aria-checked="false"');
  expect(html).not.toContain('aria-checked="true"');
});
