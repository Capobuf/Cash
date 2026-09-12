import { ArrowLeft, MoreHorizontal, Plus } from "lucide-react"
import { calculateQuote } from "../../domain/calculations"
import { createLocalClient, snapshotLocalClient } from "../../domain/clients"
import { meta, type CashDocument } from "../../domain/model"
import { Analysis } from "@/components/Analysis"
import { QuoteItemCard } from "@/components/QuoteItemCard"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useQuoteController } from "@/hooks/use-quote-controller"
import { dateIt, formReader, moneyInputValue } from "@/lib/format"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

const promptRequired = (message: string, initial = ""): string | undefined => window.prompt(message, initial)?.trim() || undefined

export function QuotesView({ doc, appState, activeQuoteId, setActiveQuoteId, requestDelete }: {
  doc: CashDocument; appState: AppState; activeQuoteId?: string
  setActiveQuoteId: (id?: string) => void; requestDelete: (target: DeleteTarget) => void
}) {
  const { quote, clientResults, newQuote, saveQuote, searchRemoteClients, insertTemplate, saveTemplate, performRefresh, performExport, itemActions } = useQuoteController({ doc, appState, activeQuoteId, setActiveQuoteId, requestDelete })

  if (!quote) return (
    <Card><CardHeader><CardTitle>Preventivi</CardTitle><CardDescription>Apri un preventivo esistente o creane uno nuovo.</CardDescription></CardHeader><CardContent className="space-y-4"><Button onClick={newQuote}><Plus />Nuovo preventivo</Button>{doc.quotes.length ? <Table><TableHeader><TableRow><TableHead>Preventivo</TableHead><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Voci</TableHead><TableHead className="w-16 text-right">Azioni</TableHead></TableRow></TableHeader><TableBody>{doc.quotes.map((entry) => <TableRow key={entry.id}><TableCell className="font-medium">{entry.items.map((item) => item.name).join(", ") || "Preventivo incompleto"}</TableCell><TableCell>{dateIt(entry.date)}</TableCell><TableCell>{entry.client?.displayName ?? "Nessun cliente"}</TableCell><TableCell>{entry.items.length}</TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Azioni preventivo" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setActiveQuoteId(entry.id)}>Apri</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "quote", id: entry.id, label: entry.items.map((item) => item.name).join(", ") || "Preventivo incompleto" })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <p className="py-8 text-center text-sm text-muted-foreground">Nessun preventivo.</p>}</CardContent></Card>
  )

  const hourly = quote.profileSnapshot?.hourlyTarget
  const total = hourly ? calculateQuote(quote.items, hourly) : undefined
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setActiveQuoteId(undefined)}><ArrowLeft />Elenco</Button>
        <Button onClick={() => { const title = promptRequired("Nome della voce commerciale"); if (title) appState.mutate((document) => document.quotes.find((candidate) => candidate.id === quote.id)!.items.push({ ...meta(), name: title, subItems: [], variantGroups: [], variantSelections: [] })) }}><Plus />Aggiungi voce</Button>
        <Button disabled={!doc.settings.fic.enabled} onClick={() => void performExport()}>Anteprima ed esporta</Button>
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" />}><MoreHorizontal />Altre azioni</DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem disabled={!doc.catalog.templates.length} onClick={() => void insertTemplate()}>Inserisci template</DropdownMenuItem><DropdownMenuItem disabled={!quote.items.length} onClick={saveTemplate}>Salva come template</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => void performRefresh()}>Aggiorna valori correnti</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="space-y-4">
          <Card><CardHeader><CardTitle>Dati preventivo</CardTitle><CardDescription>Profilo, sede, commissione e cliente associati.</CardDescription></CardHeader><CardContent className="space-y-6">
            <form onSubmit={saveQuote}><FieldGroup className="grid grid-cols-2">
              <Field><FieldLabel htmlFor="quote-date">Data</FieldLabel><Input id="quote-date" name="date" defaultValue={quote.date} type="date" /></Field>
              <Field><FieldLabel htmlFor="quote-profile">Profilo</FieldLabel><NativeSelect className="w-full" id="quote-profile" name="profileId" defaultValue={quote.profileId ?? ""}><NativeSelectOption value="">Incompleto</NativeSelectOption>{doc.profiles.map((profile) => <NativeSelectOption key={profile.id} value={profile.id}>{profile.year}{profile.confirmed ? "" : " · da confermare"}</NativeSelectOption>)}</NativeSelect></Field>
              <Field><FieldLabel htmlFor="quote-site">Sede principale</FieldLabel><NativeSelect className="w-full" id="quote-site" name="mainSiteId" defaultValue={quote.mainSite?.sourceId ?? ""}><NativeSelectOption value="">Nessuna</NativeSelectOption>{doc.sites.map((site) => <NativeSelectOption key={site.id} value={site.id}>{site.name}</NativeSelectOption>)}</NativeSelect></Field>
              <Field><FieldLabel htmlFor="quote-commission">Provvigione esterna</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id="quote-commission" name="commission" defaultValue={moneyInputValue(quote.commission ?? "")} inputMode="decimal" /></InputGroup></Field>
              <Button type="submit" className="col-span-2">Aggiorna dati</Button>
            </FieldGroup></form>
            {quote.client ? <Alert><AlertDescription className="flex flex-wrap items-center gap-2">Cliente: <strong>{quote.client.displayName}</strong> · {quote.client.source === "local" ? "locale" : "Fatture in Cloud"} · P.IVA {quote.client.vatNumber ?? "—"}<Button variant="ghost" size="sm" onClick={() => appState.mutate((document) => { document.quotes.find((candidate) => candidate.id === quote.id)!.client = undefined })}>Rimuovi</Button>{quote.client.source === "fatture_in_cloud" ? <Button variant="secondary" size="sm" onClick={() => { const homonyms = doc.localClients.filter((client) => client.displayName.localeCompare(quote.client!.displayName, "it", { sensitivity: "base" }) === 0); if (!window.confirm(`Creare una copia locale indipendente di “${quote.client!.displayName}”?${homonyms.length ? `\nAttenzione: esistono ${homonyms.length} omonimi; non verranno uniti.` : ""}`)) return; const created = createLocalClient(quote.client!.displayName, quote.client!.vatNumber); if (!created.ok) appState.setError(created.error); else appState.mutate((document) => document.localClients.push(created.value)) }}>Copia come Cliente locale</Button> : null}</AlertDescription></Alert> : <div className="space-y-4">
              <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); const client = doc.localClients.find((candidate) => candidate.id === formReader(event.currentTarget).get("localClientId")); if (client) appState.mutate((document) => { document.quotes.find((candidate) => candidate.id === quote.id)!.client = snapshotLocalClient(client) }) }}><Field className="max-w-sm"><FieldLabel htmlFor="quote-local-client">Cliente locale</FieldLabel><NativeSelect className="w-full" id="quote-local-client" name="localClientId"><NativeSelectOption value="">Nessun cliente</NativeSelectOption>{doc.localClients.map((client) => <NativeSelectOption key={client.id} value={client.id}>{client.displayName}</NativeSelectOption>)}</NativeSelect></Field><Button type="submit">Seleziona</Button></form>
              {doc.settings.fic.enabled ? <><form className="flex items-end gap-2" onSubmit={(event) => void searchRemoteClients(event)}><Field className="max-w-sm"><FieldLabel htmlFor="remote-query">Cerca cliente Fatture in Cloud</FieldLabel><Input id="remote-query" name="query" /></Field><Button type="submit">Cerca live</Button></form><div className="flex flex-wrap gap-2">{clientResults.map((client) => <Button key={client.clientId} variant="secondary" onClick={() => appState.mutate((document) => { document.quotes.find((candidate) => candidate.id === quote.id)!.client = client })}>{client.displayName} · {client.vatNumber ?? "P.IVA assente"}</Button>)}</div></> : <Alert><AlertDescription>Fatture in Cloud è disattivato. Il ciclo locale resta disponibile.</AlertDescription></Alert>}
            </div>}
          </CardContent></Card>
          {quote.items.length ? quote.items.map((item) => <QuoteItemCard key={item.id} item={item} hourly={hourly} doc={doc} actions={itemActions} />) : <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Aggiungi almeno una voce commerciale.</CardContent></Card>}
        </div>
        <aside className="space-y-4"><Card><CardHeader><CardTitle>Analisi complessiva</CardTitle></CardHeader><CardContent>{total ? <Analysis value={total} /> : <Alert><AlertDescription>Associa un profilo calcolabile.</AlertDescription></Alert>}</CardContent></Card><Card><CardHeader><CardTitle>Snapshot</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Profilo {quote.profileSnapshot ? `${quote.profileSnapshot.year} rev. ${quote.profileSnapshot.revision}` : "non associato"}<br />Revisione snapshot {quote.snapshotRevision}<br />{quote.snapshotUpdatedAt ? `Aggiornato ${quote.snapshotUpdatedAt}` : "Mai aggiornato"}</CardContent></Card></aside>
      </div>
    </div>
  )
}
