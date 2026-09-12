import { useState, type FormEvent } from "react"
import { createLocalClient, searchLocalClients, updateLocalClient } from "../../domain/clients"
import type { CashDocument } from "../../domain/model"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/FormControls"
import { formReader } from "@/lib/format"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

const promptRequired = (message: string, initial = ""): string | undefined => window.prompt(message, initial)?.trim() || undefined

export function ClientsView({ doc, appState, requestDelete }: {
  doc: CashDocument
  appState: AppState
  requestDelete: (target: DeleteTarget) => void
}) {
  const [query, setQuery] = useState("")
  const clients = query ? searchLocalClients(doc.localClients, query) : doc.localClients

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { get } = formReader(event.currentTarget)
    const created = createLocalClient(get("displayName"), get("vatNumber"))
    if (!created.ok) { appState.setError(created.error); return }
    appState.mutate((document) => document.localClients.push(created.value))
    event.currentTarget.reset()
  }

  const edit = (id: string) => {
    const client = doc.localClients.find((candidate) => candidate.id === id)
    if (!client) return
    const displayName = promptRequired("Denominazione", client.displayName)
    if (!displayName) return
    const vat = window.prompt("Partita IVA facoltativa", client.vatNumber ?? "") ?? undefined
    const updated = updateLocalClient(client, displayName, vat)
    if (!updated.ok) { appState.setError(updated.error); return }
    appState.mutate((document) => {
      const index = document.localClients.findIndex((candidate) => candidate.id === id)
      document.localClients[index] = updated.value
      for (const site of document.sites) {
        if (site.client?.source === "local" && site.client.localClientId === id) site.client.displayName = updated.value.displayName
      }
    })
  }

  return (
    <div className="app-grid">
      <Card className="card"><CardHeader><CardTitle>Nuovo Cliente locale</CardTitle></CardHeader><CardContent>
        <form className="form-grid" onSubmit={create}>
          <Field label="Denominazione" name="displayName" required />
          <Field label="Partita IVA (facoltativa)" name="vatNumber" />
          <Button type="submit" className="full">Crea cliente</Button>
        </form>
      </CardContent></Card>
      <Card className="card wide"><CardHeader><CardTitle>Anagrafica locale</CardTitle></CardHeader><CardContent>
        <form className="actions" onSubmit={(event) => { event.preventDefault(); setQuery(formReader(event.currentTarget).get("query")) }}>
          <Field label="Cerca per nome o P.IVA" name="query" value={query} />
          <Button type="submit">Cerca</Button>
          {query ? <Button type="button" variant="ghost" onClick={() => setQuery("")}>Tutti</Button> : null}
        </form>
        <div className="list section-list">
          {clients.length ? clients.map((client) => (
            <div className="row" key={client.id}><div><div className="row-title">{client.displayName}</div><div className="row-detail">{client.vatNumber ?? "P.IVA non indicata"}</div></div><div className="row-actions">
              <Button variant="secondary" size="sm" onClick={() => edit(client.id)}>Modifica</Button>
              <Button variant="destructive" size="sm" onClick={() => requestDelete({ kind: "local-client", id: client.id, label: client.displayName })}>Elimina</Button>
            </div></div>
          )) : <div className="empty">{query ? "Nessun risultato." : "Nessun Cliente locale."}</div>}
        </div>
      </CardContent></Card>
    </div>
  )
}
