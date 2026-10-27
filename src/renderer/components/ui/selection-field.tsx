import type { ComponentProps } from 'react';
import { cn } from 'cn';
import { Button } from './button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
} from './combobox';

export type SelectionOption = {
  value: string;
  label: string | number;
  searchText?: string;
  disabled?: boolean;
  group?: string;
};
type SelectionProps = Pick<
  ComponentProps<typeof SelectTrigger>,
  | 'id'
  | 'className'
  | 'disabled'
  | 'aria-label'
  | 'aria-labelledby'
  | 'aria-describedby'
  | 'aria-invalid'
  | 'size'
> & {
  options: SelectionOption[];
  value?: string | number;
  defaultValue?: string;
  name?: string;
  required?: boolean;
  readOnly?: boolean;
  onValueChange?: (value: string) => void;
};

export function SelectField({
  options,
  value,
  defaultValue,
  name,
  required,
  readOnly,
  disabled,
  onValueChange,
  ...triggerProps
}: SelectionProps) {
  return (
    <Select
      items={options}
      value={value === undefined ? undefined : String(value)}
      defaultValue={defaultValue}
      name={name}
      required={required}
      readOnly={readOnly}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onValueChange?.(next);
      }}
    >
      <SelectTrigger
        {...triggerProps}
        className={cn('min-w-0', triggerProps.className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function matchesSelection(option: SelectionOption, query: string) {
  const normalize = (text: string) =>
    text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('it');
  const label = normalize(`${option.label} ${option.searchText ?? ''}`);
  return normalize(query)
    .trim()
    .split(/\s+/)
    .every((term) => label.includes(term));
}

export function SearchableSelect({
  options,
  value,
  name,
  required,
  readOnly,
  disabled,
  onValueChange,
  size,
  ...triggerProps
}: Omit<SelectionProps, 'defaultValue'>) {
  const groups = options.some((option) => option.group)
    ? [...new Set(options.map((option) => option.group ?? ''))].map(
        (label) => ({
          label,
          items: options.filter((option) => (option.group ?? '') === label),
        }),
      )
    : undefined;
  const renderOption = (option: SelectionOption) => (
    <ComboboxItem key={option.value} value={option} disabled={option.disabled}>
      {option.label}
    </ComboboxItem>
  );
  return (
    <Combobox<SelectionOption>
      items={groups ?? options}
      value={options.find((option) => option.value === String(value)) ?? null}
      name={name}
      required={required}
      readOnly={readOnly}
      disabled={disabled}
      autoHighlight
      filter={matchesSelection}
      isItemEqualToValue={(a, b) => a.value === b.value}
      itemToStringLabel={(option) => String(option.label)}
      itemToStringValue={(option) => option.value}
      onValueChange={(option) => {
        if (option !== null) onValueChange?.(option.value);
      }}
    >
      <ComboboxTrigger
        render={
          <Button variant="outline" size={size === 'sm' ? 'sm' : 'default'} />
        }
        {...triggerProps}
        className={cn(
          'w-full min-w-0 justify-between font-normal',
          triggerProps.className,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          <ComboboxValue />
        </span>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput
          showTrigger={false}
          aria-label="Cerca opzioni"
          placeholder="Cerca…"
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault();
          }}
        />
        <ComboboxEmpty>Nessuna opzione corrisponde alla ricerca.</ComboboxEmpty>
        {groups ? (
          <ComboboxList>
            {(group: { label: string; items: SelectionOption[] }) => (
              <ComboboxGroup key={group.label} items={group.items}>
                {group.label ? (
                  <ComboboxLabel>{group.label}</ComboboxLabel>
                ) : null}
                <ComboboxCollection>{renderOption}</ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        ) : (
          <ComboboxList>{renderOption}</ComboboxList>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
