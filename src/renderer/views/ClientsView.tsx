import { DataTable } from '@/components/ui/data-table';
import { useFicClients } from '@/hooks/use-fic-clients';
import { CreateFicClientDialog } from '@/components/CreateFicClientDialog';
import {
  ArrowRight,
  Building2,
  Cloud,
  FileText,
  Landmark,
  Mail,
  MapPin,
  MapPinPlus,
  MoreHorizontal,
  Navigation,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
const clientFieldGroups = [
  {
    title: 'Anagrafica',
    icon: UserRound,
    keys: [
      'name',
      'code',
      'type',
      'first_name',
      'last_name',
      'vat_number',
      'tax_code',
    ],
  },
  {
    title: 'Contatti e indirizzo',
    icon: Mail,
    keys: [
      'contact_person',
      'email',
      'certified_email',
      'phone',
      'fax',
      'address_street',
      'address_postal_code',
      'address_city',
      'address_province',
      'address_extra',
      'country',
      'shipping_address',
    ],
  },
  {
    title: 'Fatturazione e pagamenti',
    icon: Landmark,
    keys: [
      'default_vat',
      'default_payment_terms',
      'default_payment_terms_type',
      'default_payment_method',
      'bank_name',
      'bank_iban',
      'bank_swift_code',
      'e_invoice',
      'courtesy_invoice_config',
      'has_intent_declaration',
      'intent_declaration_protocol_number',
      'intent_declaration_protocol_date',
      'ei_code',
      'default_discount',
      'discount_highlight',
    ],
  },
];

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

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Clienti</CardTitle>
            <CardDescription>
              Clienti dell’azienda collegata a Fatture in Cloud.
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
            <DataTable
              preferencesKey="clients"
              data={clients}
              loading={loading}
              longTableThreshold={Infinity}
              getRowKey={(client) => client.clientId}
              emptyMessage="Nessun cliente."
              onRowClick={(client) => void openDetails(client)}
              getRowAriaLabel={(client) =>
                `Apri dettagli di ${client.displayName}`
              }
              columns={[
                {
                  id: 'name',
                  header: 'Cliente',
                  value: (client) => client.displayName,
                  className: 'font-medium',
                },
                {
                  id: 'vat',
                  header: 'Partita IVA',
                  value: (client) => client.vatNumber,
                  cell: (client) => client.vatNumber ?? 'Non indicata',
                  className: 'text-muted-foreground',
                },
                {
                  id: 'sites',
                  header: 'Sedi Cash',
                  value: (client) => sitesForClient(doc, client).length,
                  cell: (client) => (
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="size-4 text-muted-foreground" />
                      {sitesForClient(doc, client).length}
                    </span>
                  ),
                },
                {
                  id: 'source',
                  header: 'Sorgente',
                  value: () => 'FIC',
                  cell: () => <Badge variant="outline">FIC</Badge>,
                },
                {
                  id: 'actions',
                  header: 'Azioni',
                  value: () => undefined,
                  sortable: false,
                  configurable: false,
                  cell: (client) => (
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
                      <DropdownMenuContent align="end" className="min-w-52">
                        <DropdownMenuItem
                          onClick={() => void openDetails(client)}
                        >
                          <UserRound aria-hidden="true" />
                          Apri scheda cliente
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setSiteEditor({ client })}
                        >
                          <MapPinPlus aria-hidden="true" />
                          Aggiungi una sede
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ),
                },
              ]}
            />
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
  const fields =
    details?.fields.filter((field) => !isFicIdentifier(field.key)) ?? [];
  const fieldGroups = [
    ...clientFieldGroups.map((group) => ({
      ...group,
      fields: fields.filter((field) => group.keys.includes(field.key)),
    })),
    {
      title: 'Altre informazioni',
      icon: FileText,
      fields: fields.filter(
        (field) =>
          !clientFieldGroups.some((group) => group.keys.includes(field.key)),
      ),
    },
  ].filter((group) => group.fields.length > 0);
  return (
    <Dialog
      open={Boolean(client)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b bg-muted/30 px-5 py-5 pr-12 sm:px-6 sm:pr-12">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-secondary text-secondary-foreground">
              <UserRound className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Scheda cliente
              </p>
              <DialogTitle className="text-xl leading-snug font-semibold break-words">
                {client?.displayName ?? 'Dettaglio cliente'}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <Cloud className="size-3.5" aria-hidden="true" /> Fatture in
                  Cloud
                </span>
                <span>Sedi e preventivi in Cash</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {loading ? (
            <div aria-busy="true">
              <p role="status" className="sr-only">
                Recupero dettaglio cliente…
              </p>
              <div
                aria-hidden="true"
                className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2"
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
              {fieldGroups.length ? (
                <div className="grid items-start gap-4 sm:grid-cols-2">
                  {fieldGroups.map(
                    ({ title, icon: Icon, fields: groupFields }) => (
                      <section
                        key={title}
                        className="min-w-0 overflow-hidden rounded-xl border"
                      >
                        <h3 className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3 text-sm font-semibold">
                          <Icon
                            className="size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                          {title}
                        </h3>
                        <dl className="grid gap-3 p-4">
                          {groupFields.map((field) => (
                            <div
                              key={field.key}
                              className="min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-x-3 gap-y-1 sm:grid"
                            >
                              <dt className="text-xs leading-5 text-muted-foreground">
                                {ficFieldLabels[field.key] ?? field.key}
                              </dt>
                              <dd className="text-sm leading-5 [overflow-wrap:anywhere] whitespace-pre-wrap">
                                {clientFieldValue(field.key, field.value)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    ),
                  )}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Nessuna informazione aggiuntiva disponibile da Fatture in
                  Cloud.
                </p>
              )}
              <section className="border-t pt-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <MapPin
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    Sedi in Cash ({sites.length})
                  </h3>
                  {client ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAddSite(client)}
                    >
                      <MapPinPlus aria-hidden="true" />
                      Aggiungi una sede
                    </Button>
                  ) : null}
                </div>
                {sites.length ? (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {sites.map((site) => (
                      <li
                        key={site.id}
                        className="flex min-w-0 items-start gap-3 rounded-xl border p-3"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <Building2 className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-medium [overflow-wrap:anywhere]">
                            {site.name}
                          </p>
                          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                            {site.address ?? 'Indirizzo non indicato'}
                          </p>
                          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                            {site.location
                              ? coordinatesInput(site.location.coordinates)
                              : 'Da localizzare'}
                          </p>
                          {doc.settings.defaultDepartureSiteId === site.id ? (
                            <Badge variant="secondary" className="mt-1">
                              <Navigation aria-hidden="true" />
                              Partenza predefinita
                            </Badge>
                          ) : null}
                        </div>
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
                              onClick={() => client && onEditSite(client, site)}
                            >
                              <Pencil aria-hidden="true" />
                              Modifica sede
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                appState.mutate((document) => {
                                  document.settings.defaultDepartureSiteId =
                                    site.id;
                                })
                              }
                            >
                              <Navigation aria-hidden="true" />
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
                              <Trash2 aria-hidden="true" />
                              Elimina sede
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-4">
                    <MapPin
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium">
                        Nessuna sede associata
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Aggiungi i luoghi in cui lavori per questo cliente.
                      </p>
                    </div>
                  </div>
                )}
              </section>
              <section className="border-t pt-5">
                <h3 className="mb-3 flex items-center gap-2 font-semibold">
                  <FileText
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  Preventivi in Cash ({quotes.length})
                </h3>
                {quotes.length ? (
                  <div className="overflow-hidden rounded-xl border">
                    <DataTable
                      preferencesKey="client-quotes"
                      data={quotes}
                      getRowKey={(quote) => quote.id}
                      emptyMessage="Nessun risultato."
                      columns={[
                        {
                          id: 'title',
                          header: 'Preventivo',
                          value: (quote) => quoteTitle(quote),
                          className:
                            'font-medium whitespace-normal [overflow-wrap:anywhere]',
                          cell: (quote) => quoteTitle(quote),
                        },
                        {
                          id: 'date',
                          header: 'Data',
                          value: (quote) => quote.date,
                          cell: (quote) => clientDateValue(quote.date, false),
                        },
                        {
                          id: 'actions',
                          header: 'Azioni',
                          value: () => undefined,
                          sortable: false,
                          configurable: false,
                          className: 'text-right',
                          cell: (quote) => (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Apri ${quoteTitle(quote)}`}
                              onClick={() => onOpenQuote(quote.id)}
                            >
                              Apri <ArrowRight aria-hidden="true" />
                            </Button>
                          ),
                        },
                      ]}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-4">
                    <FileText
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium">
                        Nessun preventivo associato
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Qui troverai i preventivi collegati a questo cliente.
                      </p>
                    </div>
                  </div>
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
        </div>
        <DialogFooter className="m-0 shrink-0 px-5 py-3 sm:px-6">
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
