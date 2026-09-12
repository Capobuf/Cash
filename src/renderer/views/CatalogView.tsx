import { useState, type FormEvent } from "react"
import { meta, type CashDocument } from "../../domain/model"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckboxField, Field, Option, SelectField, SuffixField } from "@/components/FormControls"
import { decimalInputValue, eur, formReader } from "@/lib/format"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

const promptRequired = (message: string, initial = ""): string | undefined => window.prompt(message, initial)?.trim() || undefined

export function CatalogView({ doc, appState, requestDelete }: {
  doc: CashDocument
  appState: AppState
  requestDelete: (target: DeleteTarget) => void
}) {
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
      appState.mutate((document) => {
        const target = document.catalog.subItems.find((candidate) => candidate.id === id)
        if (target?.kind === "travel") Object.assign(target, { description, occurrences: Number(occurrences), timeMode: mode, manualMinutesPerOccurrence: mode === "manual" ? Number(manual) : undefined, updatedAt: new Date().toISOString() })
      })
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
    <div className="app-grid">
      <Card className="card"><CardHeader><span className="eyebrow">Contenuto riutilizzabile</span><CardTitle>Nuova sottovoce</CardTitle></CardHeader><CardContent>
        <form className="form-grid" onSubmit={add}>
          <SelectField label="Tipo" name="kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><Option value="time">Tempo</Option><Option value="expense">Spesa</Option><Option value="travel">Trasferta</Option></SelectField>
          <Field label="Descrizione" name="description" placeholder="Descrivi l’attività" required />
          {(kind !== "travel" || timeMode === "manual") ? <SuffixField label={kind === "expense" ? "Importo" : kind === "travel" ? "Durata manuale" : "Durata"} name="value" value={kind === "expense" ? "0.00" : "30"} suffix={kind === "expense" ? "€" : "min"} type="text" inputMode="decimal" required /> : <input type="hidden" name="value" value="30" />}
          {kind === "travel" ? <><SuffixField label="Occorrenze" name="occurrences" value="1" suffix="volte" min={1} step={1} required /><SelectField label="Calcolo del tempo" name="timeMode" value={timeMode} onChange={(event) => setTimeMode(event.target.value as typeof timeMode)}><Option value="automatic">Automatico dalla distanza</Option><Option value="manual">Manuale · usa la durata indicata</Option></SelectField><CheckboxField name="roundTrip" checked>Andata e ritorno</CheckboxField></> : null}
          <Button type="submit" className="full">Aggiungi al catalogo</Button>
        </form>
      </CardContent></Card>
      <Card className="card wide"><CardHeader className="section-heading"><div><span className="eyebrow">Libreria</span><CardTitle>Sottovoci riutilizzabili</CardTitle></div><Badge variant="secondary">{doc.catalog.subItems.length} elementi</Badge></CardHeader><CardContent>
        {doc.catalog.subItems.length ? <div className="list">{doc.catalog.subItems.map((item) => <div className="row" key={item.id}><div className="row-main"><div className="row-title">{item.description}</div><div className="row-detail">{item.kind === "time" ? `${item.minutes} min` : item.kind === "expense" ? eur(item.amount) : `Trasferta ${item.roundTrip ? "A/R" : "solo andata"} · ${item.occurrences} occorrenze · ${item.timeMode === "automatic" ? "tempo automatico" : "tempo manuale"}`}</div></div><div className="row-actions"><Button variant="secondary" size="sm" onClick={() => editReusable(item.id)}>Modifica</Button><Button variant="destructive" size="sm" onClick={() => requestDelete({ kind: "catalog", id: item.id, label: item.description })}>Elimina</Button></div></div>)}</div> : <div className="empty">Nessun elemento</div>}
      </CardContent></Card>
      <Card className="card full"><CardHeader className="section-heading"><div><span className="eyebrow">Strutture complete</span><CardTitle>Template</CardTitle></div><Badge variant="secondary">{doc.catalog.templates.length} template</Badge></CardHeader><CardContent>
        {doc.catalog.templates.length ? <div className="list">{doc.catalog.templates.map((template) => <div className="row" key={template.id}><div><div className="row-title">{template.name}</div><div className="row-detail">{template.items.length} voci · copia indipendente</div></div><div className="row-actions"><Button variant="secondary" size="sm" onClick={() => editTemplate(template.id)}>Apri e modifica</Button><Button variant="destructive" size="sm" onClick={() => requestDelete({ kind: "template", id: template.id, label: template.name })}>Elimina</Button></div></div>)}</div> : <div className="empty"><strong>Nessun template</strong><span>Salva una o più voci da un preventivo per creare un modello riutilizzabile.</span></div>}
      </CardContent></Card>
    </div>
  )
}
