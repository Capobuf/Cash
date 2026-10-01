import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { bankCategoryDeletionBlocker, bankCategoryLabel, bankCategoryTree, bankRuleMatches } from '../../domain/bank-expenses';
import { meta, nowIso, type BankExpenseCategory, type BankExpenseRule, type CashDocument } from '../../domain/model';
import type { AppState } from '../state';
import { BankRuleDialog } from '@/components/BankRuleDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function BankCategoriesView({ doc, appState }: { doc: CashDocument; appState: AppState }) {
  const [editing, setEditing] = useState<{ id?: string; parentId?: string; name: string }>();
  const [deleting, setDeleting] = useState<BankExpenseCategory>();
  const [error, setError] = useState<string>();
  const [ruleEditor, setRuleEditor] = useState<{ rule?: BankExpenseRule }>();
  const [deletingRule, setDeletingRule] = useState<BankExpenseRule>();
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
    const blocker = bankCategoryDeletionBlocker(doc.bankExpenseCategories, doc.bankExpenses, category.id, doc.bankExpenseRules);
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
    <Card><CardHeader className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Regole automatiche</CardTitle><Button disabled={readOnly} onClick={() => setRuleEditor({})}><Plus />Nuova regola</Button></CardHeader><CardContent>
      <p className="mb-4 text-sm text-muted-foreground">Le regole sono additive e si applicano alle spese di tutti gli anni. Modificarle o eliminarle aggiorna subito le categorie automatiche; le assegnazioni manuali restano intatte.</p>
      <Table><TableHeader><TableRow><TableHead>Testo riconosciuto</TableHead><TableHead>Categoria</TableHead><TableHead className="text-right">Corrispondenze</TableHead><TableHead>Azioni</TableHead></TableRow></TableHeader><TableBody>
        {doc.bankExpenseRules.map(rule => <TableRow key={rule.id}><TableCell className="whitespace-normal break-words">{rule.matchText}</TableCell><TableCell>{bankCategoryLabel(doc.bankExpenseCategories, rule.categoryId)}</TableCell><TableCell className="text-right">{doc.bankExpenses.filter(expense => bankRuleMatches(expense.description, rule.matchText)).length}</TableCell><TableCell><div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={readOnly} aria-label={`Modifica regola ${rule.matchText}`} onClick={() => setRuleEditor({ rule })}><Pencil />Modifica</Button>
          <Button variant="ghost" size="sm" disabled={readOnly} aria-label={`Elimina regola ${rule.matchText}`} onClick={() => setDeletingRule(rule)}><Trash2 />Elimina</Button>
        </div></TableCell></TableRow>)}
        {!doc.bankExpenseRules.length ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nessuna regola automatica. Puoi crearne una anche dalla lista Movimenti.</TableCell></TableRow> : null}
      </TableBody></Table>
    </CardContent></Card>
    {ruleEditor ? <BankRuleDialog doc={doc} appState={appState} rule={ruleEditor.rule} onClose={() => setRuleEditor(undefined)} /> : null}
    <AlertDialog open={Boolean(deletingRule)} onOpenChange={open => { if (!open) setDeletingRule(undefined); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare la regola «{deletingRule?.matchText}»?</AlertDialogTitle><AlertDialogDescription>La regola smetterà di applicare la categoria a tutte le spese. Le categorie manuali resteranno intatte.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={readOnly} onClick={() => {
      if (!deletingRule || readOnly) return;
      appState.mutate(document => { document.bankExpenseRules = document.bankExpenseRules.filter(rule => rule.id !== deletingRule.id); });
      setDeletingRule(undefined);
    }}>Elimina regola</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open) setEditing(undefined); }}><DialogContent><form className="contents" onSubmit={event => { event.preventDefault(); save(); }}>
      <DialogHeader><DialogTitle>{editing?.id ? 'Rinomina' : editing?.parentId ? 'Nuova sottocategoria' : 'Nuova categoria'}</DialogTitle><DialogDescription>{editing?.parentId ? `Categoria principale: ${doc.bankExpenseCategories.find(item => item.id === editing.parentId)?.name}` : 'Il nome deve essere univoco tra le categorie principali.'}</DialogDescription></DialogHeader>
      <label htmlFor="bank-category-name" className="text-sm font-medium">Nome</label><Input id="bank-category-name" autoFocus required value={editing?.name ?? ''} onChange={event => { if (editing) setEditing({ ...editing, name: event.target.value }); }} />
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(undefined)}>Annulla</Button><Button type="submit" disabled={readOnly}>Salva</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(undefined); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>La categoria verrà rimossa dall’archivio.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={readOnly} onClick={() => {
      if (!deleting) return;
      const blocker = bankCategoryDeletionBlocker(doc.bankExpenseCategories, doc.bankExpenses, deleting.id, doc.bankExpenseRules);
      if (blocker) appState.setError({ code: 'VALIDATION', message: blocker });
      else appState.mutate(document => { document.bankExpenseCategories = document.bankExpenseCategories.filter(category => category.id !== deleting.id); });
      setDeleting(undefined);
    }}>Elimina</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
