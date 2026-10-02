import { useId, useState } from 'react';
import { bankCategoryLabel, bankCategoryTree } from '../../domain/bank-expenses';
import type { BankExpenseCategory } from '../../domain/model';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

const normalizeSearch = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('it');

export function BankCategoryChecklist({ categories, selected, automatic = [], disabled, onChange }: {
  categories: BankExpenseCategory[]; selected: string[]; automatic?: string[]; disabled?: boolean; onChange(ids: string[]): void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  const options = bankCategoryTree(categories).flatMap(category => [category, ...category.children])
    .map(category => ({ ...category, label: bankCategoryLabel(categories, category.id) }))
    .filter(category => terms.every(term => normalizeSearch(category.label).includes(term)));
  return <div className="space-y-3">
    <div className="space-y-2"><label htmlFor={`${id}-search`} className="text-sm font-medium">Cerca categoria</label>
      <Input id={`${id}-search`} type="search" placeholder="Nome categoria o sottocategoria" value={query} disabled={disabled}
        aria-controls={`${id}-options`} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter') event.preventDefault();
        }} />
    </div>
    <p role="status" className="text-xs text-muted-foreground">{options.length} categorie disponibili · {selected.length} selezionate</p>
    <div id={`${id}-options`} className="max-h-52 space-y-3 overflow-y-auto p-1">{options.map(category => <label key={category.id} className="flex items-center gap-2 text-sm">
    <Checkbox disabled={disabled} checked={selected.includes(category.id)} onCheckedChange={checked => onChange(checked ? [...new Set([...selected, category.id])] : selected.filter(id => id !== category.id))} />
    {category.label}{automatic.includes(category.id) ? <Badge variant="outline">Auto</Badge> : null}
  </label>)}{!options.length ? <p className="text-sm text-muted-foreground">{categories.length ? 'Nessuna categoria corrisponde alla ricerca.' : 'Nessuna categoria disponibile.'}</p> : null}</div>
  </div>;
}
