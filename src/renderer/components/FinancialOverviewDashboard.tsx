import { useMemo, type ReactNode } from 'react';
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
  collected: { label: 'Incassato', color: 'var(--chart-2)' },
  bank: { label: 'Uscite dal conto', color: 'var(--chart-4)' },
  margin: { label: 'Margine dopo le uscite', color: 'var(--chart-3)' },
} satisfies ChartConfig;

function Kpi({
  title,
  value,
  action,
  className,
  children,
}: {
  title: string;
  value?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card size="sm" className={`min-w-0 ${className ?? ''}`}>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl! leading-none font-semibold tracking-tight tabular-nums 2xl:text-4xl!">
          {amount(value)}
        </CardTitle>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        {children}
      </CardContent>
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
  return (
    <section aria-label="Indicatori principali">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Disponibilità stimata"
          value={o.estimatedAvailability}
          className="bg-primary/5 ring-primary/25"
        >
          {availabilityDeficit ? (
            <Badge variant="destructive">Disavanzo</Badge>
          ) : null}
          <p>Incassato − Uscite dal conto − Ancora da versare</p>
          {o.estimatedAvailability === undefined ? (
            <p>
              {o.fiscalPaymentUnavailableReason ??
                'Mancano i dati necessari per determinare la disponibilità.'}
            </p>
          ) : null}
        </Kpi>
        <Kpi title="Incassato" value={o.collectedRevenue}>
          <TargetProgress
            value={a?.percentCollectedVsTarget}
            label="Incassato rispetto all’obiettivo"
          />
          <p>Pagamenti FIC avvenuti nell’anno.</p>
        </Kpi>
        <Kpi title="Uscite dal conto" value={o.bankExpenses}>
          <p>
            {o.bankSummary.count} uscite incluse nei conteggi nel {o.year}
          </p>
          {o.bankExpenseShareOfCollections !== undefined ? (
            <p>
              Uscite / Incassato: {percentage(o.bankExpenseShareOfCollections)}
            </p>
          ) : null}
        </Kpi>
        <Kpi title="Margine dopo le uscite" value={o.marginAfterOutflows}>
          <p>Incassato − Uscite dal conto</p>
          {marginDeficit ? (
            <Badge variant="destructive">Uscite superiori agli incassi</Badge>
          ) : null}
        </Kpi>
        <Kpi title="Fatturato emesso" value={o.issuedRevenue}>
          <p>
            Obiettivo {o.year}: {amount(a?.revenueTarget)}
          </p>
          <TargetProgress
            value={a?.percentIssuedVsTarget}
            label="Fatturato emesso rispetto all’obiettivo"
          />
        </Kpi>
        <Kpi title="Da incassare" value={o.outstandingRevenue}>
          {o.overdueRevenue !== undefined && d(o.overdueRevenue).gt(0) ? (
            <Badge variant="destructive">
              Scaduto: {amount(o.overdueRevenue)}
            </Badge>
          ) : null}
          {a ? (
            <p>
              {a.outstandingInvoiceCount} fatture aperte ·{' '}
              {a.overdueInvoiceCount} scadute
            </p>
          ) : null}
        </Kpi>
        <Kpi title="Imposte P.IVA già pagate" value={o.fiscalSituation.paid}>
          <p>Movimenti della categoria di sistema nel {o.year}.</p>
          <p>Già comprese nelle Uscite dal conto.</p>
        </Kpi>
        <Kpi
          title="Ancora da versare"
          value={o.fiscalReserve}
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
          <p>Totale commercialista: {amount(o.fiscalSituation.total)}</p>
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
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Flusso finanziario</CardTitle>
        <CardDescription>
          Origine degli incassi → uscite dal conto e margine
          {overview.fiscalPaymentOverride !== undefined
            ? ' → versamenti residui e disponibilità.'
            : '.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {flow.links.length ? (
          <MoneyFlowChart
            flow={flow}
            label="Ripartizione degli incassi annuali tra uscite, margine e disponibilità"
          />
        ) : null}
        {flow.message ? (
          <p className="text-sm text-muted-foreground">{flow.message}</p>
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
          Incassato, Uscite dal conto e Margine dopo le uscite · nessuna
          distribuzione mensile della fiscalità residua
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
                dataKey="collected"
                fill="var(--color-collected)"
                radius={3}
                maxBarSize={24}
              />
            ) : null}
            <Bar
              dataKey="bank"
              fill="var(--color-bank)"
              radius={3}
              maxBarSize={24}
            />
            {o.analysis ? (
              <Line
                dataKey="margin"
                stroke="var(--color-margin)"
                strokeWidth={2}
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
        <CardDescription>
          Flussi FIC e bancari da gennaio a dicembre.
        </CardDescription>
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
