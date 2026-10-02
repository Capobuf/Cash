import { BookOpen, Layers3, Plus, Upload } from "lucide-react"
import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { type CashDocument, type Template } from "../../domain/model"
import { cashDocumentSchema, validationErrorFromIssues } from "../../domain/schema"
import { findTemplatePackConflicts, materializeTemplatePack, parseTemplatePack } from "../../domain/template-pack"
import { WorkItemRow } from "@/components/WorkItemRow"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"
import { TemplateWorkspace } from "@/components/catalog/TemplateWorkspace"
import { type Kind, ReusableDialog, reusableDetail } from "@/components/catalog/ReusableDialog"
import { TemplateListRow, RowMenu } from "@/components/catalog/TemplateListRow"
import { type TemplateImportPreview, TemplateImportDialog } from "@/components/catalog/TemplateImportDialog"

type VariantFilter = "all" | "with" | "without"

type ContentFilter = "all" | Kind

type TemplateSort = "name-asc" | "name-desc" | "recent"

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
    if (!appState.mutate((document) => { document.catalog.templates.push(...templates) })) return
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
          if (!appState.mutate((document) => {
            if (template) {
              const index = document.catalog.templates.findIndex((entry) => entry.id === template.id)
              document.catalog.templates[index] = value
            } else {
              document.catalog.templates.push(value)
            }
          })) return
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
            if (!appState.mutate((document) => {
              if (reusable) {
                const index = document.catalog.subItems.findIndex((entry) => entry.id === reusable.id)
                document.catalog.subItems[index] = value
              } else {
                document.catalog.subItems.push(value)
              }
            })) return
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
