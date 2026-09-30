import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { calculateFinancialAnalysis, financialYears } from '../../domain/financial-analysis';
import { d, money } from '../../domain/decimal';
import type { CashDocument } from '../../domain/model';
import type { AppState } from '../state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FinancialDocuments } from '@/components/FinancialDocuments';
import { dateIt, eur, formatNumber } from '@/lib/format';

const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

export function FinancialAnalysisView({ doc, appState, hasToken }: { doc: CashDocument; appState: AppState; hasToken: boolean }) {
  const snapshot = doc.financialSnapshot;
  const years = useMemo(() => financialYears(snapshot, doc.profiles), [snapshot, doc.profiles]);
  const now = new Date(); const currentYear = now.getFullYear();
  const today = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [selectedYear, setSelectedYear] = useState<number>();
  const year = selectedYear !== undefined && years.includes(selectedYear) ? selectedYear : years.includes(currentYear) ? currentYear : years[0];
  const analysis = useMemo(() => snapshot && year !== undefined
    ? calculateFinancialAnalysis(snapshot, year, doc.profiles.find(profile => profile.year === year), doc.businessCosts, today)
    : undefined, [snapshot, year, doc.profiles, doc.businessCosts, today]);
  const fic = doc.settings.fic;
  const unavailable = !fic.enabled ? 'Fatture in Cloud disattivato. I dati già acquisiti restano consultabili offline.'
    : !hasToken ? 'Questa postazione richiede configurazione: aggiungi il token in Impostazioni → Integrazioni.'
      : !fic.company ? 'Configura l’azienda Fatture in Cloud nelle Impostazioni.' : undefined;
  const canSync = !unavailable && !appState.session?.readOnly && appState.status !== 'Conflitto esterno';
  const mismatch = snapshot && fic.company && snapshot.company.id !== fic.company.id;
  const chartData = analysis?.monthly.map(month => ({ month: months[month.month - 1]?.slice(0, 3),
    issuedRevenue: Number(month.issuedRevenue), collectedRevenue: Number(month.collectedRevenue),
    documentedCosts: Number(month.documentedCosts), paidCosts: Number(month.paidCosts),
  })) ?? [];

  return <div className="min-w-0 space-y-5">
    <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="space-y-2"><Badge variant="secondary">{unavailable || appState.financialSyncError ? 'Snapshot offline' : 'Snapshot · aggiornamento live manuale'}</Badge>
        <p className="font-medium">{snapshot ? `${snapshot.company.name} · ID ${snapshot.company.id}` : 'Nessuna azienda sincronizzata'}</p>
        <p className="text-sm text-muted-foreground">{snapshot ? `Ultimo aggiornamento: ${new Date(snapshot.acquiredAt).toLocaleString('it-IT')}` : 'Aggiornamento completo solo su richiesta.'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3"><label htmlFor="financial-year" className="text-sm">Anno</label>
        <NativeSelect id="financial-year" value={year ?? ''} disabled={!years.length} onChange={event => setSelectedYear(Number(event.target.value))}>
          {!years.length ? <NativeSelectOption value="">Nessun anno disponibile</NativeSelectOption> : years.map(value => <NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}
        </NativeSelect>
        <Button disabled={!canSync || appState.financialSyncing} onClick={() => void appState.syncFinancialData()}>
          <RefreshCw className={appState.financialSyncing ? 'animate-spin' : undefined} />{appState.financialSyncing ? 'Aggiornamento in corso…' : 'Aggiorna dati Fatture in Cloud'}
        </Button>
      </div>
    </CardContent></Card>
    {unavailable ? <Alert><AlertTitle>Aggiornamento live non disponibile</AlertTitle><AlertDescription>{unavailable}{snapshot ? ` Snapshot aggiornato al ${dateIt(snapshot.acquiredAt)}.` : ''}</AlertDescription></Alert> : null}
    {appState.financialSyncError ? <Alert><AlertTitle>Ultimo aggiornamento non riuscito</AlertTitle><AlertDescription>Stai consultando lo snapshot precedente. Puoi ripetere l’aggiornamento manuale.</AlertDescription></Alert> : null}
    {mismatch ? <Alert><AlertTitle>Azienda diversa dallo snapshot</AlertTitle><AlertDescription>Stai consultando {snapshot.company.name}. Il collegamento attuale è con {fic.company?.name}. Un aggiornamento riuscito sostituirà integralmente questi dati con quelli dell’azienda configurata.</AlertDescription></Alert> : null}
    {!snapshot ? <Card><CardContent className="py-12 text-center"><h2 className="text-lg font-semibold">Nessun dato finanziario sincronizzato</h2><p className="mt-2 text-sm text-muted-foreground">{canSync ? 'Usa Aggiorna dati Fatture in Cloud per acquisire fatture, spese e pagamenti registrati.' : 'Configura Fatture in Cloud per acquisire il primo snapshot.'}</p></CardContent></Card> : null}
    {snapshot && !analysis ? <Alert><AlertDescription>Lo snapshot non contiene documenti registrati o pagamenti con un anno disponibile e non sono presenti profili annuali. Gli eventuali documenti in ingresso restano consultabili sotto.</AlertDescription></Alert> : null}
    {analysis ? <>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader><CardDescription>Obiettivo annuale</CardDescription><CardTitle className="text-2xl tabular-nums">{eur(analysis.revenueTarget)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Fatturato obiettivo {year}</CardContent></Card>
        <Card><CardHeader><CardDescription>Fatturato emesso</CardDescription><CardTitle className="text-2xl tabular-nums">{eur(analysis.issuedRevenue)}</CardTitle></CardHeader><CardContent className="space-y-2">
          <Progress aria-label="Fatturato emesso rispetto all’obiettivo" value={analysis.percentIssuedVsTarget === undefined ? 0 : Math.min(100, Number(analysis.percentIssuedVsTarget))} />
          <p className="text-xs text-muted-foreground">{analysis.percentIssuedVsTarget === undefined ? 'Obiettivo non configurato o nullo' : `${formatNumber(analysis.percentIssuedVsTarget, 2)}% dell’obiettivo`}</p>
        </CardContent></Card>
        <Card className="border-primary/50 bg-primary/5"><CardHeader><CardDescription className="text-foreground">Incassato</CardDescription><CardTitle className="text-2xl tabular-nums">{eur(analysis.collectedRevenue)}</CardTitle></CardHeader><CardContent className="space-y-2">
          <Progress aria-label="Incassato rispetto all’obiettivo" value={analysis.percentCollectedVsTarget === undefined ? 0 : Math.min(100, Number(analysis.percentCollectedVsTarget))} />
          <p className="text-xs text-muted-foreground">{analysis.percentCollectedVsTarget === undefined ? 'Obiettivo non configurato o nullo' : `${formatNumber(analysis.percentCollectedVsTarget, 2)}% dell’obiettivo`}</p>
        </CardContent></Card>
        <Card><CardHeader><CardDescription>Da incassare</CardDescription><CardTitle className="text-2xl tabular-nums">{eur(analysis.outstandingRevenue)}</CardTitle></CardHeader><CardContent><Badge variant={d(analysis.overdueRevenue).gt(0) ? 'destructive' : 'secondary'}>di cui scaduto {eur(analysis.overdueRevenue)}</Badge></CardContent></Card>
        <Card><CardHeader><CardDescription>Stima fiscale</CardDescription><CardTitle className="text-2xl tabular-nums">{analysis.fiscalProjection ? eur(analysis.fiscalProjection.totalToReserve) : 'Non disponibile'}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">{analysis.fiscalProjection ? 'Totale stimato da accantonare' : analysis.fiscalUnavailableReason}</CardContent></Card>
      </div>
      <p className="text-sm text-muted-foreground">{analysis.gapToTarget === undefined || analysis.revenueTarget === undefined || d(analysis.revenueTarget).isZero() ? 'Obiettivo annuale non configurato o nullo' : d(analysis.gapToTarget).lt(0) ? `Obiettivo superato di ${eur(money(d(analysis.gapToTarget).abs()))}` : d(analysis.gapToTarget).isZero() ? 'Obiettivo raggiunto' : `Mancano ${eur(analysis.gapToTarget)} all’obiettivo`}. Da incassare e scaduto riguardano le fatture emesse nell’anno. Le note di credito restano separate.</p>
      <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
        <Card className="min-w-0"><CardHeader><CardTitle>Ricavi mensili</CardTitle><CardDescription>Emesso per data fattura; incassato per data pagamento, anche per fatture di anni precedenti.</CardDescription></CardHeader><CardContent>
          <ChartContainer className="h-64 w-full aspect-auto" config={{ issuedRevenue: { label: 'Fatturato emesso', color: 'var(--chart-1)' }, collectedRevenue: { label: 'Incassato', color: 'var(--chart-2)' } }}>
            <BarChart accessibilityLayer data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} interval={0} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={value => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 0 }).format(Number(value))} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <><span className="text-muted-foreground">{name === 'issuedRevenue' ? 'Fatturato emesso' : 'Incassato'}</span><span className="ml-auto font-medium tabular-nums">{eur(String(value))}</span></>} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="issuedRevenue" fill="var(--color-issuedRevenue)" radius={3} /><Bar dataKey="collectedRevenue" fill="var(--color-collectedRevenue)" radius={3} />
            </BarChart>
          </ChartContainer>
        </CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle>Costi mensili</CardTitle><CardDescription>Solo spese registrate FIC: documentati per data documento, pagati per data pagamento.</CardDescription></CardHeader><CardContent>
          <ChartContainer className="h-64 w-full aspect-auto" config={{ documentedCosts: { label: 'Costi documentati', color: 'var(--chart-1)' }, paidCosts: { label: 'Costi pagati', color: 'var(--chart-2)' } }}>
            <BarChart accessibilityLayer data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} interval={0} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={value => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 0 }).format(Number(value))} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <><span className="text-muted-foreground">{name === 'documentedCosts' ? 'Costi documentati' : 'Costi pagati'}</span><span className="ml-auto font-medium tabular-nums">{eur(String(value))}</span></>} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="documentedCosts" fill="var(--color-documentedCosts)" radius={3} /><Bar dataKey="paidCosts" fill="var(--color-paidCosts)" radius={3} />
            </BarChart>
          </ChartContainer>
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Costi · pianificazione e dati registrati</CardTitle><CardDescription>I costi pianificati sono la previsione Cash corrente, annualizzata. I documenti FIC restano distinti e non vengono sommati alla previsione.</CardDescription></CardHeader><CardContent>
        <dl className="grid grid-cols-2 gap-5 xl:grid-cols-4">{[
          ['Costi pianificati Cash', analysis.plannedBusinessCosts], ['Costi documentati FIC', analysis.documentedCosts], ['Costi pagati FIC', analysis.paidCosts], ['Note di credito ricevute', analysis.receivedCreditNotes],
        ].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{eur(value)}</dd></div>)}</dl>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Stima fiscale sull’incassato</CardTitle><CardDescription>Profilo fiscale {year}. Stima forfettaria: i costi documentati non riducono la base imponibile.</CardDescription></CardHeader><CardContent>
        {analysis.fiscalProjection ? <dl className="grid grid-cols-2 gap-5 xl:grid-cols-3">{[
          ['Reddito forfettario', analysis.fiscalProjection.forfaitIncome], ['Contributi stimati', analysis.fiscalProjection.contributions], ['Imposta sostitutiva stimata', analysis.fiscalProjection.substituteTax],
          ['Totale stimato da accantonare', analysis.fiscalProjection.totalToReserve], ['Netto fiscale stimato', analysis.fiscalProjection.fiscalNet],
        ].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{eur(value)}</dd></div>)}</dl>
          : <Alert><AlertTitle>Stima fiscale non disponibile</AlertTitle><AlertDescription>{analysis.fiscalUnavailableReason} Gli altri dati finanziari restano disponibili.</AlertDescription></Alert>}
        {analysis.fiscalWarnings.map(warning => <p key={warning} className="mt-3 text-sm">{warning}</p>)}
      </CardContent></Card>
      <Card><CardContent><Collapsible><CollapsibleTrigger render={<Button variant="ghost" />}>Dettaglio mensile · {year} · mostra / nascondi</CollapsibleTrigger><CollapsibleContent><Table><TableHeader><TableRow><TableHead>Mese</TableHead>{['Fatturato emesso', 'Incassato', 'Costi documentati', 'Costi pagati'].map(label => <TableHead key={label} className="text-right">{label}</TableHead>)}</TableRow></TableHeader><TableBody>
        {analysis.monthly.map(month => <TableRow key={month.month}><TableCell>{months[month.month - 1]}</TableCell>{[month.issuedRevenue, month.collectedRevenue, month.documentedCosts, month.paidCosts].map((value, index) => <TableCell key={index} className="text-right tabular-nums">{eur(value)}</TableCell>)}</TableRow>)}
      </TableBody></Table></CollapsibleContent></Collapsible></CardContent></Card>
    </> : null}
    {snapshot ? <FinancialDocuments key={`${snapshot.company.id}:${snapshot.acquiredAt}:${year}`} snapshot={snapshot} year={year} today={today} /> : null}
    <p className="text-xs text-muted-foreground">Cash utilizza dati amministrativi provenienti da Fatture in Cloud per analisi e pianificazione. I documenti si gestiscono in Fatture in Cloud; Cash non è un software contabile e non sostituisce il commercialista.</p>
  </div>;
}
