import { Fragment, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { summarizeBankExpenses } from '../../domain/bank-expenses';
import type { CashDocument } from '../../domain/model';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { eur, formatNumber } from '@/lib/format';

const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const config = { amount: { label: 'Spese', color: 'var(--chart-1)' } };

export function BankSummaryView({ doc, year }: { doc: CashDocument; year: number | undefined }) {
  const summary = useMemo(() => summarizeBankExpenses(doc.bankExpenses, doc.bankExpenseCategories, year), [doc.bankExpenses, doc.bankExpenseCategories, year]);
  const monthly = summary.monthly.map(row => ({ name: months[row.month - 1], amount: Number(row.amount) }));
  const categories = [...summary.categories.filter(row => row.count).map(row => ({ name: row.name, amount: Number(row.amount) })),
    ...(summary.uncategorized.count ? [{ name: 'Senza categoria', amount: Number(summary.uncategorized.amount) }] : [])];
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CardHeader><CardDescription>Totale spese</CardDescription><CardTitle className="text-2xl tabular-nums">{eur(summary.total)}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Uscite bancarie · {year ?? 'nessun anno'}</CardContent></Card>
      <Card><CardHeader><CardDescription>Movimenti</CardDescription><CardTitle className="text-2xl tabular-nums">{summary.count}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Spese importate nell’anno</CardContent></Card>
      <Card><CardHeader><CardDescription>Categorizzato</CardDescription><CardTitle className="text-2xl tabular-nums">{eur(summary.categorized.amount)}</CardTitle></CardHeader><CardContent className="space-y-2"><p className="text-sm text-muted-foreground">{formatNumber(summary.categorized.percentage, 1)}% del totale</p><Progress aria-label="Percentuale spese categorizzate" value={Number(summary.categorized.percentage)} /></CardContent></Card>
      <Card><CardHeader><CardDescription>Senza categoria</CardDescription><CardTitle className="text-2xl tabular-nums">{eur(summary.uncategorized.amount)}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{summary.uncategorized.count} {summary.uncategorized.count === 1 ? 'movimento' : 'movimenti'} da classificare</CardContent></Card>
    </div>
    {!summary.count ? <p className="text-sm text-muted-foreground">Nessuna spesa nell’anno selezionato. Puoi importare un XLSX dalla pagina Movimenti.</p> : null}
    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Spese mensili</CardTitle><CardDescription>Da gennaio a dicembre · data valuta</CardDescription></CardHeader><CardContent>
        <ChartContainer config={config} className="h-72 w-full"><BarChart accessibilityLayer data={monthly}><CartesianGrid vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} width={72} /><ChartTooltip content={<ChartTooltipContent formatter={value => eur(String(value))} />} /><Bar dataKey="amount" fill="var(--color-amount)" radius={[4, 4, 0, 0]} /></BarChart></ChartContainer>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Spese per categoria</CardTitle><CardDescription>Totali delle categorie principali, incluse le sottocategorie</CardDescription></CardHeader><CardContent>
        {categories.length ? <ChartContainer config={config} className="w-full" style={{ height: Math.max(288, categories.length * 40) }}><BarChart accessibilityLayer layout="vertical" data={categories}><CartesianGrid horizontal={false} /><XAxis type="number" tickLine={false} axisLine={false} /><YAxis type="category" dataKey="name" width={130} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent formatter={value => eur(String(value))} />} /><Bar dataKey="amount" fill="var(--color-amount)" radius={[0, 4, 4, 0]} /></BarChart></ChartContainer> : <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">Nessuna spesa da rappresentare</p>}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Riepilogo categorie</CardTitle><CardDescription>Le sottocategorie sono già comprese nel totale del padre.</CardDescription></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead className="text-right">Movimenti</TableHead><TableHead className="text-right">Importo</TableHead><TableHead className="text-right">% totale</TableHead></TableRow></TableHeader><TableBody>
        {summary.categories.map(category => <Fragment key={category.id}><TableRow className="font-medium"><TableCell>{category.name}</TableCell><TableCell className="text-right">{category.count}</TableCell><TableCell className="text-right tabular-nums">{eur(category.amount)}</TableCell><TableCell className="text-right">{formatNumber(category.percentage, 1)}%</TableCell></TableRow>
          {category.children.map(child => <TableRow key={child.id} className="text-muted-foreground"><TableCell className="pl-8">{child.name}</TableCell><TableCell className="text-right">{child.count}</TableCell><TableCell className="text-right tabular-nums">{eur(child.amount)}</TableCell><TableCell className="text-right">{formatNumber(child.percentage, 1)}%</TableCell></TableRow>)}
        </Fragment>)}
        <TableRow><TableCell>Senza categoria</TableCell><TableCell className="text-right">{summary.uncategorized.count}</TableCell><TableCell className="text-right tabular-nums">{eur(summary.uncategorized.amount)}</TableCell><TableCell className="text-right">{formatNumber(summary.uncategorized.percentage, 1)}%</TableCell></TableRow>
      </TableBody></Table>
    </CardContent></Card>
  </div>;
}
