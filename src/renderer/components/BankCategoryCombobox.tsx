import { useMemo } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from '@/components/ui/combobox';
import { matchesSelection } from '@/components/ui/selection-field';
import {
  bankCategoryLabel,
  bankCategoryTree,
} from '../../domain/bank-expenses';
import type { BankExpenseCategory } from '../../domain/model';

type CategoryOption = { value: string; label: string };

export function BankCategoryCombobox({
  id,
  categories,
  value,
  disabled,
  specialOptions = [],
  onChange,
}: {
  id: string;
  categories: BankExpenseCategory[];
  value: string;
  disabled?: boolean;
  specialOptions?: CategoryOption[];
  onChange(id: string): void;
}) {
  const options = useMemo(
    () =>
      bankCategoryTree(categories)
        .flatMap((category) => [category, ...category.children])
        .map((category) => ({
          value: category.id,
          label: bankCategoryLabel(categories, category.id),
        })),
    [categories],
  );
  return (
    <Combobox
      items={[...specialOptions, ...options]}
      value={
        [...specialOptions, ...options].find(
          (option) => option.value === value,
        ) ?? null
      }
      disabled={disabled}
      autoHighlight
      isItemEqualToValue={(a, b) => a.value === b.value}
      onValueChange={(option) => {
        if (option !== null) onChange(option.value);
        else if (!specialOptions.length) onChange('');
      }}
      filter={matchesSelection}
    >
      <ComboboxInput
        id={id}
        disabled={disabled}
        triggerLabel="Mostra categorie"
        className="w-full min-w-52"
        placeholder="Scrivi per cercare una categoria"
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault();
        }}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          Nessuna categoria corrisponde alla ricerca.
        </ComboboxEmpty>
        <ComboboxList>
          {(option: CategoryOption) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
