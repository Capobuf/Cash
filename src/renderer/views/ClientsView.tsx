import { useFicClients } from '@/hooks/use-fic-clients';
import { CreateFicClientDialog } from '@/components/CreateFicClientDialog';
import {
  ArrowRight,
  Building2,
  Cloud,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type {
  CashDocument,
  FicClientDetails,
  FicClientSnapshot,
  Site,
} from '../../domain/model';
import { SiteDialog } from '@/components/EntityDialogs';
import { coordinatesInput } from '../../domain/locations';
import { quoteTitle } from '../../domain/quotes';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AppState } from '../state';
import type { DeleteTarget } from '../types';

type SiteEditor = { site?: Site; client: FicClientSnapshot } | null;

const ficFieldLabels: Record<string, string> = {
  name: 'Denominazione',
  code: 'Codice',
  type: 'Tipo',
  first_name: 'Nome',
  last_name: 'Cognome',
  contact_person: 'Persona di contatto',
  vat_number: 'Partita IVA',
  tax_code: 'Codice fiscale',
  address_street: 'Indirizzo',
  address_postal_code: 'CAP',
  address_city: 'Città',
  address_province: 'Provincia',
  address_extra: 'Indirizzo aggiuntivo',
  country: 'Paese',
  email: 'Email',
  certified_email: 'PEC',
  phone: 'Telefono',
  fax: 'Fax',
  notes: 'Note',
  default_vat: 'IVA predefinita',
  default_payment_terms: 'Termini di pagamento',
  default_payment_terms_type: 'Tipo termini di pagamento',
  default_payment_method: 'Metodo di pagamento',
  bank_name: 'Banca',
  bank_iban: 'IBAN',
  bank_swift_code: 'SWIFT/BIC',
  shipping_address: 'Indirizzo di spedizione',
  e_invoice: 'Fatturazione elettronica',
  courtesy_invoice_config: 'Fattura di cortesia',
  has_intent_declaration: 'Dichiarazione d’intento',
  intent_declaration_protocol_number: 'Protocollo dichiarazione d’intento',
  intent_declaration_protocol_date: 'Data dichiarazione d’intento',
  ei_code: 'Codice destinatario',
  default_discount: 'Sconto predefinito',
  discount_highlight: 'Evidenzia sconto',
  created_at: 'Creato il',
  updated_at: 'Aggiornato il',
};

const isFicIdentifier = (key: string) => key === 'id' || key.endsWith('_id');
function clientDateValue(value: string, withTime = true): string {
  const date = new Date(
    value.length === 10 ? `${value}T00:00:00` : value.replace(' ', 'T'),
  );
  if (Number.isNaN(date.valueOf())) return 'Non disponibile';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? ({ hour: '2-digit', minute: '2-digit' } as const) : {}),
  })
    .format(date)
    .replace(',', '');
}

function clientFieldValue(key: string, value: string): string {
  if (key === 'created_at' || key === 'updated_at')
    return clientDateValue(value);
  if (key === 'intent_declaration_protocol_date')
    return clientDateValue(value, false);
  // Structured fields (e.g. default VAT) can contain nested FIC identifiers.
  try {
    const parsed: unknown = JSON.parse(value, (key, entry: unknown) =>
      isFicIdentifier(key) ? undefined : entry,
    );
    if (key === 'courtesy_invoice_config') {
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      )
        return 'Non disponibile';
      const config = parsed as Record<string, unknown>;
      if (config.enabled === false) return 'Disattivata';
      if (config.enabled !== true) return 'Non disponibile';
      return config.include_attachments === true
        ? 'Attiva · allegati inclusi'
        : config.include_attachments === false
          ? 'Attiva · senza allegati'
          : 'Attiva';
    }
    return parsed !== null && typeof parsed === 'object'
      ? JSON.stringify(parsed)
      : value;
  } catch {
    return key === 'courtesy_invoice_config' ? 'Non disponibile' : value;
  }
}

export function ClientsView({
  doc,
  hasToken,
  appState,
  onOpenQuote,
  requestDelete,
}: {
  doc: CashDocument;
  hasToken: boolean;
  appState: AppState;
  onOpenQuote: (id: string) => void;
  requestDelete: (target: DeleteTarget) => void;
}) {
  const [query, setQuery] = useState('');
  const [creationContext, setCreationContext] = useState<string>();
  const [createdClient, setCreatedClient] = useState<FicClientSnapshot>();
  const [createdContext, setCreatedContext] = useState<string>();
  const [selectedClient, setSelectedClient] = useState<FicClientSnapshot>();
  const [details, setDetails] = useState<FicClientDetails>();
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const [siteEditor, setSiteEditor] = useState<SiteEditor>(null);
  const detailRequest = useRef(0);
  const companyId = doc.settings.fic.company?.id;
  const integrationReady =
    doc.settings.fic.enabled && hasToken && Boolean(companyId);
  const clientContext = `${doc.documentId}:${appState.archiveContext}:${appState.session?.path}:${companyId}:${integrationReady}`;

  const {
    results: clients,
    error: clientsError,
    loading,
    loaded,
    nextPage,
    search: loadClients,
    loadMore,
  } = useFicClients({
    companyId,
    enabled: integrationReady,
    appState,
    contextKey: clientContext,
  });
  useEffect(() => {
    if (integrationReady) void loadClients('');
    return () => {
      detailRequest.current++;
    };
  }, [integrationReady, loadClients]);

  const openDetails = async (client: FicClientSnapshot) => {
    if (!integrationReady) return;
    const request = ++detailRequest.current;
    setSelectedClient(client);
    setDetails(undefined);
    setDetailsLoading(true);
    setDetailsError(false);
    const result = await window.cash.fic.getClientDetails({
      companyId: client.companyId,
      clientId: client.clientId,
    });
    if (request !== detailRequest.current) return;
    setDetailsLoading(false);
    if (!result.ok) {
      setDetailsError(true);
      appState.setError(result.error);
      return;
    }
    setDetails(result.value);
  };

  const closeDetails = () => {
    detailRequest.current += 1;
    setSelectedClient(undefined);
    setDetails(undefined);
    setDetailsLoading(false);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadClients(query);
  };

  const openFromKeyboard = (
    event: KeyboardEvent<HTMLTableRowElement>,
    client: FicClientSnapshot,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    void openDetails(client);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Clienti</CardTitle>
            <CardDescription>
              Anagrafica corrente recuperata dall’azienda Fatture in Cloud
              collegata.
            </CardDescription>
          </div>
          <CardAction className="flex flex-wrap gap-2">
            <Button
              disabled={
                !integrationReady || Boolean(appState.session?.readOnly)
              }
              onClick={() => setCreationContext(clientContext)}
            >
              <Plus />
              Nuovo cliente
            </Button>
            <Button
              variant="outline"
              disabled={!integrationReady || loading}
              onClick={() => void loadClients(query)}
            >
              {loading ? <Spinner aria-hidden="true" /> : <RefreshCw />}
              Aggiorna
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {integrationReady &&
          createdClient &&
          createdContext === clientContext ? (
            <Alert>
              <AlertTitle>Cliente creato su Fatture in Cloud</AlertTitle>
              <AlertDescription>
                {createdClient.displayName}
                <Button
                  variant="link"
                  onClick={() => void openDetails(createdClient)}
                >
                  Visualizza dettagli
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {!integrationReady ? (
            <Alert>
              <Cloud />
              <AlertTitle>
                {doc.settings.fic.enabled && !hasToken
                  ? 'Richiede configurazione locale'
                  : 'Fatture in Cloud non è attivo'}
              </AlertTitle>
              <AlertDescription>
                {doc.settings.fic.enabled && !hasToken
                  ? 'Collega questa postazione a Fatture in Cloud nelle Impostazioni per recuperare i clienti.'
                  : 'Configura e attiva il collegamento nelle Impostazioni per recuperare i clienti.'}
              </AlertDescription>
            </Alert>
          ) : null}
          {integrationReady ? (
            <form className="flex max-w-xl gap-2" onSubmit={submitSearch}>
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cerca per denominazione"
                  aria-label="Cerca clienti Fatture in Cloud"
                />
              </InputGroup>
              <Button type="submit" disabled={loading}>
                {loading ? 'Ricerca…' : 'Cerca'}
              </Button>
            </form>
          ) : null}
          {nextPage ? (
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void loadMore()}
            >
              {loading ? 'Caricamento…' : 'Carica altri'}
            </Button>
          ) : null}
          {integrationReady && (loading || clients.length > 0) ? (
            <Table aria-busy={loading}>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Partita IVA</TableHead>
                  <TableHead>Sedi Cash</TableHead>
                  <TableHead>Sorgente</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && clients.length === 0
                  ? Array.from({ length: 5 }, (_, index) => (
                      <TableRow key={index} aria-hidden="true">
                        <TableCell>
                          <Skeleton className="h-5 w-44" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-28" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-12" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-10" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="size-7" />
                        </TableCell>
                      </TableRow>
                    ))
                  : clients.map((client) => {
                      const siteCount = sitesForClient(doc, client).length;
                      return (
                        <TableRow
                          key={client.clientId}
                          className="cursor-pointer"
                          tabIndex={0}
                          aria-label={`Apri dettagli di ${client.displayName}`}
                          onClick={() => void openDetails(client)}
                          onKeyDown={(event) => openFromKeyboard(event, client)}
                        >
                          <TableCell className="font-medium">
                            {client.displayName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {client.vatNumber ?? 'Non indicata'}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5">
                              <Building2 className="size-4 text-muted-foreground" />
                              {siteCount}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">FIC</Badge>
                          </TableCell>
                          <TableCell
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Azioni per ${client.displayName}`}
                                  />
                                }
                              >
                                <MoreHorizontal />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => void openDetails(client)}
                                >
                                  Visualizza dettagli
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setSiteEditor({ client })}
                                >
                                  <Plus />
                                  Aggiungi sede
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          ) : null}
          {integrationReady &&
          loaded &&
          !loading &&
          !clientsError &&
          !clients.length ? (
            <div className="grid min-h-56 place-items-center rounded-lg border border-dashed p-8 text-center">
              <div>
                <Users className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 font-medium">Nessun cliente trovato</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  La ricerca non ha restituito clienti dall’azienda Fatture in
                  Cloud collegata.
                </p>
              </div>
            </div>
          ) : null}
          {integrationReady && loading ? (
            <p role="status" className="sr-only">
              Recupero clienti da Fatture in Cloud…
            </p>
          ) : null}
          {integrationReady && clientsError ? (
            <Alert variant="destructive">
              <AlertTitle>Recupero clienti non riuscito</AlertTitle>
              <AlertDescription>
                Riprova con Aggiorna o ripeti la ricerca.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <ClientDetailsDialog
        appState={appState}
        client={selectedClient}
        details={details}
        loading={detailsLoading}
        failed={detailsError}
        doc={doc}
        onClose={closeDetails}
        onOpenQuote={(id) => {
          closeDetails();
          onOpenQuote(id);
        }}
        onAddSite={(client) => {
          closeDetails();
          setSiteEditor({ client });
        }}
        onEditSite={(client, site) => {
          closeDetails();
          setSiteEditor({ client, site });
        }}
        requestDelete={(target) => {
          closeDetails();
          requestDelete(target);
        }}
      />
      {integrationReady && companyId && creationContext === clientContext ? (
        <CreateFicClientDialog
          key={clientContext}
          companyId={companyId}
          companyName={doc.settings.fic.company!.name}
          appState={appState}
          onClose={() => setCreationContext(undefined)}
          onCreated={(client) => {
            setCreationContext(undefined);
            setCreatedClient(client);
            setCreatedContext(clientContext);
            setQuery(client.displayName);
            void loadClients(client.displayName);
          }}
        />
      ) : null}
      {siteEditor ? (
        <SiteDialog
          open
          onOpenChange={(open) => {
            if (!open) setSiteEditor(null);
          }}
          appState={appState}
          doc={doc}
          site={siteEditor.site}
          fixedClient={siteEditor.client}
        />
      ) : null}
    </>
  );
}

export function ClientDetailsDialog({
  appState,
  client,
  details,
  loading,
  failed = false,
  doc,
  onClose,
  onOpenQuote,
  onAddSite,
  onEditSite,
  requestDelete,
}: {
  appState: AppState;
  client?: FicClientSnapshot;
  details?: FicClientDetails;
  loading: boolean;
  failed?: boolean;
  doc: CashDocument;
  onClose: () => void;
  onOpenQuote: (id: string) => void;
  onAddSite: (client: FicClientSnapshot) => void;
  onEditSite: (client: FicClientSnapshot, site: Site) => void;
  requestDelete: (target: DeleteTarget) => void;
}) {
  const sites = client ? sitesForClient(doc, client) : [];
  const quotes = client
    ? doc.quotes
        .filter(
          (quote) =>
            quote.client?.companyId === client.companyId &&
            quote.client.clientId === client.clientId,
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
    : [];
  return (
    <Dialog
      open={Boolean(client)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {client?.displayName ?? 'Dettaglio cliente'}
          </DialogTitle>
          <DialogDescription>
            Dati correnti FIC e informazioni Cash collegate.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div aria-busy="true">
            <p role="status" className="sr-only">
              Recupero dettaglio cliente…
            </p>
            <div
              aria-hidden="true"
              className="grid grid-cols-2 gap-4 rounded-lg border p-4"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-3/4" />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {!loading && details ? (
          <div className="space-y-6">
            <section>
              <h3 className="mb-3 font-semibold">
                Informazioni cliente <Badge variant="outline">FIC</Badge>
              </h3>
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-4">
                {details.fields
                  .filter((field) => !isFicIdentifier(field.key))
                  .map((field) => (
                    <div key={field.key}>
                      <span className="text-xs text-muted-foreground">
                        {ficFieldLabels[field.key] ?? field.key}
                      </span>
                      <p className="text-sm break-words whitespace-pre-wrap">
                        {clientFieldValue(field.key, field.value)}
                      </p>
                    </div>
                  ))}
              </div>
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Sedi in Cash ({sites.length})</h3>
                {client ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAddSite(client)}
                  >
                    <Plus />
                    Aggiungi sede
                  </Button>
                ) : null}
              </div>
              {sites.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Indirizzo</TableHead>
                      <TableHead>Coordinate</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sites.map((site) => (
                      <TableRow key={site.id}>
                        <TableCell>{site.name}</TableCell>
                        <TableCell>{site.address ?? 'Non indicato'}</TableCell>
                        <TableCell>
                          {site.location
                            ? coordinatesInput(site.location.coordinates)
                            : 'Da localizzare'}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Azioni per ${site.name}`}
                                />
                              }
                            >
                              <MoreHorizontal />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  client && onEditSite(client, site)
                                }
                              >
                                Modifica
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  appState.mutate((document) => {
                                    document.settings.defaultDepartureSiteId =
                                      site.id;
                                  })
                                }
                              >
                                Imposta come partenza predefinita
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() =>
                                  requestDelete({
                                    kind: 'site',
                                    id: site.id,
                                    label: site.name,
                                  })
                                }
                              >
                                Elimina
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nessuna sede associata.
                </p>
              )}
            </section>
            <section>
              <h3 className="mb-3 font-semibold">
                Preventivi in Cash ({quotes.length})
              </h3>
              {quotes.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Preventivo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes.map((quote) => (
                      <TableRow key={quote.id}>
                        <TableCell className="font-medium whitespace-normal">
                          {quoteTitle(quote)}
                        </TableCell>
                        <TableCell>
                          {clientDateValue(quote.date, false)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Apri ${quoteTitle(quote)}`}
                            onClick={() => onOpenQuote(quote.id)}
                          >
                            Apri <ArrowRight aria-hidden="true" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nessun preventivo associato.
                </p>
              )}
            </section>
          </div>
        ) : null}
        {!loading && failed ? (
          <Alert variant="destructive">
            <AlertTitle>Recupero dettaglio cliente non riuscito</AlertTitle>
            <AlertDescription>
              Chiudi il dialogo e riprova ad aprire il cliente.
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function sitesForClient(doc: CashDocument, client: FicClientSnapshot): Site[] {
  return doc.sites.filter(
    (site) =>
      site.client?.source === 'fatture_in_cloud' &&
      site.client.companyId === client.companyId &&
      site.client.clientId === client.clientId,
  );
}
