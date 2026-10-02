import { useMemo, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Layer, Line, Rectangle, ReferenceLine, Sankey, Text, XAxis, YAxis, type SankeyNodeProps } from 'recharts';
import { buildFinancialOverviewFlow, type FinancialOverview } from '../../domain/financial-overview';
import { d } from '../../domain/decimal';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { dateIt, eur, formatNumber } from '@/lib/format';

const amount = (value?: string) => value === undefined ? 'Non disponibile' : eur(value);
const percentage = (value: string) => `${formatNumber(value, 2)}%`;
const compactEuro = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 0 }).format(value);
const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const monthlyConfig = {
  collected: { label: 'Incassato FIC', color: 'var(--chart-1)' },
  bank: { label: 'Spese bancarie', color: 'var(--chart-2)' },
  margin: { label: 'Margine prima della fiscalità', color: 'var(--chart-3)' },
} satisfies ChartConfig;

function Kpi({ title, value, children }: { title: string; value?: string; children: ReactNode }) {
  return <Card className="min-w-0"><CardHeader><CardDescription>{title}</CardDescription>
    <CardTitle className="text-2xl tabular-nums">{amount(value)}</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs text-muted-foreground">{children}</CardContent></Card>;
}

function TargetProgress({ value, label }: { value?: string; label: string }) {
  return value === undefined ? <p>Confronto obiettivo non disponibile</p> : <>
    <Progress aria-label={label} value={Math.min(100, Number(value))} /><p>{percentage(value)} dell’obiettivo</p>
  </>;
}

function AmountRow({ label, value, strong = false }: { label: string; value?: string; strong?: boolean }) {
  return <div className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 ${strong ? 'font-semibold' : ''}`}>
    <dt>{label}</dt><dd className="tabular-nums">{amount(value)}</dd>
  </div>;
}

function OverviewKpis({ overview: o }: { overview: FinancialOverview }) {
  const a = o.analysis;
  const deficit = o.effectiveAvailability !== undefined && d(o.effectiveAvailability).lt(0);
  return <section aria-label="Indicatori principali" className="space-y-4">
    <Card className={deficit ? 'border-destructive bg-destructive/5 ring-destructive/30' : 'bg-primary/5 ring-primary/40'}>
      <CardHeader><CardDescription className="font-medium text-foreground">{deficit ? 'Disavanzo dopo accantonamento' : 'Disponibilità effettiva'}</CardDescription>
        <CardTitle className={`text-3xl tabular-nums sm:text-4xl ${deficit ? 'text-destructive' : ''}`}>{amount(o.effectiveAvailability)}</CardTitle>
        <CardDescription>Saldo bancario di riferimento − Residuo fiscale da accantonare</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {o.bankBalance ? <p>Saldo inserito manualmente al {dateIt(o.bankBalance.date)}: {eur(o.bankBalance.amount)}. Aggiornalo quando cambia.</p> : <p>Inserisci il saldo reale e la sua data in “Modifica situazione”.</p>}
        {o.fiscalReserve === undefined ? <p>{o.fiscalUnavailableReason}</p> : null}
        {deficit ? <p>Il saldo non copre il residuo da accantonare.</p> : null}
        <p className="text-xs text-muted-foreground">Indicazione prudenziale sul saldo indicato e sulla previsione {o.year}. I versamenti già effettuati sono inclusi nel saldo; “Già coperto” è sotto il tuo controllo.</p>
      </CardContent>
    </Card>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Kpi title="Fatturato emesso" value={o.issuedRevenue}>
        <p>Obiettivo {o.year}: {amount(a?.revenueTarget)}</p>
        <TargetProgress value={a?.percentIssuedVsTarget} label="Fatturato emesso rispetto all’obiettivo" />
        <p>Fatture emesse nell’anno; note di credito separate.</p>
      </Kpi>
      <Kpi title="Incassato" value={o.collectedRevenue}>
        <TargetProgress value={a?.percentCollectedVsTarget} label="Incassato rispetto all’obiettivo" />
        <p>Pagamenti FIC nell’anno, anche per fatture di anni precedenti.</p>
      </Kpi>
      <Kpi title="Da incassare" value={o.outstandingRevenue}>
        <Badge variant={o.overdueRevenue !== undefined && d(o.overdueRevenue).gt(0) ? 'destructive' : 'secondary'}>Scaduto: {amount(o.overdueRevenue)}</Badge>
        <p>Residui delle fatture emesse nel {o.year}.</p>
        {a ? <p>{a.outstandingInvoiceCount} fatture aperte · {a.overdueInvoiceCount} scadute</p> : null}
      </Kpi>
      <Kpi title="Spese bancarie" value={o.bankExpenses}>
        <p>{o.bankSummary.count} uscite importate o inserite nel {o.year}</p>
        {o.bankExpenseShareOfCollections !== undefined ? <p>Spese / Incassato: {percentage(o.bankExpenseShareOfCollections)}</p> : null}
      </Kpi>
      <Kpi title="Margine prima della fiscalità" value={o.cashMarginBeforeTax}>
        <p>Incassato − Spese bancarie</p>
        {o.cashMarginBeforeTax !== undefined && d(o.cashMarginBeforeTax).lt(0) ? <Badge variant="destructive">Uscite superiori agli incassi</Badge> : null}
      </Kpi>
      <Kpi title="Da accantonare" value={o.fiscalReserve}>
        {o.fiscalReserve !== undefined ? <><p>Previsione totale: {eur(o.fiscalSituation.total)}</p><p>Già coperto: {eur(o.fiscalSituation.covered)}</p></> : <p>{o.fiscalUnavailableReason}</p>}
      </Kpi>
    </div>
    {a?.fiscalWarnings.map(warning => <Alert key={warning}><AlertTitle>Stima fiscale</AlertTitle><AlertDescription>{warning}</AlertDescription></Alert>)}
  </section>;
}

function CashFormation({ overview: o }: { overview: FinancialOverview }) {
  return <Card><CardHeader><CardTitle>Margine dei flussi annuali · {o.year}</CardTitle>
    <CardDescription>Incassi FIC meno uscite bancarie dell’anno e residuo da accantonare. Questo margine non è il saldo del conto.</CardDescription>
  </CardHeader><CardContent><dl className="max-w-3xl space-y-3 text-sm">
    <AmountRow label="Incassato" value={o.collectedRevenue} />
    <AmountRow label="− Spese bancarie" value={o.bankExpenses} />
    <Separator />
    <AmountRow label="Margine prima della fiscalità" value={o.cashMarginBeforeTax} strong />
    <AmountRow label="− Da accantonare" value={o.fiscalReserve} />
    <Separator />
    <AmountRow label="Margine dopo accantonamento" value={o.availableAfterTaxAndExpenses} strong />
  </dl></CardContent></Card>;
}

function FiscalSituation({ overview: o, onEdit, readOnly }: { overview: FinancialOverview; onEdit(): void; readOnly: boolean }) {
  return <Card><CardHeader><CardTitle>Situazione fiscale · {o.year}</CardTitle>
    <CardDescription>Stima finanziaria prudenziale, non una posizione fiscale definitiva. Può non comprendere elementi di anni precedenti.</CardDescription>
    <Button variant="outline" className="w-fit" disabled={readOnly} onClick={onEdit}>Modifica situazione</Button>
  </CardHeader><CardContent className="space-y-4"><dl className="max-w-3xl space-y-3 text-sm">
    <AmountRow label="Stima automatica" value={o.fiscalSituation.automaticEstimate} />
    <AmountRow label="+ Integrazioni" value={o.fiscalSituation.additions} />
    <AmountRow label="Previsione fiscale totale" value={o.fiscalSituation.total} strong />
    <Separator />
    <AmountRow label="− Già coperto" value={o.fiscalSituation.covered} />
    <AmountRow label="Da accantonare" value={o.fiscalReserve} strong />
    <Separator />
    <AmountRow label="Saldo bancario di riferimento" value={o.bankBalance?.amount} />
    <AmountRow label="Disponibilità effettiva (saldo − da accantonare)" value={o.effectiveAvailability} strong />
  </dl>
    <p className="text-xs text-muted-foreground">La stima automatica comprende contributi ({amount(o.fiscalContributions)}) e imposta sostitutiva ({amount(o.fiscalSubstituteTax)}). I pagamenti fiscali restano nelle uscite bancarie e nelle categorie assegnate; non determinano automaticamente la copertura.</p>
    {d(o.fiscalSituation.covered).gt(o.fiscalSituation.total ?? Infinity) ? <p className="text-sm text-muted-foreground">La copertura supera la previsione: da accantonare è zero. Non viene calcolato alcun credito o riporto.</p> : null}
  </CardContent></Card>;
}

function FlowNode({ x, y, width, height, payload }: SankeyNodeProps) {
  const terminal = !payload.targetNodes.length;
  const labelX = terminal ? x - 8 : x + width + 8;
  return <Layer>
    <Rectangle x={x} y={y} width={width} height={height} fill="var(--chart-1)" />
    <Text x={labelX} y={y + height / 2 - 8} width={155} maxLines={2} textAnchor={terminal ? 'end' : 'start'} verticalAnchor="middle" fill="var(--foreground)" fontSize={12}>{payload.name}</Text>
    <Text x={labelX} y={y + height / 2 + 20} textAnchor={terminal ? 'end' : 'start'} fill="var(--muted-foreground)" fontSize={11}>{eur(String(payload.value))}</Text>
  </Layer>;
}

function AnnualFlow({ overview }: { overview: FinancialOverview }) {
  const flow = useMemo(() => buildFinancialOverviewFlow(overview), [overview]);
  return <Card className="min-w-0"><CardHeader><CardTitle>Flusso finanziario · {overview.year}</CardTitle>
    <CardDescription>Top 5 clienti e altri clienti → Incassato → Spese e margine → Residuo da accantonare e margine annuale. Il saldo manuale non entra nei flussi. I rami a zero sono omessi.</CardDescription>
  </CardHeader><CardContent className="space-y-4">
    {flow.links.length ? <div className="overflow-x-auto"><ChartContainer config={{}} className="h-100 min-w-216 w-full aspect-auto" role="img" aria-label="Ripartizione degli incassi annuali; importi riportati nei KPI e nel riepilogo del disponibile">
      <Sankey data={flow} node={FlowNode} nodeWidth={12} nodePadding={52} sort={false} align="left" margin={{ top: 24, bottom: 24, left: 8, right: 8 }} link={{ stroke: 'var(--chart-1)', strokeOpacity: 0.18 }}>
        <ChartTooltip formatter={(value, name) => [eur(String(value)), name]} />
      </Sankey>
    </ChartContainer></div> : null}
    {flow.message ? <p className="text-sm text-muted-foreground">{flow.message}</p> : null}
  </CardContent></Card>;
}

function MonthlyFlow({ overview: o }: { overview: FinancialOverview }) {
  const data = o.monthly.map(row => ({ label: months[row.month - 1], collected: row.collectedRevenue === undefined ? null : Number(row.collectedRevenue),
    bank: Number(row.bankExpenses), margin: row.cashMarginBeforeTax === undefined ? null : Number(row.cashMarginBeforeTax) }));
  return <Card className="min-w-0"><CardHeader><CardTitle>Flusso mensile di cassa · {o.year}</CardTitle>
    <CardDescription>Incassi per data pagamento FIC; spese per data del movimento. Nessuna distribuzione mensile della fiscalità.</CardDescription>
  </CardHeader><CardContent>
    {!o.analysis ? <p className="mb-3 text-sm text-muted-foreground">Incassato e margine non disponibili: manca lo snapshot FIC.</p> : null}
    <ChartContainer config={monthlyConfig} className="h-88 w-full aspect-auto">
      <ComposedChart accessibilityLayer data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} />
        <YAxis width={70} tickFormatter={compactEuro} axisLine={false} tickLine={false} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <><span>{monthlyConfig[String(name) as keyof typeof monthlyConfig]?.label}</span><span className="ml-auto tabular-nums">{eur(String(value))}</span></>} />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />
        {o.analysis ? <Bar dataKey="collected" fill="var(--color-collected)" radius={3} maxBarSize={24} /> : null}
        <Bar dataKey="bank" fill="var(--color-bank)" radius={3} maxBarSize={24} />
        {o.analysis ? <Line dataKey="margin" stroke="var(--color-margin)" strokeWidth={2} dot={false} /> : null}
      </ComposedChart>
    </ChartContainer>
  </CardContent></Card>;
}

function HorizontalAmounts({ title, description, rows, empty }: {
  title: string; description: string; rows: { key: string; name: string; amount: string }[]; empty: string;
}) {
  const data = rows.map(row => ({ ...row, value: Number(row.amount) }));
  return <Card className="min-w-0"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
    <CardContent>{data.length ? <ChartContainer config={{ value: { label: title, color: 'var(--chart-2)' } }} className="w-full aspect-auto" style={{ height: Math.max(200, data.length * 46 + 35) }}>
      <BarChart accessibilityLayer layout="vertical" data={data} margin={{ left: 0, right: 14, top: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} /><XAxis type="number" tickFormatter={compactEuro} axisLine={false} tickLine={false} />
        <YAxis dataKey="key" type="category" width={135} interval={0} tickLine={false} axisLine={false}
          tickFormatter={key => { const name = rows.find(row => row.key === key)?.name ?? ''; return name.length > 20 ? `${name.slice(0, 19)}…` : name; }} />
        <ChartTooltip content={<ChartTooltipContent className="max-w-80 [&>div:first-child]:whitespace-normal" labelFormatter={(_label, payload) => payload[0]?.payload?.name}
          formatter={value => <span className="tabular-nums">{eur(String(value))}</span>} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={3} maxBarSize={22} />
      </BarChart>
    </ChartContainer> : <p className="py-8 text-sm text-muted-foreground">{empty}</p>}</CardContent>
  </Card>;
}

function SourceComparison({ overview: o }: { overview: FinancialOverview }) {
  return <Card><CardHeader><CardTitle>Costi e uscite · confronto fonti</CardTitle>
    <CardDescription>Valori confrontabili visivamente, ma non sommabili automaticamente: una fattura FIC e un movimento bancario possono descrivere la stessa spesa.</CardDescription>
  </CardHeader><CardContent><dl className="grid gap-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
    {[
      { label: 'Costi pianificati Cash', value: o.plannedBusinessCosts, note: 'Previsione del piano annuale corrente.' },
      { label: 'Costi documentati FIC', value: o.documentedCosts, note: 'Documenti di costo emessi nell’anno.' },
      { label: 'Costi pagati FIC', value: o.ficPaidCosts, note: 'Pagamenti registrati sui documenti nell’anno.' },
      { label: 'Uscite bancarie', value: o.bankExpenses, note: 'Uscite effettive importate o inserite nell’anno.' },
    ].map(row => <div key={row.label} className="space-y-2"><dt>{row.label}</dt><dd className="text-xl font-semibold tabular-nums">{amount(row.value)}</dd><dd className="text-xs text-muted-foreground">{row.note}</dd></div>)}
  </dl></CardContent></Card>;
}

export function FinancialOverviewDashboard({ overview, onEdit, readOnly }: { overview: FinancialOverview; onEdit(): void; readOnly: boolean }) {
  const categories = [
    ...overview.bankSummary.categories.map(category => ({ key: category.id, name: category.name, amount: category.amount })),
    { key: 'uncategorized', name: 'Senza categoria', amount: overview.bankSummary.uncategorized.amount },
  ].filter(row => d(row.amount).gt(0)).sort((a, b) => d(b.amount).cmp(a.amount)).slice(0, 10);
  return <div className="min-w-0 space-y-6">
    <h2 className="text-lg font-semibold">Panoramica finanziaria · {overview.year}</h2>
    <OverviewKpis overview={overview} />
    <FiscalSituation overview={overview} onEdit={onEdit} readOnly={readOnly} />
    <CashFormation overview={overview} />
    <section aria-label="Flussi" className="min-w-0 space-y-4"><h2 className="text-lg font-semibold">Flussi</h2>
      <AnnualFlow overview={overview} /><MonthlyFlow overview={overview} />
    </section>
    <section aria-label="Origine e destinazione" className="min-w-0 space-y-4"><h2 className="text-lg font-semibold">Origine e destinazione</h2>
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <HorizontalAmounts title={`Incassi per cliente · ${overview.year}`} description="Da dove arrivano i soldi · Top 10 per pagamenti avvenuti nell’anno, anche su fatture di anni precedenti. I nomi completi sono visibili al passaggio sul grafico."
          rows={overview.collectionsByClient.slice(0, 10)} empty={overview.analysis ? 'Nessun incasso nell’anno selezionato.' : 'Incassi non disponibili: manca lo snapshot FIC.'} />
        <HorizontalAmounts title={`Spese per categoria · ${overview.year}`} description="Dove vanno i soldi · Prime 10 categorie principali, comprensive delle sottocategorie. Una spesa può appartenere a più categorie; questi valori non costituiscono una ripartizione esclusiva del totale."
          rows={categories} empty="Nessuna spesa bancaria nell’anno selezionato." />
      </div>
    </section>
    <section aria-label="Confronto fonti" className="space-y-4"><h2 className="text-lg font-semibold">Confronto fonti</h2><SourceComparison overview={overview} /></section>
  </div>;
}
