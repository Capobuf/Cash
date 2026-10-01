import { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { prepareBankExpenseCategory } from '../../domain/bank-expense-editing';
import { bankCategoryTree } from '../../domain/bank-expenses';
import type { BankExpenseCategory } from '../../domain/model';
import type { AppState } from '../state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

export function BankQuickCategory({ categories, appState, onCreated }: {
  categories: BankExpenseCategory[]; appState: AppState; onCreated(id: string): void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string>();
  const readOnly = appState.session?.readOnly || appState.status === 'Conflitto esterno';
  const close = () => { setOpen(false); setName(''); setParentId(''); setError(undefined); };
  const create = () => {
    if (readOnly || !appState.document) return;
    const prepared = prepareBankExpenseCategory(appState.document.bankExpenseCategories, name, parentId || undefined);
    if (!prepared.ok) { setError(prepared.error.message); return; }
    const saved = appState.mutate(document => { document.bankExpenseCategories.push(prepared.value); });
    if (!saved) { setError(appState.error?.message ?? 'La categoria non può essere creata in questo momento.'); return; }
    onCreated(prepared.value.id);
    close();
  };
  return <div className="space-y-3">
    <Button type="button" variant="outline" size="sm" disabled={readOnly} aria-expanded={open} aria-controls={`${id}-editor`} onClick={() => open ? close() : setOpen(true)}><Plus />Nuova categoria / sottocategoria</Button>
    {open ? <div id={`${id}-editor`} className="space-y-3 rounded-lg border bg-muted/30 p-3" role="group" aria-label="Creazione rapida categoria">
      <div className="space-y-2"><label htmlFor={`${id}-name`} className="text-sm font-medium">Nome nuova categoria</label><Input id={`${id}-name`} autoFocus value={name} disabled={readOnly} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => { setName(event.target.value); setError(undefined); }} onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); create(); }
      }} /></div>
      <div className="space-y-2"><label htmlFor={`${id}-parent`} className="text-sm font-medium">Categoria principale</label><NativeSelect id={`${id}-parent`} className="w-full" value={parentId} disabled={readOnly} onChange={event => { setParentId(event.target.value); setError(undefined); }}>
        <NativeSelectOption value="">Nessuna — crea categoria principale</NativeSelectOption>
        {bankCategoryTree(categories).map(category => <NativeSelectOption key={category.id} value={category.id}>{category.name}</NativeSelectOption>)}
      </NativeSelect><p className="text-xs text-muted-foreground">Scegli un padre per creare una sottocategoria.</p></div>
      {error ? <Alert id={`${id}-error`} variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <p className="text-xs text-muted-foreground">La categoria viene creata subito e selezionata; conferma poi l’assegnazione nel dialogo.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={readOnly || !name.trim()} onClick={create}>Crea e seleziona</Button><Button type="button" variant="ghost" size="sm" onClick={close}>Annulla creazione</Button></div>
    </div> : null}
  </div>;
}
