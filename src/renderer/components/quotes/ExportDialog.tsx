import { Search } from 'lucide-react';
import { useState } from 'react';
import Decimal from 'decimal.js';
import { ExportComposer, type ExportRow } from './ExportComposer';
import { buildExportLines, needsRepeatWarning } from '../../../domain/export';
import {
  type CashDocument,
  type ExportGroup,
  type CashError,
  type FicClientSnapshot,
  type Quote,
} from '../../../domain/model';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { eur, formReader } from '@/lib/format';
import { ChoiceButton } from './ChoiceButton';

export function ExportDialog({
  quote,
  doc,
  results,
  onSearch,
  hasMore = false,
  onLoadMore,
  onClose,
  onExport,
  error,
}: {
  quote: Quote;
  doc: CashDocument;
  results: FicClientSnapshot[];
  onSearch: (query: string) => Promise<void>;
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
  onClose: () => void;
  error?: CashError | null;
  onExport: (
    client: FicClientSnapshot,
    groups: ExportGroup[],
  ) => Promise<boolean>;
}) {
  const companyId = doc.settings.fic.company?.id;
  const currentRemote =
    quote.client?.source === 'fatture_in_cloud' &&
    quote.client.companyId === companyId
      ? quote.client
      : undefined;
  const [step, setStep] = useState(currentRemote ? 2 : 1);
  const [client, setClient] = useState<FicClientSnapshot | undefined>(
    currentRemote,
  );
  const [searching, setSearching] = useState(false);
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const groups: ExportGroup[] = rows.map((row) => ({
    product: row.product,
    itemIds: row.itemIds,
    description: [
      row.description.trim(),
      ...row.itemIds.map(
        (id) =>
          quote.items.find((item) => item.id === id)?.name.trim() ||
          'Voce senza nome',
      ),
    ]
      .filter(Boolean)
      .join('\n'),
  }));
  const unassigned = quote.items.filter(
    (item) => !rows.some((row) => row.itemIds.includes(item.id)),
  );
  const preview = client
    ? buildExportLines({ ...quote, client }, groups, companyId)
    : undefined;
  const repeat = needsRepeatWarning(quote);
  const send = () => {
    if (!client) return;
    setBusy(true);
    void onExport(client, groups).then((ok) => {
      setBusy(false);
      if (ok) onClose();
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none overflow-y-auto sm:max-w-none"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>Esporta verso Fatture in Cloud</DialogTitle>
          <DialogDescription>
            Passaggio {step} di 3 ·{' '}
            {step === 1
              ? 'Cliente'
              : step === 2
                ? 'Righe commerciali'
                : 'Anteprima finale'}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>{error.message}</AlertTitle>
            <AlertDescription>
              {error.action ? <p>{error.action}</p> : null}
              {error.details?.map((detail, index) => (
                <p key={index}>{detail}</p>
              ))}
            </AlertDescription>
          </Alert>
        ) : null}
        {step === 1 ? (
          <div className="space-y-3">
            <Alert>
              <AlertDescription>
                Seleziona il cliente corrente dall’azienda Fatture in Cloud
                collegata.
              </AlertDescription>
            </Alert>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setSearching(true);
                void onSearch(
                  formReader(event.currentTarget).get('query'),
                ).finally(() => setSearching(false));
              }}
            >
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  name="query"
                  defaultValue={quote.client?.displayName ?? ''}
                  placeholder="Cerca cliente Fatture in Cloud"
                />
              </InputGroup>
              <Button disabled={searching}>
                {searching ? 'Ricerca…' : 'Cerca'}
              </Button>
            </form>
            <ScrollArea className="h-64 rounded-lg border">
              <div className="p-2">
                {results.map((entry) => (
                  <ChoiceButton
                    key={entry.clientId}
                    selected={client?.clientId === entry.clientId}
                    title={entry.displayName}
                    detail={entry.vatNumber ?? 'P.IVA non indicata'}
                    onClick={() => setClient(entry)}
                  />
                ))}
              </div>
            </ScrollArea>
            {hasMore ? (
              <Button
                variant="outline"
                disabled={searching}
                onClick={() => {
                  setSearching(true);
                  void onLoadMore?.().finally(() => setSearching(false));
                }}
              >
                {searching ? 'Caricamento…' : 'Carica altri'}
              </Button>
            ) : null}
          </div>
        ) : null}
        {step === 2 && companyId ? (
          <ExportComposer
            key={companyId}
            quote={quote}
            companyId={companyId}
            defaultProduct={doc.settings.fic.product}
            rows={rows}
            onChange={setRows}
          />
        ) : null}
        {step === 3 ? (
          <div className="space-y-4">
            {repeat ? (
              <Alert variant="destructive">
                <AlertTitle>Possibile duplicazione</AlertTitle>
                <AlertDescription>
                  Questo preventivo è già stato esportato o contiene un
                  tentativo da verificare. Controlla Fatture in Cloud prima di
                  inviare di nuovo.
                </AlertDescription>
              </Alert>
            ) : null}
            {preview?.ok ? (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prodotto e descrizione</TableHead>
                      <TableHead className="text-right">Quantità</TableHead>
                      <TableHead className="text-right">Prezzo netto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.value.map((line) => (
                      <TableRow key={line.itemIds.join('-')}>
                        <TableCell className="font-medium">
                          <p>{line.product?.name}</p>
                          <p className="whitespace-pre-line font-normal text-muted-foreground">
                            {line.description}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">1</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {eur(line.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>Esportazione bloccata</AlertTitle>
                <AlertDescription>
                  {preview && !preview.ok
                    ? preview.error.message
                    : 'Seleziona un cliente Fatture in Cloud.'}
                </AlertDescription>
              </Alert>
            )}
            {preview?.ok ? (
              <p className="text-right font-semibold">
                Totale netto:{' '}
                {eur(
                  preview.value
                    .reduce(
                      (total, line) => total.plus(line.amount),
                      new Decimal(0),
                    )
                    .toFixed(2),
                )}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {unassigned.length > 0
                ? `${unassigned.length} voci Cash non assegnate: non saranno esportate. `
                : 'Tutte le voci Cash sono assegnate. '}
              Ogni riga ha quantità 1; le ore non vengono esportate.
            </p>
          </div>
        ) : null}
        <DialogFooter className="justify-between">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              step === 1 ? onClose() : setStep((current) => current - 1)
            }
          >
            {step === 1 ? 'Annulla' : 'Indietro'}
          </Button>
          {step < 3 ? (
            <Button
              disabled={(step === 1 && !client) || (step === 2 && !preview?.ok)}
              onClick={() => setStep((current) => current + 1)}
            >
              Continua
            </Button>
          ) : (
            <Button disabled={busy || !preview?.ok} onClick={send}>
              {busy
                ? 'Invio…'
                : repeat
                  ? 'Conferma nuova esportazione'
                  : 'Invia preventivo'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
