import { MoreHorizontal } from "lucide-react"
import { useState, type FormEvent } from "react"
import { meta, type CashDocument } from "../../domain/model"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { decimalInputValue, eur, formReader } from "@/lib/format"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

const promptRequired = (message: string, initial = ""): string | undefined => window.prompt(message, initial)?.trim() || undefined

export function CatalogView({ doc, appState, requestDelete }: { doc: CashDocument; appState: AppState; requestDelete: (target: DeleteTarget) => void }) {
  const [kind, setKind] = useState<"time" | "expense" | "travel">("time")
  const [timeMode, setTimeMode] = useState<"automatic" | "manual">("automatic")

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { data, get } = formReader(event.currentTarget)
    appState.mutate((document) => {
      if (kind === "time") document.catalog.subItems.push({ ...meta(), kind: "time", description: get("description"), minutes: Number(get("value")) })
      else if (kind === "expense") document.catalog.subItems.push({ ...meta(), kind: "expense", description: get("description"), amount: Number(decimalInputValue(get("value"))).toFixed(2) })
      else document.catalog.subItems.push({ ...meta(), kind: "travel", description: get("description"), roundTrip: data.get("roundTrip") === "on", occurrences: Number(get("occurrences")), timeMode, ...(timeMode === "manual" ? { manualMinutesPerOccurrence: Number(get("value")) } : {}) })
    })
    event.currentTarget.reset(); setKind("time"); setTimeMode("automatic")
  }

  const editReusable = (id: string) => {
    const reusable = doc.catalog.subItems.find((candidate) => candidate.id === id)
    if (!reusable) return
    const description = promptRequired("Descrizione", reusable.description)
    if (!description) return
    if (reusable.kind === "time") {
      const minutes = promptRequired("Minuti interi positivi", String(reusable.minutes)); if (!minutes) return
      appState.mutate((document) => Object.assign(document.catalog.subItems.find((candidate) => candidate.id === id)!, { description, minutes: Number(minutes), updatedAt: new Date().toISOString() }))
    } else if (reusable.kind === "expense") {
      const amount = promptRequired("Importo (€)", reusable.amount); if (!amount) return
      appState.mutate((document) => Object.assign(document.catalog.subItems.find((candidate) => candidate.id === id)!, { description, amount: Number(decimalInputValue(amount)).toFixed(2), updatedAt: new Date().toISOString() }))
    } else {
      const occurrences = promptRequired("Occorrenze", String(reusable.occurrences))
      const mode = promptRequired("Modalità: automatic o manual", reusable.timeMode)
      const manual = mode === "manual" ? promptRequired("Minuti manuali per occorrenza", String(reusable.manualMinutesPerOccurrence ?? 30)) : undefined
      if (!occurrences || !mode || (mode !== "automatic" && mode !== "manual") || (mode === "manual" && !manual)) return
      appState.mutate((document) => { const target = document.catalog.subItems.find((candidate) => candidate.id === id); if (target?.kind === "travel") Object.assign(target, { description, occurrences: Number(occurrences), timeMode: mode, manualMinutesPerOccurrence: mode === "manual" ? Number(manual) : undefined, updatedAt: new Date().toISOString() }) })
    }
  }

  const editTemplate = (id: string) => {
    const template = doc.catalog.templates.find((candidate) => candidate.id === id)
    if (!template) return
    const draft = structuredClone(template)
    const templateName = promptRequired("Nome template", draft.name); if (!templateName) return
    draft.name = templateName
    const itemRaw = window.prompt(`Voce da modificare (numero; vuoto modifica solo il nome template):\n${draft.items.map((item, index) => `${index + 1}. ${item.name}`).join("\n")}`, "")
    if (itemRaw === null) return
    const item = itemRaw.trim() ? draft.items[Number(itemRaw) - 1] : undefined
    if (itemRaw.trim() && !item) return
    if (item) {
      const itemName = promptRequired("Nome voce", item.name); if (!itemName) return
      item.name = itemName
      const subRaw = window.prompt(`Sottovoce base da modificare (numero; vuoto nessuna):\n${item.subItems.map((sub, index) => `${index + 1}. ${sub.description}`).join("\n")}`, "")
      if (subRaw === null) return
      const sub = subRaw.trim() ? item.subItems[Number(subRaw) - 1] : undefined
      if (sub) {
        const description = promptRequired("Descrizione sottovoce", sub.description); if (!description) return
        sub.description = description
        if (sub.kind === "time") { const minutes = promptRequired("Minuti", String(sub.minutes)); if (!minutes) return; sub.minutes = Number(minutes) }
        else if (sub.kind === "expense") { const amount = promptRequired("Importo", sub.amount); if (!amount) return; sub.amount = Number(amount).toFixed(2) }
      }
    }
    if (!window.confirm("Salvare esplicitamente le modifiche a questo template?")) return
    draft.updatedAt = new Date().toISOString()
    appState.mutate((document) => { const index = document.catalog.templates.findIndex((candidate) => candidate.id === id); document.catalog.templates[index] = draft })
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-4"><CardHeader><CardTitle>Nuova sottovoce</CardTitle><CardDescription>Contenuto riutilizzabile nei preventivi.</CardDescription></CardHeader><CardContent><form onSubmit={add}><FieldGroup>
        <Field><FieldLabel htmlFor="catalog-kind">Tipo</FieldLabel><NativeSelect className="w-full" id="catalog-kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><NativeSelectOption value="time">Tempo</NativeSelectOption><NativeSelectOption value="expense">Spesa</NativeSelectOption><NativeSelectOption value="travel">Trasferta</NativeSelectOption></NativeSelect></Field>
        <Field><FieldLabel htmlFor="catalog-description">Descrizione</FieldLabel><Input id="catalog-description" name="description" placeholder="Descrivi l’attività" required /></Field>
        {(kind !== "travel" || timeMode === "manual") ? <Field><FieldLabel htmlFor="catalog-value">{kind === "expense" ? "Importo" : kind === "travel" ? "Durata manuale" : "Durata"}</FieldLabel><InputGroup><InputGroupInput id="catalog-value" name="value" defaultValue={kind === "expense" ? "0.00" : "30"} inputMode="decimal" required /><InputGroupAddon align="inline-end"><InputGroupText>{kind === "expense" ? "€" : "min"}</InputGroupText></InputGroupAddon></InputGroup></Field> : <input type="hidden" name="value" value="30" />}
        {kind === "travel" ? <><Field><FieldLabel htmlFor="catalog-occurrences">Occorrenze</FieldLabel><InputGroup><InputGroupInput id="catalog-occurrences" name="occurrences" type="number" defaultValue="1" min={1} step={1} required /><InputGroupAddon align="inline-end"><InputGroupText>volte</InputGroupText></InputGroupAddon></InputGroup></Field><Field><FieldLabel htmlFor="catalog-time-mode">Calcolo del tempo</FieldLabel><NativeSelect className="w-full" id="catalog-time-mode" name="timeMode" value={timeMode} onChange={(event) => setTimeMode(event.target.value as typeof timeMode)}><NativeSelectOption value="automatic">Automatico dalla distanza</NativeSelectOption><NativeSelectOption value="manual">Manuale · usa la durata indicata</NativeSelectOption></NativeSelect></Field><Field orientation="horizontal"><Checkbox id="catalog-round-trip" name="roundTrip" defaultChecked /><FieldLabel htmlFor="catalog-round-trip">Andata e ritorno</FieldLabel></Field></> : null}
        <Button type="submit">Aggiungi al catalogo</Button>
      </FieldGroup></form></CardContent></Card>
      <Card className="col-span-8"><CardHeader><CardTitle>Sottovoci riutilizzabili</CardTitle><CardDescription>Libreria di contenuti indipendenti.</CardDescription><CardAction><Badge variant="secondary">{doc.catalog.subItems.length} elementi</Badge></CardAction></CardHeader><CardContent>{doc.catalog.subItems.length ? <Table><TableHeader><TableRow><TableHead>Descrizione</TableHead><TableHead>Dettagli</TableHead><TableHead className="w-16 text-right">Azioni</TableHead></TableRow></TableHeader><TableBody>{doc.catalog.subItems.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.description}</TableCell><TableCell className="text-muted-foreground">{item.kind === "time" ? `${item.minutes} min` : item.kind === "expense" ? eur(item.amount) : `Trasferta ${item.roundTrip ? "A/R" : "solo andata"} · ${item.occurrences} occorrenze · ${item.timeMode === "automatic" ? "tempo automatico" : "tempo manuale"}`}</TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${item.description}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => editReusable(item.id)}>Modifica</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "catalog", id: item.id, label: item.description })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <p className="py-8 text-center text-sm text-muted-foreground">Nessun elemento.</p>}</CardContent></Card>
      <Card className="col-span-12"><CardHeader><CardTitle>Template</CardTitle><CardDescription>Strutture complete riutilizzabili come copie indipendenti.</CardDescription><CardAction><Badge variant="secondary">{doc.catalog.templates.length} template</Badge></CardAction></CardHeader><CardContent>{doc.catalog.templates.length ? <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Contenuto</TableHead><TableHead className="w-16 text-right">Azioni</TableHead></TableRow></TableHeader><TableBody>{doc.catalog.templates.map((template) => <TableRow key={template.id}><TableCell className="font-medium">{template.name}</TableCell><TableCell className="text-muted-foreground">{template.items.length} voci · copia indipendente</TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${template.name}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => editTemplate(template.id)}>Apri e modifica</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "template", id: template.id, label: template.name })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <p className="py-8 text-center text-sm text-muted-foreground">Nessun template. Salva una o più voci da un preventivo per crearne uno.</p>}</CardContent></Card>
    </div>
  )
}
