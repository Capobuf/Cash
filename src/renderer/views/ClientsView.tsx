import { MoreHorizontal } from "lucide-react"
import { useState, type FormEvent } from "react"
import { createLocalClient, searchLocalClients, updateLocalClient } from "../../domain/clients"
import type { CashDocument } from "../../domain/model"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formReader } from "@/lib/format"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

export function ClientsView({ doc, appState, requestDelete }: {
  doc: CashDocument
  appState: AppState
  requestDelete: (target: DeleteTarget) => void
}) {
  const [query, setQuery] = useState("")
  const [editingId, setEditingId] = useState<string>()
  const clients = query ? searchLocalClients(doc.localClients, query) : doc.localClients
  const editing = doc.localClients.find((candidate) => candidate.id === editingId)

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { get } = formReader(event.currentTarget)
    const created = createLocalClient(get("displayName"), get("vatNumber"))
    if (!created.ok) { appState.setError(created.error); return }
    appState.mutate((document) => document.localClients.push(created.value))
    event.currentTarget.reset()
  }

  const edit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    const { get } = formReader(event.currentTarget)
    const updated = updateLocalClient(editing, get("displayName"), get("vatNumber"))
    if (!updated.ok) { appState.setError(updated.error); return }
    appState.mutate((document) => {
      const index = document.localClients.findIndex((candidate) => candidate.id === editing.id)
      document.localClients[index] = updated.value
      for (const site of document.sites) {
        if (site.client?.source === "local" && site.client.localClientId === editing.id) site.client.displayName = updated.value.displayName
      }
    })
    setEditingId(undefined)
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-4"><CardHeader><CardTitle>Nuovo Cliente locale</CardTitle><CardDescription>Crea un’anagrafica disponibile solo in questo archivio.</CardDescription></CardHeader><CardContent>
        <form onSubmit={create}><FieldGroup>
          <Field><FieldLabel htmlFor="new-client-name">Denominazione</FieldLabel><Input id="new-client-name" name="displayName" required /></Field>
          <Field><FieldLabel htmlFor="new-client-vat">Partita IVA (facoltativa)</FieldLabel><Input id="new-client-vat" name="vatNumber" /></Field>
          <Button type="submit">Crea cliente</Button>
        </FieldGroup></form>
      </CardContent></Card>
      <Card className="col-span-8"><CardHeader><CardTitle>Anagrafica locale</CardTitle><CardDescription>Clienti salvati nell’archivio corrente.</CardDescription><CardAction>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setQuery(formReader(event.currentTarget).get("query")) }}>
          <Input aria-label="Cerca per nome o Partita IVA" name="query" defaultValue={query} placeholder="Cerca per nome o P.IVA" />
          <Button type="submit" variant="outline">Cerca</Button>{query ? <Button type="button" variant="ghost" onClick={() => setQuery("")}>Tutti</Button> : null}
        </form>
      </CardAction></CardHeader><CardContent>
        {clients.length ? <Table><TableHeader><TableRow><TableHead>Denominazione</TableHead><TableHead>Partita IVA</TableHead><TableHead className="w-16 text-right">Azioni</TableHead></TableRow></TableHeader><TableBody>{clients.map((client) => <TableRow key={client.id}><TableCell className="font-medium">{client.displayName}</TableCell><TableCell className="text-muted-foreground">{client.vatNumber ?? "Non indicata"}</TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${client.displayName}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setEditingId(client.id)}>Modifica</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "local-client", id: client.id, label: client.displayName })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <p className="py-8 text-center text-sm text-muted-foreground">{query ? "Nessun risultato." : "Nessun Cliente locale."}</p>}
      </CardContent></Card>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditingId(undefined) }}>
        <DialogContent><form key={editing?.id} onSubmit={edit} className="contents"><DialogHeader><DialogTitle>Modifica Cliente locale</DialogTitle><DialogDescription>Aggiorna l’anagrafica e le sedi locali collegate.</DialogDescription></DialogHeader><FieldGroup>
          <Field><FieldLabel htmlFor="edit-client-name">Denominazione</FieldLabel><Input id="edit-client-name" name="displayName" defaultValue={editing?.displayName} required /></Field>
          <Field><FieldLabel htmlFor="edit-client-vat">Partita IVA (facoltativa)</FieldLabel><Input id="edit-client-vat" name="vatNumber" defaultValue={editing?.vatNumber} /></Field>
        </FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setEditingId(undefined)}>Annulla</Button><Button type="submit">Salva modifiche</Button></DialogFooter></form></DialogContent>
      </Dialog>
    </div>
  )
}
