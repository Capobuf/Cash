import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { calculateFinancialAnalysis, financialYears } from '../../domain/financial-analysis';
import type { CashDocument } from '../../domain/model';
import type { AppState } from '../state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FinancialDocuments } from '@/components/FinancialDocuments';
import { dateIt, eur } from '@/lib/format';
import { FinancialKpis, FinancialCharts, FinancialAggregates } from '@/components/FinancialDashboard';

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

  return <div className="min-w-0 space-y-5">
    <Card><CardContent className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1"><Badge variant="secondary">{unavailable || appState.financialSyncError ? 'Snapshot offline' : 'Snapshot · aggiornamento live manuale'}</Badge>
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
    {analysis ? <FinancialKpis analysis={analysis} year={year!} /> : null}
    {unavailable ? <Alert><AlertTitle>Aggiornamento live non disponibile</AlertTitle><AlertDescription>{unavailable}{snapshot ? ` Snapshot aggiornato al ${dateIt(snapshot.acquiredAt)}.` : ''}</AlertDescription></Alert> : null}
    {appState.financialSyncError ? <Alert><AlertTitle>Ultimo aggiornamento non riuscito</AlertTitle><AlertDescription>Stai consultando lo snapshot precedente. Puoi ripetere l’aggiornamento manuale.</AlertDescription></Alert> : null}
    {mismatch ? <Alert><AlertTitle>Azienda diversa dallo snapshot</AlertTitle><AlertDescription>Stai consultando {snapshot.company.name}. Il collegamento attuale è con {fic.company?.name}. Un aggiornamento riuscito sostituirà integralmente questi dati con quelli dell’azienda configurata.</AlertDescription></Alert> : null}
    {!snapshot ? <Card><CardContent className="py-12 text-center"><h2 className="text-lg font-semibold">Nessun dato finanziario sincronizzato</h2><p className="mt-2 text-sm text-muted-foreground">{canSync ? 'Usa Aggiorna dati Fatture in Cloud per acquisire fatture, spese e pagamenti registrati.' : 'Configura Fatture in Cloud per acquisire il primo snapshot.'}</p></CardContent></Card> : null}
    {snapshot && !analysis ? <Alert><AlertDescription>Lo snapshot non contiene documenti registrati o pagamenti con un anno disponibile e non sono presenti profili annuali. Gli eventuali documenti in ingresso restano consultabili sotto.</AlertDescription></Alert> : null}
    {analysis ? <>
      <p className="text-xs text-muted-foreground">Da incassare e scaduto riguardano le fatture emesse nell’anno. Le note di credito restano separate. I costi pianificati Cash sono il piano annuale corrente, non sommato ai costi FIC.</p>
      <FinancialCharts analysis={analysis} />
      <FinancialAggregates analysis={analysis} year={year!} />
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
