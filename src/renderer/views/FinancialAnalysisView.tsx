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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const outstanding = analysis?.invoiceDetails.filter(detail => d(detail.outstanding).gt(0)) ?? [];

  return <div className="space-y-5">
    <Card><CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
      <div className="space-y-2"><Badge variant="secondary">Analisi dei dati Fatture in Cloud</Badge>
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
    {mismatch ? <Alert><AlertTitle>Azienda diversa dallo snapshot</AlertTitle><AlertDescription>Stai consultando {snapshot.company.name}. Il collegamento attuale è con {fic.company?.name}. Un aggiornamento riuscito sostituirà integralmente questi dati con quelli dell’azienda configurata.</AlertDescription></Alert> : null}
    {!snapshot ? <Card><CardContent className="py-12 text-center"><h2 className="text-lg font-semibold">Nessun dato finanziario sincronizzato</h2><p className="mt-2 text-sm text-muted-foreground">{canSync ? 'Usa Aggiorna dati Fatture in Cloud per acquisire fatture, spese e pagamenti registrati.' : 'Configura Fatture in Cloud per acquisire il primo snapshot.'}</p></CardContent></Card> : null}
    {snapshot && !analysis ? <Alert><AlertDescription>Lo snapshot non contiene documenti o pagamenti e non sono presenti profili annuali.</AlertDescription></Alert> : null}
    {analysis ? <>
      <Card><CardHeader><CardTitle>Ricavi · {year}</CardTitle><CardDescription>Emesso per data fattura; incassato per data del pagamento, anche di fatture di anni precedenti.</CardDescription></CardHeader><CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-5 xl:grid-cols-3">{[
          ['Fatturato obiettivo', analysis.revenueTarget], ['Fatturato emesso', analysis.issuedRevenue], ['Incassato', analysis.collectedRevenue],
          ['Da incassare', analysis.outstandingRevenue], ['di cui Scaduto', analysis.overdueRevenue], ['Note di credito emesse', analysis.issuedCreditNotes],
        ].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{eur(value)}</dd></div>)}</dl>
        <div className="flex flex-wrap gap-x-8 gap-y-2 border-t pt-4 text-sm">
          <p>Emesso / obiettivo: <strong>{analysis.percentIssuedVsTarget === undefined ? '—' : `${formatNumber(analysis.percentIssuedVsTarget, 2)}%`}</strong></p>
          <p>Incassato / obiettivo: <strong>{analysis.percentCollectedVsTarget === undefined ? '—' : `${formatNumber(analysis.percentCollectedVsTarget, 2)}%`}</strong></p>
          <p className="font-medium">{analysis.gapToTarget === undefined ? 'Obiettivo annuale non configurato' : d(analysis.gapToTarget).lt(0) ? `Obiettivo superato di ${eur(money(d(analysis.gapToTarget).abs()))}` : d(analysis.gapToTarget).isZero() ? 'Obiettivo raggiunto' : `Mancano ${eur(analysis.gapToTarget)} all’obiettivo`}</p>
        </div><p className="text-xs text-muted-foreground">Da incassare e scaduto riguardano le fatture emesse nell’anno, secondo i pagamenti presenti nell’ultimo snapshot. Le note di credito sono separate e non riducono il fatturato emesso.</p>
      </CardContent></Card>
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
      <Card><CardHeader><CardTitle>Andamento mensile · {year}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Mese</TableHead>{['Fatturato emesso', 'Incassato', 'Costi documentati', 'Costi pagati'].map(label => <TableHead key={label} className="text-right">{label}</TableHead>)}</TableRow></TableHeader><TableBody>
        {analysis.monthly.map(month => <TableRow key={month.month}><TableCell>{months[month.month - 1]}</TableCell>{[month.issuedRevenue, month.collectedRevenue, month.documentedCosts, month.paidCosts].map((value, index) => <TableCell key={index} className="text-right tabular-nums">{eur(value)}</TableCell>)}</TableRow>)}
      </TableBody></Table></CardContent></Card>
      <Card><CardHeader><CardTitle>Dettaglio documenti · {year}</CardTitle><CardDescription>Importi pagati e residui secondo tutti i pagamenti registrati nello snapshot, anche in anni diversi.</CardDescription></CardHeader><CardContent>
        <Tabs defaultValue="outstanding"><TabsList><TabsTrigger value="outstanding">Da incassare ({outstanding.length})</TabsTrigger><TabsTrigger value="costs">Costi ({analysis.costDetails.length})</TabsTrigger></TabsList>
          <TabsContent value="outstanding">{outstanding.length ? <Table><TableHeader><TableRow>{['Data', 'Numero', 'Cliente', 'Totale fattura', 'Incassato', 'Residuo', 'Scadenza', 'Stato'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>
            {outstanding.map(detail => <TableRow key={detail.document.id}><TableCell>{dateIt(detail.document.date)}</TableCell><TableCell>{detail.document.number === undefined ? '—' : `${detail.document.number}${detail.document.numeration ?? ''}`}</TableCell><TableCell>{detail.document.entityName ?? '—'}</TableCell><TableCell>{eur(detail.document.amountGross)}</TableCell><TableCell>{eur(detail.paid)}</TableCell><TableCell>{eur(detail.outstanding)}</TableCell><TableCell>{detail.dueDate ? dateIt(detail.dueDate) : '—'}</TableCell><TableCell><Badge variant={detail.status === 'Scaduta' ? 'destructive' : 'secondary'}>{detail.status}</Badge></TableCell></TableRow>)}
          </TableBody></Table> : <p className="py-6 text-sm text-muted-foreground">Nessuna fattura dell’anno da incassare.</p>}</TabsContent>
          <TabsContent value="costs">{analysis.costDetails.length ? <Table><TableHeader><TableRow>{['Data', 'Numero', 'Fornitore', 'Descrizione / categoria FIC', 'Importo', 'Pagato', 'Residuo'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>
            {analysis.costDetails.map(detail => <TableRow key={detail.document.id}><TableCell>{dateIt(detail.document.date)}</TableCell><TableCell>{detail.document.invoiceNumber ?? '—'}</TableCell><TableCell>{detail.document.entityName ?? '—'}</TableCell><TableCell className="max-w-sm whitespace-normal">{[detail.document.description, detail.document.category].filter(Boolean).join(' · ') || '—'}</TableCell><TableCell>{eur(detail.document.amountGross)}</TableCell><TableCell>{eur(detail.paid)}</TableCell><TableCell>{eur(detail.outstanding)}</TableCell></TableRow>)}
          </TableBody></Table> : <p className="py-6 text-sm text-muted-foreground">Nessun costo documentato nell’anno.</p>}</TabsContent>
        </Tabs>
      </CardContent></Card>
    </> : null}
    <p className="text-xs text-muted-foreground">Cash utilizza dati amministrativi provenienti da Fatture in Cloud per analisi e pianificazione. I documenti si gestiscono in Fatture in Cloud; Cash non è un software contabile e non sostituisce il commercialista.</p>
  </div>;
}
