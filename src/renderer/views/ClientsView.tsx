import { Building2, Cloud, MoreHorizontal, Plus, RefreshCw, Search, Users } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import type { CashDocument, FicClientDetails, FicClientSnapshot, Site } from "../../domain/model"
import { SiteDialog } from "@/components/EntityDialogs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

type SiteEditor = { site?: Site; client: FicClientSnapshot } | null

const ficFieldLabels: Record<string, string> = {
  id: "ID cliente", name: "Denominazione", code: "Codice", type: "Tipo", first_name: "Nome", last_name: "Cognome",
  contact_person: "Persona di contatto", vat_number: "Partita IVA", tax_code: "Codice fiscale", address_street: "Indirizzo",
  address_postal_code: "CAP", address_city: "Città", address_province: "Provincia", address_extra: "Indirizzo aggiuntivo",
  country: "Paese", email: "Email", certified_email: "PEC", phone: "Telefono", fax: "Fax", notes: "Note",
  default_vat: "IVA predefinita", default_payment_terms: "Termini di pagamento", default_payment_terms_type: "Tipo termini di pagamento",
  default_payment_method: "Metodo di pagamento", bank_name: "Banca", bank_iban: "IBAN", bank_swift_code: "SWIFT/BIC",
  shipping_address: "Indirizzo di spedizione", e_invoice: "Fatturazione elettronica", ei_code: "Codice destinatario",
  default_discount: "Sconto predefinito", discount_highlight: "Evidenzia sconto", created_at: "Creato il", updated_at: "Aggiornato il",
}

export function ClientsView({ doc, appState, requestDelete }: {
  doc: CashDocument
  appState: AppState
  requestDelete: (target: DeleteTarget) => void
}) {
  const [query, setQuery] = useState("")
  const [clients, setClients] = useState<FicClientSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [selectedClient, setSelectedClient] = useState<FicClientSnapshot>()
  const [details, setDetails] = useState<FicClientDetails>()
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [siteEditor, setSiteEditor] = useState<SiteEditor>(null)
  const clientsRequest = useRef(0)
  const detailRequest = useRef(0)
  const companyId = doc.settings.fic.company?.id
  const integrationReady = doc.settings.fic.enabled && Boolean(companyId)

  const loadClients = useCallback(async (search: string) => {
    if (!companyId || !doc.settings.fic.enabled) return
    const request = ++clientsRequest.current
    setLoading(true)
    setClients([])
    const result = await window.cash.fic.searchClients({ companyId, query: search })
    if (request !== clientsRequest.current) return
    setLoading(false)
    setLoaded(true)
    if (!result.ok) { appState.setError(result.error); return }
    setClients(result.value)
  }, [appState, companyId, doc.settings.fic.enabled])

  useEffect(() => {
    if (integrationReady) void loadClients("")
    else { clientsRequest.current += 1; setClients([]); setLoaded(false); setLoading(false) }
  }, [integrationReady, loadClients])

  const openDetails = async (client: FicClientSnapshot) => {
    const request = ++detailRequest.current
    setSelectedClient(client)
    setDetails(undefined)
    setDetailsLoading(true)
    const result = await window.cash.fic.getClientDetails({ companyId: client.companyId, clientId: client.clientId })
    if (request !== detailRequest.current) return
    setDetailsLoading(false)
    if (!result.ok) { appState.setError(result.error); return }
    setDetails(result.value)
  }

  const closeDetails = () => {
    detailRequest.current += 1
    setSelectedClient(undefined)
    setDetails(undefined)
    setDetailsLoading(false)
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void loadClients(query)
  }

  const openFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, client: FicClientSnapshot) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    void openDetails(client)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div><CardTitle>Clienti</CardTitle><CardDescription>Anagrafica corrente recuperata dall’azienda Fatture in Cloud collegata.</CardDescription></div>
          <CardAction><Button variant="outline" disabled={!integrationReady || loading} onClick={() => void loadClients(query)}><RefreshCw className={loading ? "animate-spin" : undefined} />Aggiorna</Button></CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {!integrationReady ? <Alert><Cloud /><AlertTitle>Fatture in Cloud non è attivo</AlertTitle><AlertDescription>Configura e attiva il collegamento nelle Impostazioni per recuperare i clienti.</AlertDescription></Alert> : null}
          {integrationReady ? <form className="flex max-w-xl gap-2" onSubmit={submitSearch}><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca per denominazione" aria-label="Cerca clienti Fatture in Cloud" /></InputGroup><Button type="submit" disabled={loading}>{loading ? "Ricerca…" : "Cerca"}</Button></form> : null}
          {integrationReady && clients.length ? <Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Partita IVA</TableHead><TableHead>Sedi Cash</TableHead><TableHead>Sorgente</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{clients.map((client) => {
            const siteCount = sitesForClient(doc, client).length
            return <TableRow key={client.clientId} className="cursor-pointer" tabIndex={0} aria-label={`Apri dettagli di ${client.displayName}`} onClick={() => void openDetails(client)} onKeyDown={(event) => openFromKeyboard(event, client)}><TableCell className="font-medium">{client.displayName}</TableCell><TableCell className="text-muted-foreground">{client.vatNumber ?? "Non indicata"}</TableCell><TableCell><span className="inline-flex items-center gap-1.5"><Building2 className="size-4 text-muted-foreground" />{siteCount}</span></TableCell><TableCell><Badge variant="outline">FIC</Badge></TableCell><TableCell onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${client.displayName}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void openDetails(client)}>Visualizza dettagli</DropdownMenuItem><DropdownMenuItem onClick={() => setSiteEditor({ client })}><Plus />Aggiungi sede</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>
          })}</TableBody></Table> : null}
          {integrationReady && loaded && !loading && !clients.length ? <div className="grid min-h-56 place-items-center rounded-lg border border-dashed p-8 text-center"><div><Users className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">Nessun cliente trovato</p><p className="mt-1 text-sm text-muted-foreground">La ricerca non ha restituito clienti dall’azienda Fatture in Cloud collegata.</p></div></div> : null}
          {integrationReady && loading && !clients.length ? <div className="grid min-h-56 place-items-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"><RefreshCw className="mx-auto mb-3 size-7 animate-spin" />Recupero clienti da Fatture in Cloud…</div> : null}
        </CardContent>
      </Card>

      <ClientDetailsDialog client={selectedClient} details={details} loading={detailsLoading} doc={doc} onClose={closeDetails} onAddSite={(client) => { closeDetails(); setSiteEditor({ client }) }} onEditSite={(client, site) => { closeDetails(); setSiteEditor({ client, site }) }} requestDelete={(target) => { closeDetails(); requestDelete(target) }} />
      {siteEditor ? <SiteDialog open onOpenChange={(open) => { if (!open) setSiteEditor(null) }} appState={appState} doc={doc} site={siteEditor.site} fixedClient={siteEditor.client} /> : null}
    </>
  )
}

function ClientDetailsDialog({ client, details, loading, doc, onClose, onAddSite, onEditSite, requestDelete }: { client?: FicClientSnapshot; details?: FicClientDetails; loading: boolean; doc: CashDocument; onClose: () => void; onAddSite: (client: FicClientSnapshot) => void; onEditSite: (client: FicClientSnapshot, site: Site) => void; requestDelete: (target: DeleteTarget) => void }) {
  const sites = client ? sitesForClient(doc, client) : []
  const quotes = client ? doc.quotes.filter((quote) => quote.client?.companyId === client.companyId && quote.client.clientId === client.clientId) : []
  return <Dialog open={Boolean(client)} onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{client?.displayName ?? "Dettaglio cliente"}</DialogTitle><DialogDescription>Dati correnti FIC e informazioni Cash collegate.</DialogDescription></DialogHeader>{loading ? <p>Recupero dettaglio cliente…</p> : null}{!loading && details ? <div className="space-y-6"><section><h3 className="mb-3 font-semibold">Informazioni cliente <Badge variant="outline">FIC</Badge></h3><div className="grid grid-cols-2 gap-3 rounded-lg border p-4">{details.fields.map((field) => <div key={field.key}><span className="text-xs text-muted-foreground">{ficFieldLabels[field.key] ?? field.key}</span><p className="text-sm">{field.value}</p></div>)}</div></section><section><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Sedi in Cash ({sites.length})</h3>{client ? <Button size="sm" variant="outline" onClick={() => onAddSite(client)}><Plus />Aggiungi sede</Button> : null}</div>{sites.length ? <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Indirizzo</TableHead><TableHead>Coordinate</TableHead><TableHead /></TableRow></TableHeader><TableBody>{sites.map((site) => <TableRow key={site.id}><TableCell>{site.name}</TableCell><TableCell>{site.address ?? "Non indicato"}</TableCell><TableCell>{site.location ? `${site.location.coordinates.longitude}, ${site.location.coordinates.latitude}` : "Da localizzare"}</TableCell><TableCell><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${site.name}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => client && onEditSite(client, site)}>Modifica</DropdownMenuItem><DropdownMenuItem onClick={() => client && doc && onEditSite(client, site)}>Imposta come partenza predefinita</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "site", id: site.id, label: site.name })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <p className="text-sm text-muted-foreground">Nessuna sede associata.</p>}</section><section><h3 className="font-semibold">Preventivi in Cash ({quotes.length})</h3></section></div> : null}<DialogFooter><Button variant="outline" onClick={onClose}>Chiudi</Button></DialogFooter></DialogContent></Dialog>
}

function sitesForClient(doc: CashDocument, client: FicClientSnapshot): Site[] {
  return doc.sites.filter((site) => site.client?.source === "fatture_in_cloud" && site.client.companyId === client.companyId && site.client.clientId === client.clientId)
}
