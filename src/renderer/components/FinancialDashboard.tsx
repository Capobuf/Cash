import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { FinancialAnalysis } from '../../domain/financial-analysis';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { DataTable } from '@/components/ui/data-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpenseCategoryChart } from '@/components/ExpenseCategoryChart';
import { eur, formatNumber } from '@/lib/format';

const percentage = (value: string | undefined) =>
  value === undefined ? 'Non disponibile' : `${formatNumber(value, 2)}%`;
const days = (value: number | undefined) =>
  value === undefined
    ? 'Non disponibile'
    : `${formatNumber(String(value), 1)} gg`;
const compactEuro = (value: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(value);

type ChartRow = { label: string; [key: string]: string | number };

function AnalysisChart({
  title,
  description,
  data,
  config,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  description: string;
  data: ChartRow[];
  config: ChartConfig;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const series = Object.keys(config);
  const hasData = data.some((row) =>
    series.some((key) => Number(row[key] ?? 0) !== 0),
  );
  return (
    <Card className="min-w-0">
      <CardHeader className="min-h-18">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer className="h-80 w-full aspect-auto" config={config}>
            <BarChart
              accessibilityLayer
              data={data}
              margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={12}
                tickMargin={8}
              />
              <YAxis
                tickFormatter={compactEuro}
                width={64}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="max-w-80 [&>div:first-child]:whitespace-normal [&>div:first-child]:break-words"
                    labelFormatter={(_label, payload) =>
                      payload[0]?.payload?.label
                    }
                    formatter={(value, name) => (
                      <>
                        <span className="text-muted-foreground">
                          {config[String(name)]?.label}
                        </span>
                        <span className="ml-auto font-medium tabular-nums">
                          {eur(String(value))}
                        </span>
                      </>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {Object.keys(config).map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={`var(--color-${key})`}
                  radius={3}
                  maxBarSize={24}
                />
              ))}
            </BarChart>
          </ChartContainer>
        ) : (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

type RankingRow = {
  key: string;
  label: string;
  values: Record<string, number>;
};
function RankingChart({
  title,
  description,
  data,
  series,
  dayValues = false,
}: {
  title: string;
  description: string;
  data: RankingRow[];
  series: { key: string; label: string; color: string }[];
  dayValues?: boolean;
}) {
  const chartData = data.map((row) => ({
    key: row.key,
    label: row.label,
    ...row.values,
  }));
  const config = Object.fromEntries(
    series.map((item) => [item.key, { label: item.label, color: item.color }]),
  ) satisfies ChartConfig;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length ? (
          <ChartContainer
            config={config}
            className="w-full aspect-auto"
            style={{ height: Math.max(240, data.length * 52 + 44) }}
          >
            <BarChart
              accessibilityLayer
              layout="vertical"
              data={chartData}
              margin={{ left: 0, right: 12, top: 0, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(value) =>
                  dayValues
                    ? `${formatNumber(String(value), 0)} gg`
                    : compactEuro(value)
                }
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
                  const label =
                    data.find((row) => row.key === key)?.label ?? '';
                  return label.length > 20 ? `${label.slice(0, 19)}…` : label;
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="max-w-80 [&>div:first-child]:whitespace-normal"
                    labelFormatter={(_label, payload) =>
                      payload[0]?.payload?.label
                    }
                    formatter={(value, name) => (
                      <>
                        <span className="text-muted-foreground">
                          {config[String(name)]?.label}
                        </span>
                        <span className="ml-auto tabular-nums">
                          {dayValues ? days(Number(value)) : eur(String(value))}
                        </span>
                      </>
                    )}
                  />
                }
              />
              {series.length > 1 ? (
                <ChartLegend
                  content={<ChartLegendContent className="flex-wrap" />}
                />
              ) : null}
              {series.map((item) => (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  fill={`var(--color-${item.key})`}
                  radius={3}
                  maxBarSize={18}
                />
              ))}
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            {dayValues
              ? 'Nessun pagamento con scadenza e data di pagamento analizzabili.'
              : 'Nessun documento per l’anno selezionato.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function FinancialCharts({
  analysis: a,
  bankCategories,
}: {
  analysis: FinancialAnalysis;
  bankCategories: { key: string; name: string; amount: string }[];
}) {
  const monthly = a.monthly.map((row) => ({
    label: [
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
    ][row.month - 1]!,
    issued: Number(row.issuedRevenue),
    collected: Number(row.collectedRevenue),
    documented: Number(row.documentedCosts),
    paid: Number(row.paidCosts),
  }));
  return (
    <div className="min-w-0 space-y-6">
      <section aria-label="Andamento" className="min-w-0 space-y-4">
        <h2 className="text-lg font-semibold">Andamento</h2>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <AnalysisChart
            title="Ricavi mensili FIC"
            description="Emesso per data fattura · Incassato per data pagamento FIC"
            data={monthly}
            config={{
              issued: { label: 'Fatturato emesso', color: 'var(--chart-1)' },
              collected: { label: 'Incassato', color: 'var(--chart-2)' },
            }}
            emptyTitle="Nessun ricavo FIC registrato"
            emptyDescription="Non risultano fatture emesse o pagamenti incassati nell’anno selezionato."
          />
          <AnalysisChart
            title="Costi mensili FIC"
            description="Documentati per data documento · Pagati per data pagamento FIC"
            data={monthly}
            config={{
              documented: {
                label: 'Costi documentati',
                color: 'var(--chart-4)',
              },
              paid: { label: 'Costi pagati', color: 'var(--chart-5)' },
            }}
            emptyTitle="Nessun costo FIC registrato"
            emptyDescription="Non risultano costi documentati o pagati nell’anno selezionato."
          />
        </div>
      </section>
      <section aria-label="Clienti e uscite" className="min-w-0 space-y-4">
        <h2 className="text-lg font-semibold">Clienti e uscite</h2>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <RankingChart
            title="Top 10 clienti per fatturato"
            description="Fatture dell’anno e relativi incassi presenti nello snapshot."
            data={a.clientAnalysis.slice(0, 10).map((row) => ({
              key: row.key,
              label: row.name,
              values: {
                issued: Number(row.issuedRevenue),
                collected: Number(row.collectedRevenue),
              },
            }))}
            series={[
              {
                key: 'issued',
                label: 'Fatturato emesso',
                color: 'var(--chart-1)',
              },
              { key: 'collected', label: 'Incassato', color: 'var(--chart-2)' },
            ]}
          />
          <RankingChart
            title="Clienti con maggior ritardo medio"
            description="Top 10 · pagamenti conclusi delle fatture dell’anno."
            dayValues
            data={a.clientPaymentAnalysis
              .filter((row) => row.analyzedPaymentCount > 0)
              .slice(0, 10)
              .map((row) => ({
                key: row.key,
                label: row.name,
                values: { delay: row.averageDelayDays! },
              }))}
            series={[
              {
                key: 'delay',
                label: 'Giorni medi di ritardo',
                color: 'var(--chart-5)',
              },
            ]}
          />
          <ExpenseCategoryChart
            title="Uscite bancarie per categoria"
            description="Prime 10 categorie. I valori possono sovrapporsi e non formano una ripartizione esclusiva."
            rows={bankCategories}
            empty="Nessuna uscita dal conto nell’anno selezionato."
          />
          <RankingChart
            title="Costi per categoria FIC"
            description="Prime 10 categorie FIC per costo documentato. Tutte le categorie sono consultabili nella tabella Costi."
            data={a.costCategoryAnalysis.slice(0, 10).map((row) => ({
              key: row.key,
              label: row.category,
              values: { documented: Number(row.documentedCosts) },
            }))}
            series={[
              {
                key: 'documented',
                label: 'Costi documentati',
                color: 'var(--chart-4)',
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}

function Counterparty({ row }: { row: { name: string } }) {
  return (
    <div className="min-w-40 max-w-64 whitespace-normal break-words">
      {row.name}
    </div>
  );
}

interface AggregateRow {
  key: string;
  cells: ReactNode[];
  sortValues: (string | number | undefined)[];
}

function AggregateTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: AggregateRow[];
}) {
  return rows.length ? (
    <DataTable<AggregateRow>
      data={rows}
      columns={headers.map((header, index) => ({
        id: `column-${index}`,
        header,
        value: (row) => row.sortValues[index],
        cell: (row) => row.cells[index],
        className: index ? 'text-right tabular-nums' : undefined,
        headClassName: index
          ? 'max-w-32 whitespace-normal text-right'
          : undefined,
      }))}
      getRowKey={(row) => row.key}
      emptyMessage="Nessun documento per l’anno selezionato."
    />
  ) : (
    <p className="py-6 text-sm text-muted-foreground">
      Nessun documento per l’anno selezionato.
    </p>
  );
}

export function FinancialAggregates({
  analysis: a,
  year,
}: {
  analysis: FinancialAnalysis;
  year: number;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Analisi aggregate · {year}</CardTitle>
        <CardDescription>
          Documenti dell’anno selezionato e tutti i relativi pagamenti nello
          snapshot, anche di altri anni. Gli importi pagati possono quindi
          differire dai flussi annuali dei KPI.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="clients">
          <TabsList
            variant="line"
            className="h-auto max-w-full flex-wrap justify-start"
          >
            <TabsTrigger value="clients">Clienti</TabsTrigger>
            <TabsTrigger value="payments">Pagamenti</TabsTrigger>
            <TabsTrigger value="costs">Costi</TabsTrigger>
            <TabsTrigger value="suppliers">Fornitori</TabsTrigger>
          </TabsList>
          <TabsContent value="clients">
            <AggregateTable
              headers={[
                'Cliente',
                'Fatture',
                'Fatturato',
                'Incassato',
                'Da incassare',
                'Scaduto',
                '% fatturato',
              ]}
              rows={a.clientAnalysis.map((row) => ({
                key: row.key,
                cells: [
                  <Counterparty key="name" row={row} />,
                  row.invoiceCount,
                  eur(row.issuedRevenue),
                  eur(row.collectedRevenue),
                  eur(row.outstandingRevenue),
                  eur(row.overdueRevenue),
                  percentage(row.revenueShare),
                ],
                sortValues: [
                  row.name,
                  row.invoiceCount,
                  Number(row.issuedRevenue),
                  Number(row.collectedRevenue),
                  Number(row.outstandingRevenue),
                  Number(row.overdueRevenue),
                  Number(row.revenueShare),
                ],
              }))}
            />
          </TabsContent>
          <TabsContent value="payments">
            <p className="my-3 text-xs text-muted-foreground">
              Media aritmetica dei ritardi dei pagamenti conclusi con entrambe
              le date. Pagamenti anticipati o puntuali: 0 giorni. Lo scaduto
              attuale riguarda rate ancora aperte.
            </p>
            <AggregateTable
              headers={[
                'Cliente',
                'Pagamenti analizzati',
                'Ritardo medio',
                'Ritardo massimo',
                'Puntuali %',
                'Scaduto attuale',
                'Fatture scadute',
                'Scadenza aperta più vecchia',
              ]}
              rows={a.clientPaymentAnalysis.map((row) => ({
                key: row.key,
                cells: [
                  <Counterparty key="name" row={row} />,
                  row.analyzedPaymentCount,
                  days(row.averageDelayDays),
                  days(row.maxDelayDays),
                  percentage(row.onTimePercentage),
                  eur(row.overdueRevenue),
                  row.overdueInvoiceCount,
                  row.oldestOpenDueDays === undefined
                    ? '—'
                    : days(row.oldestOpenDueDays),
                ],
                sortValues: [
                  row.name,
                  row.analyzedPaymentCount,
                  row.averageDelayDays,
                  row.maxDelayDays,
                  Number(row.onTimePercentage),
                  Number(row.overdueRevenue),
                  row.overdueInvoiceCount,
                  row.oldestOpenDueDays,
                ],
              }))}
            />
          </TabsContent>
          <TabsContent value="costs">
            <div className="my-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <p>
                Incidenza costi documentati / fatturato emesso:{' '}
                <strong>{percentage(a.costIncidenceOnIssued)}</strong>
              </p>
              <p>
                Incidenza costi pagati / incassato:{' '}
                <strong>{percentage(a.paidCostIncidenceOnCollected)}</strong>
              </p>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Incidenze sui totali annuali dei KPI. Indicatori descrittivi; i
              costi pianificati Cash restano separati dai documenti FIC.
            </p>
            <AggregateTable
              headers={[
                'Categoria',
                'Documenti',
                'Documentato',
                'Pagato',
                'Aperto',
                '% totale',
              ]}
              rows={a.costCategoryAnalysis.map((row) => ({
                key: row.key,
                cells: [
                  <span
                    key="category"
                    className="block max-w-64 whitespace-normal break-words"
                  >
                    {row.category}
                  </span>,
                  row.documentCount,
                  eur(row.documentedCosts),
                  eur(row.paidCosts),
                  eur(row.outstandingCosts),
                  percentage(row.costShare),
                ],
                sortValues: [
                  row.category,
                  row.documentCount,
                  Number(row.documentedCosts),
                  Number(row.paidCosts),
                  Number(row.outstandingCosts),
                  Number(row.costShare),
                ],
              }))}
            />
          </TabsContent>
          <TabsContent value="suppliers">
            <AggregateTable
              headers={[
                'Fornitore',
                'Documenti',
                'Documentato',
                'Pagato',
                'Residuo',
              ]}
              rows={a.supplierAnalysis.map((row) => ({
                key: row.key,
                cells: [
                  <Counterparty key="name" row={row} />,
                  row.documentCount,
                  eur(row.documentedCosts),
                  eur(row.paidCosts),
                  eur(row.outstandingCosts),
                ],
                sortValues: [
                  row.name,
                  row.documentCount,
                  Number(row.documentedCosts),
                  Number(row.paidCosts),
                  Number(row.outstandingCosts),
                ],
              }))}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
