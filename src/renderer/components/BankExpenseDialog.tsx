import { useState } from 'react';
import { automaticCategoryIds, bankCategoryLabel } from '../../domain/bank-expenses';
import { prepareBankExpense } from '../../domain/bank-expense-editing';
import type { BankExpense, CashDocument } from '../../domain/model';
import type { AppState } from '../state';
import { BankCategoryChecklist } from './BankCategoryChecklist';
import { BankQuickCategory } from './BankQuickCategory';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export function BankExpenseDialog({ expense, doc, appState, year, onClose, onSaved }: {
  expense?: BankExpense; doc: CashDocument; appState: AppState; year?: number; onClose(): void; onSaved(expense: BankExpense): void;
}) {
  const [date, setDate] = useState(() => {
    if (expense) return expense.date;
    const today = new Date();
    return year !== undefined && year !== today.getFullYear() ? `${year}-01-01`
      : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [description, setDescription] = useState(expense?.description ?? '');
  const [amount, setAmount] = useState(expense?.amount.replace('.', ',') ?? '');
  const [categoryIds, setCategoryIds] = useState(expense?.categoryIds ?? []);
  const [error, setError] = useState<string>();
  const readOnly = appState.session?.readOnly || appState.status === 'Conflitto esterno';
  const auto = automaticCategoryIds({ description }, doc.bankExpenseRules);
  const save = () => {
    if (readOnly || !appState.document) return;
    const prepared = prepareBankExpense(appState.document, { date, description, amount, categoryIds }, expense?.id);
    if (!prepared.ok) { setError(prepared.error.message); return; }
    const saved = appState.mutate(document => {
      if (expense) document.bankExpenses = document.bankExpenses.map(row => row.id === expense.id ? prepared.value : row);
      else document.bankExpenses.push(prepared.value);
    });
    if (saved) onSaved(prepared.value);
    else setError(appState.error?.message ?? 'La spesa non può essere salvata in questo momento.');
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
    <form className="contents" onSubmit={event => { event.preventDefault(); save(); }}>
      <DialogHeader><DialogTitle>{expense ? 'Modifica spesa' : 'Nuova spesa'}</DialogTitle><DialogDescription>Inserisci data, descrizione e importo positivo. Le categorie automatiche si aggiornano in base alla descrizione.</DialogDescription></DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><label htmlFor="bank-expense-date" className="text-sm font-medium">Data</label><Input id="bank-expense-date" type="date" required value={date} disabled={readOnly} onChange={event => setDate(event.target.value)} /></div>
        <div className="space-y-2"><label htmlFor="bank-expense-amount" className="text-sm font-medium">Importo (€)</label><Input id="bank-expense-amount" inputMode="decimal" placeholder="34,90" required value={amount} disabled={readOnly} onChange={event => setAmount(event.target.value)} /></div>
      </div>
      <div className="space-y-2"><label htmlFor="bank-expense-description" className="text-sm font-medium">Descrizione</label><Input id="bank-expense-description" autoFocus required value={description} disabled={readOnly} onChange={event => setDescription(event.target.value)} /></div>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Categorie manuali</legend><BankCategoryChecklist categories={doc.bankExpenseCategories} selected={categoryIds} disabled={readOnly} onChange={setCategoryIds} /></fieldset>
      <BankQuickCategory categories={doc.bankExpenseCategories} appState={appState} onCreated={id => setCategoryIds(current => [...current, id])} />
      <div className="space-y-2"><p className="text-sm font-medium">Categorie automatiche</p><div className="flex flex-wrap gap-1">{auto.map(id => <Badge key={id} variant="outline">{bankCategoryLabel(doc.bankExpenseCategories, id)} · Auto</Badge>)}{!auto.length ? <p className="text-sm text-muted-foreground">Nessuna regola corrispondente.</p> : null}</div></div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Annulla</Button><Button type="submit" disabled={readOnly}>Salva spesa</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
