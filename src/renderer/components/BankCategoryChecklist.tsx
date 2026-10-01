import { bankCategoryLabel, bankCategoryTree } from '../../domain/bank-expenses';
import type { BankExpenseCategory } from '../../domain/model';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

export function BankCategoryChecklist({ categories, selected, automatic = [], disabled, onChange }: {
  categories: BankExpenseCategory[]; selected: string[]; automatic?: string[]; disabled?: boolean; onChange(ids: string[]): void;
}) {
  const options = bankCategoryTree(categories).flatMap(category => [category, ...category.children]);
  return <div className="max-h-52 space-y-3 overflow-y-auto p-1">{options.map(category => <label key={category.id} className="flex items-center gap-2 text-sm">
    <Checkbox disabled={disabled} checked={selected.includes(category.id)} onCheckedChange={checked => onChange(checked ? [...new Set([...selected, category.id])] : selected.filter(id => id !== category.id))} />
    {bankCategoryLabel(categories, category.id)}{automatic.includes(category.id) ? <Badge variant="outline">Auto</Badge> : null}
  </label>)}{!options.length ? <p className="text-sm text-muted-foreground">Nessuna categoria disponibile.</p> : null}</div>;
}
