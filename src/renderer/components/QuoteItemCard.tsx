import { BriefcaseBusiness, ChevronDown, Clock3, MapPin, MoreHorizontal, Pencil, Plus, ReceiptText, Shapes } from "lucide-react"
import { calculateItem } from "../../domain/calculations"
import type { CashDocument, QuoteItem, VariantGroup } from "../../domain/model"
import { Analysis } from "@/components/Analysis"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { eur, hours, moneyInputValue } from "@/lib/format"
import type { DeleteTarget } from "../types"

export interface QuoteItemActions {
  rename: (item: QuoteItem) => void
  updatePrices: (itemId: string, form: HTMLFormElement) => void
  editSub: (itemId: string, subId: string) => void
  saveSub: (itemId: string, subId: string) => void
  changeVariant: (itemId: string, group: VariantGroup, optionId: string) => void
  editVariant: (itemId: string, group?: VariantGroup) => void
  addSub: (itemId: string, kind: "time" | "expense" | "travel") => void
  addCatalog: (itemId: string) => void
  requestDelete: (target: DeleteTarget) => void
}

export function QuoteItemCard({ item, hourly, doc, actions }: { item: QuoteItem; hourly?: string; doc: CashDocument; actions: QuoteItemActions }) {
  const analysis = hourly ? calculateItem(item, hourly) : undefined
  return (
    <Collapsible defaultOpen={item.subItems.length === 0 || Boolean(analysis?.blockers.length)} render={<Card className="overflow-hidden" />}>
      <div className="flex min-h-20 items-center gap-4 px-5 py-3">
        <CollapsibleTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Apri o chiudi ${item.name}`} className="group" />}><ChevronDown className="transition-transform group-data-panel-open:rotate-180" /></CollapsibleTrigger>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-semibold">{item.name}</h3>{analysis?.blockers.length ? <Badge variant="destructive">Da completare</Badge> : <Badge variant="outline">{item.subItems.length} sottovoci</Badge>}</div><div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground"><span>{hours(analysis?.minutes)}</span><span>Spese {eur(analysis?.expenses)}</span><span>Teorico {eur(analysis?.theoreticalValue)}</span></div></div>
        <div className="grid min-w-56 grid-cols-2 gap-4 text-right"><div><p className="text-[11px] text-muted-foreground">Prezzo scelto</p><p className="font-semibold tabular-nums">{eur(item.chosenPrice)}</p></div><div><p className="text-[11px] text-muted-foreground">Resa</p><p className="font-medium tabular-nums">{analysis?.yieldPerHour ? `${eur(analysis.yieldPerHour)}/h` : "—"}</p></div></div>
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${item.name}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => actions.rename(item)}><Pencil />Rinomina</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => actions.requestDelete({ kind: "item", id: item.id, label: item.name })}>Elimina voce</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
      <CollapsibleContent><Separator /><CardContent className="space-y-6 pt-5">
        {item.variantGroups.length ? <section className="space-y-3"><div className="flex items-center justify-between"><div><h4 className="text-sm font-medium">Struttura e varianti</h4><p className="text-xs text-muted-foreground">Ogni gruppo modifica soltanto le sottovoci che produce.</p></div><Button size="sm" variant="outline" onClick={() => actions.editVariant(item.id)}><Plus />Nuovo gruppo</Button></div><div className="grid grid-cols-2 gap-3">{item.variantGroups.map((group) => <div key={group.id} className="flex items-end gap-2 rounded-lg border bg-muted/20 p-3"><Field className="flex-1"><FieldLabel htmlFor={`variant-${group.id}`}>{group.name}</FieldLabel><NativeSelect id={`variant-${group.id}`} value={item.variantSelections.find((selection) => selection.groupId === group.id)?.optionId ?? ""} onChange={(event) => actions.changeVariant(item.id, group, event.target.value)}><NativeSelectOption value="" disabled>Scegli opzione</NativeSelectOption>{group.options.map((option) => <NativeSelectOption key={option.id} value={option.id}>{option.name}</NativeSelectOption>)}</NativeSelect></Field><Button size="icon-sm" variant="ghost" aria-label={`Modifica variante ${group.name}`} onClick={() => actions.editVariant(item.id, group)}><Pencil /></Button></div>)}</div></section> : <div className="flex items-center justify-between rounded-lg border border-dashed p-4"><div><p className="text-sm font-medium">Nessuna variante</p><p className="text-xs text-muted-foreground">Aggiungi un gruppo se questa voce cambia spesso configurazione.</p></div><Button size="sm" variant="outline" onClick={() => actions.editVariant(item.id)}><Shapes />Aggiungi variante</Button></div>}

        <section className="space-y-3"><div className="flex items-center justify-between"><div><h4 className="text-sm font-medium">Attività, spese e trasferte</h4><p className="text-xs text-muted-foreground">Dettagli interni che compongono tempo e costo del lavoro.</p></div><DropdownMenu><DropdownMenuTrigger render={<Button size="sm" />}><Plus />Aggiungi sottovoce</DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => actions.addSub(item.id, "time")}><Clock3 />Tempo</DropdownMenuItem><DropdownMenuItem onClick={() => actions.addSub(item.id, "expense")}><ReceiptText />Spesa</DropdownMenuItem><DropdownMenuItem onClick={() => actions.addSub(item.id, "travel")}><MapPin />Trasferta</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={!doc.catalog.subItems.length} onClick={() => actions.addCatalog(item.id)}><BriefcaseBusiness />Dal catalogo</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
          {item.subItems.length ? <Table><TableHeader><TableRow><TableHead className="w-28">Tipo</TableHead><TableHead>Descrizione</TableHead><TableHead>Dettagli</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{item.subItems.map((sub) => <TableRow key={sub.id}><TableCell><KindBadge kind={sub.kind} /></TableCell><TableCell><div className="font-medium">{sub.description}</div>{sub.variantOwner ? <div className="mt-1 text-xs text-muted-foreground">Prodotta da variante{sub.manuallyModified ? " · modificata manualmente" : ""}</div> : null}</TableCell><TableCell className="text-muted-foreground">{sub.kind === "time" ? `${sub.minutes} min` : sub.kind === "expense" ? eur(sub.amount) : `${sub.departure?.name ?? "Partenza?"} → ${sub.destination?.name ?? "Destinazione?"} · ${sub.totalDistanceKm ?? sub.distanceKmPerOccurrence ?? "—"} km · ${hours(sub.totalMinutes ?? sub.travelMinutesPerOccurrence)} · ${eur(sub.totalCost)}`}</TableCell><TableCell><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${sub.description}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => actions.editSub(item.id, sub.id)}>Modifica</DropdownMenuItem><DropdownMenuItem onClick={() => actions.saveSub(item.id, sub.id)}>Salva come nuova copia nel catalogo</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => actions.requestDelete({ kind: "sub", id: `${item.id}:${sub.id}`, label: sub.description })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <div className="grid min-h-28 place-items-center rounded-lg border border-dashed text-center"><div><p className="text-sm font-medium">Aggiungi almeno un’attività che produca tempo</p><Button className="mt-3" size="sm" variant="outline" onClick={() => actions.addSub(item.id, "time")}><Plus />Aggiungi Tempo</Button></div></div>}
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(420px,.8fr)] gap-5 border-t pt-5">
          <section><h4 className="mb-3 text-sm font-medium">Prezzo commerciale</h4><form className="grid grid-cols-3 gap-3" onBlur={(event) => actions.updatePrices(item.id, event.currentTarget)}>
            <Field><FieldLabel htmlFor={`chosen-${item.id}`}>Prezzo scelto</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id={`chosen-${item.id}`} name="chosenPrice" defaultValue={moneyInputValue(item.chosenPrice ?? "")} inputMode="decimal" /></InputGroup></Field>
            <Field><FieldLabel htmlFor={`reference-${item.id}`}>Prezzo di riferimento</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id={`reference-${item.id}`} name="referenceAmount" defaultValue={moneyInputValue(item.referencePrice?.amount ?? "")} inputMode="decimal" /></InputGroup></Field>
            <Field><FieldLabel htmlFor={`period-${item.id}`}>Mese riferimento</FieldLabel><Input id={`period-${item.id}`} name="referencePeriod" defaultValue={item.referencePrice?.period ?? ""} type="month" /></Field>
          </form>{item.referencePrice?.foiEvidence ? <p className="mt-3 text-xs text-muted-foreground">Prezzo rivalutato: <strong className="text-foreground">{eur(item.referencePrice.foiEvidence.revaluedAmount)}</strong> · dato {item.referencePrice.foiEvidence.toPeriod}</p> : null}</section>
          <section><h4 className="mb-3 text-sm font-medium">Analisi del lavoro</h4>{analysis ? <Analysis value={analysis} chosenPrice={item.chosenPrice} compact /> : <p className="text-sm text-muted-foreground">Associa un profilo calcolabile.</p>}</section>
        </div>
      </CardContent></CollapsibleContent>
    </Collapsible>
  )
}

function KindBadge({ kind }: { kind: "time" | "expense" | "travel" }) {
  const Icon = kind === "time" ? Clock3 : kind === "expense" ? ReceiptText : MapPin
  return <Badge variant="outline"><Icon />{kind === "time" ? "Tempo" : kind === "expense" ? "Spesa" : "Trasferta"}</Badge>
}
