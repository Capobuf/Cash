import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock3,
  Layers3,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
  Save,
  Trash2,
  Upload,
} from "lucide-react"
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react"
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
import { cashDocumentSchema, validationErrorFromIssues } from "../../domain/schema"
import { findTemplatePackConflicts, materializeTemplatePack, parseTemplatePack, type TemplatePack } from "../../domain/template-pack"
import { validateVariantGroups } from "../../domain/variants"
import { DefinitionDialog } from "@/components/QuoteDialogs"
import { WorkItemRow } from "@/components/WorkItemRow"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
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
type VariantFilter = "all" | "with" | "without"
type ContentFilter = "all" | Kind
type TemplateSort = "name-asc" | "name-desc" | "recent"
type BaseEditor = { itemIndex: number; subIndex?: number; initialKind?: Kind }
type DefinitionEditor = {
  itemIndex: number
  groupIndex: number
  optionIndex: number
  definitionIndex?: number
  initialKind?: SubItemDefinition["kind"]
}
type TemplateImportPreview = {
  fileName: string
  pack: TemplatePack
  conflicts: Set<number>
  importAnyway: Record<number, boolean>
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
  const [importPreview, setImportPreview] = useState<TemplateImportPreview>()
  const [templateQuery, setTemplateQuery] = useState("")
  const [variantFilter, setVariantFilter] = useState<VariantFilter>("all")
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all")
  const [templateSort, setTemplateSort] = useState<TemplateSort>("name-asc")
  const [reusableQuery, setReusableQuery] = useState("")
  const [reusableKind, setReusableKind] = useState<ContentFilter>("all")
  const importInputRef = useRef<HTMLInputElement>(null)
  const reusable = editingReusableId ? doc.catalog.subItems.find((entry) => entry.id === editingReusableId) : undefined
  const template = editingTemplateId ? doc.catalog.templates.find((entry) => entry.id === editingTemplateId) : undefined
  const filteredTemplates = useMemo(() => {
    const query = normalizeSearch(templateQuery)
    return doc.catalog.templates
      .filter((entry) => !query || templateSearchText(entry).includes(query))
      .filter((entry) => {
        const hasVariants = entry.items.some((item) => item.variantGroups.length > 0)
        return variantFilter === "all" || (variantFilter === "with" ? hasVariants : !hasVariants)
      })
      .filter((entry) => contentFilter === "all" || templateHasKind(entry, contentFilter))
      .toSorted((left, right) => {
        if (templateSort === "recent") return right.updatedAt.localeCompare(left.updatedAt)
        const comparison = left.name.localeCompare(right.name, "it", { sensitivity: "base" })
        return templateSort === "name-desc" ? -comparison : comparison
      })
  }, [contentFilter, doc.catalog.templates, templateQuery, templateSort, variantFilter])
  const filteredReusable = useMemo(() => {
    const query = normalizeSearch(reusableQuery)
    return doc.catalog.subItems.filter((item) => (
      (!query || normalizeSearch(item.description).includes(query))
      && (reusableKind === "all" || item.kind === reusableKind)
    ))
  }, [doc.catalog.subItems, reusableKind, reusableQuery])
  const templateResultsFiltered = Boolean(templateQuery.trim())
    || variantFilter !== "all"
    || contentFilter !== "all"

  const resetTemplateFilters = () => {
    setTemplateQuery("")
    setVariantFilter("all")
    setContentFilter("all")
    setTemplateSort("name-asc")
  }

  const readImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (!file.name.toLocaleLowerCase("it").endsWith(".json")) {
      appState.setError({ code: "VALIDATION", field: "file", message: "Seleziona un singolo file JSON.", action: "Scegli un file con estensione .json. Nessun template è stato importato." })
      return
    }
    let input: unknown
    try {
      input = JSON.parse(await file.text())
    } catch (error) {
      appState.setError({
        code: "VALIDATION",
        field: "file",
        message: "Il file selezionato non contiene JSON valido.",
        action: "Correggi il file e selezionalo nuovamente. Nessun template è stato importato.",
        details: [error instanceof Error ? error.message : "Errore di lettura o sintassi JSON."],
      })
      return
    }
    const parsed = parseTemplatePack(input)
    if (!parsed.ok) { appState.setError(parsed.error); return }
    const conflicts = new Set(findTemplatePackConflicts(parsed.value, doc.catalog.templates).map((conflict) => conflict.templateIndex))
    appState.clearError()
    setImportPreview({ fileName: file.name, pack: parsed.value, conflicts, importAnyway: {} })
  }

  const confirmImport = () => {
    if (!importPreview) return
    const currentConflicts = new Set(findTemplatePackConflicts(importPreview.pack, doc.catalog.templates).map((conflict) => conflict.templateIndex))
    const selectedIndexes = importPreview.pack.templates
      .map((_, index) => index)
      .filter((index) => !currentConflicts.has(index) || importPreview.importAnyway[index])
    if (!selectedIndexes.length) { setImportPreview(undefined); return }
    const templates = materializeTemplatePack(importPreview.pack, selectedIndexes)
    const candidate = structuredClone(doc)
    candidate.catalog.templates.push(...templates)
    const validation = cashDocumentSchema.safeParse(candidate)
    if (!validation.success) { appState.setError(validationErrorFromIssues(validation.error.issues)); return }
    appState.mutate((document) => { document.catalog.templates.push(...templates) })
    setImportPreview(undefined)
  }

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
          <TabsTrigger value="subitems"><Layers3 />Elementi singoli</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Template</CardTitle>
              <CardDescription>Prepara le basi che userai più spesso nei preventivi.</CardDescription>
              <CardAction>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => importInputRef.current?.click()}><Upload />Importa</Button>
                  <Button onClick={() => setEditingTemplateId(null)}><Plus />Nuovo template</Button>
                </div>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              {doc.catalog.templates.length ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="search"
                      value={templateQuery}
                      onChange={(event) => setTemplateQuery(event.target.value)}
                      placeholder="Cerca template..."
                      aria-label="Cerca template"
                      className="min-w-64 flex-1 sm:max-w-md"
                    />
                    <NativeSelect
                      aria-label="Filtra per varianti"
                      value={variantFilter}
                      onChange={(event) => setVariantFilter(event.target.value as VariantFilter)}
                    >
                      <NativeSelectOption value="all">Varianti: Tutti</NativeSelectOption>
                      <NativeSelectOption value="with">Con varianti</NativeSelectOption>
                      <NativeSelectOption value="without">Senza varianti</NativeSelectOption>
                    </NativeSelect>
                    <NativeSelect
                      aria-label="Filtra per contenuto"
                      value={contentFilter}
                      onChange={(event) => setContentFilter(event.target.value as ContentFilter)}
                    >
                      <NativeSelectOption value="all">Contenuto: Tutti</NativeSelectOption>
                      <NativeSelectOption value="time">Attività</NativeSelectOption>
                      <NativeSelectOption value="expense">Spese</NativeSelectOption>
                      <NativeSelectOption value="travel">Trasferte</NativeSelectOption>
                    </NativeSelect>
                    <NativeSelect
                      aria-label="Ordina template"
                      value={templateSort}
                      onChange={(event) => setTemplateSort(event.target.value as TemplateSort)}
                    >
                      <NativeSelectOption value="name-asc">Ordina: Nome A–Z</NativeSelectOption>
                      <NativeSelectOption value="name-desc">Nome Z–A</NativeSelectOption>
                      <NativeSelectOption value="recent">Modificati di recente</NativeSelectOption>
                    </NativeSelect>
                  </div>
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {templateResultsFiltered ? `${filteredTemplates.length} di ${doc.catalog.templates.length}` : doc.catalog.templates.length} template
                  </p>
                  {filteredTemplates.length ? (
                    <div className="divide-y rounded-lg border">
                      {filteredTemplates.map((entry) => (
                        <TemplateListRow
                          key={entry.id}
                          template={entry}
                          onEdit={() => setEditingTemplateId(entry.id)}
                          onDelete={() => requestDelete({ kind: "template", id: entry.id, label: entry.name })}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="grid min-h-48 place-items-center rounded-lg border border-dashed px-4 text-center">
                      <div>
                        <p className="font-medium">Nessun template corrisponde alla ricerca o ai filtri.</p>
                        <p className="mt-1 text-sm text-muted-foreground">Prova a cambiare i criteri oppure riparti dall’elenco completo.</p>
                        <Button className="mt-4" size="sm" variant="outline" onClick={resetTemplateFilters}>Reimposta filtri</Button>
                      </div>
                    </div>
                  )}
                </>
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
              <CardTitle>Elementi singoli</CardTitle>
              <CardDescription>Attività, spese e trasferte salvati per riutilizzarli.</CardDescription>
              <CardAction><Button variant="outline" onClick={() => setEditingReusableId(null)}><Plus />Nuovo elemento</Button></CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              {doc.catalog.subItems.length ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="search"
                      value={reusableQuery}
                      onChange={(event) => setReusableQuery(event.target.value)}
                      placeholder="Cerca elementi..."
                      aria-label="Cerca elementi singoli"
                      className="min-w-64 flex-1 sm:max-w-md"
                    />
                    <NativeSelect
                      aria-label="Filtra elementi per tipo"
                      value={reusableKind}
                      onChange={(event) => setReusableKind(event.target.value as ContentFilter)}
                    >
                      <NativeSelectOption value="all">Tutti i tipi</NativeSelectOption>
                      <NativeSelectOption value="time">Attività</NativeSelectOption>
                      <NativeSelectOption value="expense">Spese</NativeSelectOption>
                      <NativeSelectOption value="travel">Trasferte</NativeSelectOption>
                    </NativeSelect>
                  </div>
                  {filteredReusable.length ? (
                    <div className="space-y-2">
                      {filteredReusable.map((item) => (
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
                    <div className="rounded-lg border border-dashed px-4 py-10 text-center">
                      <p className="font-medium">Nessun elemento corrisponde alla ricerca o al filtro.</p>
                      <Button className="mt-3" size="sm" variant="outline" onClick={() => { setReusableQuery(""); setReusableKind("all") }}>Reimposta filtri</Button>
                    </div>
                  )}
                </>
              ) : (
                <Empty
                  title="Nessun elemento singolo"
                  description="Puoi crearne uno qui o salvarlo da un preventivo."
                  actionLabel="Nuovo elemento"
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

      <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => { void readImportFile(event) }} />

      {importPreview ? (
        <TemplateImportDialog
          preview={importPreview}
          onChange={(templateIndex, importAnyway) => setImportPreview((current) => current ? {
            ...current,
            importAnyway: { ...current.importAnyway, [templateIndex]: importAnyway },
          } : current)}
          onClose={() => setImportPreview(undefined)}
          onImport={confirmImport}
        />
      ) : null}
    </>
  )
}

function TemplateListRow({
  template,
  onEdit,
  onDelete,
}: {
  template: Template
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const includedCount = template.items.reduce((sum, item) => sum + item.subItems.length, 0)
  const variantCount = template.items.reduce((sum, item) => sum + item.variantGroups.length, 0)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-stretch transition-colors hover:bg-muted/30">
        <CollapsibleTrigger
          className="grid min-w-0 flex-1 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:grid-cols-[auto_minmax(12rem,1fr)_6rem_8rem_7rem]"
          aria-label={`${open ? "Chiudi" : "Espandi"} anteprima di ${template.name}`}
        >
          <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
          <span className="min-w-0 truncate font-medium">{template.name}</span>
          <span className="col-start-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground lg:hidden">
            <span>{template.items.length} {template.items.length === 1 ? "voce" : "voci"}</span>
            <span>{includedCount} {includedCount === 1 ? "incluso" : "inclusi"}</span>
            <span>{variantCount} {variantCount === 1 ? "variante" : "varianti"}</span>
          </span>
          <span className="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground lg:block">
            {template.items.length} {template.items.length === 1 ? "voce" : "voci"}
          </span>
          <span className="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground lg:block">
            {includedCount} {includedCount === 1 ? "incluso" : "inclusi"}
          </span>
          <span className="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground lg:block">
            {variantCount} {variantCount === 1 ? "variante" : "varianti"}
          </span>
        </CollapsibleTrigger>
        <div className="flex items-center gap-1 px-2">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Apri e modifica ${template.name}`}
            title="Apri e modifica"
            onClick={onEdit}
          >
            <Pencil />
          </Button>
          <RowMenu label={template.name} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      <CollapsibleContent>
        <div className="border-t bg-muted/20 px-4 py-4 sm:px-10">
          <div className="space-y-5">
            {template.items.map((item) => (
              <section key={item.id} className="space-y-3 border-border/70 [&+section]:border-t [&+section]:pt-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="font-medium">{item.name}</h3>
                  {item.referencePrice ? (
                    <p className="text-xs text-muted-foreground">
                      Prezzo di riferimento: <span className="font-medium text-foreground">{eur(item.referencePrice.amount)}</span> · {formatReferencePeriod(item.referencePrice.period)}
                    </p>
                  ) : null}
                </div>

                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sempre inclusi</h4>
                  {item.subItems.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {item.subItems.map((subItem) => <PreviewSubItem key={subItem.id} item={subItem} />)}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted-foreground">Nessun elemento sempre incluso.</p>
                  )}
                </div>

                {item.variantGroups.length ? (
                  <div>
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Varianti</h4>
                    <div className="mt-2 space-y-3">
                      {item.variantGroups.map((group) => (
                        <div key={group.id} className="border-l-2 border-border pl-3">
                          <p className="text-sm font-medium">{group.name}</p>
                          <div className="mt-1.5 space-y-2">
                            {group.options.map((option) => (
                              <div key={option.id}>
                                <p className="text-sm">
                                  {option.name}
                                  {group.defaultOptionId === option.id ? <Badge variant="outline" className="ml-2">Predefinita</Badge> : null}
                                </p>
                                {option.subItems.length ? (
                                  <ul className="mt-1 space-y-1 pl-4">
                                    {option.subItems.map((subItem, index) => <PreviewSubItem key={`${option.id}-${index}`} item={subItem} />)}
                                  </ul>
                                ) : (
                                  <p className="mt-0.5 pl-4 text-xs text-muted-foreground">Nessun contenuto aggiuntivo.</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
          <Button className="mt-5" size="sm" variant="outline" onClick={onEdit}>Apri e modifica</Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function PreviewSubItem({ item }: { item: ReusableSubItem | SubItemDefinition }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <Badge variant="outline">{kindLabel(item.kind)}</Badge>
      <span>{item.description}</span>
      <span className="text-xs text-muted-foreground">· {previewSubItemDetail(item)}</span>
    </li>
  )
}

function TemplateImportDialog({
  preview,
  onChange,
  onClose,
  onImport,
}: {
  preview: TemplateImportPreview
  onChange: (templateIndex: number, importAnyway: boolean) => void
  onClose: () => void
  onImport: () => void
}) {
  const selectedCount = preview.pack.templates.filter((_, index) => !preview.conflicts.has(index) || preview.importAnyway[index]).length
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importa Template</DialogTitle>
          <DialogDescription>
            {preview.fileName} · {preview.pack.templates.length} template
            {preview.conflicts.size ? ` · ${preview.conflicts.size} ${preview.conflicts.size === 1 ? "conflitto" : "conflitti"}` : " · nessun conflitto"}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {preview.pack.templates.map((template, templateIndex) => {
            const conflict = preview.conflicts.has(templateIndex)
            return (
              <div key={`${template.name}-${templateIndex}`} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">{template.items.length} {template.items.length === 1 ? "voce" : "voci"}</p>
                </div>
                {conflict ? <Badge variant="outline">Conflitto</Badge> : <Badge variant="secondary">Nuovo</Badge>}
                {conflict ? (
                  <NativeSelect
                    size="sm"
                    aria-label={`Scelta per il conflitto ${template.name}`}
                    value={preview.importAnyway[templateIndex] ? "import" : "skip"}
                    onChange={(event) => onChange(templateIndex, event.target.value === "import")}
                  >
                    <NativeSelectOption value="skip">Salta</NativeSelectOption>
                    <NativeSelectOption value="import">Importa comunque</NativeSelectOption>
                  </NativeSelect>
                ) : null}
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={onImport}>{selectedCount ? `Importa ${selectedCount}` : "Chiudi senza importare"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [initialDraft] = useState<Template>(() => source
    ? structuredClone(source)
    : { ...meta(), name: "", items: [{ ...meta(), name: "", subItems: [], variantGroups: [] }] })
  const [draft, setDraft] = useState<Template>(() => structuredClone(initialDraft))
  const [baseEditor, setBaseEditor] = useState<BaseEditor>()
  const [definitionEditor, setDefinitionEditor] = useState<DefinitionEditor>()
  const [pickerItemIndex, setPickerItemIndex] = useState<number>()
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft)

  const close = () => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

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
        <Button variant="ghost" size="sm" onClick={close}><ArrowLeft />Catalogo</Button>
        <div className="h-6 w-px bg-border" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Template</p>
          <p className="truncate font-medium">{draft.name.trim() || "Senza nome"}</p>
        </div>
        <Button variant="outline" onClick={close}>Annulla</Button>
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
          <FieldDescription>Nome con cui lo troverai nel Catalogo.</FieldDescription>
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

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scartare le modifiche al template?</AlertDialogTitle>
            <AlertDialogDescription>Le modifiche non salvate andranno perse.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua a modificare</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClose}>Scarta modifiche</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        <div className="min-w-0 space-y-3 pr-10">
          <p className="text-sm font-semibold">Voce {itemIndex + 1}</p>
          <Field className="max-w-xl">
            <FieldLabel htmlFor={`template-item-${item.id}`}>Nome nel preventivo</FieldLabel>
            <Input
              id={`template-item-${item.id}`}
              value={item.name}
              onChange={(event) => onRename(event.target.value)}
              placeholder="es. Configurazione server"
              className="h-9 font-medium"
            />
          </Field>
        </div>
        <CardAction>
          <Button size="icon-sm" variant="ghost" disabled={!canDelete} aria-label={`Elimina voce ${itemIndex + 1}`} onClick={onDelete}>
            <Trash2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Sempre incluso</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Attività e costi presenti indipendentemente dalle varianti.</p>
            </div>
            {item.subItems.length ? <AddContentMenu hasCatalog={hasReusableItems} onAdd={onAddSub} onAddCatalog={onAddReusable} /> : null}
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
            <div className="rounded-lg border border-dashed px-4 py-4 text-sm">
              <p className="font-medium">Nessun elemento sempre incluso.</p>
              <p className="mt-1 text-muted-foreground">Aggiungi un’attività, una spesa o una trasferta che fa sempre parte di questa voce.</p>
              <div className="mt-3"><AddContentMenu hasCatalog={hasReusableItems} onAdd={onAddSub} onAddCatalog={onAddReusable} /></div>
            </div>
          )}
        </section>

        <TemplateVariants item={item} onChange={onVariantsChange} onDefinition={onDefinition} />

        <Collapsible defaultOpen={Boolean(item.referencePrice)}>
          <CollapsibleTrigger render={<Button size="sm" variant="ghost" className="group" />}>
            <ChevronDown className="transition-transform group-data-panel-open:rotate-180" />
            Prezzo storico di riferimento
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
  const [focusGroupId, setFocusGroupId] = useState<string>()
  const update = (mutate: (groups: VariantGroup[]) => void) => {
    const groups = structuredClone(item.variantGroups)
    mutate(groups)
    onChange(groups)
  }
  const addGroup = () => update((groups) => {
    const option: VariantOption = { ...meta(), name: "", subItems: [] }
    const group: VariantGroup = { ...meta(), name: "", options: [option], defaultOptionId: option.id }
    groups.push(group)
    setExpandedOptionId(undefined)
    setFocusGroupId(group.id)
  })

  if (!item.variantGroups.length) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <div>
          <h3 className="text-sm font-medium">Varianti</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Usala quando una parte del lavoro può cambiare.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={addGroup}><Plus />Aggiungi variante</Button>
      </section>
    )
  }

  return (
    <section className="space-y-3 border-t pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Varianti</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Parti della voce che cambiano in base a una scelta.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={addGroup}><Plus />Aggiungi variante</Button>
      </div>

      {item.variantGroups.map((group, groupIndex) => (
        <div key={group.id} className="rounded-lg border-l-2 border-primary/30 bg-muted/20 px-4 py-3">
          <div className="flex items-end gap-2">
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor={`variant-name-${group.id}`}>Nome variante</FieldLabel>
              <Input
                id={`variant-name-${group.id}`}
                value={group.name}
                onChange={(event) => update((groups) => { groups[groupIndex]!.name = event.target.value })}
                placeholder="es. Gestione cliente"
                className="max-w-lg font-medium"
                autoFocus={focusGroupId === group.id}
                onFocus={() => setFocusGroupId(undefined)}
              />
            </Field>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Azioni per la variante ${group.name || groupIndex + 1}`} />}><MoreHorizontal /></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onClick={() => update((groups) => groups.splice(groupIndex, 1))}>Elimina variante</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Field className="mt-3 max-w-sm">
            <FieldLabel htmlFor={`variant-default-${group.id}`}>Opzione predefinita</FieldLabel>
            <NativeSelect
              id={`variant-default-${group.id}`}
              value={group.defaultOptionId ?? ""}
              onChange={(event) => update((groups) => {
                const current = groups[groupIndex]!
                current.defaultOptionId = event.target.value || undefined
              })}
            >
              <NativeSelectOption value="">Nessuna predefinita</NativeSelectOption>
              {group.options.map((option, optionIndex) => (
                <NativeSelectOption key={option.id} value={option.id}>{option.name.trim() || `Opzione ${optionIndex + 1}`}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <div className="mt-4 divide-y rounded-lg border bg-card">
            {group.options.map((option, optionIndex) => {
              const expanded = expandedOptionId === option.id
              return (
                <div key={option.id}>
                  <div className="flex min-h-12 items-center gap-2 px-2 py-1.5">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${expanded ? "Chiudi" : "Modifica"} ${option.name || `opzione ${optionIndex + 1}`}`}
                      aria-expanded={expanded}
                      onClick={() => setExpandedOptionId(expanded ? undefined : option.id)}
                    >
                      <ChevronRight className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
                    </Button>
                    {expanded ? (
                      <Input
                        value={option.name}
                        onChange={(event) => update((groups) => { groups[groupIndex]!.options[optionIndex]!.name = event.target.value })}
                        aria-label={`Nome opzione ${optionIndex + 1}`}
                        placeholder="es. Nessuna, Minima, Media"
                        className="h-8 min-w-0 flex-1 font-medium"
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                        onClick={() => setExpandedOptionId(option.id)}
                      >
                        {option.name.trim() || `Opzione ${optionIndex + 1}`}
                      </button>
                    )}
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{optionEffect(option)}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Azioni per ${option.name || `opzione ${optionIndex + 1}`}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={group.options.length === 1}
                          onClick={() => update((groups) => {
                            const current = groups[groupIndex]!
                            current.options.splice(optionIndex, 1)
                            if (current.defaultOptionId === option.id) current.defaultOptionId = undefined
                          })}
                        >
                          Elimina opzione
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {expanded ? (
                    <div className="space-y-3 border-t bg-muted/10 px-3 py-3 sm:pl-12">
                      <p className="text-sm font-medium">Cosa aggiunge questa opzione</p>
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
                        <p className="text-sm text-muted-foreground">Questa opzione non aggiunge attività, spese o trasferte.</p>
                      )}

                      <AddContentMenu onAdd={(kind) => onDefinition(groupIndex, optionIndex, undefined, kind)} />
                    </div>
                  ) : null}
                </div>
              )
            })}

          </div>

          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => {
              const option: VariantOption = { ...meta(), name: "", subItems: [] }
              update((groups) => { groups[groupIndex]!.options.push(option) })
              setExpandedOptionId(option.id)
            }}
          >
            <Plus />Aggiungi opzione
          </Button>
        </div>
      ))}
    </section>
  )
}

function AddContentMenu({
  onAdd,
  onAddCatalog,
  hasCatalog = false,
}: {
  onAdd: (kind: Kind) => void
  onAddCatalog?: () => void
  hasCatalog?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" />}><Plus />Aggiungi <ChevronDown /></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onAdd("time")}><Clock3 />Attività</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("expense")}><ReceiptText />Spesa</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("travel")}><MapPin />Trasferta</DropdownMenuItem>
        {onAddCatalog ? <DropdownMenuSeparator /> : null}
        {onAddCatalog ? <DropdownMenuItem disabled={!hasCatalog} onClick={onAddCatalog}><Layers3 />Dal catalogo</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
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

  const dialogTitle = title ?? (value ? `Modifica ${kindLabel(kind).toLocaleLowerCase("it")}` : "Nuovo elemento")
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
          <DialogTitle>Aggiungi dal catalogo</DialogTitle>
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

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("it")
}

function templateSearchText(template: Template): string {
  const values = [template.name]
  for (const item of template.items) {
    values.push(item.name, ...item.subItems.map((subItem) => subItem.description))
    for (const group of item.variantGroups) {
      values.push(group.name)
      for (const option of group.options) {
        values.push(option.name, ...option.subItems.map((subItem) => subItem.description))
      }
    }
  }
  return normalizeSearch(values.join(" "))
}

function templateHasKind(template: Template, kind: Kind): boolean {
  return template.items.some((item) => (
    item.subItems.some((subItem) => subItem.kind === kind)
    || item.variantGroups.some((group) => group.options.some((option) => option.subItems.some((subItem) => subItem.kind === kind)))
  ))
}

function formatReferencePeriod(period: string): string {
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(`${period}-01T00:00:00`))
}

function previewSubItemDetail(item: ReusableSubItem | SubItemDefinition): string {
  if (item.kind === "time") return hours(item.minutes)
  if (item.kind === "expense") return eur(item.amount)
  const details = [
    item.roundTrip ? "A/R" : "Solo andata",
    `${item.occurrences} ${item.occurrences === 1 ? "occorrenza" : "occorrenze"}`,
  ]
  if (item.distanceKmPerOccurrence !== undefined) details.push(`${item.distanceKmPerOccurrence} km/occorrenza`)
  if (item.travelMinutesPerOccurrence !== undefined) details.push(`${hours(item.travelMinutesPerOccurrence)}/occorrenza`)
  return details.join(" · ")
}

function optionEffect(option: VariantOption): string {
  if (!option.subItems.length) return "—"
  if (option.subItems.every((item) => item.kind === "time")) {
    return hours(option.subItems.reduce((sum, item) => sum + (item.kind === "time" ? item.minutes : 0), 0))
  }
  if (option.subItems.length === 1 && option.subItems[0]!.kind === "expense") return eur(option.subItems[0]!.amount)
  if (option.subItems.length === 1 && option.subItems[0]!.kind === "travel") return "Trasferta"
  return `${option.subItems.length} elementi`
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
