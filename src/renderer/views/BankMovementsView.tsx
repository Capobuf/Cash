import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import {
  automaticCategoryIds,
  bankCategoryLabel,
  effectiveCategoryIds,
  filterBankExpenses,
  isBankExpenseExcluded,
} from '../../domain/bank-expenses';
import { deleteBankExpenses } from '../../domain/bank-expense-editing';
import { d, money } from '../../domain/decimal';
import {
  nowIso,
  type BankExpense,
  type CashDocument,
} from '../../domain/model';
import type { AppState } from '../state';
import { BankCategoryOptions } from '@/components/BankCategoryOptions';
import { BankManualCategoriesDialog } from '@/components/BankManualCategoriesDialog';
import { BankRuleDialog } from '@/components/BankRuleDialog';
import { BankExpenseDialog } from '@/components/BankExpenseDialog';
import { BankBulkCategoriesDialog } from '@/components/BankBulkCategoriesDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { dateIt, eur } from '@/lib/format';

type BankMovementsProps = {
  doc: CashDocument;
  appState: AppState;
  year: number | undefined;
};

export function BankMovementsView(props: BankMovementsProps) {
  return (
    <BankMovementsContent
      key={`${props.doc.documentId}:${props.appState.session?.path}:${props.year}`}
      {...props}
    />
  );
}

function BankMovementsContent({ doc, appState, year }: BankMovementsProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [uncategorized, setUncategorized] = useState(false);
  const [editing, setEditing] = useState<BankExpense>();
  const [ruleExpense, setRuleExpense] = useState<BankExpense>();
  const [expenseEditor, setExpenseEditor] = useState<{
    expense?: BankExpense;
  }>();
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkCategories, setBulkCategories] = useState<string[]>();
  const [deleting, setDeleting] = useState<BankExpense[]>();
  const [notice, setNotice] = useState<string>();
  const readOnly =
    appState.session?.readOnly || appState.status === 'Conflitto esterno';
  const rows = useMemo(
    () =>
      filterBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        year,
        query,
        category,
        uncategorized,
        doc.bankExpenseRules,
      ),
    [
      doc.bankExpenses,
      doc.bankExpenseCategories,
      doc.bankExpenseRules,
      year,
      query,
      category,
      uncategorized,
    ],
  );
  const summary = appState.bankExpenseImportSummary;
  const selectedSet = new Set(selected);
  const selectedRows = rows.filter((row) => selectedSet.has(row.id));
  const selectedIds = selectedRows.map((row) => row.id);
  const selectedTotal = money(
    selectedRows.reduce((sum, row) => sum.plus(row.amount), d(0)),
  );
  const clearSelection = () => setSelected([]);
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="min-w-52 flex-1 space-y-2">
            <label htmlFor="bank-search" className="text-sm font-medium">
              Cerca
            </label>
            <Input
              id="bank-search"
              type="search"
              placeholder="Cerca movimenti..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                clearSelection();
              }}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="bank-filter" className="text-sm font-medium">
              Filtro categoria
            </label>
            <NativeSelect
              id="bank-filter"
              value={uncategorized ? 'none' : category}
              disabled={uncategorized}
              onChange={(event) => {
                setCategory(event.target.value);
                clearSelection();
              }}
            >
              <NativeSelectOption value="all">Tutte</NativeSelectOption>
              <NativeSelectOption value="none">
                Senza categoria
              </NativeSelectOption>
              <BankCategoryOptions categories={doc.bankExpenseCategories} />
            </NativeSelect>
          </div>
          <label className="flex h-8 items-center gap-2 text-sm">
            <Checkbox
              checked={uncategorized}
              onCheckedChange={(value) => {
                setUncategorized(value === true);
                clearSelection();
              }}
            />
            Solo non categorizzati
          </label>
          <Button disabled={readOnly} onClick={() => setExpenseEditor({})}>
            <Plus />
            Nuova spesa
          </Button>
          <Button
            disabled={readOnly || appState.bankExpenseImporting}
            onClick={() => void appState.importBankExpenses()}
          >
            <Upload />
            {appState.bankExpenseImporting
              ? 'Importazione in corso…'
              : 'Importa XLSX / CSV'}
          </Button>
        </CardContent>
      </Card>
      {notice ? (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {summary ? (
        <Alert role="status">
          <AlertTitle>Importazione completata</AlertTitle>
          <AlertDescription>
            {summary.imported} movimenti importati · {summary.duplicates}{' '}
            duplicati già presenti · {summary.ignoredIncome} entrate ignorate.
            <span className="block">
              Il file viene importato per tutti gli anni. Qui sono visibili i
              movimenti del {year ?? 'periodo selezionato'}.
            </span>
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">
              Movimenti · {year ?? 'nessun anno disponibile'}
            </h2>
            <Badge variant="secondary">{rows.length} movimenti</Badge>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <span role="status" className="text-sm">
              {selectedRows.length} spese selezionate · {eur(selectedTotal)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={readOnly || !selectedRows.length}
              onClick={() => setBulkCategories(selectedIds)}
            >
              Modifica categorie selezionate
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={readOnly || !selectedRows.length}
              onClick={() => setDeleting(selectedRows)}
            >
              <Trash2 />
              Elimina selezionate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedRows.length}
              onClick={clearSelection}
            >
              Deseleziona
            </Button>
            <span className="text-xs text-muted-foreground">
              Seleziona tutte le spese visibili con la casella
              nell’intestazione. Cambiando filtri o anno la selezione si azzera.
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Checkbox
                    aria-label="Seleziona tutte le spese visibili"
                    disabled={readOnly || !rows.length}
                    checked={
                      rows.length > 0 && selectedRows.length === rows.length
                    }
                    indeterminate={
                      selectedRows.length > 0 &&
                      selectedRows.length < rows.length
                    }
                    onCheckedChange={(checked) =>
                      setSelected(checked ? rows.map((row) => row.id) : [])
                    }
                  />
                </TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrizione</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Categorie</TableHead>
                <TableHead>Conteggi</TableHead>
                <TableHead>Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((expense) => {
                const effective = effectiveCategoryIds(
                  expense,
                  doc.bankExpenseRules,
                );
                const auto = automaticCategoryIds(
                  expense,
                  doc.bankExpenseRules,
                );
                const excluded = isBankExpenseExcluded(
                  expense,
                  doc.bankExpenseCategories,
                  doc.bankExpenseRules,
                );
                return (
                  <TableRow
                    key={expense.id}
                    data-state={
                      selectedSet.has(expense.id) ? 'selected' : undefined
                    }
                  >
                    <TableCell>
                      <Checkbox
                        aria-label={`Seleziona ${expense.description} del ${dateIt(expense.date)}`}
                        disabled={readOnly}
                        checked={selectedSet.has(expense.id)}
                        onCheckedChange={(checked) =>
                          setSelected((current) =>
                            checked
                              ? [...new Set([...current, expense.id])]
                              : current.filter((id) => id !== expense.id),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {dateIt(expense.date)}
                    </TableCell>
                    <TableCell className="min-w-56 max-w-xl whitespace-normal break-words">
                      {expense.description}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {eur(expense.amount)}
                    </TableCell>
                    <TableCell className="min-w-56 whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {effective.map((id) => (
                          <Badge
                            key={id}
                            variant={
                              expense.categoryIds.includes(id)
                                ? 'secondary'
                                : 'outline'
                            }
                            className="whitespace-normal"
                          >
                            {bankCategoryLabel(doc.bankExpenseCategories, id)}
                            <span className="text-muted-foreground">
                              {auto.includes(id)
                                ? expense.categoryIds.includes(id)
                                  ? 'Manuale · Auto'
                                  : 'Auto'
                                : 'Manuale'}
                            </span>
                          </Badge>
                        ))}
                        {!effective.length ? (
                          <span className="text-sm text-muted-foreground">
                            Senza categoria
                          </span>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={readOnly}
                        aria-label={`Modifica categorie per ${expense.description} del ${dateIt(expense.date)}`}
                        onClick={() => setEditing(expense)}
                      >
                        Modifica categorie
                      </Button>
                    </TableCell>
                    <TableCell className="min-w-44 whitespace-normal">
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            aria-label={`Ignora nei conteggi ${expense.description} del ${dateIt(expense.date)}`}
                            checked={Boolean(expense.excludedFromCalculations)}
                            disabled={readOnly}
                            onCheckedChange={(checked) => {
                              appState.mutate((document) => {
                                const row = document.bankExpenses.find(
                                  (item) => item.id === expense.id,
                                );
                                if (!row) return;
                                row.excludedFromCalculations = checked === true;
                                row.updatedAt = nowIso();
                              });
                            }}
                          />
                          Ignora nei conteggi
                        </label>
                        <Badge variant={excluded ? 'secondary' : 'outline'}>
                          {excluded
                            ? 'Esclusa dai conteggi'
                            : 'Inclusa nei conteggi'}
                        </Badge>
                        {excluded && !expense.excludedFromCalculations ? (
                          <p className="text-xs text-muted-foreground">
                            Esclusione derivata dalla categoria.
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={readOnly}
                          aria-label={`Modifica spesa ${expense.description} del ${dateIt(expense.date)}`}
                          onClick={() => setExpenseEditor({ expense })}
                        >
                          <Pencil />
                          Modifica
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={readOnly}
                          aria-label={`Elimina spesa ${expense.description} del ${dateIt(expense.date)}`}
                          onClick={() => setDeleting([expense])}
                        >
                          <Trash2 />
                          Elimina
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={readOnly}
                          onClick={() => setRuleExpense(expense)}
                        >
                          Crea regola
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!rows.length ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    {doc.bankExpenses.length
                      ? 'Nessun movimento corrisponde all’anno e ai filtri selezionati.'
                      : 'Crea una spesa oppure importa un file XLSX o CSV della banca per iniziare.'}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {editing ? (
        <BankManualCategoriesDialog
          expense={editing}
          doc={doc}
          appState={appState}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {ruleExpense ? (
        <BankRuleDialog
          doc={doc}
          appState={appState}
          description={ruleExpense.description}
          onClose={() => setRuleExpense(undefined)}
        />
      ) : null}
      {expenseEditor ? (
        <BankExpenseDialog
          expense={expenseEditor.expense}
          doc={doc}
          appState={appState}
          year={year}
          onClose={() => setExpenseEditor(undefined)}
          onSaved={(expense) => {
            setExpenseEditor(undefined);
            clearSelection();
            setNotice(
              `Spesa salvata (${expense.date.slice(0, 4)}). ${Number(expense.date.slice(0, 4)) !== year ? 'Seleziona l’anno della spesa per visualizzarla.' : 'Se non compare nella lista, controlla i filtri attivi.'}`,
            );
          }}
        />
      ) : null}
      {bulkCategories ? (
        <BankBulkCategoriesDialog
          expenseIds={bulkCategories}
          doc={doc}
          appState={appState}
          onClose={() => setBulkCategories(undefined)}
          onSaved={() => {
            setNotice(
              `Categorie manuali aggiornate per ${bulkCategories.length} spese.`,
            );
            setBulkCategories(undefined);
            clearSelection();
          }}
        />
      ) : null}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.length === 1
                ? 'Eliminare questa spesa?'
                : `Eliminare ${deleting?.length ?? 0} spese?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Le spese saranno rimosse dall’archivio. Le categorie e le regole
              restano disponibili. Una successiva importazione dello stesso file
              può inserire nuovamente le spese eliminate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-48 space-y-2 overflow-y-auto text-sm">
            {deleting?.map((expense) => (
              <p key={expense.id}>
                {dateIt(expense.date)} · {expense.description} ·{' '}
                {eur(expense.amount)}
              </p>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={readOnly}
              onClick={() => {
                if (!deleting || readOnly) return;
                const saved = appState.mutate((document) =>
                  deleteBankExpenses(
                    document,
                    deleting.map((expense) => expense.id),
                  ),
                );
                if (saved) {
                  setNotice(
                    `${deleting.length} ${deleting.length === 1 ? 'spesa eliminata' : 'spese eliminate'}.`,
                  );
                  clearSelection();
                  setDeleting(undefined);
                }
              }}
            >
              Conferma eliminazione
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
