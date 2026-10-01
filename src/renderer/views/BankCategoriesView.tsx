import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { bankCategoryDeletionBlocker, bankCategoryTree } from '../../domain/bank-expenses';
import { meta, nowIso, type BankExpenseCategory, type CashDocument } from '../../domain/model';
import type { AppState } from '../state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export function BankCategoriesView({ doc, appState }: { doc: CashDocument; appState: AppState }) {
  const [editing, setEditing] = useState<{ id?: string; parentId?: string; name: string }>();
  const [deleting, setDeleting] = useState<BankExpenseCategory>();
  const [error, setError] = useState<string>();
  const readOnly = appState.session?.readOnly || appState.status === 'Conflitto esterno';
  const tree = bankCategoryTree(doc.bankExpenseCategories);
  const openEditor = (value: NonNullable<typeof editing>) => { setError(undefined); setEditing(value); };
  const save = () => {
    if (!editing || readOnly) return;
    const name = editing.name.trim();
    if (!name) { setError('Inserisci un nome.'); return; }
    if (doc.bankExpenseCategories.some(category => category.id !== editing.id && category.parentId === editing.parentId && category.name.trim().toLocaleLowerCase('it') === name.toLocaleLowerCase('it'))) {
      setError('Esiste già una categoria con questo nome nello stesso livello.'); return;
    }
    appState.mutate(document => {
      if (editing.id) {
        const category = document.bankExpenseCategories.find(item => item.id === editing.id);
        if (category) { category.name = name; category.updatedAt = nowIso(); }
      } else document.bankExpenseCategories.push({ ...meta(), name, ...(editing.parentId ? { parentId: editing.parentId } : {}) });
    });
    setEditing(undefined);
  };
  const actions = (category: BankExpenseCategory) => {
    const blocker = bankCategoryDeletionBlocker(doc.bankExpenseCategories, doc.bankExpenses, category.id);
    return <div className="flex flex-wrap items-center gap-2">
      {!category.parentId ? <Button variant="outline" size="sm" disabled={readOnly} onClick={() => openEditor({ parentId: category.id, name: '' })}><Plus />Nuova sottocategoria</Button> : null}
      <Button variant="ghost" size="sm" aria-label={`Rinomina ${category.name}`} disabled={readOnly} onClick={() => openEditor(category)}><Pencil />Rinomina</Button>
      <Button variant="ghost" size="sm" aria-label={`Elimina ${category.name}`} disabled={readOnly || Boolean(blocker)} title={blocker} onClick={() => setDeleting(category)}><Trash2 />Elimina</Button>
      {blocker ? <span className="text-xs text-muted-foreground">{blocker}</span> : null}
    </div>;
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Categorie e sottocategorie condivise tra tutti gli anni.</p>
      <Button disabled={readOnly} onClick={() => openEditor({ name: '' })}><Plus />Nuova categoria</Button></div>
    {!tree.length ? <Card><CardContent className="py-12 text-center text-muted-foreground">Crea la prima categoria per organizzare le spese bancarie.</CardContent></Card> : null}
    {tree.map(category => <Card key={category.id}><CardHeader className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{category.name}</CardTitle>{actions(category)}</CardHeader>
      {category.children.length ? <CardContent className="space-y-2">{category.children.map(child => <div key={child.id} className="ml-4 flex flex-wrap items-center justify-between gap-3 border-l-2 py-2 pl-4"><div className="flex items-center gap-2"><span>{child.name}</span><Badge variant="outline">Sottocategoria</Badge></div>{actions(child)}</div>)}</CardContent> : null}
    </Card>)}
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open) setEditing(undefined); }}><DialogContent><form className="contents" onSubmit={event => { event.preventDefault(); save(); }}>
      <DialogHeader><DialogTitle>{editing?.id ? 'Rinomina' : editing?.parentId ? 'Nuova sottocategoria' : 'Nuova categoria'}</DialogTitle><DialogDescription>{editing?.parentId ? `Categoria principale: ${doc.bankExpenseCategories.find(item => item.id === editing.parentId)?.name}` : 'Il nome deve essere univoco tra le categorie principali.'}</DialogDescription></DialogHeader>
      <label htmlFor="bank-category-name" className="text-sm font-medium">Nome</label><Input id="bank-category-name" autoFocus required value={editing?.name ?? ''} onChange={event => { if (editing) setEditing({ ...editing, name: event.target.value }); }} />
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(undefined)}>Annulla</Button><Button type="submit" disabled={readOnly}>Salva</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(undefined); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>La categoria verrà rimossa dall’archivio.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={readOnly} onClick={() => {
      if (!deleting) return;
      const blocker = bankCategoryDeletionBlocker(doc.bankExpenseCategories, doc.bankExpenses, deleting.id);
      if (blocker) appState.setError({ code: 'VALIDATION', message: blocker });
      else appState.mutate(document => { document.bankExpenseCategories = document.bankExpenseCategories.filter(category => category.id !== deleting.id); });
      setDeleting(undefined);
    }}>Elimina</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
