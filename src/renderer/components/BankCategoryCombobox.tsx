import { useMemo } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronsUpDown } from 'lucide-react';
import { bankCategoryLabel, bankCategoryTree } from '../../domain/bank-expenses';
import type { BankExpenseCategory } from '../../domain/model';

type CategoryOption = { value: string; label: string };
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('it');

export function BankCategoryCombobox({ id, categories, value, disabled, onChange }: {
  id: string; categories: BankExpenseCategory[]; value: string; disabled?: boolean; onChange(id: string): void;
}) {
  const options = useMemo(() => bankCategoryTree(categories).flatMap(category => [category, ...category.children])
    .map(category => ({ value: category.id, label: bankCategoryLabel(categories, category.id) })), [categories]);
  return <Combobox.Root items={options} value={options.find(option => option.value === value) ?? null}
    disabled={disabled} autoHighlight isItemEqualToValue={(a, b) => a.value === b.value}
    onValueChange={option => onChange(option?.value ?? '')}
    filter={(option, query) => normalize(query).trim().split(/\s+/).every(term => normalize(option.label).includes(term))}>
    <div className="relative">
      <Combobox.Input id={id} placeholder="Scrivi per cercare una categoria" className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-9 pl-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} />
      <Combobox.Trigger aria-label="Mostra categorie" className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-lg text-muted-foreground disabled:opacity-50"><ChevronsUpDown className="size-4" /></Combobox.Trigger>
    </div>
    <Combobox.Portal><Combobox.Positioner sideOffset={4} className="z-[60]">
      <Combobox.Popup className="w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
        <Combobox.Empty className="px-2 text-sm text-muted-foreground">Nessuna categoria corrisponde alla ricerca.</Combobox.Empty>
        <Combobox.List className="max-h-52 overflow-y-auto overscroll-contain">{(option: CategoryOption) =>
          <Combobox.Item key={option.value} value={option} className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground">
            <span className="size-4 shrink-0"><Combobox.ItemIndicator><Check className="size-4" /></Combobox.ItemIndicator></span>
            {option.label}
          </Combobox.Item>
        }</Combobox.List>
      </Combobox.Popup>
    </Combobox.Positioner></Combobox.Portal>
  </Combobox.Root>;
}
