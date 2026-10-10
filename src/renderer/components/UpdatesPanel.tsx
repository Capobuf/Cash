import { RefreshCw, Download, RotateCw, Info } from 'lucide-react';
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

export function UpdatesPanel({ appState }: { appState: AppState }) {
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aggiornamenti di Cash</CardTitle>
        <CardDescription>
          Versione installata: {update?.currentVersion ?? '—'}. Origine: GitHub
          Releases del progetto Cash.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground" role="status">
          {phase === 'unsupported'
            ? 'Gli aggiornamenti integrati sono disponibili solo nella versione installata su Windows, non nella portable o in sviluppo.'
            : phase === 'idle'
              ? 'Verifica degli aggiornamenti non ancora effettuata.'
              : phase === 'checking'
                ? 'Verifica degli aggiornamenti in corso…'
                : phase === 'up-to-date'
                  ? 'Stai già utilizzando la versione più recente pubblicata.'
                  : phase === 'available'
                    ? `È disponibile la versione ${update?.availableVersion}.`
                    : phase === 'downloading'
                      ? `Download in corso: ${update?.progressPercent ?? 0}%.`
                      : phase === 'ready'
                        ? `Versione ${update?.availableVersion} pronta per l'installazione.`
                        : (update?.message ??
                          'Lettura degli aggiornamenti in corso…')}
        </p>
        {phase === 'error' || actionError ? (
          <Alert variant="destructive">
            <AlertTitle>Aggiornamento non riuscito</AlertTitle>
            <AlertDescription>
              {actionError ?? update?.message}
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
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
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
            <RefreshCw />
            Verifica aggiornamenti
          </Button>
          {phase === 'available' ? (
            <Button
              disabled={pending}
              onClick={() => void perform(() => window.cash.updates.download())}
            >
              <Download />
              Scarica aggiornamento
            </Button>
          ) : null}
          {phase === 'ready' ? (
            <Button
              disabled={pending || unsaved}
              onClick={() => void perform(() => window.cash.updates.install())}
            >
              <RotateCw />
              Installa e riavvia
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
