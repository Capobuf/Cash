import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Info, Maximize2, Minimize2 } from 'lucide-react';
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';
import { DataTable } from '@/components/ui/data-table';
import { eur, formatNumber } from '@/lib/format';
import { ExpenseCategoryChart } from '@/components/ExpenseCategoryChart';

type CategoryRow = ReturnType<
  typeof summarizeBankExpenses
>['categories'][number]['children'][number] & {
  child?: boolean;
  children?: CategoryRow[];
};

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
const config = { amount: { label: 'Spese', color: 'var(--muted-foreground)' } };

export function BankSummaryView({
  doc,
  year,
}: {
  doc: CashDocument;
  year: number | undefined;
}) {
  const flowHelpId = useId();
  const categoriesHelpId = useId();
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
            Inclusi nei conteggi
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
          Nessuna spesa inclusa nei conteggi nell’anno selezionato. Puoi gestire
          le esclusioni o importare un file XLSX o CSV dalla pagina Movimenti.
        </p>
      ) : null}
      <Card
        ref={flowCard}
        className={`min-w-0 ${fullscreen ? 'h-screen w-screen rounded-none' : ''}`}
      >
        <CardHeader>
          <CardTitle>Flusso delle spese · {year ?? 'nessun anno'}</CardTitle>
          <CardAction>
            <Tooltip>
              <TooltipTrigger
                aria-describedby={flowHelpId}
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Come leggere il flusso delle spese"
                  />
                }
              >
                <Info aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent id={flowHelpId} role="tooltip">
                Ogni spesa è conteggiata una sola volta. Le spese assegnate a
                più categorie confluiscono nel ramo “Più categorie”. Sono
                incluse le categorie automatiche.
              </TooltipContent>
            </Tooltip>
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
            Uscite → categorie → sottocategorie · conteggio unico
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
                  isAnimationActive="auto"
                  animationDuration={220}
                  animationBegin={0}
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
          description="Sottocategorie incluse. Totali sovrapposti, non sommabili."
          rows={categories}
          empty="Nessuna spesa da rappresentare"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Riepilogo categorie</CardTitle>
          <CardAction>
            <Tooltip>
              <TooltipTrigger
                aria-describedby={categoriesHelpId}
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Perché i totali delle categorie non sono sommabili"
                  />
                }
              >
                <Info aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent id={categoriesHelpId} role="tooltip">
                Ogni spesa compare in tutte le categorie assegnate, a differenza
                del flusso a conteggio unico. Le sottocategorie sono già incluse
                nel totale del padre. Le percentuali possono complessivamente
                superare il 100%.
              </TooltipContent>
            </Tooltip>
          </CardAction>
          <CardDescription>
            Totali non sommabili tra categorie. Sottocategorie già incluse.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable<CategoryRow>
            preferencesKey="bank-category-summary"
            longTableThreshold={Infinity}
            data={[
              ...summary.categories.map((category) => ({
                ...category,
                children: category.children.map((child) => ({
                  ...child,
                  child: true,
                })),
              })),
              {
                id: 'uncategorized',
                name: 'Senza categoria',
                ...summary.uncategorized,
              },
            ]}
            getSubRows={(row) => row.children ?? []}
            getRowClassName={(row) =>
              row.child
                ? 'text-muted-foreground'
                : row.children
                  ? 'font-medium'
                  : undefined
            }
            getRowKey={(row) => row.id}
            emptyMessage="Nessuna categoria."
            columns={[
              {
                id: 'name',
                header: 'Categoria',
                value: (row) => row.name,
                cell: (row) => (
                  <span className={row.child ? 'pl-6' : undefined}>
                    {row.name}
                  </span>
                ),
              },
              {
                id: 'count',
                header: 'Movimenti',
                value: (row) => row.count,
                className: 'text-right',
                headClassName: 'text-right',
              },
              {
                id: 'amount',
                header: 'Importo',
                value: (row) => Number(row.amount),
                cell: (row) => eur(row.amount),
                className: 'text-right tabular-nums',
                headClassName: 'text-right',
              },
              {
                id: 'percentage',
                header: '% totale',
                value: (row) => Number(row.percentage),
                cell: (row) => <>{formatNumber(row.percentage, 1)}%</>,
                className: 'text-right',
                headClassName: 'text-right',
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
