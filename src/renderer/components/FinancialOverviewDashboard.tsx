import {
  Children,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  CircleAlert,
  Clock3,
  Landmark,
  Maximize2,
  Minimize2,
  ReceiptText,
  Scale,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildFinancialOverviewFlow,
  type FinancialOverview,
} from '../../domain/financial-overview';
import { d } from '../../domain/decimal';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { DataTable } from '@/components/ui/data-table';
import { FinancialCharts } from '@/components/FinancialDashboard';
import { eur, formatNumber } from '@/lib/format';
import { FiscalCorrectionDialog } from './FiscalCorrectionDialog';
import { MoneyFlowChart } from './MoneyFlowChart';

interface FiscalCorrectionControls {
  onFiscalCorrection?: (total: string | undefined) => boolean;
  correctionDisabled?: boolean;
}

const amount = (value?: string) =>
  value === undefined ? 'Non disponibile' : eur(value);
const percentage = (value: string) => `${formatNumber(value, 2)}%`;
const compactEuro = (value: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(value);
const shortMonths = [
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
const months = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];
const monthlyConfig = {
  collected: { label: 'Incassato', color: 'var(--chart-1)' },
  bank: { label: 'Uscite dal conto', color: 'var(--muted-foreground)' },
  margin: { label: 'Margine dopo le uscite', color: 'var(--foreground)' },
} satisfies ChartConfig;

function Kpi({
  title,
  icon: Icon,
  help,
  value,
  action,
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  help?: string;
  value?: string;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const helpId = useId();
  const content = Children.toArray(children);
  return (
    <Card className={`h-full min-w-0 gap-3 ${className ?? ''}`}>
      <CardHeader className="gap-2">
        <div className="flex min-h-10 items-center justify-between gap-3">
          <CardDescription className="text-sm leading-5 font-medium text-foreground">
            {help ? (
              <Tooltip>
                <TooltipTrigger
                  aria-describedby={helpId}
                  className="cursor-help rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  {title}
                </TooltipTrigger>
                <TooltipContent id={helpId} role="tooltip">
                  {help}
                </TooltipContent>
              </Tooltip>
            ) : (
              title
            )}
          </CardDescription>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
        <CardTitle
          className={`${value === undefined ? 'text-base' : 'text-2xl 2xl:text-3xl'} leading-tight font-semibold tracking-tight wrap-anywhere tabular-nums`}
        >
          {amount(value)}
        </CardTitle>
      </CardHeader>
      {content.length || action ? (
        <CardContent className="mt-auto space-y-2 text-xs text-muted-foreground">
          {content}
          {action ? <div className="flex justify-end">{action}</div> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function TargetProgress({ value, label }: { value?: string; label: string }) {
  return value === undefined ? (
    <p>Confronto obiettivo non disponibile</p>
  ) : (
    <>
      <Progress aria-label={label} value={Math.min(100, Number(value))} />
      <p>{percentage(value)} dell’obiettivo</p>
    </>
  );
}

function OverviewKpis({
  overview: o,
  onFiscalCorrection,
  correctionDisabled,
}: { overview: FinancialOverview } & FiscalCorrectionControls) {
  const a = o.analysis;
  const availabilityDeficit =
    o.estimatedAvailability !== undefined && d(o.estimatedAvailability).lt(0);
  const marginDeficit =
    o.marginAfterOutflows !== undefined && d(o.marginAfterOutflows).lt(0);
  const fiscalExcess =
    o.fiscalSituation.excess !== undefined && d(o.fiscalSituation.excess).gt(0)
      ? o.fiscalSituation.excess
      : undefined;
  const hasOverdue =
    (o.overdueRevenue !== undefined && d(o.overdueRevenue).gt(0)) ||
    (a !== undefined && a.overdueInvoiceCount > 0);
  return (
    <section aria-label="Indicatori principali">
      <div className="grid min-w-0 auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Disponibilità stimata"
          icon={WalletCards}
          value={o.estimatedAvailability}
          className="bg-primary/5 ring-primary/25"
        >
          {availabilityDeficit ? (
            <Badge variant="destructive">Disavanzo</Badge>
          ) : null}
          {o.estimatedAvailability === undefined ? (
            <p>
              {o.fiscalPaymentUnavailableReason ??
                'Mancano i dati necessari per determinare la disponibilità.'}
            </p>
          ) : null}
        </Kpi>
        <Kpi
          title="Incassato"
          icon={ArrowDownLeft}
          value={o.collectedRevenue}
          help={`Obiettivo ${o.year}: ${amount(a?.revenueTarget)}`}
        >
          <TargetProgress
            value={a?.percentCollectedVsTarget}
            label="Incassato rispetto all’obiettivo"
          />
        </Kpi>
        <Kpi
          title="Uscite dal conto"
          icon={ArrowUpRight}
          value={o.bankExpenses}
          help={`${o.bankSummary.count} uscite incluse nei conteggi${o.bankExpenseShareOfCollections !== undefined ? `. Uscite / Incassato: ${percentage(o.bankExpenseShareOfCollections)}` : ''}`}
        />
        <Kpi
          title="Margine dopo le uscite"
          icon={Scale}
          value={o.marginAfterOutflows}
        >
          {marginDeficit ? (
            <Badge variant="destructive">Uscite superiori agli incassi</Badge>
          ) : null}
        </Kpi>
        <Kpi
          title="Fatturato emesso"
          icon={ReceiptText}
          value={o.issuedRevenue}
          help={`Obiettivo ${o.year}: ${amount(a?.revenueTarget)}`}
        >
          <TargetProgress
            value={a?.percentIssuedVsTarget}
            label="Fatturato emesso rispetto all’obiettivo"
          />
        </Kpi>
        <Kpi title="Da incassare" icon={Clock3} value={o.outstandingRevenue}>
          {a ? (
            <p className="wrap-anywhere tabular-nums">
              {a.outstandingInvoiceCount}{' '}
              {a.outstandingInvoiceCount === 1
                ? 'fattura aperta'
                : 'fatture aperte'}
            </p>
          ) : (
            <p>Conteggi fatture non disponibili</p>
          )}
          {hasOverdue ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t pt-2 text-destructive">
              <span className="inline-flex min-w-0 items-center gap-1.5 wrap-anywhere">
                <CircleAlert
                  aria-hidden="true"
                  className="size-3.5 shrink-0 self-center"
                />
                <span className="tabular-nums">
                  {a
                    ? `${a.overdueInvoiceCount} ${a.overdueInvoiceCount === 1 ? 'scaduta' : 'scadute'}`
                    : 'Scaduto'}
                </span>
              </span>
              <span className="font-semibold wrap-anywhere tabular-nums">
                {amount(o.overdueRevenue)}
              </span>
            </div>
          ) : a ? (
            <p className="border-t pt-2">Nessuna fattura scaduta</p>
          ) : null}
        </Kpi>
        <Kpi
          title="Imposte P.IVA già pagate"
          icon={BadgeCheck}
          value={o.fiscalSituation.paid}
        />
        <Kpi
          title="Ancora da versare"
          icon={Landmark}
          value={o.fiscalReserve}
          help={
            o.fiscalSituation.total !== undefined
              ? `Totale commercialista: ${amount(o.fiscalSituation.total)}`
              : undefined
          }
          action={
            onFiscalCorrection ? (
              <FiscalCorrectionDialog
                year={o.year}
                total={o.fiscalPaymentOverride}
                disabled={correctionDisabled}
                onSave={onFiscalCorrection}
              />
            ) : undefined
          }
        >
          {o.fiscalReserve === undefined ? (
            <p>Manca il totale annuale del commercialista.</p>
          ) : null}
          {fiscalExcess ? (
            <p>Pagato oltre il totale previsto: {eur(fiscalExcess)}</p>
          ) : null}
        </Kpi>
      </div>
    </section>
  );
}

function AnnualFlow({ overview }: { overview: FinancialOverview }) {
  const flow = useMemo(() => buildFinancialOverviewFlow(overview), [overview]);
  const flowCard = useRef<HTMLDivElement>(null);
  const flowArea = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenHeight, setFullscreenHeight] = useState(480);
  const [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const sync = () =>
      setFullscreen(document.fullscreenElement === flowCard.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  useEffect(() => {
    if (!fullscreen || !flowArea.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setFullscreenHeight(Math.max(1, Math.floor(entry.contentRect.height)));
    });
    observer.observe(flowArea.current);
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
  return (
    <Card
      ref={flowCard}
      className={`min-w-0 ${fullscreen ? 'h-screen w-screen rounded-none' : ''}`}
    >
      <CardHeader className="shrink-0">
        <CardTitle>Flusso finanziario</CardTitle>
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
          Origine degli incassi → uscite dal conto e margine
          {overview.fiscalPaymentOverride !== undefined
            ? ' → versamenti residui e disponibilità.'
            : '.'}
        </CardDescription>
        {fullscreenError ? (
          <p role="alert" className="text-sm text-destructive">
            {fullscreenError}
          </p>
        ) : null}
      </CardHeader>
      <CardContent
        className={`flex min-w-0 flex-col gap-4 overflow-hidden ${fullscreen ? 'min-h-0 flex-1' : ''}`}
      >
        {flow.links.length ? (
          <div ref={flowArea} className={fullscreen ? 'min-h-0 flex-1' : ''}>
            <MoneyFlowChart
              flow={flow}
              height={fullscreen ? fullscreenHeight : 480}
              fitToContainer
              label="Ripartizione degli incassi annuali tra uscite, margine e disponibilità"
            />
          </div>
        ) : null}
        {flow.message ? (
          <p className="shrink-0 text-sm text-muted-foreground">
            {flow.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MonthlyFlow({ overview: o }: { overview: FinancialOverview }) {
  const data = o.monthly.map((row) => ({
    label: shortMonths[row.month - 1],
    collected:
      row.collectedRevenue === undefined ? null : Number(row.collectedRevenue),
    bank: Number(row.bankExpenses),
    margin:
      row.marginAfterOutflows === undefined
        ? null
        : Number(row.marginAfterOutflows),
  }));
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Flusso mensile di cassa</CardTitle>
        <CardDescription>
          Fiscalità residua non distribuita sui mesi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!o.analysis ? (
          <p className="mb-3 text-sm text-muted-foreground">
            Incassato e margine non disponibili: manca lo snapshot FIC.
          </p>
        ) : null}
        <ChartContainer
          config={monthlyConfig}
          className="h-88 w-full aspect-auto"
        >
          <ComposedChart
            accessibilityLayer
            data={data}
            margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} />
            <YAxis
              width={70}
              tickFormatter={compactEuro}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <>
                      <span>
                        {
                          monthlyConfig[
                            String(name) as keyof typeof monthlyConfig
                          ]?.label
                        }
                      </span>
                      <span className="ml-auto tabular-nums">
                        {eur(String(value))}
                      </span>
                    </>
                  )}
                />
              }
            />
            <ChartLegend
              content={<ChartLegendContent className="flex-wrap" />}
            />
            {o.analysis ? (
              <Bar
                isAnimationActive="auto"
                animationDuration={220}
                animationBegin={0}
                dataKey="collected"
                fill="var(--color-collected)"
                radius={3}
                maxBarSize={24}
              />
            ) : null}
            <Bar
              isAnimationActive="auto"
              animationDuration={220}
              animationBegin={0}
              dataKey="bank"
              fill="var(--color-bank)"
              radius={3}
              maxBarSize={24}
            />
            {o.analysis ? (
              <Line
                isAnimationActive="auto"
                animationDuration={220}
                animationBegin={0}
                dataKey="margin"
                stroke="var(--color-margin)"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
              />
            ) : null}
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function FiscalProjection({ overview: o }: { overview: FinancialOverview }) {
  const f = o.analysis?.fiscalProjection;
  const yearRows = f
    ? [
        ['Compensi percepiti', o.collectedRevenue],
        ['Reddito forfettario', f.forfaitIncome],
        ['Base INPS', f.contributionBase],
        ['Contributi INPS stimati', f.contributions],
        ['Base sostitutiva stimata', f.taxBase],
        [
          `Imposta sostitutiva stimata · ${percentage(f.effectiveTaxRate)}`,
          f.substituteTax,
        ],
        ['Bollo', f.stampDuty],
        ['Totale anno', f.annualTotal],
      ]
    : [];
  const advanceRows = f
    ? [
        ['Acconto imposta anno successivo', f.substituteTaxAdvance],
        ['Prima rata imposta', f.substituteTaxAdvanceFirst],
        ['Seconda/unica rata imposta', f.substituteTaxAdvanceSecond],
        ['Acconto INPS anno successivo', f.contributionAdvance],
        ['Primo acconto INPS', f.contributionAdvanceFirst],
        ['Secondo acconto INPS', f.contributionAdvanceSecond],
        ['Totale acconti', f.totalAdvances],
      ]
    : [];
  const projectionTable = (title: string, rows: (string | undefined)[][]) => (
    <section className="min-w-0 space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <DataTable
        data={rows.map(([label, value], index) => ({
          label: label ?? '—',
          value,
          total: index === rows.length - 1,
        }))}
        columns={[
          {
            id: 'label',
            header: 'Voce',
            value: (row) => row.label,
            cell: (row) => (
              <span className={row.total ? 'font-semibold' : undefined}>
                {row.label}
              </span>
            ),
            className: 'whitespace-normal',
          },
          {
            id: 'value',
            header: 'Importo',
            value: (row) =>
              row.value === undefined ? undefined : Number(row.value),
            cell: (row) => (
              <span className={row.total ? 'font-semibold' : undefined}>
                {amount(row.value)}
              </span>
            ),
            className: 'text-right tabular-nums',
            headClassName: 'text-right',
          },
        ]}
        getRowKey={(row) => row.label}
        emptyMessage="Nessun dato fiscale disponibile."
      />
    </section>
  );
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Previsione fiscale</CardTitle>
        <CardDescription>
          {f
            ? `ATECO ${f.atecoCode} · Redditività ${percentage(f.profitabilityCoefficient)} · Gestione Separata ${percentage(f.contributionRate)} · Massimale ${eur(f.contributionCeiling)}`
            : `Stima automatica non disponibile: ${o.fiscalUnavailableReason ?? 'dati insufficienti.'}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {o.analysis?.fiscalWarnings.map((warning) => (
          <Alert key={warning}>
            <AlertTitle>Stima fiscale</AlertTitle>
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        ))}
        {f ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {projectionTable(`Stima ${o.year}`, yearRows)}
            {projectionTable(`Acconti stimati ${o.year + 1}`, advanceRows)}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Stima anno e acconti sono distinti e non determinano il residuo
          annuale. La previsione è gestionale e usa i dati disponibili in Cash e
          Fatture in Cloud.
        </p>
      </CardContent>
    </Card>
  );
}

function SourceComparison({ overview: o }: { overview: FinancialOverview }) {
  const rows = [
    {
      label: 'Costi pianificati Cash',
      value: o.plannedBusinessCosts,
      note: 'Previsione del piano annuale corrente.',
    },
    {
      label: 'Costi documentati FIC',
      value: o.documentedCosts,
      note: 'Documenti di costo emessi nell’anno.',
    },
    {
      label: 'Costi pagati FIC',
      value: o.ficPaidCosts,
      note: 'Pagamenti registrati sui documenti nell’anno.',
    },
    {
      label: 'Uscite dal conto',
      value: o.bankExpenses,
      note: 'Uscite effettive importate o inserite nell’anno.',
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Confronto fonti</CardTitle>
        <CardDescription>
          Valori confrontabili ma non sommabili automaticamente: una fattura FIC
          e un movimento bancario possono descrivere la stessa spesa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          data={rows}
          columns={[
            {
              id: 'label',
              header: 'Fonte / voce',
              value: (row) => row.label,
              cell: (row) => <span className="font-medium">{row.label}</span>,
            },
            {
              id: 'value',
              header: 'Importo',
              value: (row) =>
                row.value === undefined ? undefined : Number(row.value),
              cell: (row) => amount(row.value),
              className: 'text-right tabular-nums',
              headClassName: 'text-right',
            },
            {
              id: 'note',
              header: 'Perimetro',
              value: (row) => row.note,
              className: 'min-w-64 whitespace-normal text-muted-foreground',
            },
          ]}
          getRowKey={(row) => row.label}
          emptyMessage="Nessuna fonte disponibile."
        />
      </CardContent>
    </Card>
  );
}

function MonthlyDetail({ overview: o }: { overview: FinancialOverview }) {
  const data = o.monthly.map((month, index) => {
    const fic = o.analysis?.monthly[index];
    return {
      month: month.month,
      monthName: months[month.month - 1] ?? String(month.month),
      issuedRevenue: fic?.issuedRevenue,
      collectedRevenue: month.collectedRevenue,
      bankExpenses: month.bankExpenses,
      marginAfterOutflows: month.marginAfterOutflows,
      documentedCosts: fic?.documentedCosts,
      paidCosts: fic?.paidCosts,
    };
  });
  type MonthlyRow = (typeof data)[number];
  const moneyColumn = (id: keyof MonthlyRow, header: string) => ({
    id,
    header,
    value: (row: MonthlyRow) =>
      row[id] === undefined ? undefined : Number(row[id]),
    cell: (row: MonthlyRow) =>
      row[id] === undefined ? '—' : eur(String(row[id])),
    className: 'text-right tabular-nums',
    headClassName: 'text-right',
  });
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Dettaglio mensile</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          data={data}
          columns={[
            {
              id: 'month',
              header: 'Mese',
              value: (row) => row.month,
              cell: (row) => row.monthName,
            },
            moneyColumn('issuedRevenue', 'Fatturato emesso'),
            moneyColumn('collectedRevenue', 'Incassato'),
            moneyColumn('bankExpenses', 'Uscite dal conto'),
            moneyColumn('marginAfterOutflows', 'Margine'),
            moneyColumn('documentedCosts', 'Costi FIC documentati'),
            moneyColumn('paidCosts', 'Costi FIC pagati'),
          ]}
          getRowKey={(row) => String(row.month)}
          emptyMessage="Nessun dettaglio mensile disponibile."
          initialSort={{ id: 'month', direction: 'asc' }}
        />
      </CardContent>
    </Card>
  );
}

export function FinancialOverviewDashboard({
  overview,
  onFiscalCorrection,
  correctionDisabled,
  children,
}: {
  overview: FinancialOverview;
  children?: ReactNode;
} & FiscalCorrectionControls) {
  const categories = [
    ...overview.bankSummary.categories.map((category) => ({
      key: category.id,
      name: category.name,
      amount: category.amount,
    })),
    {
      key: 'uncategorized',
      name: 'Senza categoria',
      amount: overview.bankSummary.uncategorized.amount,
    },
  ]
    .filter((row) => d(row.amount).gt(0))
    .sort((a, b) => d(b.amount).cmp(a.amount))
    .slice(0, 10);
  return (
    <div className="min-w-0 space-y-6">
      <OverviewKpis
        overview={overview}
        onFiscalCorrection={onFiscalCorrection}
        correctionDisabled={correctionDisabled}
      />
      <section aria-label="Flussi" className="min-w-0 space-y-4">
        <h2 className="text-lg font-semibold">Flussi</h2>
        <AnnualFlow overview={overview} />
        <MonthlyFlow overview={overview} />
      </section>
      {overview.analysis ? (
        <FinancialCharts
          analysis={overview.analysis}
          bankCategories={categories}
        />
      ) : null}
      <section aria-label="Tabelle" className="min-w-0 space-y-4">
        <h2 className="text-lg font-semibold">Tabelle</h2>
        <FiscalProjection overview={overview} />
        <SourceComparison overview={overview} />
        <MonthlyDetail overview={overview} />
        {children}
      </section>
    </div>
  );
}
