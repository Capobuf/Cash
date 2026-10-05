import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buildExportLines, needsRepeatWarning } from '../../../domain/export';
import {
  type CashDocument,
  type CashError,
  type FicClientSnapshot,
  type Quote,
} from '../../../domain/model';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
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
  onClose,
  onExport,
  error,
}: {
  quote: Quote;
  doc: CashDocument;
  results: FicClientSnapshot[];
  onSearch: (query: string) => Promise<void>;
  onClose: () => void;
  error?: CashError | null;
  onExport: (
    client: FicClientSnapshot,
    groups: Array<{ itemIds: string[]; description: string }>,
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
  const [groupAll, setGroupAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() =>
    quote.items.map((item) => item.id),
  );
  const selectedItems = useMemo(
    () => quote.items.filter((item) => selectedIds.includes(item.id)),
    [quote.items, selectedIds],
  );
  const [descriptions, setDescriptions] = useState<Record<string, string>>(() =>
    Object.fromEntries(quote.items.map((item) => [item.id, item.name])),
  );
  const [allDescription, setAllDescription] = useState<string>();
  const groupDescription =
    allDescription ?? selectedItems.map((item) => item.name).join(' + ');
  const [busy, setBusy] = useState(false);
  const groups = useMemo(
    () =>
      groupAll
        ? [
            {
              itemIds: selectedItems.map((item) => item.id),
              description: groupDescription,
            },
          ]
        : selectedItems.map((item) => ({
            itemIds: [item.id],
            description: descriptions[item.id] ?? item.name,
          })),
    [groupDescription, descriptions, groupAll, selectedItems],
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
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
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
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border p-4">
              <p className="font-medium">Voci da esportare</p>
              {quote.items.map((item) => (
                <Field key={item.id} orientation="horizontal">
                  <Checkbox
                    id={`export-select-${item.id}`}
                    checked={selectedIds.includes(item.id)}
                    onCheckedChange={(checked) =>
                      setSelectedIds((current) =>
                        checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <FieldLabel htmlFor={`export-select-${item.id}`}>
                    {item.name.trim() || 'Voce senza nome'} ·{' '}
                    {eur(item.chosenPrice)}
                  </FieldLabel>
                </Field>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">Raggruppa le voci selezionate</p>
                <p className="text-sm text-muted-foreground">
                  Influisce soltanto sulle righe esportate, non sul preventivo.
                </p>
              </div>
              <Switch checked={groupAll} onCheckedChange={setGroupAll} />
            </div>
            {groupAll ? (
              <Field>
                <FieldLabel htmlFor="export-all-description">
                  Descrizione riga
                </FieldLabel>
                <Input
                  id="export-all-description"
                  value={groupDescription}
                  onChange={(event) => setAllDescription(event.target.value)}
                />
              </Field>
            ) : (
              <div className="space-y-3">
                {selectedItems.map((item) => (
                  <Field key={item.id}>
                    <FieldLabel htmlFor={`export-${item.id}`}>
                      {item.name.trim() || 'Voce senza nome'} ·{' '}
                      {eur(item.chosenPrice)}
                    </FieldLabel>
                    <Input
                      id={`export-${item.id}`}
                      value={descriptions[item.id] ?? ''}
                      onChange={(event) =>
                        setDescriptions((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                    />
                  </Field>
                ))}
              </div>
            )}
          </div>
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
                      <TableHead>Descrizione</TableHead>
                      <TableHead className="text-right">Quantità</TableHead>
                      <TableHead className="text-right">Prezzo netto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.value.map((line) => (
                      <TableRow key={line.itemIds.join('-')}>
                        <TableCell className="font-medium">
                          {line.description}
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
            <p className="text-xs text-muted-foreground">
              Prodotto: Consulenza · le sottovoci, le spese interne e la
              provvigione non vengono esportate come righe autonome.
            </p>
          </div>
        ) : null}
        <DialogFooter className="justify-between">
          <Button
            variant="outline"
            onClick={() =>
              step === 1 ? onClose() : setStep((current) => current - 1)
            }
          >
            {step === 1 ? 'Annulla' : 'Indietro'}
          </Button>
          {step < 3 ? (
            <Button
              disabled={
                (step === 1 && !client) ||
                (step === 2 &&
                  (selectedItems.length === 0 ||
                    groups.some((group) => !group.description.trim())))
              }
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
