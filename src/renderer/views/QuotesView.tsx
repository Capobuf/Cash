import { ArrowLeft, ChevronDown, CloudUpload, FilePlus2, Info, MoreHorizontal, Plus, RefreshCw, UserRound, Wrench } from "lucide-react"
import { useState } from "react"
import { calculateQuote } from "../../domain/calculations"
import type { CashDocument, QuoteItem } from "../../domain/model"
import { Analysis } from "@/components/Analysis"
import { CatalogPickerDialog, CustomerDialog, ExportDialog, InsertTemplateDialog, ItemNameDialog, SaveSubDialog, SaveTemplateDialog, SubItemDialog, VariantChangeDialog, VariantEditorSheet } from "@/components/QuoteDialogs"
import { QuoteItemCard, type QuoteItemActions } from "@/components/QuoteItemCard"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useQuoteController } from "@/hooks/use-quote-controller"
import { dateIt, decimalInputValue, formReader, moneyInputValue } from "@/lib/format"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

type Overlay =
  | { kind: "customer" }
  | { kind: "item"; item?: QuoteItem }
  | { kind: "sub"; itemId: string; subId?: string; initialKind?: "time" | "expense" | "travel" }
  | { kind: "catalog"; itemId: string }
  | { kind: "save-sub"; itemId: string; subId: string }
  | { kind: "variant"; itemId: string; groupId?: string }
  | { kind: "variant-change"; itemId: string; groupId: string; optionId: string }
  | { kind: "insert-template" }
  | { kind: "save-template" }
  | { kind: "export" }

interface PendingQuoteUpdate { date?: string; profileId?: string; mainSiteId?: string; commission?: string }

export function QuotesView({ doc, appState, activeQuoteId, setActiveQuoteId, requestDelete }: {
  doc: CashDocument; appState: AppState; activeQuoteId?: string
  setActiveQuoteId: (id?: string) => void; requestDelete: (target: DeleteTarget) => void
}) {
  const controller = useQuoteController({ doc, appState, activeQuoteId, setActiveQuoteId, requestDelete })
  const { quote } = controller
  const [overlay, setOverlay] = useState<Overlay>()
  const [pendingUpdate, setPendingUpdate] = useState<PendingQuoteUpdate>()

  if (!quote) return <QuotesList doc={doc} onNew={controller.newQuote} onOpen={setActiveQuoteId} requestDelete={requestDelete} />

  const hourly = quote.profileSnapshot?.hourlyTarget
  const total = hourly ? calculateQuote(quote.items, hourly) : undefined
  const setQuoteValue = (updates: PendingQuoteUpdate) => {
    const result = controller.updateQuote(updates)
    if (result === "year-mismatch") setPendingUpdate(updates)
  }
  const selectCustomer = (selection: string | import("../../domain/model").FicClientSnapshot) => {
    appState.mutate((document) => {
      const target = document.quotes.find((entry) => entry.id === quote.id)!
      if (typeof selection !== "string") target.client = selection
      else if (!selection) target.client = undefined
    })
  }

  const itemActions: QuoteItemActions = {
    rename: (item) => setOverlay({ kind: "item", item }),
    updatePrices: (itemId, form) => { const { get, money } = formReader(form); controller.updatePrices(itemId, money("chosenPrice"), money("referenceAmount"), get("referencePeriod")) },
    editSub: (itemId, subId) => setOverlay({ kind: "sub", itemId, subId }),
    saveSub: (itemId, subId) => setOverlay({ kind: "save-sub", itemId, subId }),
    changeVariant: (itemId, group, optionId) => {
      const item = quote.items.find((entry) => entry.id === itemId)
      if (!item || item.variantSelections.find((entry) => entry.groupId === group.id)?.optionId === optionId) return
      const hasTravel = group.options.find((entry) => entry.id === optionId)?.subItems.some((entry) => entry.kind === "travel")
      const hasManualChanges = item.subItems.some((entry) => entry.variantOwner?.groupId === group.id && entry.manuallyModified)
      if (hasTravel || hasManualChanges) setOverlay({ kind: "variant-change", itemId, groupId: group.id, optionId })
      else void controller.switchVariant(itemId, group.id, optionId, {}, true)
    },
    editVariant: (itemId, group) => setOverlay({ kind: "variant", itemId, groupId: group?.id }),
    addSub: (itemId, initialKind) => setOverlay({ kind: "sub", itemId, initialKind }),
    addCatalog: (itemId) => setOverlay({ kind: "catalog", itemId }),
    requestDelete,
  }

  const overlayItem = "itemId" in (overlay ?? {}) ? quote.items.find((item) => item.id === (overlay as { itemId: string }).itemId) : undefined
  const overlaySub = overlay?.kind === "sub" ? overlayItem?.subItems.find((sub) => sub.id === overlay.subId) : undefined
  const overlayGroup = overlay?.kind === "variant" || overlay?.kind === "variant-change" ? overlayItem?.variantGroups.find((group) => group.id === overlay.groupId) : undefined

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3"><Button variant="ghost" size="sm" onClick={() => setActiveQuoteId(undefined)}><ArrowLeft />Preventivi</Button><div className="h-5 w-px bg-border" /><div><h2 className="font-semibold">{quote.client?.displayName ?? quote.items[0]?.name ?? "Nuovo preventivo"}</h2><p className="text-xs text-muted-foreground">{dateIt(quote.date)} · {quote.items.length} {quote.items.length === 1 ? "voce" : "voci"}</p></div></div>
        <div className="flex items-center gap-2"><Button onClick={() => setOverlay({ kind: "item" })}><Plus />Aggiungi voce</Button><Button variant="secondary" onClick={() => setOverlay({ kind: "insert-template" })} disabled={!doc.catalog.templates.length}>Inserisci template</Button><Tooltip><TooltipTrigger render={<span />}><Button onClick={() => setOverlay({ kind: "export" })} disabled={!doc.settings.fic.enabled}><CloudUpload />Esporta FIC</Button></TooltipTrigger>{!doc.settings.fic.enabled ? <TooltipContent>Attiva Fatture in Cloud nelle Impostazioni.</TooltipContent> : null}</Tooltip><DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Altre azioni preventivo" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={!quote.items.length} onClick={() => setOverlay({ kind: "save-template" })}>Salva come template</DropdownMenuItem><DropdownMenuItem onClick={() => void controller.performRefresh()}><RefreshCw />Aggiorna con valori correnti</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
      </div>

      <Card><CardContent className="grid grid-cols-[150px_170px_minmax(180px,1fr)_minmax(180px,1fr)_180px] gap-3 py-4">
        <Field><FieldLabel htmlFor="quote-date">Data</FieldLabel><Input id="quote-date" type="date" value={quote.date} onChange={(event) => setQuoteValue({ date: event.target.value })} /></Field>
        <Field><FieldLabel htmlFor="quote-profile">Profilo</FieldLabel><NativeSelect id="quote-profile" value={quote.profileId ?? ""} onChange={(event) => setQuoteValue({ profileId: event.target.value })}><NativeSelectOption value="">Incompleto</NativeSelectOption>{doc.profiles.map((profile) => <NativeSelectOption key={profile.id} value={profile.id}>{profile.year} · {profile.confirmed ? "confermato" : "da verificare"}</NativeSelectOption>)}</NativeSelect></Field>
        <Field><FieldLabel>Cliente</FieldLabel><Button className="w-full justify-start" variant="outline" onClick={() => setOverlay({ kind: "customer" })}><UserRound />{quote.client?.displayName ?? "Scegli cliente"}{quote.client ? <Badge className="ml-auto" variant="secondary">FIC</Badge> : null}</Button></Field>
        <Field><FieldLabel htmlFor="quote-site">Sede principale</FieldLabel><NativeSelect id="quote-site" value={quote.mainSite?.sourceId ?? ""} onChange={(event) => setQuoteValue({ mainSiteId: event.target.value })}><NativeSelectOption value="">Nessuna</NativeSelectOption>{doc.sites.map((site) => <NativeSelectOption key={site.id} value={site.id}>{site.name}</NativeSelectOption>)}</NativeSelect></Field>
        <Field><FieldLabel htmlFor="quote-commission">Provvigione esterna</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id="quote-commission" defaultValue={moneyInputValue(quote.commission ?? "")} inputMode="decimal" onBlur={(event) => setQuoteValue({ commission: decimalInputValue(event.target.value) })} /></InputGroup></Field>
      </CardContent></Card>
      {quote.client?.source === "fatture_in_cloud" ? <Alert><AlertDescription>Cliente Fatture in Cloud: <strong>{quote.client.displayName}</strong>. Lo snapshot nel preventivo resta indipendente dalla sorgente.</AlertDescription></Alert> : null}

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-4">
        <div className="space-y-3">{quote.items.length ? quote.items.map((item) => <QuoteItemCard key={item.id} item={item} hourly={hourly} doc={doc} actions={itemActions} />) : <Card><CardContent className="grid min-h-64 place-items-center text-center"><div><Wrench className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 font-medium">Il preventivo è vuoto</p><p className="mt-1 text-sm text-muted-foreground">Crea una voce manuale o inserisci un template: puoi combinare i due approcci liberamente.</p><div className="mt-4 flex justify-center gap-2"><Button onClick={() => setOverlay({ kind: "item" })}><Plus />Aggiungi voce</Button><Button variant="outline" disabled={!doc.catalog.templates.length} onClick={() => setOverlay({ kind: "insert-template" })}>Inserisci template</Button></div></div></CardContent></Card>}</div>
        <aside className="sticky top-24 space-y-3"><Card><CardHeader><div><CardTitle>Analisi complessiva</CardTitle><CardDescription>La provvigione resta esclusa da questi calcoli.</CardDescription></div></CardHeader><CardContent>{total ? <Analysis value={total} /> : <Alert><AlertTitle>Analisi non disponibile</AlertTitle><AlertDescription>Associa un profilo confermato e calcolabile.</AlertDescription></Alert>}</CardContent></Card><Collapsible render={<Card />}><CollapsibleTrigger render={<Button variant="ghost" className="h-auto w-full justify-between p-4" />}><span className="flex items-center gap-2"><Info className="size-4" />Dettagli tecnici</span><ChevronDown /></CollapsibleTrigger><CollapsibleContent><CardContent className="space-y-2 border-t pt-4 text-xs text-muted-foreground"><p>Profilo: {quote.profileSnapshot ? `${quote.profileSnapshot.year} · rev. ${quote.profileSnapshot.revision}` : "non associato"}</p><p>Revisione snapshot: {quote.snapshotRevision}</p><p>{quote.snapshotUpdatedAt ? `Aggiornato: ${quote.snapshotUpdatedAt}` : "Snapshot mai aggiornato esplicitamente"}</p><p>Tentativi export: {quote.exportAttempts.length}</p></CardContent></CollapsibleContent></Collapsible></aside>
      </div>

      {overlay?.kind === "customer" ? <CustomerDialog open onOpenChange={(open) => { if (!open) setOverlay(undefined) }} quote={quote} doc={doc} results={controller.clientResults} onSearch={controller.searchRemoteClients} onSelect={selectCustomer} /> : null}
      {overlay?.kind === "item" ? <ItemNameDialog open initial={overlay.item?.name} title={overlay.item ? "Rinomina voce" : "Nuova voce commerciale"} onOpenChange={(open) => { if (!open) setOverlay(undefined) }} onSave={(name) => { if (overlay.item) controller.renameItem(overlay.item.id, name); else controller.addItem(name); setOverlay(undefined) }} /> : null}
      {overlay?.kind === "sub" && overlayItem ? <SubItemDialog key={`${overlay.itemId}-${overlay.subId ?? overlay.initialKind}`} sub={overlaySub} initialKind={overlay.initialKind} doc={doc} appState={appState} quoteClient={quote.client} defaultDestinationSiteId={quote.mainSite?.sourceId} onClose={() => setOverlay(undefined)} onSaveSimple={(input) => controller.saveSimpleSub(overlay.itemId, input, overlay.subId)} onSaveTravel={(input) => controller.saveTravel(overlay.itemId, input, overlay.subId)} /> : null}
      {overlay?.kind === "catalog" ? <CatalogPickerDialog itemId={overlay.itemId} doc={doc} quote={quote} onClose={() => setOverlay(undefined)} onAdd={(item, context) => controller.addReusable(overlay.itemId, item, context)} /> : null}
      {overlay?.kind === "save-sub" && overlaySub ? <SaveSubDialog description={overlaySub.description} onClose={() => setOverlay(undefined)} onConfirm={() => { controller.saveSubToCatalog(overlay.itemId, overlay.subId); setOverlay(undefined) }} /> : null}
      {overlay?.kind === "variant" && overlayItem ? <VariantEditorSheet item={overlayItem} source={overlayGroup} doc={doc} quote={quote} onClose={() => setOverlay(undefined)} onSave={(group, selected, context, force) => controller.saveVariantGroup(overlay.itemId, group, selected, context, force)} /> : null}
      {overlay?.kind === "variant-change" && overlayItem && overlayGroup ? <VariantChangeDialog group={overlayGroup} optionId={overlay.optionId} doc={doc} quote={quote} hasManualChanges={overlayItem.subItems.some((sub) => sub.variantOwner?.groupId === overlay.groupId && sub.manuallyModified)} onClose={() => setOverlay(undefined)} onChange={(context, force) => controller.switchVariant(overlay.itemId, overlay.groupId, overlay.optionId, context, force)} /> : null}
      {overlay?.kind === "insert-template" ? <InsertTemplateDialog doc={doc} quote={quote} onClose={() => setOverlay(undefined)} onInsert={controller.insertTemplate} /> : null}
      {overlay?.kind === "save-template" ? <SaveTemplateDialog quote={quote} onClose={() => setOverlay(undefined)} onSave={controller.saveTemplate} /> : null}
      {overlay?.kind === "export" ? <ExportDialog quote={quote} doc={doc} results={controller.clientResults} onSearch={controller.searchRemoteClients} onClose={() => setOverlay(undefined)} onExport={controller.performExport} /> : null}
      <AlertDialog open={Boolean(pendingUpdate)} onOpenChange={(open) => { if (!open) setPendingUpdate(undefined) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Data e profilo appartengono ad anni diversi</AlertDialogTitle><AlertDialogDescription>Cash non cambia automaticamente il profilo. Puoi mantenere esplicitamente questa associazione senza modificare voci o prezzi scelti.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingUpdate) controller.updateQuote(pendingUpdate, true); setPendingUpdate(undefined) }}>Mantieni associazione</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  )
}

function QuotesList({ doc, onNew, onOpen, requestDelete }: { doc: CashDocument; onNew: () => void; onOpen: (id: string) => void; requestDelete: (target: DeleteTarget) => void }) {
  return <Card><CardHeader><div><CardTitle>Preventivi</CardTitle><CardDescription>Spazio di lavoro libero: nessuno stato commerciale e nessun wizard obbligatorio.</CardDescription></div><CardAction><Button onClick={onNew}><FilePlus2 />Nuovo preventivo</Button></CardAction></CardHeader><CardContent>{doc.quotes.length ? <Table><TableHeader><TableRow><TableHead>Preventivo</TableHead><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Voci</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{[...doc.quotes].reverse().map((quote) => <TableRow key={quote.id} className="cursor-pointer" onDoubleClick={() => onOpen(quote.id)}><TableCell className="font-medium">{quote.items.map((item) => item.name).join(", ") || "Preventivo incompleto"}</TableCell><TableCell>{dateIt(quote.date)}</TableCell><TableCell>{quote.client?.displayName ?? "Nessun cliente"}</TableCell><TableCell className="text-right">{quote.items.length}</TableCell><TableCell><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Azioni preventivo" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onOpen(quote.id)}>Apri</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "quote", id: quote.id, label: quote.items.map((item) => item.name).join(", ") || "Preventivo incompleto" })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <div className="grid min-h-72 place-items-center rounded-lg border border-dashed text-center"><div><FilePlus2 className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 font-medium">Nessun preventivo</p><p className="mt-1 text-sm text-muted-foreground">Crea un workspace vuoto e aggiungi ciò che serve man mano.</p><Button className="mt-4" onClick={onNew}>Nuovo preventivo</Button></div></div>}</CardContent></Card>
}
