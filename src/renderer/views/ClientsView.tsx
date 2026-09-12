import { MoreHorizontal, Plus, Search, Users } from "lucide-react"
import { useState } from "react"
import { searchLocalClients } from "../../domain/clients"
import type { CashDocument } from "../../domain/model"
import { ClientDialog } from "@/components/EntityDialogs"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

export function ClientsView({ doc, appState, requestDelete }: {
  doc: CashDocument
  appState: AppState
  requestDelete: (target: DeleteTarget) => void
}) {
  const [query, setQuery] = useState("")
  const [editingId, setEditingId] = useState<string | null>()
  const clients = searchLocalClients(doc.localClients, query)
  const editing = editingId ? doc.localClients.find((client) => client.id === editingId) : undefined

  return (
    <>
      <Card>
        <CardHeader>
          <div><CardTitle>Clienti locali</CardTitle><CardDescription>Anagrafica minimale per compilare rapidamente i preventivi. Nessun workflow CRM.</CardDescription></div>
          <CardAction><Button onClick={() => setEditingId(null)}><Plus />Nuovo cliente</Button></CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md"><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca per denominazione o P.IVA" aria-label="Cerca clienti" /></InputGroup></div>
          {clients.length ? <Table><TableHeader><TableRow><TableHead>Denominazione</TableHead><TableHead>Partita IVA</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{clients.map((client) => <TableRow key={client.id}><TableCell className="font-medium">{client.displayName}</TableCell><TableCell className="text-muted-foreground">{client.vatNumber ?? "Non indicata"}</TableCell><TableCell><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${client.displayName}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setEditingId(client.id)}>Modifica</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "local-client", id: client.id, label: client.displayName })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <div className="grid min-h-56 place-items-center rounded-lg border border-dashed p-8 text-center"><div><Users className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">{query ? "Nessun cliente trovato" : "Nessun cliente locale"}</p><p className="mt-1 text-sm text-muted-foreground">{query ? "Prova con un altro nome o Partita IVA." : "Puoi anche lasciare il cliente vuoto finché il preventivo è incompleto."}</p>{!query ? <Button className="mt-4" size="sm" onClick={() => setEditingId(null)}><Plus />Nuovo cliente</Button> : null}</div></div>}
        </CardContent>
      </Card>
      <ClientDialog open={editingId !== undefined} onOpenChange={(open) => { if (!open) setEditingId(undefined) }} appState={appState} client={editing} />
    </>
  )
}
