import { useState } from 'react';
import { FolderOpen, RefreshCw, ShieldCheck } from 'lucide-react';
import type { BackupConfig, BackupState } from '../../shared/backup';
import type { Result } from '../../domain/model';
import type { AppState } from '../state';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from './ui/empty';
import { Field, FieldDescription, FieldLabel } from './ui/field';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import { SelectField } from './ui/selection-field';
import { Skeleton } from './ui/skeleton';
import { Spinner } from './ui/spinner';
import { Switch } from './ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { toast } from './ui/toast';

const phaseLabels = {
  preparing: 'Preparazione',
  snapshot: 'Creazione snapshot',
  verifying: 'Verifica',
  copying: 'Copia',
  completing: 'Completamento',
};
const date = (value?: string | null) =>
  value ? new Date(value).toLocaleString('it-IT') : '—';
const size = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`
    : `${(bytes / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 })} KB`;

export function BackupSettingsPanel({ appState }: { appState: AppState }) {
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<
    import('../../domain/model').CashError | null
  >(null);
  const backup = appState.backup;
  const config = backup?.config;
  const busy =
    pending || Boolean(backup?.running) || appState.archiveOperationPending;
  const saved = appState.status === 'Salvato';
  const action = async (
    task: () => Promise<
      Result<
        BackupState | void | import('../../shared/archive').ArchiveInspection
      >
    >,
    success?: string,
  ) => {
    if (busy) return;
    setPending(true);
    setActionError(null);
    try {
      const result = await task();
      if (result.ok) {
        if (result.value && 'running' in result.value)
          appState.acceptBackupState(result.value);
        if (success) toast.add({ type: 'success', title: success });
      } else if (result.error.code !== 'CANCELLED') {
        setActionError(result.error);
        // Native state changes already notify operation failures globally.
        if (appState.backup?.error?.message !== result.error.message)
          toast.add({ type: 'error', title: result.error.message });
      }
    } catch (cause) {
      const problem = {
        code: 'IO' as const,
        source: 'backup' as const,
        message: 'Comunicazione con il backup interrotta.',
        action: 'Aggiorna la cronologia e verifica l’esito prima di riprovare.',
        details: [String(cause)],
      };
      setActionError(problem);
      toast.add({ type: 'error', title: problem.message });
    } finally {
      setPending(false);
    }
  };
  const configure = (
    update: Partial<
      Pick<BackupConfig, 'enabled' | 'intervalHours' | 'retention'>
    >,
  ) => {
    if (config)
      void action(() =>
        window.cash.backup.configure({
          enabled: config.enabled,
          intervalHours: config.intervalHours,
          retention: config.retention,
          ...update,
        }),
      );
  };
  const problems = [
    appState.backupError,
    backup?.error,
    backup?.warning,
    actionError,
  ].filter(
    (problem, index, list) =>
      problem &&
      list.findIndex((other) => other?.message === problem.message) === index,
  );
  if (appState.backupLoading && !backup)
    return (
      <div className="space-y-4" aria-label="Caricamento backup">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return (
    <div className="space-y-4">
      {problems.map((problem) =>
        problem ? (
          <Alert key={problem.message} variant="destructive">
            <AlertTitle>{problem.message}</AlertTitle>
            <AlertDescription>
              <p>
                {problem.action ??
                  'Aggiorna la cronologia oppure verifica e cambia destinazione.'}
              </p>
              {problem.details?.length ? (
                <details>
                  <summary className="cursor-pointer">
                    Dettagli dell’errore
                  </summary>
                  <ul className="mt-2 list-disc break-all pl-4">
                    {problem.details.map((detail, index) => (
                      <li key={index}>{detail}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void appState.refreshBackups()}
                >
                  Aggiorna cronologia
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void action(() => window.cash.backup.selectDirectory())
                  }
                >
                  Cambia destinazione
                </Button>
                {backup?.destinationMissing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void action(() => window.cash.backup.recreateDirectory())
                    }
                  >
                    Ricrea cartella
                  </Button>
                ) : null}
              </div>
            </AlertDescription>
          </Alert>
        ) : null,
      )}
      <Card>
        <CardHeader>
          <CardTitle>Stato backup</CardTitle>
          <CardDescription>
            La copia protegge la revisione salvata indicata, indipendentemente
            dallo stato “Salvato” dell’archivio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Badge variant={backup?.error ? 'destructive' : 'outline'}>
            {backup?.running
              ? phaseLabels[backup.phase ?? 'preparing']
              : backup?.error
                ? 'Richiede attenzione'
                : backup?.latest
                  ? 'Copia verificata'
                  : 'Nessuna copia valida'}
          </Badge>
          {backup?.running ? (
            <div role="status" aria-live="polite" className="space-y-2">
              <div className="flex items-center gap-2">
                <Spinner />
                {phaseLabels[backup.phase ?? 'preparing']}
              </div>
              {backup.phase === 'copying' && backup.totalBytes ? (
                <Progress
                  aria-label="Trasferimento backup"
                  value={(100 * (backup.bytesCopied ?? 0)) / backup.totalBytes}
                />
              ) : null}
              {backup.operationDocumentId &&
              backup.operationDocumentId !==
                appState.session?.token.documentId ? (
                <p className="text-sm">
                  Backup dell’archivio di origine: {backup.operationDocumentId}
                </p>
              ) : null}
            </div>
          ) : null}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Ultimo backup valido</dt>
              <dd>{date(backup?.latest?.completedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Revisione protetta / salvata
              </dt>
              <dd>
                {backup?.latest?.revision ?? '—'} /{' '}
                {appState.session?.token.revision ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Prossimo backup</dt>
              <dd>
                {!config?.enabled
                  ? 'Automatico disattivato'
                  : backup?.nextAt
                    ? date(backup.nextAt)
                    : 'In attesa di una nuova modifica salvata'}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Destinazione</dt>
              <dd className="break-all">
                {config?.destination ?? 'Da configurare'}
              </dd>
            </div>
          </dl>
          {!saved ? (
            <p className="text-sm text-muted-foreground">
              Il backup sarà disponibile quando l’archivio risulta Salvato,
              senza conflitti.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !saved}
              onClick={() =>
                void action(
                  () => window.cash.backup.run(),
                  'Backup creato e verificato',
                )
              }
            >
              <ShieldCheck />
              Esegui backup ora
            </Button>
            <Button
              variant="outline"
              disabled={busy || !config}
              onClick={() => void action(() => window.cash.backup.openFolder())}
            >
              <FolderOpen />
              Apri cartella
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void appState.restoreFromBackup()}
            >
              Ripristina da backup
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Configurazione</CardTitle>
          <CardDescription>
            Preferenze specifiche di questa postazione. Ogni copia viene sempre
            verificata.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field orientation="horizontal">
            <Switch
              id="backup-enabled"
              checked={config?.enabled ?? true}
              disabled={busy || !config}
              onCheckedChange={(enabled) => configure({ enabled })}
            />
            <FieldLabel htmlFor="backup-enabled">Backup automatico</FieldLabel>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="backup-frequency">Frequenza</FieldLabel>
              <SelectField
                id="backup-frequency"
                disabled={busy || !config?.enabled}
                value={config?.intervalHours ?? 24}
                onValueChange={(value) =>
                  configure({
                    intervalHours: Number(
                      value,
                    ) as BackupConfig['intervalHours'],
                  })
                }
                options={[
                  { value: '6', label: '6 ore' },
                  { value: '12', label: '12 ore' },
                  { value: '24', label: '24 ore' },
                  { value: '168', label: '7 giorni' },
                ]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="backup-retention">
                Numero di copie
              </FieldLabel>
              <SelectField
                id="backup-retention"
                disabled={busy || !config}
                value={config?.retention ?? 10}
                onValueChange={(value) =>
                  configure({
                    retention: Number(value) as BackupConfig['retention'],
                  })
                }
                options={[5, 10, 20, 30].map((value) => ({
                  value: String(value),
                  label: `${value} copie`,
                }))}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="backup-destination">
              Cartella di destinazione
            </FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Input
                id="backup-destination"
                className="min-w-60 flex-1"
                value={config?.destination ?? ''}
                readOnly
              />
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void action(() => window.cash.backup.selectDirectory())
                }
              >
                Seleziona cartella
              </Button>
            </div>
            <FieldDescription>
              La pianificazione funziona soltanto mentre Cash è aperto. Senza
              nuove revisioni salvate non crea duplicati automatici. Il backup
              manuale resta disponibile anche con l’automatico disattivato.
            </FieldDescription>
          </Field>
          <p className="text-sm text-muted-foreground">
            {backup?.latest
              ? 'Il backup è stato creato nella cartella selezionata. '
              : ''}
            Se utilizzi Google Drive per desktop, verifica che la
            sincronizzazione cloud sia terminata. La rotazione locale può
            eliminare anche le copie sincronizzate nel cloud. Il database attivo
            deve rimanere su disco locale non sincronizzato.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cronologia</CardTitle>
          <CardDescription>
            Copie di questo archivio e di questa installazione nella
            destinazione corrente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void appState.refreshBackups()}
          >
            <RefreshCw />
            Aggiorna cronologia
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void action(
                () => window.cash.backup.verifyFile(),
                'File backup verificato',
              )
            }
          >
            Verifica file backup
          </Button>
          {backup?.entries.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Dimensione</TableHead>
                  <TableHead>Revisione</TableHead>
                  <TableHead>Verifica</TableHead>
                  <TableHead>Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backup.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{date(entry.completedAt)}</TableCell>
                    <TableCell>{size(entry.size)}</TableCell>
                    <TableCell>{entry.revision}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          entry.verification === 'valid'
                            ? 'outline'
                            : 'destructive'
                        }
                      >
                        {entry.verification === 'valid'
                          ? 'Verificato'
                          : 'Non valido'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void action(
                              () => window.cash.backup.verify(entry.id),
                              'Copia verificata',
                            )
                          }
                        >
                          Verifica
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || entry.verification !== 'valid'}
                          onClick={() =>
                            void appState.restoreFromBackup(entry.id)
                          }
                        >
                          Ripristina
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void action(() =>
                              window.cash.backup.reveal(entry.id),
                            )
                          }
                        >
                          Mostra nel filesystem
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nessun backup disponibile</EmptyTitle>
                <EmptyDescription>
                  Esegui un backup oppure verifica la destinazione configurata.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
