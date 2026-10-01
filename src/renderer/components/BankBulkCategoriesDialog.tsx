import { useState } from 'react';
import { changeBankManualCategories, type BankCategoryAction } from '../../domain/bank-expense-editing';
import type { CashDocument } from '../../domain/model';
import type { AppState } from '../state';
import { BankCategoryChecklist } from './BankCategoryChecklist';
import { BankQuickCategory } from './BankQuickCategory';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

export function BankBulkCategoriesDialog({ expenseIds, doc, appState, onClose, onSaved }: {
  expenseIds: string[]; doc: CashDocument; appState: AppState; onClose(): void; onSaved(): void;
}) {
  const [action, setAction] = useState<BankCategoryAction>('add');
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const readOnly = appState.session?.readOnly || appState.status === 'Conflitto esterno';
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
    <DialogHeader><DialogTitle>Categorie di {expenseIds.length} spese</DialogTitle><DialogDescription>Applica un’unica operazione alle spese selezionate. Le categorie automatiche restano determinate dalle regole.</DialogDescription></DialogHeader>
    <div className="space-y-2"><label htmlFor="bank-bulk-action" className="text-sm font-medium">Operazione</label><NativeSelect id="bank-bulk-action" value={action} disabled={readOnly} onChange={event => setAction(event.target.value as BankCategoryAction)}>
      <NativeSelectOption value="add">Aggiungi categorie manuali</NativeSelectOption><NativeSelectOption value="remove">Rimuovi categorie manuali</NativeSelectOption><NativeSelectOption value="replace">Sostituisci categorie manuali</NativeSelectOption><NativeSelectOption value="clear">Rimuovi tutte le categorie manuali</NativeSelectOption>
    </NativeSelect></div>
    {action !== 'clear' ? <BankCategoryChecklist categories={doc.bankExpenseCategories} selected={categories} disabled={readOnly} onChange={setCategories} /> : null}
    {action === 'add' || action === 'replace' ? <BankQuickCategory categories={doc.bankExpenseCategories} appState={appState} onCreated={id => setCategories(current => [...current, id])} /> : null}
    {action === 'replace' || action === 'clear' ? <p className="text-sm text-muted-foreground">{action === 'replace' ? 'Le categorie manuali esistenti saranno sostituite con quelle selezionate.' : 'Tutte le assegnazioni manuali saranno rimosse dalle spese selezionate.'}</p> : null}
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <DialogFooter><Button variant="outline" onClick={onClose}>Annulla</Button><Button disabled={readOnly || (action !== 'clear' && !categories.length)} onClick={() => {
      if (readOnly || (action !== 'clear' && !categories.length)) return;
      const saved = appState.mutate(document => changeBankManualCategories(document, expenseIds, categories, action));
      if (saved) onSaved();
      else setError(appState.error?.message ?? 'Le categorie non possono essere salvate in questo momento.');
    }}>Applica a {expenseIds.length} spese</Button></DialogFooter>
  </DialogContent></Dialog>;
}
