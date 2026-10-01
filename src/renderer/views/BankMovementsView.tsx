import { useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { filterBankExpenses } from '../../domain/bank-expenses';
import { nowIso, type CashDocument } from '../../domain/model';
import type { AppState } from '../state';
import { BankCategoryOptions } from '@/components/BankCategoryOptions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dateIt, eur } from '@/lib/format';

export function BankMovementsView({ doc, appState, year }: { doc: CashDocument; appState: AppState; year: number | undefined }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [uncategorized, setUncategorized] = useState(false);
  const readOnly = appState.session?.readOnly || appState.status === 'Conflitto esterno';
  const rows = useMemo(() => filterBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, year, query, category, uncategorized),
    [doc.bankExpenses, doc.bankExpenseCategories, year, query, category, uncategorized]);
  const summary = appState.bankExpenseImportSummary;
  return <div className="space-y-5">
    <Card><CardContent className="flex flex-wrap items-end gap-4">
      <div className="min-w-52 flex-1 space-y-2"><label htmlFor="bank-search" className="text-sm font-medium">Cerca</label>
        <Input id="bank-search" placeholder="Cerca nella descrizione" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="space-y-2"><label htmlFor="bank-filter" className="text-sm font-medium">Filtro categoria</label>
        <NativeSelect id="bank-filter" value={uncategorized ? 'none' : category} disabled={uncategorized} onChange={event => setCategory(event.target.value)}>
          <NativeSelectOption value="all">Tutte</NativeSelectOption><NativeSelectOption value="none">Senza categoria</NativeSelectOption>
          <BankCategoryOptions categories={doc.bankExpenseCategories} />
        </NativeSelect></div>
      <label className="flex h-8 items-center gap-2 text-sm"><Checkbox checked={uncategorized} onCheckedChange={value => setUncategorized(value === true)} />Solo non categorizzati</label>
      <Button disabled={readOnly || appState.bankExpenseImporting} onClick={() => void appState.importBankExpenses()}><Upload />{appState.bankExpenseImporting ? 'Importazione in corso…' : 'Importa XLSX'}</Button>
    </CardContent></Card>
    {summary ? <Alert role="status"><AlertTitle>Importazione completata</AlertTitle><AlertDescription>
      {summary.imported} movimenti importati · {summary.duplicates} duplicati già presenti · {summary.ignoredIncome} entrate ignorate.
      <span className="block">Il file viene importato per tutti gli anni. Qui sono visibili i movimenti del {year ?? 'periodo selezionato'}.</span>
    </AlertDescription></Alert> : null}
    <Card><CardContent>
      <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Movimenti · {year ?? 'nessun anno disponibile'}</h2><Badge variant="secondary">{rows.length} movimenti</Badge></div>
      <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrizione</TableHead><TableHead className="text-right">Importo</TableHead><TableHead>Categoria</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(expense => <TableRow key={expense.id}>
          <TableCell className="whitespace-nowrap">{dateIt(expense.date)}</TableCell>
          <TableCell className="min-w-56 max-w-xl whitespace-normal break-words">{expense.description}</TableCell>
          <TableCell className="text-right tabular-nums">{eur(expense.amount)}</TableCell>
          <TableCell><NativeSelect className="w-full min-w-48" aria-label={`Categoria per ${expense.description} del ${dateIt(expense.date)}`} value={expense.categoryId ?? ''} disabled={readOnly}
            onChange={event => { const categoryId = event.target.value || undefined; appState.mutate(document => {
              const row = document.bankExpenses.find(item => item.id === expense.id);
              if (row) { row.categoryId = categoryId; row.updatedAt = nowIso(); }
            }); }}>
            <NativeSelectOption value="">Senza categoria</NativeSelectOption><BankCategoryOptions categories={doc.bankExpenseCategories} />
          </NativeSelect></TableCell>
        </TableRow>)}{!rows.length ? <TableRow><TableCell colSpan={4} className="py-12 text-center text-muted-foreground">{doc.bankExpenses.length ? 'Nessun movimento corrisponde all’anno e ai filtri selezionati.' : 'Importa un XLSX della banca per iniziare a classificare le spese.'}</TableCell></TableRow> : null}</TableBody>
      </Table>
    </CardContent></Card>
  </div>;
}
