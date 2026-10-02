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
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
}: {
  title: string;
  description: string;
  data: ChartRow[];
  config: ChartConfig;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="min-h-18">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length ? (
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
          <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
            Nessun documento per l’anno selezionato.
          </div>
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
  // Every bar in the card shares one scale; HTML labels determine row height naturally.
  const maximum = Math.max(
    0,
    ...data.flatMap((row) => series.map((item) => row.values[item.key] ?? 0)),
  );
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length ? (
          <>
            <div
              aria-hidden="true"
              className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"
            >
              {series.map((item) => (
                <span key={item.key} className="flex items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
            <ol aria-label={title} className="space-y-5">
              {data.map((row) => (
                <li key={row.key} className="min-w-0 space-y-1.5">
                  <p className="text-sm leading-snug font-medium [overflow-wrap:anywhere]">
                    {row.label}
                  </p>
                  <dl className="space-y-1.5">
                    {series.map((item) => {
                      const value = row.values[item.key] ?? 0;
                      return (
                        <div key={item.key}>
                          <dt className="sr-only">{item.label}</dt>
                          <dd className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3">
                            <div
                              aria-hidden="true"
                              className="h-2.5 rounded-sm bg-muted"
                            >
                              <div
                                className="h-full rounded-sm"
                                style={{
                                  width: `${maximum > 0 ? (value / maximum) * 100 : 0}%`,
                                  backgroundColor: item.color,
                                }}
                              />
                            </div>
                            <span className="text-right text-xs tabular-nums [overflow-wrap:anywhere]">
                              {dayValues ? days(value) : eur(String(value))}
                            </span>
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </li>
              ))}
            </ol>
          </>
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
}: {
  analysis: FinancialAnalysis;
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
    <section
      aria-label="Grafici finanziari"
      className="grid min-w-0 gap-4 xl:grid-cols-2"
    >
      <AnalysisChart
        title="Ricavi mensili FIC"
        description="Emesso per data fattura; incassato per data pagamento, anche su fatture di anni precedenti."
        data={monthly}
        config={{
          issued: { label: 'Fatturato emesso', color: 'var(--chart-1)' },
          collected: { label: 'Incassato', color: 'var(--chart-2)' },
        }}
      />
      <AnalysisChart
        title="Costi mensili FIC"
        description="Spese FIC: documentati per data documento; pagati per data pagamento, anche su documenti di anni precedenti."
        data={monthly}
        config={{
          documented: { label: 'Costi documentati', color: 'var(--chart-1)' },
          paid: { label: 'Costi pagati', color: 'var(--chart-2)' },
        }}
      />
      <RankingChart
        title="Top 10 clienti per fatturato"
        description="Fatture dell’anno selezionato e relativi incassi presenti nello snapshot."
        data={a.clientAnalysis.slice(0, 10).map((row) => ({
          key: row.key,
          label: row.name,
          values: {
            issued: Number(row.issuedRevenue),
            collected: Number(row.collectedRevenue),
          },
        }))}
        series={[
          { key: 'issued', label: 'Fatturato', color: 'var(--chart-1)' },
          { key: 'collected', label: 'Incassato', color: 'var(--chart-2)' },
        ]}
      />
      <RankingChart
        title="Clienti con maggior ritardo medio"
        description="Top 10 · pagamenti conclusi delle fatture dell’anno. Insoluti attuali separati nella tabella Pagamenti."
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
            color: 'var(--chart-1)',
          },
        ]}
      />
      <div className="min-w-0 xl:col-span-2">
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
              color: 'var(--chart-1)',
            },
          ]}
        />
      </div>
    </section>
  );
}

function Counterparty({ row }: { row: { name: string } }) {
  return (
    <div className="min-w-40 max-w-64 whitespace-normal break-words">
      {row.name}
    </div>
  );
}

function AggregateTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return rows.length ? (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((header, index) => (
            <TableHead
              key={header}
              className={
                index ? 'max-w-32 whitespace-normal text-right' : undefined
              }
            >
              {header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            {row.cells.map((cell, index) => (
              <TableCell
                key={index}
                className={index ? 'text-right tabular-nums' : undefined}
              >
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
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
              }))}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
