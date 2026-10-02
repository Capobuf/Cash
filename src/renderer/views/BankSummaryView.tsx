import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { buildBankExpenseFlow } from '../../domain/bank-expense-flow';
import { MoneyFlowChart } from '@/components/MoneyFlowChart';
import { summarizeBankExpenses } from '../../domain/bank-expenses';
import type { CashDocument } from '../../domain/model';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { eur, formatNumber } from '@/lib/format';
import { ExpenseCategoryChart } from '@/components/ExpenseCategoryChart';

const months = [
  'Gen',
  'Feb',
  'Mar',
  'Apr',
  'Mag',
  'Giu',
  'Lug',
  'Ago',
  'Set',
  'Ott',
  'Nov',
  'Dic',
];
const config = { amount: { label: 'Spese', color: 'var(--chart-1)' } };

export function BankSummaryView({
  doc,
  year,
}: {
  doc: CashDocument;
  year: number | undefined;
}) {
  const summary = useMemo(
    () =>
      summarizeBankExpenses(
        doc.bankExpenses,
        doc.bankExpenseCategories,
        year,
        doc.bankExpenseRules,
      ),
    [doc.bankExpenses, doc.bankExpenseCategories, doc.bankExpenseRules, year],
  );
  const monthly = summary.monthly.map((row) => ({
    name: months[row.month - 1],
    amount: Number(row.amount),
  }));
  const categories = [
    ...summary.categories
      .filter((row) => row.count)
      .map((row) => ({ key: row.id, name: row.name, amount: row.amount })),
    ...(summary.uncategorized.count
      ? [
          {
            key: 'uncategorized',
            name: 'Senza categoria',
            amount: summary.uncategorized.amount,
          },
        ]
      : []),
  ];
  const flow = useMemo(() => buildBankExpenseFlow(doc, year), [doc, year]);
  const leafCount = flow.nodes.filter(
    (_, index) => !flow.links.some((link) => link.source === index),
  ).length;
  const flowCard = useRef<HTMLDivElement>(null);
  const flowContent = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenHeight, setFullscreenHeight] = useState(720);
  const [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const sync = () =>
      setFullscreen(document.fullscreenElement === flowCard.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  useEffect(() => {
    if (!fullscreen || !flowContent.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setFullscreenHeight(Math.max(1, Math.floor(entry.contentRect.height)));
    });
    observer.observe(flowContent.current);
    return () => observer.disconnect();
  }, [fullscreen]);
  const toggleFullscreen = async () => {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === flowCard.current)
        await document.exitFullscreen();
      else await flowCard.current?.requestFullscreen();
    } catch {
      setFullscreenError(
        'Impossibile attivare la modalità a pieno schermo. Riprova.',
      );
    }
  };
  const flowHeight = fullscreen ? fullscreenHeight : 720;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Totale spese</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {eur(summary.total)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Uscite dal conto · {year ?? 'nessun anno'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Movimenti</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary.count}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Spese importate nell’anno
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Categorizzato</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {eur(summary.categorized.amount)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {formatNumber(summary.categorized.percentage, 1)}% del totale
            </p>
            <Progress
              aria-label="Percentuale spese categorizzate"
              value={Number(summary.categorized.percentage)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Senza categoria</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {eur(summary.uncategorized.amount)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {summary.uncategorized.count}{' '}
            {summary.uncategorized.count === 1 ? 'movimento' : 'movimenti'} da
            classificare
          </CardContent>
        </Card>
      </div>
      {!summary.count ? (
        <p className="text-sm text-muted-foreground">
          Nessuna spesa nell’anno selezionato. Puoi importare un file XLSX o CSV
          dalla pagina Movimenti.
        </p>
      ) : null}
      <Card
        ref={flowCard}
        className={`min-w-0 ${fullscreen ? 'h-screen w-screen rounded-none' : ''}`}
      >
        <CardHeader>
          <CardTitle>Flusso delle spese · {year ?? 'nessun anno'}</CardTitle>
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={
                fullscreen ? 'Esci da pieno schermo' : 'Apri a pieno schermo'
              }
              title={
                fullscreen
                  ? 'Esci da pieno schermo (Esc)'
                  : 'Apri a pieno schermo'
              }
              aria-pressed={fullscreen}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </CardAction>
          <CardDescription>
            Totale delle uscite → categorie principali → sottocategorie. Ogni
            spesa è conteggiata una sola volta; quelle assegnate a più categorie
            sono raggruppate nel ramo “Più categorie”. Sono incluse le categorie
            automatiche.
          </CardDescription>
          {fullscreenError ? (
            <p role="alert" className="text-sm text-destructive">
              {fullscreenError}
            </p>
          ) : null}
        </CardHeader>
        <CardContent
          ref={flowContent}
          className={fullscreen ? 'min-h-0 flex-1' : undefined}
        >
          {flow.links.length ? (
            <MoneyFlowChart
              flow={flow}
              height={flowHeight}
              layoutHeight={Math.max(flowHeight, leafCount * 64 + 48)}
              minWidth={720}
              nodePadding={32}
              label="Ripartizione delle spese annuali per categoria e sottocategoria, senza duplicazioni"
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessuna spesa da rappresentare nell’anno selezionato.
            </p>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spese mensili</CardTitle>
            <CardDescription>
              Da gennaio a dicembre · data valuta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={config} className="h-72 w-full">
              <BarChart accessibilityLayer data={monthly}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={72} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => eur(String(value))}
                    />
                  }
                />
                <Bar
                  dataKey="amount"
                  fill="var(--color-amount)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <ExpenseCategoryChart
          title="Spese per categoria"
          description="Totali delle categorie principali, incluse le sottocategorie. Le fette rappresentano il peso relativo degli importi per categoria, che possono sovrapporsi."
          rows={categories}
          empty="Nessuna spesa da rappresentare"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Riepilogo categorie</CardTitle>
          <CardDescription>
            Le sottocategorie sono già comprese nel totale del padre. In questa
            tabella ogni spesa compare in tutte le categorie assegnate: i totali
            non sono sommabili tra loro e le percentuali possono
            complessivamente superare il 100%.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Movimenti</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead className="text-right">% totale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.categories.map((category) => (
                <Fragment key={category.id}>
                  <TableRow className="font-medium">
                    <TableCell>{category.name}</TableCell>
                    <TableCell className="text-right">
                      {category.count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {eur(category.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(category.percentage, 1)}%
                    </TableCell>
                  </TableRow>
                  {category.children.map((child) => (
                    <TableRow key={child.id} className="text-muted-foreground">
                      <TableCell className="pl-8">{child.name}</TableCell>
                      <TableCell className="text-right">
                        {child.count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {eur(child.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(child.percentage, 1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
              <TableRow>
                <TableCell>Senza categoria</TableCell>
                <TableCell className="text-right">
                  {summary.uncategorized.count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {eur(summary.uncategorized.amount)}
                </TableCell>
                <TableCell className="text-right">
                  {formatNumber(summary.uncategorized.percentage, 1)}%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
