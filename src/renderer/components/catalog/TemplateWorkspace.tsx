import { ArrowLeft, Plus, Save } from "lucide-react"
import { useState } from "react"
import { cloneReusableSubItem } from "../../../domain/catalog"
import { meta, type ReusableSubItem, type SubItemDefinition, type Template } from "../../../domain/model"
import { validateVariantGroups } from "../../../domain/variants"
import { DefinitionDialog } from "@/components/quotes/DefinitionDialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { decimalInputValue } from "@/lib/format"
import type { AppState } from "../../state"
import { TemplateItemCard } from "./TemplateItemCard"
import { type Kind, ReusableDialog, ReusablePickerDialog } from "./ReusableDialog"

type BaseEditor = { itemIndex: number; subIndex?: number; initialKind?: Kind }

type DefinitionEditor = {
  itemIndex: number
  groupIndex: number
  optionIndex: number
  definitionIndex?: number
  initialKind?: SubItemDefinition["kind"]
}

export function TemplateWorkspace({
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
