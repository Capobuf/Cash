import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Clock3,
  Layers3,
  MapPin,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Save,
  Star,
  Trash2,
} from "lucide-react"
import { useState, type FormEvent } from "react"
import { cloneReusableSubItem } from "../../domain/catalog"
import { parseDuration } from "../../domain/duration"
import {
  meta,
  type CashDocument,
  type ReusableSubItem,
  type SubItemDefinition,
  type Template,
  type TemplateItem,
  type VariantGroup,
  type VariantOption,
} from "../../domain/model"
import { validateVariantGroups } from "../../domain/variants"
import { DefinitionDialog } from "@/components/QuoteDialogs"
import { WorkItemRow } from "@/components/WorkItemRow"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { decimalInputValue, eur, formReader, hours, moneyInputValue } from "@/lib/format"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

type Kind = ReusableSubItem["kind"]
type BaseEditor = { itemIndex: number; subIndex?: number; initialKind?: Kind }
type DefinitionEditor = {
  itemIndex: number
  groupIndex: number
  optionIndex: number
  definitionIndex?: number
  initialKind?: SubItemDefinition["kind"]
}

export function CatalogView({
  doc,
  appState,
  requestDelete,
}: {
  doc: CashDocument
  appState: AppState
  requestDelete: (target: DeleteTarget) => void
}) {
  const [editingReusableId, setEditingReusableId] = useState<string | null>()
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>()
  const reusable = editingReusableId ? doc.catalog.subItems.find((entry) => entry.id === editingReusableId) : undefined
  const template = editingTemplateId ? doc.catalog.templates.find((entry) => entry.id === editingTemplateId) : undefined

  if (editingTemplateId !== undefined) {
    return (
      <TemplateWorkspace
        key={editingTemplateId ?? "new"}
        source={template}
        reusableItems={doc.catalog.subItems}
        appState={appState}
        onClose={() => setEditingTemplateId(undefined)}
        onSave={(value) => {
          appState.mutate((document) => {
            if (template) {
              const index = document.catalog.templates.findIndex((entry) => entry.id === template.id)
              document.catalog.templates[index] = value
            } else {
              document.catalog.templates.push(value)
            }
          })
          setEditingTemplateId(undefined)
        }}
      />
    )
  }

  return (
    <>
      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates"><BookOpen />Template</TabsTrigger>
          <TabsTrigger value="subitems"><Layers3 />Contenuti riutilizzabili</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Template</CardTitle>
              <CardDescription>Prepara le basi che userai più spesso nei preventivi.</CardDescription>
              <CardAction><Button onClick={() => setEditingTemplateId(null)}><Plus />Nuovo template</Button></CardAction>
            </CardHeader>
            <CardContent>
              {doc.catalog.templates.length ? (
                <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {doc.catalog.templates.map((entry) => {
                    const variants = entry.items.reduce((sum, item) => sum + item.variantGroups.length, 0)
                    const content = entry.items.reduce((sum, item) => sum + item.subItems.length, 0)
                    return (
                      <Card key={entry.id} size="sm" className="cursor-pointer transition-colors hover:bg-muted/20" onDoubleClick={() => setEditingTemplateId(entry.id)}>
                        <CardHeader>
                          <CardTitle>{entry.name}</CardTitle>
                          <CardDescription>{entry.items.map((item) => item.name).join(" · ")}</CardDescription>
                          <CardAction>
                            <RowMenu
                              label={entry.name}
                              onEdit={() => setEditingTemplateId(entry.id)}
                              onDelete={() => requestDelete({ kind: "template", id: entry.id, label: entry.name })}
                            />
                          </CardAction>
                        </CardHeader>
                        <CardContent className="flex gap-4 text-xs text-muted-foreground">
                          <span>{entry.items.length} {entry.items.length === 1 ? "voce" : "voci"}</span>
                          <span>{content} elementi base</span>
                          {variants ? <span>{variants} {variants === 1 ? "variante" : "varianti"}</span> : null}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              ) : (
                <Empty
                  title="Crea il tuo primo template"
                  description="Parti da una voce e aggiungi le attività che compongono il lavoro."
                  actionLabel="Crea template"
                  onAction={() => setEditingTemplateId(null)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subitems">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Contenuti riutilizzabili</CardTitle>
              <CardDescription>Attività, spese e trasferte da inserire singolarmente.</CardDescription>
              <CardAction><Button variant="outline" onClick={() => setEditingReusableId(null)}><Plus />Nuovo contenuto</Button></CardAction>
            </CardHeader>
            <CardContent>
              {doc.catalog.subItems.length ? (
                <div className="space-y-2">
                  {doc.catalog.subItems.map((item) => (
                    <WorkItemRow
                      key={item.id}
                      kind={item.kind}
                      description={item.description}
                      detail={reusableDetail(item)}
                      onClick={() => setEditingReusableId(item.id)}
                      action={
                        <RowMenu
                          label={item.description}
                          onEdit={() => setEditingReusableId(item.id)}
                          onDelete={() => requestDelete({ kind: "catalog", id: item.id, label: item.description })}
                        />
                      }
                    />
                  ))}
                </div>
              ) : (
                <Empty
                  title="Nessun contenuto riutilizzabile"
                  description="Puoi crearne uno qui o salvarlo da un preventivo."
                  actionLabel="Nuovo contenuto"
                  onAction={() => setEditingReusableId(null)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editingReusableId !== undefined ? (
        <ReusableDialog
          key={editingReusableId ?? "new"}
          value={reusable}
          onClose={() => setEditingReusableId(undefined)}
          onSave={(value) => {
            appState.mutate((document) => {
              if (reusable) {
                const index = document.catalog.subItems.findIndex((entry) => entry.id === reusable.id)
                document.catalog.subItems[index] = value
              } else {
                document.catalog.subItems.push(value)
              }
            })
            setEditingReusableId(undefined)
          }}
        />
      ) : null}
    </>
  )
}

function TemplateWorkspace({
  source,
  reusableItems,
  appState,
  onClose,
  onSave,
}: {
  source?: Template
  reusableItems: ReusableSubItem[]
  appState: AppState
  onClose: () => void
  onSave: (template: Template) => void
}) {
  const [draft, setDraft] = useState<Template>(() => source
    ? structuredClone(source)
    : { ...meta(), name: "", items: [{ ...meta(), name: "", subItems: [], variantGroups: [] }] })
  const [baseEditor, setBaseEditor] = useState<BaseEditor>()
  const [definitionEditor, setDefinitionEditor] = useState<DefinitionEditor>()
  const [pickerItemIndex, setPickerItemIndex] = useState<number>()

  const updateDraft = (mutate: (next: Template) => void) => {
    setDraft((current) => {
      const next = structuredClone(current)
      mutate(next)
      return next
    })
  }

  const save = () => {
    if (!draft.name.trim() || !draft.items.length || draft.items.some((item) => !item.name.trim())) {
      appState.setError({ code: "VALIDATION", message: "Nome del template e nomi delle voci sono obbligatori." })
      return
    }
    for (const item of draft.items) {
      const valid = validateVariantGroups(item.variantGroups)
      if (!valid.ok) {
        appState.setError(valid.error)
        return
      }
      const hasWork = item.subItems.some((sub) => sub.kind === "time" || sub.kind === "travel")
        || item.variantGroups.some((group) => group.options.some((option) => option.subItems.some((sub) => sub.kind === "time" || sub.kind === "travel")))
      if (!hasWork) {
        appState.setError({
          code: "VALIDATION",
          field: "template.items",
          message: `La voce “${item.name}” deve includere almeno un’attività o una Trasferta, di base o in una variante.`,
        })
        return
      }
      const referenceAmount = item.referencePrice ? decimalInputValue(item.referencePrice.amount) : undefined
      if (item.referencePrice && (!referenceAmount || !Number.isFinite(Number(referenceAmount)) || Number(referenceAmount) < 0 || !item.referencePrice.period)) {
        appState.setError({
          code: "VALIDATION",
          field: "template.items.referencePrice",
          message: `Completa importo e mese del prezzo di riferimento per “${item.name}”, oppure rimuovilo.`,
        })
        return
      }
    }
    const prepared = structuredClone(draft)
    for (const item of prepared.items) {
      if (item.referencePrice) item.referencePrice.amount = Number(decimalInputValue(item.referencePrice.amount)).toFixed(2)
    }
    onSave({ ...prepared, name: prepared.name.trim(), updatedAt: new Date().toISOString() })
  }

  const baseValue = baseEditor
    ? draft.items[baseEditor.itemIndex]?.subItems[baseEditor.subIndex ?? -1]
    : undefined
  const definitionValue = definitionEditor
    ? draft.items[definitionEditor.itemIndex]?.variantGroups[definitionEditor.groupIndex]?.options[definitionEditor.optionIndex]?.subItems[definitionEditor.definitionIndex ?? -1]
    : undefined

  return (
    <div className="space-y-5">
      <div className="sticky top-16 z-10 -mx-6 flex items-center gap-4 border-y bg-background/95 px-6 py-3 backdrop-blur 2xl:-mx-8 2xl:px-8">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft />Catalogo</Button>
        <div className="h-6 w-px bg-border" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Template</p>
          <p className="truncate font-medium">{draft.name.trim() || "Senza nome"}</p>
        </div>
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button onClick={save}><Save />Salva template</Button>
      </div>

      <div className="mx-auto max-w-5xl space-y-5">
        <Field>
          <FieldLabel htmlFor="template-name">Nome template</FieldLabel>
          <Input
            id="template-name"
            className="h-11 text-lg font-medium"
            value={draft.name}
            onChange={(event) => updateDraft((next) => { next.name = event.target.value })}
            placeholder="es. Configurazione server"
            autoFocus
          />
        </Field>

        <div className="space-y-4">
          {draft.items.map((item, itemIndex) => (
            <TemplateItemCard
              key={item.id}
              item={item}
              itemIndex={itemIndex}
              canDelete={draft.items.length > 1}
              hasReusableItems={reusableItems.length > 0}
              onRename={(name) => updateDraft((next) => { next.items[itemIndex]!.name = name })}
              onDelete={() => updateDraft((next) => { next.items.splice(itemIndex, 1) })}
              onReferenceChange={(referencePrice) => updateDraft((next) => {
                if (referencePrice) next.items[itemIndex]!.referencePrice = referencePrice
                else delete next.items[itemIndex]!.referencePrice
              })}
              onEditSub={(subIndex) => setBaseEditor({ itemIndex, subIndex })}
              onAddSub={(initialKind) => setBaseEditor({ itemIndex, initialKind })}
              onAddReusable={() => setPickerItemIndex(itemIndex)}
              onVariantsChange={(groups) => updateDraft((next) => { next.items[itemIndex]!.variantGroups = groups })}
              onDefinition={(groupIndex, optionIndex, definitionIndex, initialKind) => {
                setDefinitionEditor({ itemIndex, groupIndex, optionIndex, definitionIndex, initialKind })
              }}
            />
          ))}

          <Button
            variant="outline"
            onClick={() => updateDraft((next) => {
              next.items.push({ ...meta(), name: "", subItems: [], variantGroups: [] })
            })}
          >
            <Plus />Aggiungi voce
          </Button>
        </div>
      </div>

      {baseEditor ? (
        <ReusableDialog
          key={`${baseEditor.itemIndex}-${baseEditor.subIndex ?? "new"}-${baseEditor.initialKind ?? "existing"}`}
          value={baseValue}
          initialKind={baseEditor.initialKind}
          lockKind={Boolean(baseValue || baseEditor.initialKind)}
          title={baseEditor.initialKind === "time" ? "Aggiungi attività" : undefined}
          onClose={() => setBaseEditor(undefined)}
          onSave={(value) => {
            updateDraft((next) => {
              const subItems = next.items[baseEditor.itemIndex]!.subItems
              if (baseEditor.subIndex === undefined) subItems.push(value)
              else subItems[baseEditor.subIndex] = value
            })
            setBaseEditor(undefined)
          }}
          onDelete={baseEditor.subIndex === undefined ? undefined : () => {
            updateDraft((next) => { next.items[baseEditor.itemIndex]!.subItems.splice(baseEditor.subIndex!, 1) })
            setBaseEditor(undefined)
          }}
        />
      ) : null}

      {definitionEditor ? (
        <DefinitionDialog
          key={`${definitionEditor.itemIndex}-${definitionEditor.groupIndex}-${definitionEditor.optionIndex}-${definitionEditor.definitionIndex ?? "new"}-${definitionEditor.initialKind ?? "any"}`}
          value={definitionValue}
          initialKind={definitionEditor.initialKind}
          lockKind={Boolean(definitionValue || definitionEditor.initialKind)}
          onClose={() => setDefinitionEditor(undefined)}
          onSave={(value) => {
            updateDraft((next) => {
              const subItems = next.items[definitionEditor.itemIndex]!.variantGroups[definitionEditor.groupIndex]!.options[definitionEditor.optionIndex]!.subItems
              if (definitionEditor.definitionIndex === undefined) subItems.push(value)
              else subItems[definitionEditor.definitionIndex] = value
            })
            setDefinitionEditor(undefined)
          }}
          onDelete={definitionEditor.definitionIndex === undefined ? undefined : () => {
            updateDraft((next) => {
              next.items[definitionEditor.itemIndex]!.variantGroups[definitionEditor.groupIndex]!.options[definitionEditor.optionIndex]!.subItems.splice(definitionEditor.definitionIndex!, 1)
            })
            setDefinitionEditor(undefined)
          }}
        />
      ) : null}

      {pickerItemIndex !== undefined ? (
        <ReusablePickerDialog
          items={reusableItems}
          onClose={() => setPickerItemIndex(undefined)}
          onSelect={(item) => {
            updateDraft((next) => { next.items[pickerItemIndex]!.subItems.push(cloneReusableSubItem(item)) })
            setPickerItemIndex(undefined)
          }}
        />
      ) : null}
    </div>
  )
}

function TemplateItemCard({
  item,
  itemIndex,
  canDelete,
  hasReusableItems,
  onRename,
  onDelete,
  onReferenceChange,
  onEditSub,
  onAddSub,
  onAddReusable,
  onVariantsChange,
  onDefinition,
}: {
  item: TemplateItem
  itemIndex: number
  canDelete: boolean
  hasReusableItems: boolean
  onRename: (name: string) => void
  onDelete: () => void
  onReferenceChange: (referencePrice?: { amount: string; period: string }) => void
  onEditSub: (index: number) => void
  onAddSub: (kind: Kind) => void
  onAddReusable: () => void
  onVariantsChange: (groups: VariantGroup[]) => void
  onDefinition: (groupIndex: number, optionIndex: number, definitionIndex?: number, initialKind?: SubItemDefinition["kind"]) => void
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{itemIndex + 1}</span>
          <Input
            value={item.name}
            onChange={(event) => onRename(event.target.value)}
            aria-label={`Nome voce ${itemIndex + 1}`}
            placeholder="Nome della voce"
            className="h-9 max-w-xl font-medium"
          />
        </div>
        <CardAction>
          <Button size="icon-sm" variant="ghost" disabled={!canDelete} aria-label={`Elimina voce ${itemIndex + 1}`} onClick={onDelete}>
            <Trash2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Contenuto della voce</h3>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => onAddSub("time")}><Plus />Aggiungi attività</Button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="sm" variant="outline" aria-label="Aggiungi altro contenuto" />}>
                  Altro <ChevronDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onAddSub("expense")}><ReceiptText />Spesa</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAddSub("travel")}><MapPin />Trasferta</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!hasReusableItems} onClick={onAddReusable}><Layers3 />Da contenuti riutilizzabili</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {item.subItems.length ? (
            <div className="space-y-2">
              {item.subItems.map((sub, index) => (
                <WorkItemRow
                  key={sub.id}
                  kind={sub.kind}
                  description={sub.description}
                  detail={reusableDetail(sub)}
                  onClick={() => onEditSub(index)}
                />
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-5 text-left text-sm text-muted-foreground hover:border-input hover:bg-muted/20"
              onClick={() => onAddSub("time")}
            >
              <Clock3 className="size-5" />
              <span><strong className="block text-foreground">Aggiungi il lavoro previsto</strong>Descrizione e durata della prima attività.</span>
            </button>
          )}
        </section>

        <TemplateVariants item={item} onChange={onVariantsChange} onDefinition={onDefinition} />

        <Collapsible defaultOpen={Boolean(item.referencePrice)}>
          <CollapsibleTrigger render={<Button size="sm" variant="ghost" className="group" />}>
            <ChevronDown className="transition-transform group-data-panel-open:rotate-180" />
            Prezzo di riferimento
            {item.referencePrice?.amount ? <Badge variant="outline">{eur(item.referencePrice.amount)}</Badge> : null}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-lg border p-3">
              <Field>
                <FieldLabel htmlFor={`template-reference-${item.id}`}>Importo</FieldLabel>
                <Input
                  id={`template-reference-${item.id}`}
                  value={item.referencePrice?.amount.replace(".", ",") ?? ""}
                  inputMode="decimal"
                  placeholder="0,00"
                  onChange={(event) => onReferenceChange({ amount: event.target.value.replace(",", "."), period: item.referencePrice?.period ?? "" })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`template-period-${item.id}`}>Mese di riferimento</FieldLabel>
                <Input
                  id={`template-period-${item.id}`}
                  type="month"
                  value={item.referencePrice?.period ?? ""}
                  onChange={(event) => onReferenceChange({ amount: item.referencePrice?.amount ?? "", period: event.target.value })}
                />
              </Field>
              <Button variant="ghost" disabled={!item.referencePrice} onClick={() => onReferenceChange(undefined)}>Rimuovi</Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

function TemplateVariants({
  item,
  onChange,
  onDefinition,
}: {
  item: TemplateItem
  onChange: (groups: VariantGroup[]) => void
  onDefinition: (groupIndex: number, optionIndex: number, definitionIndex?: number, initialKind?: SubItemDefinition["kind"]) => void
}) {
  const [expandedOptionId, setExpandedOptionId] = useState<string>()
  const update = (mutate: (groups: VariantGroup[]) => void) => {
    const groups = structuredClone(item.variantGroups)
    mutate(groups)
    onChange(groups)
  }
  const addGroup = () => update((groups) => {
    const option: VariantOption = { ...meta(), name: "", subItems: [] }
    groups.push({ ...meta(), name: "", options: [option], defaultOptionId: option.id })
    setExpandedOptionId(option.id)
  })

  if (!item.variantGroups.length) {
    return (
      <div className="border-t pt-4">
        <Button size="sm" variant="ghost" onClick={addGroup}><Plus />Aggiungi varianti</Button>
      </div>
    )
  }

  return (
    <section className="space-y-3 border-t pt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Varianti</h3>
        <Button size="sm" variant="ghost" onClick={addGroup}><Plus />Nuovo gruppo</Button>
      </div>

      {item.variantGroups.map((group, groupIndex) => (
        <div key={group.id} className="rounded-lg border bg-muted/10">
          <div className="flex items-center gap-2 border-b p-3">
            <Input
              value={group.name}
              onChange={(event) => update((groups) => { groups[groupIndex]!.name = event.target.value })}
              aria-label={`Nome gruppo variante ${groupIndex + 1}`}
              placeholder="es. Gestione cliente"
              className="max-w-lg font-medium"
            />
            <Button size="icon-sm" variant="ghost" aria-label="Elimina gruppo variante" onClick={() => update((groups) => groups.splice(groupIndex, 1))}>
              <Trash2 />
            </Button>
          </div>

          <div className="space-y-2 p-3">
            {group.options.map((option, optionIndex) => {
              const expanded = expandedOptionId === option.id
              const isDefault = group.defaultOptionId === option.id
              return (
                <div key={option.id} className="rounded-lg border bg-card">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    onClick={() => setExpandedOptionId(expanded ? undefined : option.id)}
                    aria-expanded={expanded}
                  >
                    <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{option.name.trim() || "Opzione senza nome"}</span>
                        {isDefault ? <Badge variant="secondary"><Star />Predefinita</Badge> : null}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">{optionEffect(option)}</span>
                  </button>

                  {expanded ? (
                    <div className="space-y-3 border-t p-3">
                      <div className="flex items-end gap-2">
                        <Field className="flex-1">
                          <FieldLabel htmlFor={`option-${option.id}`}>Nome opzione</FieldLabel>
                          <Input
                            id={`option-${option.id}`}
                            value={option.name}
                            onChange={(event) => update((groups) => { groups[groupIndex]!.options[optionIndex]!.name = event.target.value })}
                            placeholder="es. Nessuna, Minima, Media"
                          />
                        </Field>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => update((groups) => {
                            groups[groupIndex]!.defaultOptionId = isDefault ? undefined : option.id
                          })}
                        >
                          <Star />{isDefault ? "Rimuovi default" : "Imposta default"}
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={group.options.length === 1}
                          aria-label={`Elimina opzione ${option.name}`}
                          onClick={() => update((groups) => {
                            const current = groups[groupIndex]!
                            current.options.splice(optionIndex, 1)
                            if (current.defaultOptionId === option.id) current.defaultOptionId = undefined
                          })}
                        >
                          <Trash2 />
                        </Button>
                      </div>

                      {option.subItems.length ? (
                        <div className="space-y-2">
                          {option.subItems.map((definition, definitionIndex) => (
                            <WorkItemRow
                              key={`${definition.kind}-${definitionIndex}`}
                              kind={definition.kind}
                              description={definition.description}
                              detail={definitionDetail(definition)}
                              onClick={() => onDefinition(groupIndex, optionIndex, definitionIndex)}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-md bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Nessun contributo</p>
                      )}

                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => onDefinition(groupIndex, optionIndex, undefined, "time")}>
                          <Plus />Aggiungi tempo
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button size="sm" variant="ghost" />}>Altro <ChevronDown /></DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => onDefinition(groupIndex, optionIndex, undefined, "expense")}><ReceiptText />Spesa</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDefinition(groupIndex, optionIndex, undefined, "travel")}><MapPin />Trasferta</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const option: VariantOption = { ...meta(), name: "", subItems: [] }
                update((groups) => { groups[groupIndex]!.options.push(option) })
                setExpandedOptionId(option.id)
              }}
            >
              <Plus />Aggiungi opzione
            </Button>
          </div>
        </div>
      ))}
    </section>
  )
}

function ReusableDialog({
  value,
  initialKind,
  lockKind = false,
  title,
  onClose,
  onSave,
  onDelete,
}: {
  value?: ReusableSubItem
  initialKind?: Kind
  lockKind?: boolean
  title?: string
  onClose: () => void
  onSave: (value: ReusableSubItem) => void
  onDelete?: () => void
}) {
  const [kind, setKind] = useState<Kind>(value?.kind ?? initialKind ?? "time")
  const [durationError, setDurationError] = useState<string>()
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { data, get, money } = formReader(event.currentTarget)
    const identity = value
      ? { id: value.id, createdAt: value.createdAt, updatedAt: new Date().toISOString() }
      : meta()
    if (kind === "time") {
      const duration = parseDuration(get("minutes"))
      if (!duration.ok) { setDurationError(duration.error.message); return }
      onSave({ ...identity, kind, description: get("description"), minutes: duration.value })
    }
    else if (kind === "expense") onSave({ ...identity, kind, description: get("description"), amount: Number(money("amount")).toFixed(2) })
    else {
      const distance = get("distance")
      const minutes = get("travelMinutes")
      const duration = minutes ? parseDuration(minutes) : undefined
      if (duration && !duration.ok) { setDurationError(duration.error.message); return }
      onSave({
        ...identity,
        kind,
        description: get("description"),
        occurrences: Number(get("occurrences")),
        roundTrip: data.get("roundTrip") === "on",
        ...(distance ? { distanceKmPerOccurrence: Number(distance.replace(",", ".")).toFixed(1) } : {}),
        ...(duration?.ok ? { travelMinutesPerOccurrence: duration.value } : {}),
      })
    }
  }

  const dialogTitle = title ?? (value ? `Modifica ${kindLabel(kind).toLocaleLowerCase("it")}` : "Nuovo contenuto")
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            {kind === "travel" ? <DialogDescription>Sedi, Veicolo e percorso verranno scelti nel preventivo.</DialogDescription> : null}
          </DialogHeader>
          <FieldGroup>
            {!lockKind && !value ? (
              <Field>
                <FieldLabel htmlFor="catalog-kind">Tipo</FieldLabel>
                <NativeSelect id="catalog-kind" value={kind} onChange={(event) => { setKind(event.target.value as Kind); setDurationError(undefined) }}>
                  <NativeSelectOption value="time">Attività</NativeSelectOption>
                  <NativeSelectOption value="expense">Spesa</NativeSelectOption>
                  <NativeSelectOption value="travel">Trasferta</NativeSelectOption>
                </NativeSelect>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="catalog-description">Descrizione</FieldLabel>
              <Input id="catalog-description" name="description" defaultValue={value?.description} autoFocus required />
            </Field>
            {kind === "time" ? (
              <Field>
                <FieldLabel htmlFor="catalog-minutes">Durata</FieldLabel>
                <Input id="catalog-minutes" name="minutes" defaultValue={value?.kind === "time" ? hours(value.minutes) : ""} placeholder="es. 2h 30m" onChange={() => setDurationError(undefined)} required />
                {durationError ? <FieldDescription className="text-destructive">{durationError}</FieldDescription> : <FieldDescription>Puoi usare minuti oppure ore e minuti.</FieldDescription>}
              </Field>
            ) : null}
            {kind === "expense" ? (
              <Field>
                <FieldLabel htmlFor="catalog-amount">Importo</FieldLabel>
                <Input id="catalog-amount" name="amount" defaultValue={value?.kind === "expense" ? moneyInputValue(value.amount) : ""} inputMode="decimal" required />
              </Field>
            ) : null}
            {kind === "travel" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="catalog-occurrences">Occorrenze</FieldLabel>
                  <Input id="catalog-occurrences" name="occurrences" type="number" defaultValue={value?.kind === "travel" ? value.occurrences : 1} min={1} step={1} required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="catalog-distance">Distanza manuale/occ.</FieldLabel>
                    <Input id="catalog-distance" name="distance" defaultValue={value?.kind === "travel" ? value.distanceKmPerOccurrence : ""} inputMode="decimal" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="catalog-travel-minutes">Tempo manuale/occ.</FieldLabel>
                    <Input id="catalog-travel-minutes" name="travelMinutes" defaultValue={value?.kind === "travel" && value.travelMinutesPerOccurrence !== undefined ? hours(value.travelMinutesPerOccurrence) : ""} placeholder="es. 45m" onChange={() => setDurationError(undefined)} />
                    {durationError ? <FieldDescription className="text-destructive">{durationError}</FieldDescription> : null}
                  </Field>
                </div>
                <Field orientation="horizontal">
                  <Checkbox id="catalog-roundtrip" name="roundTrip" defaultChecked={value?.kind === "travel" ? value.roundTrip : true} />
                  <FieldLabel htmlFor="catalog-roundtrip">Andata e ritorno</FieldLabel>
                </Field>
              </>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            {onDelete ? <Button type="button" variant="destructive" className="mr-auto" onClick={onDelete}>Elimina</Button> : null}
            <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
            <Button type="submit">{value ? "Aggiorna" : kind === "time" ? "Aggiungi attività" : "Aggiungi"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ReusablePickerDialog({
  items,
  onClose,
  onSelect,
}: {
  items: ReusableSubItem[]
  onClose: () => void
  onSelect: (item: ReusableSubItem) => void
}) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "")
  const selected = items.find((item) => item.id === selectedId)
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Aggiungi contenuto riutilizzabile</DialogTitle>
          <DialogDescription>Nel template verrà inserita una copia indipendente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${selectedId === item.id ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}
              onClick={() => setSelectedId(item.id)}
            >
              <span><span className="block font-medium">{item.description}</span><span className="text-xs text-muted-foreground">{kindLabel(item.kind)}</span></span>
              <span className="text-sm text-muted-foreground">{reusableDetail(item)}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={!selected} onClick={() => { if (selected) onSelect(selected) }}>Aggiungi copia</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function optionEffect(option: VariantOption): string {
  if (!option.subItems.length) return "Nessun contributo"
  if (option.subItems.length === 1) return definitionDetail(option.subItems[0]!)
  const time = option.subItems.filter((item) => item.kind === "time").reduce((sum, item) => sum + item.minutes, 0)
  return time > 0 ? `${option.subItems.length} elementi · ${hours(time)}` : `${option.subItems.length} elementi`
}

function definitionDetail(item: SubItemDefinition): string {
  if (item.kind === "time") return hours(item.minutes)
  if (item.kind === "expense") return eur(item.amount)
  return `${item.occurrences} ${item.occurrences === 1 ? "occorrenza" : "occorrenze"}`
}

function reusableDetail(item: ReusableSubItem): string {
  if (item.kind === "time") return hours(item.minutes)
  if (item.kind === "expense") return eur(item.amount)
  return `${item.roundTrip ? "A/R" : "Solo andata"} · ${item.occurrences} ${item.occurrences === 1 ? "occorrenza" : "occorrenze"}`
}

function kindLabel(kind: Kind): string {
  return kind === "time" ? "Attività" : kind === "expense" ? "Spesa" : "Trasferta"
}

function RowMenu({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${label}`} />}><MoreHorizontal /></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>Apri e modifica</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>Elimina</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Empty({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-lg border border-dashed text-center">
      <div>
        <BookOpen className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <Button className="mt-4" size="sm" onClick={onAction}><Plus />{actionLabel}</Button>
      </div>
    </div>
  )
}
