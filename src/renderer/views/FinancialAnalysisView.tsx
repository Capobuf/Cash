import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { calculateFinancialOverview } from '../../domain/financial-overview';
import type { CashDocument } from '../../domain/model';
import type { AppState } from '../state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FinancialDocuments } from '@/components/FinancialDocuments';
import { dateIt, eur } from '@/lib/format';
import { FinancialCharts, FinancialAggregates } from '@/components/FinancialDashboard';
import { FinancialOverviewDashboard } from '@/components/FinancialOverviewDashboard';

const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

export function FinancialAnalysisView({ doc, appState, hasToken, year }: { doc: CashDocument; appState: AppState; hasToken: boolean; year: number | undefined }) {
  const snapshot = doc.financialSnapshot;
  const now = new Date(); const currentYear = now.getFullYear();
  const today = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const overview = useMemo(() => year !== undefined ? calculateFinancialOverview(doc, year, today) : undefined, [doc, year, today]);
  const analysis = overview?.analysis;
  const fic = doc.settings.fic;
  const unavailable = !fic.enabled ? 'Fatture in Cloud disattivato. I dati già acquisiti restano consultabili offline.'
    : !hasToken ? 'Questa postazione richiede configurazione: aggiungi il token in Impostazioni → Integrazioni.'
      : !fic.company ? 'Configura l’azienda Fatture in Cloud nelle Impostazioni.' : undefined;
  const canSync = !unavailable && !appState.session?.readOnly && appState.status !== 'Conflitto esterno';
  const mismatch = snapshot && fic.company && snapshot.company.id !== fic.company.id;

  return <div className="min-w-0 space-y-5">
    <Card><CardContent className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1"><Badge variant="secondary">{unavailable || appState.financialSyncError ? 'Snapshot offline' : 'Snapshot · aggiornamento live manuale'}</Badge>
        <p className="font-medium">{snapshot?.company.name ?? 'Nessuna azienda sincronizzata'}</p>
        <p className="text-sm text-muted-foreground">{snapshot ? `Ultimo aggiornamento: ${new Date(snapshot.acquiredAt).toLocaleString('it-IT')}` : 'Aggiornamento completo solo su richiesta.'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!canSync || appState.financialSyncing} onClick={() => void appState.syncFinancialData()}>
          <RefreshCw className={appState.financialSyncing ? 'animate-spin' : undefined} />{appState.financialSyncing ? 'Aggiornamento in corso…' : 'Aggiorna dati Fatture in Cloud'}
        </Button>
      </div>
    </CardContent></Card>
    {unavailable ? <Alert><AlertTitle>Aggiornamento live non disponibile</AlertTitle><AlertDescription>{unavailable}{snapshot ? ` Snapshot aggiornato al ${dateIt(snapshot.acquiredAt)}.` : ''}</AlertDescription></Alert> : null}
    {appState.financialSyncError ? <Alert><AlertTitle>Ultimo aggiornamento non riuscito</AlertTitle><AlertDescription>Stai consultando lo snapshot precedente. Puoi ripetere l’aggiornamento manuale.</AlertDescription></Alert> : null}
    {mismatch ? <Alert><AlertTitle>Azienda diversa dallo snapshot</AlertTitle><AlertDescription>Stai consultando {snapshot.company.name}. Il collegamento attuale è con {fic.company?.name}. Un aggiornamento riuscito sostituirà integralmente questi dati con quelli dell’azienda configurata.</AlertDescription></Alert> : null}
    {overview ? <FinancialOverviewDashboard overview={overview} /> : <Alert><AlertDescription>Nessun anno disponibile. Aggiungi un profilo annuale, un movimento bancario o sincronizza Fatture in Cloud.</AlertDescription></Alert>}
    {!snapshot ? <Card><CardContent className="py-12 text-center"><h2 className="text-lg font-semibold">Nessun dato finanziario sincronizzato</h2><p className="mt-2 text-sm text-muted-foreground">{canSync ? 'Usa Aggiorna dati Fatture in Cloud per acquisire fatture, spese e pagamenti registrati.' : 'Configura Fatture in Cloud per acquisire il primo snapshot.'}</p></CardContent></Card> : null}
    {snapshot && !analysis ? <Alert><AlertDescription>Lo snapshot non contiene documenti registrati o pagamenti con un anno disponibile e non sono presenti profili annuali. Gli eventuali documenti in ingresso restano consultabili sotto.</AlertDescription></Alert> : null}
    {snapshot ? <Collapsible className="space-y-4">
      <CollapsibleTrigger render={<Button variant="outline" className="h-auto whitespace-normal text-left" />}>Dettaglio Fatture in Cloud · mostra / nascondi</CollapsibleTrigger>
      <CollapsibleContent className="space-y-4">
        {analysis ? <>
          <p className="text-xs text-muted-foreground">Da incassare e scaduto riguardano le fatture emesse nell’anno. Le note di credito restano separate. I costi pianificati Cash sono il piano annuale corrente, non sommato ai costi FIC.</p>
          <FinancialCharts analysis={analysis} />
          <FinancialAggregates analysis={analysis} year={year!} />
          <Card><CardContent><Collapsible><CollapsibleTrigger render={<Button variant="ghost" />}>Dettaglio mensile FIC · {year} · mostra / nascondi</CollapsibleTrigger><CollapsibleContent><Table><TableHeader><TableRow><TableHead>Mese</TableHead>{['Fatturato emesso', 'Incassato', 'Costi documentati', 'Costi pagati'].map(label => <TableHead key={label} className="text-right">{label}</TableHead>)}</TableRow></TableHeader><TableBody>
            {analysis.monthly.map(month => <TableRow key={month.month}><TableCell>{months[month.month - 1]}</TableCell>{[month.issuedRevenue, month.collectedRevenue, month.documentedCosts, month.paidCosts].map((value, index) => <TableCell key={index} className="text-right tabular-nums">{eur(value)}</TableCell>)}</TableRow>)}
          </TableBody></Table></CollapsibleContent></Collapsible></CardContent></Card>
        </> : null}
        <FinancialDocuments key={`${snapshot.company.id}:${snapshot.acquiredAt}:${year}`} snapshot={snapshot} year={year} today={today} />
      </CollapsibleContent>
    </Collapsible> : null}
    <p className="text-xs text-muted-foreground">Cash utilizza dati amministrativi provenienti da Fatture in Cloud per analisi e pianificazione. I documenti si gestiscono in Fatture in Cloud; Cash non è un software contabile e non sostituisce il commercialista.</p>
  </div>;
}
