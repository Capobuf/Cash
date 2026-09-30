import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { FinancialAnalysis } from '../../domain/financial-analysis';
import { d, money } from '../../domain/decimal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { eur, formatNumber } from '@/lib/format';

const percentage = (value: string | undefined) => value === undefined ? 'Non disponibile' : `${formatNumber(value, 2)}%`;
const days = (value: number | undefined) => value === undefined ? 'Non disponibile' : `${formatNumber(String(value), 1)} gg`;
const compactEuro = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 0 }).format(value);
const shortLabel = (value: string) => value.length > 21 ? `${value.slice(0, 20)}…` : value;
const entityLabel = (row: { name: string; entityId?: string; ungroupedDocumentId?: string }) =>
  `${row.name} · ${row.entityId ? `ID ${row.entityId}` : `doc. ${row.ungroupedDocumentId} · senza ID FIC`}`;

function Kpi({ title, value, children, principal = false }: { title: string; value: string; children: ReactNode; principal?: boolean }) {
  return <Card className={principal ? 'min-w-0 bg-primary/5 ring-primary/50' : 'min-w-0'}>
    <CardHeader><CardDescription className={principal ? 'text-foreground' : undefined}>{title}</CardDescription>
      <CardTitle className="text-2xl font-semibold tabular-nums tracking-tight">{value}</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs text-muted-foreground">{children}</CardContent>
  </Card>;
}

function TargetProgress({ value, label }: { value?: string; label: string }) {
  return value === undefined ? <p>Obiettivo non configurato o nullo</p> : <>
    <Progress aria-label={label} value={Math.min(100, Number(value))} /><p>{percentage(value)} dell’obiettivo</p>
  </>;
}

export function FinancialKpis({ analysis: a, year }: { analysis: FinancialAnalysis; year: number }) {
  return <section aria-label="Indicatori principali" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
    <Kpi title="Obiettivo" value={eur(a.revenueTarget)}><p>Fatturato obiettivo · {year}</p></Kpi>
    <Kpi title="Fatturato emesso" value={eur(a.issuedRevenue)}>
      <TargetProgress value={a.percentIssuedVsTarget} label="Fatturato emesso rispetto all’obiettivo" /><p>{a.invoiceCount} fatture emesse nel {year}</p>
    </Kpi>
    <Kpi title="Incassato" value={eur(a.collectedRevenue)} principal>
      <TargetProgress value={a.percentCollectedVsTarget} label="Incassato rispetto all’obiettivo" />
      {a.percentCollectedVsTarget !== undefined && a.gapToTarget !== undefined ? <p className="font-medium text-foreground">{d(a.gapToTarget).lt(0)
        ? `Obiettivo superato di ${eur(money(d(a.gapToTarget).abs()))}` : d(a.gapToTarget).isZero() ? 'Obiettivo raggiunto' : `Residuo obiettivo ${eur(a.gapToTarget)}`}</p> : null}
    </Kpi>
    <Kpi title="Da incassare" value={eur(a.outstandingRevenue)}>
      <Badge variant={d(a.overdueRevenue).gt(0) ? 'destructive' : 'secondary'}>Scaduto {eur(a.overdueRevenue)}</Badge>
      <p>{a.outstandingInvoiceCount} fatture aperte · {a.overdueInvoiceCount} scadute</p>
    </Kpi>
    <Kpi title="Costi documentati FIC" value={eur(a.documentedCosts)}>
      <p>{a.costDocumentCount} documenti · {year}</p><p>Costi pagati FIC: {eur(a.paidCosts)}</p><p>Costi pianificati Cash: {eur(a.plannedBusinessCosts)} / anno</p>
    </Kpi>
    <Kpi title="Stima fiscale" value={a.fiscalProjection ? eur(a.fiscalProjection.totalToReserve) : 'Non disponibile'}>
      {a.fiscalProjection ? <><p>Totale stimato da accantonare</p><p>Contributi: {eur(a.fiscalProjection.contributions)}</p><p>Imposta sostitutiva: {eur(a.fiscalProjection.substituteTax)}</p></> : <p>{a.fiscalUnavailableReason}</p>}
    </Kpi>
  </section>;
}

type ChartRow = { label: string; [key: string]: string | number };
function CategoryTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return <text x={x - 4} y={y} dy="0.32em" textAnchor="end" fill="var(--muted-foreground)" fontSize={11}>
    <title>{payload?.value}</title>{shortLabel(payload?.value ?? '')}
  </text>;
}

function AnalysisChart({ title, description, data, config, horizontal = false, dayValues = false }: {
  title: string; description: string; data: ChartRow[]; config: ChartConfig; horizontal?: boolean; dayValues?: boolean;
}) {
  const formatValue = (value: number) => dayValues ? days(value) : compactEuro(value);
  return <Card className="min-w-0"><CardHeader className="min-h-18"><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
    <CardContent>{data.length ? <ChartContainer className="h-80 w-full aspect-auto" config={config}>
      <BarChart accessibilityLayer data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? <><XAxis type="number" tickFormatter={formatValue} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" width={132} interval={0} tick={<CategoryTick />} tickLine={false} axisLine={false} /></> : <>
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tickMargin={8} />
          <YAxis tickFormatter={formatValue} width={64} tickLine={false} axisLine={false} /></>}
        <ChartTooltip content={<ChartTooltipContent className="max-w-80 [&>div:first-child]:whitespace-normal [&>div:first-child]:break-words" labelFormatter={(_label, payload) => payload[0]?.payload?.label}
          formatter={(value, name) => <><span className="text-muted-foreground">{config[String(name)]?.label}</span>
            <span className="ml-auto font-medium tabular-nums">{dayValues ? days(Number(value)) : eur(String(value))}</span></>} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {Object.keys(config).map(key => <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={3} maxBarSize={24} />)}
      </BarChart>
    </ChartContainer> : <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">{dayValues ? 'Nessun pagamento con scadenza e data di pagamento analizzabili.' : 'Nessun documento per l’anno selezionato.'}</div>}</CardContent>
  </Card>;
}

export function FinancialCharts({ analysis: a }: { analysis: FinancialAnalysis }) {
  const monthly = a.monthly.map(row => ({ label: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'][row.month - 1]!,
    issued: Number(row.issuedRevenue), collected: Number(row.collectedRevenue), documented: Number(row.documentedCosts), paid: Number(row.paidCosts) }));
  return <section aria-label="Grafici finanziari" className="grid min-w-0 gap-4 xl:grid-cols-2">
    <AnalysisChart title="Ricavi mensili" description="Emesso per data fattura; incassato per data pagamento, anche su fatture di anni precedenti." data={monthly}
      config={{ issued: { label: 'Fatturato emesso', color: 'var(--chart-1)' }, collected: { label: 'Incassato', color: 'var(--chart-2)' } }} />
    <AnalysisChart title="Costi mensili" description="Spese FIC: documentati per data documento; pagati per data pagamento, anche su documenti di anni precedenti." data={monthly}
      config={{ documented: { label: 'Costi documentati', color: 'var(--chart-1)' }, paid: { label: 'Costi pagati', color: 'var(--chart-2)' } }} />
    <AnalysisChart title="Top 10 clienti per fatturato" description="Fatture dell’anno selezionato e relativi incassi presenti nello snapshot." horizontal
      data={a.clientAnalysis.slice(0, 10).map(row => ({ label: entityLabel(row), issued: Number(row.issuedRevenue), collected: Number(row.collectedRevenue) }))}
      config={{ issued: { label: 'Fatturato', color: 'var(--chart-1)' }, collected: { label: 'Incassato', color: 'var(--chart-2)' } }} />
    <AnalysisChart title="Clienti con maggior ritardo medio" description="Top 10 · pagamenti conclusi delle fatture dell’anno. Insoluti attuali separati nella tabella Pagamenti." horizontal dayValues
      data={a.clientPaymentAnalysis.filter(row => row.analyzedPaymentCount > 0).slice(0, 10).map(row => ({ label: entityLabel(row), delay: row.averageDelayDays! }))}
      config={{ delay: { label: 'Giorni medi di ritardo', color: 'var(--chart-1)' } }} />
    <div className="min-w-0 xl:col-span-2"><AnalysisChart title="Costi per categoria" description="Prime 10 categorie FIC per costo documentato. Tutte le categorie sono consultabili nella tabella Costi." horizontal
      data={a.costCategoryAnalysis.slice(0, 10).map(row => ({ label: row.category, documented: Number(row.documentedCosts) }))}
      config={{ documented: { label: 'Costi documentati', color: 'var(--chart-1)' } }} /></div>
  </section>;
}

function Counterparty({ row }: { row: { name: string; entityId?: string; ungroupedDocumentId?: string } }) {
  return <div className="min-w-40 max-w-64 whitespace-normal break-words"><span>{row.name}</span>
    <p className="mt-1 text-xs text-muted-foreground">{row.entityId ? `ID FIC ${row.entityId}` : `Senza ID FIC · documento ${row.ungroupedDocumentId} non aggregato`}</p></div>;
}

function AggregateTable({ headers, rows }: { headers: string[]; rows: { key: string; cells: ReactNode[] }[] }) {
  return rows.length ? <Table><TableHeader><TableRow>{headers.map((header, index) => <TableHead key={header} className={index ? 'max-w-32 whitespace-normal text-right' : undefined}>{header}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{rows.map(row => <TableRow key={row.key}>{row.cells.map((cell, index) => <TableCell key={index} className={index ? 'text-right tabular-nums' : undefined}>{cell}</TableCell>)}</TableRow>)}</TableBody>
  </Table> : <p className="py-6 text-sm text-muted-foreground">Nessun documento per l’anno selezionato.</p>;
}

export function FinancialAggregates({ analysis: a, year }: { analysis: FinancialAnalysis; year: number }) {
  return <Card className="min-w-0"><CardHeader><CardTitle>Analisi aggregate · {year}</CardTitle>
    <CardDescription>Documenti dell’anno selezionato e tutti i relativi pagamenti nello snapshot, anche di altri anni. Gli importi pagati possono quindi differire dai flussi annuali dei KPI. Senza ID FIC i documenti restano separati.</CardDescription>
  </CardHeader><CardContent><Tabs defaultValue="clients"><TabsList className="h-auto max-w-full flex-wrap justify-start">
    <TabsTrigger value="clients">Clienti</TabsTrigger><TabsTrigger value="payments">Pagamenti</TabsTrigger><TabsTrigger value="costs">Costi</TabsTrigger><TabsTrigger value="suppliers">Fornitori</TabsTrigger>
  </TabsList>
    <TabsContent value="clients"><AggregateTable headers={['Cliente', 'Fatture', 'Fatturato', 'Incassato', 'Da incassare', 'Scaduto', '% fatturato']}
      rows={a.clientAnalysis.map(row => ({ key: row.key, cells: [<Counterparty key="name" row={row} />, row.invoiceCount, eur(row.issuedRevenue), eur(row.collectedRevenue), eur(row.outstandingRevenue), eur(row.overdueRevenue), percentage(row.revenueShare)] }))} /></TabsContent>
    <TabsContent value="payments"><p className="my-3 text-xs text-muted-foreground">Media aritmetica dei ritardi dei pagamenti conclusi con entrambe le date. Pagamenti anticipati o puntuali: 0 giorni. Lo scaduto attuale riguarda rate ancora aperte.</p>
      <AggregateTable headers={['Cliente', 'Pagamenti analizzati', 'Ritardo medio', 'Ritardo massimo', 'Puntuali %', 'Scaduto attuale', 'Fatture scadute', 'Scadenza aperta più vecchia']}
        rows={a.clientPaymentAnalysis.map(row => ({ key: row.key, cells: [<Counterparty key="name" row={row} />, row.analyzedPaymentCount, days(row.averageDelayDays), days(row.maxDelayDays), percentage(row.onTimePercentage), eur(row.overdueRevenue), row.overdueInvoiceCount, row.oldestOpenDueDays === undefined ? '—' : days(row.oldestOpenDueDays)] }))} /></TabsContent>
    <TabsContent value="costs"><div className="my-4 flex flex-wrap gap-x-8 gap-y-2 text-sm"><p>Incidenza costi documentati / fatturato emesso: <strong>{percentage(a.costIncidenceOnIssued)}</strong></p>
      <p>Incidenza costi pagati / incassato: <strong>{percentage(a.paidCostIncidenceOnCollected)}</strong></p></div>
      <p className="mb-3 text-xs text-muted-foreground">Incidenze sui totali annuali dei KPI. Indicatori descrittivi; i costi pianificati Cash restano separati dai documenti FIC.</p>
      <AggregateTable headers={['Categoria', 'Documenti', 'Documentato', 'Pagato', 'Aperto', '% totale']}
        rows={a.costCategoryAnalysis.map(row => ({ key: row.key, cells: [<span key="category" className="block max-w-64 whitespace-normal break-words">{row.category}</span>, row.documentCount, eur(row.documentedCosts), eur(row.paidCosts), eur(row.outstandingCosts), percentage(row.costShare)] }))} /></TabsContent>
    <TabsContent value="suppliers"><AggregateTable headers={['Fornitore', 'Documenti', 'Documentato', 'Pagato', 'Residuo']}
      rows={a.supplierAnalysis.map(row => ({ key: row.key, cells: [<Counterparty key="name" row={row} />, row.documentCount, eur(row.documentedCosts), eur(row.paidCosts), eur(row.outstandingCosts)] }))} /></TabsContent>
  </Tabs></CardContent></Card>;
}
