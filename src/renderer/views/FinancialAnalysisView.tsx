import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { calculateFinancialOverview } from '../../domain/financial-overview';
import type { CashDocument } from '../../domain/model';
import type { AppState } from '../state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item';
import { FinancialDocuments } from '@/components/FinancialDocuments';
import { dateIt } from '@/lib/format';
import { FinancialAggregates } from '@/components/FinancialDashboard';
import { FinancialOverviewDashboard } from '@/components/FinancialOverviewDashboard';

export function FinancialAnalysisView({
  doc,
  appState,
  hasToken,
  year,
}: {
  doc: CashDocument;
  appState: AppState;
  hasToken: boolean;
  year: number | undefined;
}) {
  const snapshot = doc.financialSnapshot;
  const now = new Date();
  const currentYear = now.getFullYear();
  const today = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const overview = useMemo(
    () =>
      year !== undefined
        ? calculateFinancialOverview(doc, year, today)
        : undefined,
    [doc, year, today],
  );
  const analysis = overview?.analysis;
  const fic = doc.settings.fic;
  const unavailable = !fic.enabled
    ? 'Fatture in Cloud disattivato. I dati già acquisiti restano consultabili offline.'
    : !hasToken
      ? 'Questa postazione richiede configurazione: aggiungi il token in Impostazioni → Integrazioni.'
      : !fic.company
        ? 'Configura l’azienda Fatture in Cloud nelle Impostazioni.'
        : undefined;
  const canSync =
    !unavailable &&
    !appState.session?.readOnly &&
    appState.status !== 'Conflitto esterno';
  const mismatch =
    snapshot && fic.company && snapshot.company.id !== fic.company.id;

  return (
    <div className="min-w-0 space-y-6">
      <Item variant="muted" size="sm">
        <ItemContent>
          <ItemTitle className="flex-wrap">
            <Badge variant="secondary">
              {unavailable || appState.financialSyncError
                ? 'Snapshot offline'
                : 'Snapshot · aggiornamento live manuale'}
            </Badge>
            {snapshot?.company.name ?? 'Nessuna azienda sincronizzata'}
          </ItemTitle>
          <ItemDescription>
            {snapshot
              ? `Ultima sincronizzazione: ${new Date(snapshot.acquiredAt).toLocaleString('it-IT')}`
              : 'Aggiornamento completo solo su richiesta.'}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="w-full sm:w-auto">
          <Button
            className="w-full sm:w-auto"
            disabled={!canSync || appState.financialSyncing}
            onClick={() => void appState.syncFinancialData()}
          >
            <RefreshCw
              className={appState.financialSyncing ? 'animate-spin' : undefined}
            />
            {appState.financialSyncing
              ? 'Aggiornamento in corso…'
              : 'Aggiorna dati Fatture in Cloud'}
          </Button>
        </ItemActions>
      </Item>
      {unavailable ? (
        <Alert>
          <AlertTitle>Aggiornamento live non disponibile</AlertTitle>
          <AlertDescription>
            {unavailable}
            {snapshot
              ? ` Snapshot aggiornato al ${dateIt(snapshot.acquiredAt)}.`
              : ''}
          </AlertDescription>
        </Alert>
      ) : null}
      {appState.financialSyncError ? (
        <Alert>
          <AlertTitle>Ultimo aggiornamento non riuscito</AlertTitle>
          <AlertDescription>
            Stai consultando lo snapshot precedente. Puoi ripetere
            l’aggiornamento manuale.
          </AlertDescription>
        </Alert>
      ) : null}
      {mismatch ? (
        <Alert>
          <AlertTitle>Azienda diversa dallo snapshot</AlertTitle>
          <AlertDescription>
            Stai consultando {snapshot.company.name}. Il collegamento attuale è
            con {fic.company?.name}. Un aggiornamento riuscito sostituirà
            integralmente questi dati con quelli dell’azienda configurata.
          </AlertDescription>
        </Alert>
      ) : null}
      {overview ? (
        <FinancialOverviewDashboard
          overview={overview}
          correctionDisabled={
            appState.session?.readOnly ||
            appState.status === 'Conflitto esterno'
          }
          onFiscalCorrection={(total) =>
            appState.mutate((document) => {
              const entries = (document.fiscalPaymentOverrides ?? []).filter(
                (entry) => entry.year !== overview.year,
              );
              if (total !== undefined)
                entries.push({ year: overview.year, total });
              if (entries.length) document.fiscalPaymentOverrides = entries;
              else delete document.fiscalPaymentOverrides;
            })
          }
        >
          {analysis ? (
            <FinancialAggregates analysis={analysis} year={year!} />
          ) : null}
          {snapshot ? (
            <FinancialDocuments
              key={`${snapshot.company.id}:${snapshot.acquiredAt}:${year}`}
              snapshot={snapshot}
              year={year}
              today={today}
            />
          ) : null}
        </FinancialOverviewDashboard>
      ) : (
        <Alert>
          <AlertDescription>
            Nessun anno disponibile. Aggiungi un profilo annuale, un movimento
            bancario o sincronizza Fatture in Cloud.
          </AlertDescription>
        </Alert>
      )}
      {!snapshot ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Nessun dato finanziario sincronizzato</EmptyTitle>
            <EmptyDescription>
              {canSync
                ? 'Usa Aggiorna dati Fatture in Cloud per acquisire fatture, spese e pagamenti registrati.'
                : 'Configura Fatture in Cloud per acquisire il primo snapshot.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {snapshot && !analysis ? (
        <Alert>
          <AlertDescription>
            Lo snapshot non contiene documenti registrati o pagamenti con un
            anno disponibile e non sono presenti profili annuali. Gli eventuali
            documenti in ingresso restano consultabili sotto.
          </AlertDescription>
        </Alert>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Cash utilizza dati amministrativi provenienti da Fatture in Cloud per
        analisi e pianificazione. I documenti si gestiscono in Fatture in Cloud;
        Cash non è un software contabile e non sostituisce il commercialista.
      </p>
    </div>
  );
}
