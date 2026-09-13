import {
  BriefcaseBusiness,
  ChevronDown,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
  Shapes,
} from "lucide-react"
import { calculateItem } from "../../domain/calculations"
import type { CashDocument, QuoteItem, QuoteSubItem, VariantGroup } from "../../domain/model"
import { Analysis } from "@/components/Analysis"
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

export function QuoteItemCard({
  item,
  hourly,
  doc,
  actions,
}: {
  item: QuoteItem
  hourly?: string
  doc: CashDocument
  actions: QuoteItemActions
}) {
  const analysis = hourly ? calculateItem(item, hourly) : undefined

  return (
    <Collapsible defaultOpen={item.subItems.length === 0 || Boolean(analysis?.blockers.length)} render={<Card className="overflow-hidden" />}>
      <div className="flex min-h-20 items-start gap-3 px-5 py-4">
        <CollapsibleTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Apri o chiudi ${item.name}`} className="group mt-0.5" />}
        >
          <ChevronDown className="transition-transform group-data-panel-open:rotate-180" />
        </CollapsibleTrigger>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{item.name}</h3>
            {analysis?.blockers.length ? <Badge variant="destructive">Da completare</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{hours(analysis?.minutes)}</span>
            <span>Spese {eur(analysis?.expenses)}</span>
            <span>Valore teorico {eur(analysis?.theoreticalValue)}</span>
          </div>

          {item.variantGroups.length ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {item.variantGroups.map((group) => {
                const selected = item.variantSelections.find((entry) => entry.groupId === group.id)?.optionId ?? ""
                return (
                  <div key={group.id} className="flex items-center gap-1.5 rounded-lg bg-muted/40 px-2 py-1">
                    <label htmlFor={`variant-${item.id}-${group.id}`} className="text-xs font-medium">{group.name}</label>
                    <NativeSelect
                      id={`variant-${item.id}-${group.id}`}
                      size="sm"
                      value={selected}
                      onChange={(event) => actions.changeVariant(item.id, group, event.target.value)}
                    >
                      <NativeSelectOption value="" disabled>Scegli</NativeSelectOption>
                      {group.options.map((option) => <NativeSelectOption key={option.id} value={option.id}>{option.name}</NativeSelectOption>)}
                    </NativeSelect>
                    <Button size="icon-xs" variant="ghost" aria-label={`Configura ${group.name}`} onClick={() => actions.editVariant(item.id, group)}>
                      <Pencil />
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>

        <div className="grid min-w-56 grid-cols-2 gap-4 text-right">
          <div>
            <p className="text-[11px] text-muted-foreground">Prezzo scelto</p>
            <p className="font-semibold tabular-nums">{eur(item.chosenPrice)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Resa</p>
            <p className="font-medium tabular-nums">{analysis?.yieldPerHour ? `${eur(analysis.yieldPerHour)}/h` : "—"}</p>
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
        <CardContent className="space-y-6 pt-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-medium">Contenuto della voce</h4>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => actions.addSub(item.id, "time")}><Plus />Aggiungi attività</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>Altro <ChevronDown /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => actions.addSub(item.id, "expense")}><ReceiptText />Spesa</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => actions.addSub(item.id, "travel")}><MapPin />Trasferta</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={!doc.catalog.subItems.length} onClick={() => actions.addCatalog(item.id)}>
                      <BriefcaseBusiness />Da contenuti riutilizzabili
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
                          <DropdownMenuItem onClick={() => actions.saveSub(item.id, sub.id)}>Salva come nuovo contenuto riutilizzabile</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => actions.requestDelete({ kind: "sub", id: `${item.id}:${sub.id}`, label: sub.description })}>Elimina</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  />
                ))}
              </div>
            ) : (
              <button
                type="button"
                className="flex w-full items-center justify-center rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground hover:bg-muted/20"
                onClick={() => actions.addSub(item.id, "time")}
              >
                <Plus className="mr-2 size-4" />Aggiungi la prima attività
              </button>
            )}

            {!item.variantGroups.length ? (
              <Button size="sm" variant="ghost" onClick={() => actions.editVariant(item.id)}><Shapes />Aggiungi varianti</Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => actions.editVariant(item.id)}><Plus />Nuovo gruppo variante</Button>
            )}
          </section>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(420px,.8fr)] gap-5 border-t pt-5">
            <section>
              <h4 className="mb-3 text-sm font-medium">Prezzo commerciale</h4>
              <form className="grid grid-cols-3 gap-3" onBlur={(event) => actions.updatePrices(item.id, event.currentTarget)}>
                <Field>
                  <FieldLabel htmlFor={`chosen-${item.id}`}>Prezzo scelto</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon>
                    <InputGroupInput id={`chosen-${item.id}`} name="chosenPrice" defaultValue={moneyInputValue(item.chosenPrice ?? "")} inputMode="decimal" />
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`reference-${item.id}`}>Prezzo di riferimento</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon>
                    <InputGroupInput id={`reference-${item.id}`} name="referenceAmount" defaultValue={moneyInputValue(item.referencePrice?.amount ?? "")} inputMode="decimal" />
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`period-${item.id}`}>Mese riferimento</FieldLabel>
                  <Input id={`period-${item.id}`} name="referencePeriod" defaultValue={item.referencePrice?.period ?? ""} type="month" />
                </Field>
              </form>
              {item.referencePrice?.foiEvidence ? (
                <p className="mt-3 text-xs text-muted-foreground">Prezzo rivalutato: <strong className="text-foreground">{eur(item.referencePrice.foiEvidence.revaluedAmount)}</strong> · dato {item.referencePrice.foiEvidence.toPeriod}</p>
              ) : null}
            </section>
            <section>
              <h4 className="mb-3 text-sm font-medium">Analisi del lavoro</h4>
              {analysis ? <Analysis value={analysis} chosenPrice={item.chosenPrice} compact /> : <p className="text-sm text-muted-foreground">Associa un profilo calcolabile.</p>}
            </section>
          </div>
        </CardContent>
      </CollapsibleContent>
    </Collapsible>
  )
}

function quoteSubDetail(sub: QuoteSubItem): string {
  if (sub.kind === "time") return `${sub.minutes} min`
  if (sub.kind === "expense") return eur(sub.amount)
  return `${sub.departure?.name ?? "Partenza?"} → ${sub.destination?.name ?? "Destinazione?"} · ${sub.totalDistanceKm ?? sub.distanceKmPerOccurrence ?? "—"} km · ${hours(sub.totalMinutes ?? sub.travelMinutesPerOccurrence)} · ${eur(sub.totalCost)}`
}

function variantNote(item: QuoteItem, sub: QuoteSubItem): string | undefined {
  if (!sub.variantOwner) return undefined
  const group = item.variantGroups.find((entry) => entry.id === sub.variantOwner?.groupId)
  const option = group?.options.find((entry) => entry.id === sub.variantOwner?.optionId)
  const source = [group?.name, option?.name].filter(Boolean).join(" · ")
  return `${source || "Prodotta da variante"}${sub.manuallyModified ? " · modificata manualmente" : ""}`
}
