import { useMemo, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { ExpenseCategoryChart } from '@/components/ExpenseCategoryChart';
import { eur, formatNumber } from '@/lib/format';
import { FiscalCorrectionForm } from './FiscalCorrectionForm';
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
const monthlyConfig = {
  collected: { label: 'Incassato FIC', color: 'var(--chart-1)' },
  bank: { label: 'Uscite dal conto', color: 'var(--chart-2)' },
  margin: { label: 'Margine dopo le uscite', color: 'var(--chart-3)' },
} satisfies ChartConfig;

function Kpi({
  title,
  value,
  children,
}: {
  title: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{amount(value)}</CardTitle>
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

function AmountRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value?: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 ${strong ? 'font-semibold' : ''}`}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{amount(value)}</dd>
    </div>
  );
}

function OverviewKpis({ overview: o }: { overview: FinancialOverview }) {
  const a = o.analysis;
  const hasAnnualTotal = o.fiscalPaymentOverride !== undefined;
  const heroValue = hasAnnualTotal
    ? o.estimatedAvailability
    : o.marginAfterOutflows;
  const deficit = heroValue !== undefined && d(heroValue).lt(0);
  return (
    <section aria-label="Indicatori principali" className="space-y-4">
      <Card
        className={
          deficit
            ? 'border-destructive bg-destructive/5 ring-destructive/30'
            : 'bg-primary/5 ring-primary/40'
        }
      >
        <CardHeader>
          <CardDescription className="font-medium text-foreground">
            {hasAnnualTotal
              ? deficit
                ? 'Disavanzo stimato'
                : 'Disponibilità stimata'
              : 'Margine dopo le uscite'}
          </CardDescription>
          <CardTitle
            className={`text-3xl tabular-nums sm:text-4xl ${deficit ? 'text-destructive' : ''}`}
          >
            {amount(heroValue)}
          </CardTitle>
          <CardDescription>
            {hasAnnualTotal
              ? 'Incassato − Uscite dal conto − Ancora da versare nell’anno'
              : 'Incassato − Uscite dal conto'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {o.fiscalReserve === undefined ? (
            <p>{o.fiscalPaymentUnavailableReason}</p>
          ) : null}
          {hasAnnualTotal && deficit ? (
            <p>
              Gli incassi non coprono le uscite dal conto e i versamenti residui
              dell’anno.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {hasAnnualTotal
              ? `Le imposte già pagate sono comprese nelle uscite e riducono il totale ancora da versare nel ${o.year}.`
              : `Il carico fiscale stimato ${o.year} e gli acconti stimati ${o.year + 1} restano separati dai flussi annuali.`}{' '}
            Questo flusso annuale non è il saldo bancario.
          </p>
        </CardContent>
      </Card>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi title="Fatturato emesso" value={o.issuedRevenue}>
          <p>
            Obiettivo {o.year}: {amount(a?.revenueTarget)}
          </p>
          <TargetProgress
            value={a?.percentIssuedVsTarget}
            label="Fatturato emesso rispetto all’obiettivo"
          />
          <p>Fatture emesse nell’anno; note di credito separate.</p>
        </Kpi>
        <Kpi title="Incassato" value={o.collectedRevenue}>
          <TargetProgress
            value={a?.percentCollectedVsTarget}
            label="Incassato rispetto all’obiettivo"
          />
          <p>Pagamenti FIC nell’anno, anche per fatture di anni precedenti.</p>
        </Kpi>
        <Kpi title="Da incassare" value={o.outstandingRevenue}>
          <Badge
            variant={
              o.overdueRevenue !== undefined && d(o.overdueRevenue).gt(0)
                ? 'destructive'
                : 'secondary'
            }
          >
            Scaduto: {amount(o.overdueRevenue)}
          </Badge>
          <p>Residui delle fatture emesse nel {o.year}.</p>
          {a ? (
            <p>
              {a.outstandingInvoiceCount} fatture aperte ·{' '}
              {a.overdueInvoiceCount} scadute
            </p>
          ) : null}
        </Kpi>
        <Kpi title="Uscite dal conto" value={o.bankExpenses}>
          <p>
            {o.bankSummary.count} uscite importate o inserite nel {o.year}
          </p>
          {o.bankExpenseShareOfCollections !== undefined ? (
            <p>
              Uscite / Incassato: {percentage(o.bankExpenseShareOfCollections)}
            </p>
          ) : null}
        </Kpi>
        <Kpi title="Margine dopo le uscite" value={o.marginAfterOutflows}>
          <p>Incassato − Uscite dal conto</p>
          {o.marginAfterOutflows !== undefined &&
          d(o.marginAfterOutflows).lt(0) ? (
            <Badge variant="destructive">Uscite superiori agli incassi</Badge>
          ) : null}
        </Kpi>
        <Kpi title="Imposte P.IVA già pagate" value={o.fiscalSituation.paid}>
          <p>Versamenti effettivamente usciti dal conto nel {o.year}.</p>
          <p>Già compresi nelle uscite dal conto.</p>
        </Kpi>
      </div>
      {a?.fiscalWarnings.map((warning) => (
        <Alert key={warning}>
          <AlertTitle>Stima fiscale</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}
    </section>
  );
}

function CashFormation({ overview: o }: { overview: FinancialOverview }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Margine dei flussi annuali · {o.year}</CardTitle>
        <CardDescription>
          Incassi FIC meno uscite effettive del conto. Il totale del
          commercialista consente di sottrarre anche quanto resta da versare.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="max-w-3xl space-y-3 text-sm">
          <AmountRow label="Incassato" value={o.collectedRevenue} />
          <AmountRow label="− Uscite dal conto" value={o.bankExpenses} />
          <Separator />
          <AmountRow
            label="Margine dopo le uscite"
            value={o.marginAfterOutflows}
            strong
          />
          {o.fiscalPaymentOverride !== undefined ? (
            <>
              <AmountRow
                label="− Ancora da versare nell’anno"
                value={o.fiscalReserve}
              />
              <Separator />
              <AmountRow
                label="Disponibilità stimata"
                value={o.estimatedAvailability}
                strong
              />
            </>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

function FiscalSituation({
  overview: o,
  onFiscalCorrection,
  correctionDisabled,
}: { overview: FinancialOverview } & FiscalCorrectionControls) {
  const f = o.analysis?.fiscalProjection;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Versamenti annuali e stima fiscale · {o.year}</CardTitle>
        <CardDescription>
          Versamenti effettivi nell’anno e proiezioni sugli incassi hanno
          periodi diversi. Il residuo richiede il totale del commercialista.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="max-w-3xl space-y-3 text-sm">
          <AmountRow
            label="Totale annuale del commercialista"
            value={o.fiscalSituation.total}
            strong
          />
          <AmountRow
            label="Imposte P.IVA già pagate"
            value={o.fiscalSituation.paid}
          />
          <AmountRow label="Ancora da versare" value={o.fiscalReserve} strong />
          {o.fiscalSituation.excess !== undefined &&
          d(o.fiscalSituation.excess).gt(0) ? (
            <AmountRow
              label="Pagato oltre il totale previsto"
              value={o.fiscalSituation.excess}
            />
          ) : null}
        </dl>
        {o.fiscalPaymentUnavailableReason ? (
          <p className="text-sm text-muted-foreground">
            {o.fiscalPaymentUnavailableReason}
          </p>
        ) : null}
        {onFiscalCorrection ? (
          <FiscalCorrectionForm
            key={`${o.year}:${o.fiscalPaymentOverride ?? 'auto'}`}
            year={o.year}
            total={o.fiscalPaymentOverride}
            disabled={correctionDisabled}
            onSave={onFiscalCorrection}
          />
        ) : null}
        {o.fiscalUnavailableReason ? (
          <p className="text-sm text-muted-foreground">
            Stima automatica non disponibile: {o.fiscalUnavailableReason}
          </p>
        ) : null}
        {f ? (
          <>
            <Separator />
            <p className="text-sm font-medium">
              Previsione fiscale automatica sugli incassi · {o.year}
            </p>
            <p className="text-sm">
              ATECO {f.atecoCode} · Redditività{' '}
              {percentage(f.profitabilityCoefficient)} · Gestione Separata{' '}
              {percentage(f.contributionRate)} · Massimale{' '}
              {eur(f.contributionCeiling)}
            </p>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Stima anno · {o.year}</h3>
                <dl className="space-y-3 text-sm">
                  <AmountRow
                    label="Compensi percepiti"
                    value={o.collectedRevenue}
                  />
                  <AmountRow
                    label="Reddito forfettario"
                    value={f.forfaitIncome}
                  />
                  <AmountRow label="Base INPS" value={f.contributionBase} />
                  <AmountRow
                    label="Contributi INPS stimati"
                    value={f.contributions}
                  />
                  <AmountRow
                    label="Base sostitutiva stimata"
                    value={f.taxBase}
                  />
                  <AmountRow
                    label={
                      'Imposta sostitutiva stimata · ' +
                      percentage(f.effectiveTaxRate)
                    }
                    value={f.substituteTax}
                  />
                  <AmountRow label="Bollo" value={f.stampDuty} />
                  <AmountRow label="Totale anno" value={f.annualTotal} strong />
                </dl>
              </section>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">
                  Acconti stimati · {o.year + 1}
                </h3>
                <dl className="space-y-3 text-sm">
                  <AmountRow
                    label="Acconto imposta anno successivo"
                    value={f.substituteTaxAdvance}
                  />
                  <AmountRow
                    label="Prima rata imposta · 40% se dovuta"
                    value={f.substituteTaxAdvanceFirst}
                  />
                  <AmountRow
                    label="Seconda o unica rata imposta"
                    value={f.substituteTaxAdvanceSecond}
                  />
                  <AmountRow
                    label={
                      'Acconto INPS anno successivo · 80% (aliquota ' +
                      percentage(f.advanceContributionRate) +
                      ')'
                    }
                    value={f.contributionAdvance}
                  />
                  <AmountRow
                    label="Primo acconto INPS · 40%"
                    value={f.contributionAdvanceFirst}
                  />
                  <AmountRow
                    label="Secondo acconto INPS · 40%"
                    value={f.contributionAdvanceSecond}
                  />
                  <AmountRow
                    label="Totale acconti"
                    value={f.totalAdvances}
                    strong
                  />
                </dl>
              </section>
            </div>
            <p className="text-xs text-muted-foreground">
              Totale anno e totale acconti sono stime separate e non determinano
              il residuo dei versamenti annuali. La base sostitutiva stimata usa
              i contributi INPS stimati dell’anno. La dichiarazione deduce
              invece i contributi effettivamente versati nel periodo. Le rate
              sono informative, senza gestione delle scadenze.
            </p>
          </>
        ) : null}
        <p className="text-xs text-muted-foreground">
          La previsione è gestionale e usa i dati disponibili in Cash e Fatture
          in Cloud. I versamenti bancari classificati come Imposte P.IVA
          indicano quanto è già uscito dal conto e non identificano il singolo
          tributo o anno fiscale.
        </p>
      </CardContent>
    </Card>
  );
}

function AnnualFlow({ overview }: { overview: FinancialOverview }) {
  const flow = useMemo(() => buildFinancialOverviewFlow(overview), [overview]);
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Flusso finanziario · {overview.year}</CardTitle>
        <CardDescription>
          {overview.fiscalPaymentOverride !== undefined
            ? 'Origine degli incassi → uscite dal conto e margine → ancora da versare e disponibilità stimata.'
            : 'Origine degli incassi → uscite dal conto e margine dopo le uscite.'}{' '}
          Le imposte già pagate sono comprese nelle uscite dal conto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <section
          aria-label="Contesto economico"
          className="space-y-3 rounded-lg bg-muted/40 p-4"
        >
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            {[
              { label: 'Fatturato emesso', value: overview.issuedRevenue },
              {
                label: 'Incassato nell’anno',
                value: overview.collectedRevenue,
              },
              { label: 'Da incassare', value: overview.outstandingRevenue },
            ].map((row) => (
              <div key={row.label} className="space-y-1">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="text-xl font-semibold tabular-nums">
                  {amount(row.value)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Fatturato e incassato hanno perimetri diversi: l’incassato dell’anno
            può comprendere fatture emesse in anni precedenti. Da incassare
            riguarda i residui delle fatture emesse nell’anno.
          </p>
        </section>
        {flow.links.length ? (
          <MoneyFlowChart
            flow={flow}
            label="Ripartizione degli incassi annuali; importi riportati nei KPI e nel riepilogo del disponibile"
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
    label: months[row.month - 1],
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
        <CardTitle>Flusso mensile di cassa · {o.year}</CardTitle>
        <CardDescription>
          Incassi per data pagamento FIC; uscite dal conto per data del
          movimento. Nessuna distribuzione mensile della fiscalità.
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

function HorizontalAmounts({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: { key: string; name: string; amount: string }[];
  empty: string;
}) {
  const data = rows.map((row) => ({ ...row, value: Number(row.amount) }));
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length ? (
          <ChartContainer
            config={{ value: { label: title, color: 'var(--chart-2)' } }}
            className="w-full aspect-auto"
            style={{ height: Math.max(200, data.length * 46 + 35) }}
          >
            <BarChart
              accessibilityLayer
              layout="vertical"
              data={data}
              margin={{ left: 0, right: 14, top: 0, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={compactEuro}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="key"
                type="category"
                width={135}
                interval={0}
                tickLine={false}
                axisLine={false}
                tickFormatter={(key) => {
                  const name = rows.find((row) => row.key === key)?.name ?? '';
                  return name.length > 20 ? `${name.slice(0, 19)}…` : name;
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="max-w-80 [&>div:first-child]:whitespace-normal"
                    labelFormatter={(_label, payload) =>
                      payload[0]?.payload?.name
                    }
                    formatter={(value) => (
                      <span className="tabular-nums">{eur(String(value))}</span>
                    )}
                  />
                }
              />
              <Bar
                dataKey="value"
                fill="var(--color-value)"
                radius={3}
                maxBarSize={22}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="py-8 text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SourceComparison({ overview: o }: { overview: FinancialOverview }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Costi e uscite · confronto fonti</CardTitle>
        <CardDescription>
          Valori confrontabili visivamente, ma non sommabili automaticamente:
          una fattura FIC e un movimento bancario possono descrivere la stessa
          spesa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {[
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
          ].map((row) => (
            <div key={row.label} className="space-y-2">
              <dt>{row.label}</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {amount(row.value)}
              </dd>
              <dd className="text-xs text-muted-foreground">{row.note}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export function FinancialOverviewDashboard({
  overview,
  onFiscalCorrection,
  correctionDisabled,
}: { overview: FinancialOverview } & FiscalCorrectionControls) {
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
      <h2 className="text-lg font-semibold">
        Panoramica finanziaria · {overview.year}
      </h2>
      <OverviewKpis overview={overview} />
      <FiscalSituation
        overview={overview}
        onFiscalCorrection={onFiscalCorrection}
        correctionDisabled={correctionDisabled}
      />
      <CashFormation overview={overview} />
      <section aria-label="Flussi" className="min-w-0 space-y-4">
        <h2 className="text-lg font-semibold">Flussi</h2>
        <AnnualFlow overview={overview} />
        <MonthlyFlow overview={overview} />
      </section>
      <section
        aria-label="Origine e destinazione"
        className="min-w-0 space-y-4"
      >
        <h2 className="text-lg font-semibold">Origine e destinazione</h2>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <HorizontalAmounts
            title={`Incassi per cliente · ${overview.year}`}
            description="Da dove arrivano i soldi · Top 10 per pagamenti avvenuti nell’anno, anche su fatture di anni precedenti. I nomi completi sono visibili al passaggio sul grafico."
            rows={overview.collectionsByClient.slice(0, 10)}
            empty={
              overview.analysis
                ? 'Nessun incasso nell’anno selezionato.'
                : 'Incassi non disponibili: manca lo snapshot FIC.'
            }
          />
          <ExpenseCategoryChart
            title={`Uscite per categoria · ${overview.year}`}
            description="Dove vanno i soldi · Prime 10 categorie principali, comprensive delle sottocategorie. Le fette rappresentano il peso relativo degli importi mostrati. Una spesa può appartenere a più categorie: non è una ripartizione esclusiva del totale."
            rows={categories}
            empty="Nessuna uscita dal conto nell’anno selezionato."
          />
        </div>
      </section>
      <section aria-label="Confronto fonti" className="space-y-4">
        <h2 className="text-lg font-semibold">Confronto fonti</h2>
        <SourceComparison overview={overview} />
      </section>
    </div>
  );
}
