import {
  BriefcaseBusiness,
  ChevronDown,
  Clock3,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
} from "lucide-react"
import { useState, type FormEvent } from "react"
import { calculateItem } from "../../domain/calculations"
import type { CashDocument, QuoteItem, QuoteSubItem, VariantGroup } from "../../domain/model"
import { WorkItemRow } from "@/components/WorkItemRow"
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
import { decimalInputValue, eur, formReader, hours, moneyInputValue } from "@/lib/format"
import type { DeleteTarget } from "../types"

export interface QuoteItemActions {
  rename: (item: QuoteItem) => void
  updateChosenPrice: (itemId: string, value: string) => boolean
  updateReferencePrice: (itemId: string, amount?: string, period?: string) => boolean
  editSub: (itemId: string, subId: string) => void
  saveSub: (itemId: string, subId: string) => void
  changeVariant: (itemId: string, group: VariantGroup, optionId: string) => void
  addSub: (itemId: string, kind: "time" | "expense" | "travel") => void
  addCatalog: (itemId: string) => void
  requestDelete: (target: DeleteTarget) => void
}

export function QuoteItemCard({ item, hourly, doc, actions }: {
  item: QuoteItem
  hourly?: string
  doc: CashDocument
  actions: QuoteItemActions
}) {
  const analysis = hourly ? calculateItem(item, hourly) : undefined
  const [referenceOpen, setReferenceOpen] = useState(Boolean(item.referencePrice))

  const saveReference = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { get, money } = formReader(event.currentTarget)
    actions.updateReferencePrice(item.id, money("referenceAmount"), get("referencePeriod"))
  }

  const removeReference = () => {
    if (actions.updateReferencePrice(item.id)) setReferenceOpen(false)
  }

  return (
    <Collapsible defaultOpen={item.subItems.length === 0 || Boolean(analysis?.blockers.length)} render={<Card className="overflow-hidden" />}>
      <div className="flex min-h-24 flex-wrap items-start gap-3 px-4 py-4 sm:px-5">
        <CollapsibleTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Apri o chiudi ${item.name}`} className="group mt-0.5" />}>
          <ChevronDown className="transition-transform group-data-panel-open:rotate-180" />
        </CollapsibleTrigger>

        <div className="min-w-[240px] flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{item.name}</h3>
            {analysis?.blockers.length ? <Badge variant="destructive">Da completare</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock3 className="size-3.5" />{hours(analysis?.minutes)}</span>
            <span>Spese {eur(analysis?.expenses)}</span>
          </div>

          {item.variantGroups.length ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {item.variantGroups.map((group) => {
                const selected = item.variantSelections.find((entry) => entry.groupId === group.id)?.optionId ?? ""
                return (
                  <div key={group.id} className="flex items-center gap-1.5 rounded-lg bg-muted/40 px-2 py-1">
                    <label htmlFor={`variant-${item.id}-${group.id}`} className="text-xs font-medium">{group.name}</label>
                    <NativeSelect id={`variant-${item.id}-${group.id}`} size="sm" value={selected} onChange={(event) => actions.changeVariant(item.id, group, event.target.value)}>
                      <NativeSelectOption value="" disabled>Scegli</NativeSelectOption>
                      {group.options.map((option) => <NativeSelectOption key={option.id} value={option.id}>{option.name}</NativeSelectOption>)}
                    </NativeSelect>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-[290px] flex-1 items-end justify-end gap-4 sm:flex-none">
          <Field className="w-40">
            <FieldLabel htmlFor={`chosen-${item.id}`}>Prezzo scelto</FieldLabel>
            <InputGroup>
              <InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon>
              <InputGroupInput
                id={`chosen-${item.id}`}
                defaultValue={moneyInputValue(item.chosenPrice ?? "")}
                inputMode="decimal"
                placeholder="0,00"
                onBlur={(event) => actions.updateChosenPrice(item.id, decimalInputValue(event.currentTarget.value))}
              />
            </InputGroup>
          </Field>
          <div className="min-w-28 pb-1 text-right">
            <p className="text-[11px] text-muted-foreground">Valore teorico</p>
            <p className="font-semibold tabular-nums">{eur(analysis?.theoreticalValue)}</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${item.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => actions.rename(item)}><Pencil />Rinomina</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => actions.requestDelete({ kind: "item", id: item.id, label: item.name })}>Elimina voce</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CollapsibleContent>
        <Separator />
        <CardContent className="space-y-5 pt-5">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-sm font-medium">Attività e costi</h4>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="sm" />}><Plus />Aggiungi <ChevronDown /></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => actions.addSub(item.id, "time")}><Clock3 />Attività</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => actions.addSub(item.id, "expense")}><ReceiptText />Spesa</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => actions.addSub(item.id, "travel")}><MapPin />Trasferta</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!doc.catalog.subItems.length} onClick={() => actions.addCatalog(item.id)}><BriefcaseBusiness />Dal catalogo</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {item.subItems.length ? (
              <div className="space-y-2">
                {item.subItems.map((sub) => (
                  <WorkItemRow
                    key={sub.id}
                    kind={sub.kind}
                    description={sub.description}
                    detail={quoteSubDetail(sub)}
                    note={variantNote(item, sub)}
                    onClick={() => actions.editSub(item.id, sub.id)}
                    action={
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${sub.description}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => actions.editSub(item.id, sub.id)}>Modifica</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => actions.saveSub(item.id, sub.id)}>Salva nel catalogo</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => actions.requestDelete({ kind: "sub", id: `${item.id}:${sub.id}`, label: sub.description })}>Elimina</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  />
                ))}
              </div>
            ) : <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nessuna attività o costo nella voce.</p>}
          </section>

          <section className="border-t pt-4">
            {!referenceOpen ? (
              <Button size="sm" variant="ghost" onClick={() => setReferenceOpen(true)}>Aggiungi prezzo di riferimento</Button>
            ) : (
              <form className="space-y-3" onSubmit={saveReference}>
                <div className="flex flex-wrap items-end gap-3">
                  <Field className="min-w-44 flex-1">
                    <FieldLabel htmlFor={`reference-${item.id}`}>Prezzo di riferimento</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon>
                      <InputGroupInput id={`reference-${item.id}`} name="referenceAmount" defaultValue={moneyInputValue(item.referencePrice?.amount ?? "")} inputMode="decimal" required />
                    </InputGroup>
                  </Field>
                  <Field className="min-w-44 flex-1">
                    <FieldLabel htmlFor={`period-${item.id}`}>Mese/anno di riferimento</FieldLabel>
                    <Input id={`period-${item.id}`} name="referencePeriod" defaultValue={item.referencePrice?.period ?? ""} type="month" required />
                  </Field>
                  <Button size="sm" type="submit" variant="outline">Salva riferimento</Button>
                  <Button size="sm" type="button" variant="ghost" onClick={removeReference}>{item.referencePrice ? "Rimuovi" : "Annulla"}</Button>
                </div>
                {item.referencePrice?.foiEvidence ? <p className="text-xs text-muted-foreground">Prezzo rivalutato FOI: <strong className="text-foreground">{eur(item.referencePrice.foiEvidence.revaluedAmount)}</strong> · dato {item.referencePrice.foiEvidence.toPeriod}</p> : null}
              </form>
            )}
          </section>
        </CardContent>
      </CollapsibleContent>
    </Collapsible>
  )
}

function quoteSubDetail(sub: QuoteSubItem): string {
  if (sub.kind === "time") return hours(sub.minutes)
  if (sub.kind === "expense") return eur(sub.amount)
  return `${sub.totalDistanceKm ?? sub.distanceKmPerOccurrence ?? "—"} km · ${hours(sub.totalMinutes ?? sub.travelMinutesPerOccurrence)} · ${eur(sub.totalCost)}`
}

function variantNote(item: QuoteItem, sub: QuoteSubItem): string | undefined {
  if (!sub.variantOwner) return undefined
  const group = item.variantGroups.find((entry) => entry.id === sub.variantOwner?.groupId)
  const option = group?.options.find((entry) => entry.id === sub.variantOwner?.optionId)
  const source = [group?.name, option?.name].filter(Boolean).join(" · ")
  return `${source || "Prodotta da variante"}${sub.manuallyModified ? " · modificata manualmente" : ""}`
}
