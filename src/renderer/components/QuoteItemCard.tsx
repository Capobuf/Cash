import { MoreHorizontal, Plus } from "lucide-react"
import type { FormEvent } from "react"
import { calculateItem } from "../../domain/calculations"
import type { CashDocument, QuoteItem } from "../../domain/model"
import { Analysis } from "@/components/Analysis"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { eur, hours, moneyInputValue } from "@/lib/format"
import type { DeleteTarget } from "../types"

export interface QuoteItemActions {
  rename: (item: QuoteItem) => void
  savePrices: (item: QuoteItem, form: HTMLFormElement) => void
  editSub: (itemId: string, subId: string) => void
  saveSub: (itemId: string, subId: string) => void
  changeVariant: (itemId: string, groupId: string, optionId: string) => void
  addTimeOrExpense: (kind: "time" | "expense", itemId: string) => void
  addTravel: (itemId: string) => void
  addCatalog: (itemId: string) => void
  addVariant: (itemId: string) => void
  requestDelete: (target: DeleteTarget) => void
}

export function QuoteItemCard({ item, hourly, doc, actions }: { item: QuoteItem; hourly?: string; doc: CashDocument; actions: QuoteItemActions }) {
  const analysis = hourly ? calculateItem(item, hourly) : undefined
  const savePrices = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); actions.savePrices(item, event.currentTarget) }
  return (
    <Card>
      <CardHeader><CardTitle>{item.name}</CardTitle><Badge variant="secondary">{item.subItems.length} sottovoci</Badge><CardAction><DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label={`Azioni per ${item.name}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => actions.rename(item)}>Rinomina</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => actions.requestDelete({ kind: "item", id: item.id, label: item.name })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></CardAction></CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={savePrices}><FieldGroup className="grid grid-cols-4 items-end">
          <Field><FieldLabel htmlFor={`chosen-${item.id}`}>Prezzo scelto</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id={`chosen-${item.id}`} name="chosenPrice" defaultValue={moneyInputValue(item.chosenPrice ?? "")} inputMode="decimal" /></InputGroup></Field>
          <Field><FieldLabel htmlFor={`reference-${item.id}`}>Prezzo di riferimento</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id={`reference-${item.id}`} name="referenceAmount" defaultValue={moneyInputValue(item.referencePrice?.amount ?? "")} inputMode="decimal" /></InputGroup></Field>
          <Field><FieldLabel htmlFor={`period-${item.id}`}>Mese riferimento</FieldLabel><Input id={`period-${item.id}`} name="referencePeriod" defaultValue={item.referencePrice?.period ?? ""} type="month" /></Field>
          <Button type="submit">Aggiorna prezzi</Button>
        </FieldGroup></form>
        {item.referencePrice?.foiEvidence ? <Alert><AlertDescription>Rivalutato: <strong>{eur(item.referencePrice.foiEvidence.revaluedAmount)}</strong> · {item.referencePrice.foiEvidence.fromPeriod} → {item.referencePrice.foiEvidence.toPeriod} · basi {item.referencePrice.foiEvidence.fromBase} / {item.referencePrice.foiEvidence.toBase} · acquisito {item.referencePrice.foiEvidence.acquiredAt}</AlertDescription></Alert> : null}
        {item.subItems.length ? <Table><TableHeader><TableRow><TableHead>Descrizione</TableHead><TableHead>Dettagli</TableHead><TableHead className="w-16 text-right">Azioni</TableHead></TableRow></TableHeader><TableBody>{item.subItems.map((sub) => <TableRow key={sub.id}><TableCell className="font-medium">{sub.description}</TableCell><TableCell className="text-muted-foreground">{sub.kind === "time" ? `${sub.minutes} min` : sub.kind === "expense" ? eur(sub.amount) : `${sub.totalDistanceKm} km · ${hours(sub.totalMinutes)} · ${eur(sub.totalCost)}`}{sub.variantOwner ? " · variante" : ""}</TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${sub.description}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => actions.editSub(item.id, sub.id)}>Modifica</DropdownMenuItem><DropdownMenuItem onClick={() => actions.saveSub(item.id, sub.id)}>Salva nel catalogo</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => actions.requestDelete({ kind: "sub", id: `${item.id}:${sub.id}`, label: sub.description })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <p className="py-6 text-center text-sm text-muted-foreground">La voce richiede tempo positivo per essere calcolabile.</p>}
        {item.variantGroups.length ? <FieldGroup>{item.variantGroups.map((group) => <Field key={group.id}><FieldLabel htmlFor={`variant-${group.id}`}>{group.name}</FieldLabel><NativeSelect className="w-full" id={`variant-${group.id}`} name={`variant-${group.id}`} value={item.variantSelections.find((selection) => selection.groupId === group.id)?.optionId} onChange={(event) => actions.changeVariant(item.id, group.id, event.target.value)}>{group.options.map((option) => <NativeSelectOption key={option.id} value={option.id}>{option.name}</NativeSelectOption>)}</NativeSelect></Field>)}</FieldGroup> : null}
        <Separator />
        <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => actions.addTimeOrExpense("time", item.id)}><Plus />Tempo</Button><Button variant="secondary" size="sm" onClick={() => actions.addTimeOrExpense("expense", item.id)}><Plus />Spesa</Button><Button variant="secondary" size="sm" onClick={() => actions.addTravel(item.id)}><Plus />Trasferta</Button><Button variant="secondary" size="sm" disabled={!doc.catalog.subItems.length} onClick={() => actions.addCatalog(item.id)}><Plus />Dal catalogo</Button><Button variant="secondary" size="sm" onClick={() => actions.addVariant(item.id)}><Plus />Variante</Button></div>
        {analysis ? <Analysis value={analysis} /> : null}
      </CardContent>
    </Card>
  )
}
