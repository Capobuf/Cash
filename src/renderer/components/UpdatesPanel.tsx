import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';
import {
  RefreshCw,
  Download,
  RotateCw,
  Info,
  ExternalLink,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CashUpdateStatus } from '../../shared/ipc';
import type { Result } from '../../domain/model';
import type { AppState } from '../state';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function useCashUpdateStatus(): CashUpdateStatus | null {
  const [status, setStatus] = useState<CashUpdateStatus | null>(null);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const unsubscribe = window.cash.updates.onStatus((next) => {
      if (!active) return;
      receivedEvent = true;
      setStatus(next);
    });
    void window.cash.updates.getStatus().then(
      (next) => {
        if (active && !receivedEvent) setStatus(next);
      },
      () => {
        if (active && !receivedEvent)
          setStatus({
            phase: 'error',
            currentVersion: '—',
            message: 'Impossibile leggere lo stato degli aggiornamenti.',
          });
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return status;
}

const isUnsaved = (appState: AppState): boolean =>
  !['Salvato', 'Sola lettura', 'Nessun archivio'].includes(appState.status);

export function UpdateNotice({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const update = useCashUpdateStatus();
  if (!update || (update.phase !== 'available' && update.phase !== 'ready'))
    return null;
  return (
    <Alert>
      <Info />
      <AlertTitle>Cash {update.availableVersion} è disponibile</AlertTitle>
      <AlertDescription>
        {update.phase === 'ready'
          ? 'Aggiornamento scaricato, pronto per l’installazione.'
          : 'Puoi scaricarlo e installarlo quando preferisci.'}
      </AlertDescription>
      <AlertAction>
        <Button variant="outline" size="sm" onClick={onOpenSettings}>
          Apri impostazioni
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function UpdatesPanel({
  appState,
  compact = false,
  archiveBlocked = false,
}: {
  appState: AppState;
  compact?: boolean;
  archiveBlocked?: boolean;
}) {
  const update = useCashUpdateStatus();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function perform(
    action: () => Promise<Result<unknown>>,
  ): Promise<void> {
    setPending(true);
    setActionError(null);
    try {
      const result = await action();
      if (!result.ok) setActionError(result.error.message);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'Operazione non riuscita.',
      );
    } finally {
      setPending(false);
    }
  }

  const phase = update?.phase;
  const unsaved = isUnsaved(appState);
  const content = (
    <>
      <p className="text-sm text-muted-foreground" role="status">
        {phase === 'unsupported'
          ? 'Questa copia di Cash non supporta l’aggiornamento automatico. Apri la pagina dei download per verificare le versioni disponibili e scaricare quella adatta.'
          : phase === 'idle'
            ? 'Verifica degli aggiornamenti non ancora effettuata.'
            : phase === 'checking'
              ? 'Verifica degli aggiornamenti in corso…'
              : phase === 'up-to-date'
                ? archiveBlocked
                  ? 'Non sono disponibili aggiornamenti più recenti. Per aprire questo archivio serve comunque una versione compatibile di Cash. Puoi controllare le versioni nella pagina dei download o aprire un altro archivio.'
                  : 'Stai già utilizzando la versione più recente pubblicata.'
                : phase === 'available'
                  ? `È disponibile la versione ${update?.availableVersion}.`
                  : phase === 'downloading'
                    ? typeof update?.progressPercent === 'number'
                      ? `Download in corso: ${update.progressPercent}%.`
                      : 'Download aggiornamento in corso…'
                    : phase === 'ready'
                      ? `Versione ${update?.availableVersion} pronta per l'installazione.`
                      : phase === 'error'
                        ? 'Non è stato possibile verificare o completare l’aggiornamento. Controlla la connessione e riprova, oppure apri la pagina dei download.'
                        : 'Lettura degli aggiornamenti in corso…'}
      </p>
      {phase === 'error' || actionError ? (
        <Alert variant="destructive">
          <AlertTitle>Aggiornamento non riuscito</AlertTitle>
          <AlertDescription>
            <div>Riprova oppure apri la pagina dei download.</div>
            {actionError || update?.message ? (
              <details className="mt-2">
                <summary className="cursor-pointer">Dettagli tecnici</summary>
                <div className="mt-2 break-words">
                  {actionError ?? update?.message}
                </div>
              </details>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {unsaved && phase === 'ready' ? (
        <Alert>
          <Info />
          <AlertTitle>Modifiche ancora da salvare</AlertTitle>
          <AlertDescription>
            Attendi lo stato “Salvato” prima di riavviare per aggiornare.
          </AlertDescription>
        </Alert>
      ) : null}
      {phase === 'downloading' ? (
        <div className="space-y-2">
          {typeof update?.progressPercent === 'number' ? (
            <Progress
              value={update.progressPercent}
              aria-label="Download aggiornamento"
            />
          ) : (
            <Spinner aria-label="Download in corso" />
          )}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={
            compact && (phase === 'idle' || phase === 'error')
              ? 'default'
              : 'outline'
          }
          disabled={
            pending ||
            !phase ||
            phase === 'unsupported' ||
            phase === 'checking' ||
            phase === 'downloading' ||
            phase === 'ready'
          }
          onClick={() => void perform(() => window.cash.updates.check())}
        >
          {phase === 'checking' ? (
            <Spinner aria-hidden="true" />
          ) : (
            <RefreshCw />
          )}
          {phase === 'checking'
            ? 'Verifica in corso…'
            : 'Verifica aggiornamenti'}
        </Button>
        {phase === 'available' ? (
          <Button
            disabled={pending}
            onClick={() => void perform(() => window.cash.updates.download())}
          >
            {pending ? <Spinner aria-hidden="true" /> : <Download />}
            Scarica aggiornamento
          </Button>
        ) : null}
        {phase === 'ready' ? (
          <Button
            disabled={
              pending ||
              unsaved ||
              appState.backup?.running ||
              appState.archiveOperationPending
            }
            onClick={() => void perform(() => window.cash.updates.install())}
          >
            <RotateCw />
            Installa e riavvia
          </Button>
        ) : null}
        {phase === 'unsupported' ||
        phase === 'error' ||
        phase === 'up-to-date' ||
        actionError ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              void perform(() => window.cash.updates.openReleases())
            }
          >
            <ExternalLink />
            Apri pagina dei download
          </Button>
        ) : null}
      </div>
    </>
  );
  if (compact)
    return (
      <section aria-label="Aggiornamenti di Cash" className="space-y-3">
        <div className="text-sm text-muted-foreground">
          Versione installata: {update?.currentVersion ?? '—'}
        </div>
        {content}
      </section>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aggiornamenti di Cash</CardTitle>
        <CardDescription>
          Versione installata: {update?.currentVersion ?? '—'}. Origine: GitHub
          Releases del progetto Cash.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{content}</CardContent>
    </Card>
  );
}
