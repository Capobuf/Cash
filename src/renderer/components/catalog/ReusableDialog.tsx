import { useState, type FormEvent } from "react"
import { parseDuration } from "../../../domain/duration"
import { meta, type ReusableSubItem } from "../../../domain/model"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { eur, formReader, hours, moneyInputValue } from "@/lib/format"

export type Kind = ReusableSubItem["kind"]

export function ReusableDialog({
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

export function ReusablePickerDialog({
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

export function reusableDetail(item: ReusableSubItem): string {
  if (item.kind === "time") return hours(item.minutes)
  if (item.kind === "expense") return eur(item.amount)
  return `${item.roundTrip ? "A/R" : "Solo andata"} · ${item.occurrences} ${item.occurrences === 1 ? "occorrenza" : "occorrenze"}`
}

export function kindLabel(kind: Kind): string {
  return kind === "time" ? "Attività" : kind === "expense" ? "Spesa" : "Trasferta"
}
