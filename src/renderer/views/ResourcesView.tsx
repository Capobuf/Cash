import { Building2, Car, MoreHorizontal, Plus, ReceiptText } from "lucide-react"
import { useState, type FormEvent } from "react"
import { calculateVehicleCost } from "../../domain/calculations"
import type { CashDocument, FicClientSnapshot } from "../../domain/model"
import { CostDialog, SiteDialog, VehicleDialog } from "@/components/EntityDialogs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { dateIt, eur, formatNumber, formReader } from "@/lib/format"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

type Editor = { kind: "cost" | "vehicle" | "site"; id?: string } | null

export function ResourcesView({ doc, appState, requestDelete }: {
  doc: CashDocument
  appState: AppState
  requestDelete: (target: DeleteTarget) => void
}) {
  const [editor, setEditor] = useState<Editor>(null)
  const [vehicleCostPreviews, setVehicleCostPreviews] = useState<Record<string, { costPerKm: string; referenceDate: string }>>({})
  const [remoteSiteId, setRemoteSiteId] = useState<string>()
  const [remoteResults, setRemoteResults] = useState<FicClientSnapshot[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const annualCosts = doc.businessCosts.reduce((sum, cost) => sum + Number(cost.monthlyAmount) * 12, 0).toFixed(2)

  const checkVehicleCost = async (id: string) => {
    const vehicle = doc.vehicles.find((entry) => entry.id === id)
    if (!vehicle || !doc.settings.fuelTerritory) {
      appState.setError({ code: "MISSING_DATA", message: "Il costo chilometrico non può essere calcolato.", field: "fuelTerritory", action: "Configura il territorio MIMIT nelle impostazioni di pianificazione." })
      return
    }
    const fuel = await window.cash.mimit.latestFuelPrice({ territory: doc.settings.fuelTerritory, fuel: vehicle.fuel })
    if (!fuel.ok) { appState.setError(fuel.error); return }
    const result = calculateVehicleCost(vehicle, fuel.value)
    if (!result.ok) { appState.setError(result.error); return }
    setVehicleCostPreviews((current) => ({ ...current, [id]: { costPerKm: result.value.costPerKm, referenceDate: fuel.value.referenceDate } }))
  }

  const searchRemote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const companyId = doc.settings.fic.company?.id
    if (!companyId || !doc.settings.fic.enabled) return
    setRemoteLoading(true)
    const found = await window.cash.fic.searchClients({ companyId, query: formReader(event.currentTarget).get("query") })
    setRemoteLoading(false)
    if (!found.ok) { appState.setError(found.error); return }
    setRemoteResults(found.value)
  }

  const associateRemote = (client: FicClientSnapshot) => {
    if (!remoteSiteId) return
    appState.mutate((document) => {
      const site = document.sites.find((entry) => entry.id === remoteSiteId)
      if (site) site.client = { source: "fatture_in_cloud", companyId: client.companyId, clientId: client.clientId, displayName: client.displayName }
    })
    setRemoteSiteId(undefined)
    setRemoteResults([])
  }

  return (
    <>
      <Tabs defaultValue="costs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="costs"><ReceiptText />Costi aziendali</TabsTrigger>
          <TabsTrigger value="vehicles"><Car />Veicoli</TabsTrigger>
          <TabsTrigger value="sites"><Building2 />Sedi</TabsTrigger>
        </TabsList>

        <TabsContent value="costs">
          <Card><CardHeader><div><CardTitle>Costi aziendali</CardTitle><CardDescription>Costi medi mensili. Totale annuale: <strong className="text-foreground">{eur(annualCosts)}</strong>.</CardDescription></div><CardAction><Button onClick={() => setEditor({ kind: "cost" })}><Plus />Nuovo costo</Button></CardAction></CardHeader><CardContent>
            {doc.businessCosts.length ? <Table><TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead>Descrizione</TableHead><TableHead className="text-right">Mensile</TableHead><TableHead className="text-right">Annuale</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{doc.businessCosts.map((cost) => <TableRow key={cost.id}><TableCell><Badge variant="secondary">{cost.category}</Badge></TableCell><TableCell className="font-medium">{cost.description}</TableCell><TableCell className="text-right tabular-nums">{eur(cost.monthlyAmount)}</TableCell><TableCell className="text-right tabular-nums">{eur((Number(cost.monthlyAmount) * 12).toFixed(2))}</TableCell><TableCell><RowMenu label={cost.description} onEdit={() => setEditor({ kind: "cost", id: cost.id })} onDelete={() => requestDelete({ kind: "cost", id: cost.id, label: cost.description })} /></TableCell></TableRow>)}</TableBody></Table> : <Empty title="Nessun costo aziendale" description="Aggiungi solo i costi ricorrenti utili alla pianificazione annuale." action="Nuovo costo" onAction={() => setEditor({ kind: "cost" })} />}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="vehicles">
          <Card><CardHeader><div><CardTitle>Veicoli</CardTitle><CardDescription>Dati essenziali per verificare il costo chilometrico delle trasferte.</CardDescription></div><CardAction><Button onClick={() => setEditor({ kind: "vehicle" })}><Plus />Nuovo veicolo</Button></CardAction></CardHeader><CardContent className="space-y-4">
            <Alert><AlertTitle>Evita duplicazioni</AlertTitle><AlertDescription>Assicurazione, bollo e manutenzione configurati qui non vanno inseriti anche nei costi aziendali.</AlertDescription></Alert>
            {doc.vehicles.length ? <Table><TableHeader><TableRow><TableHead>Veicolo</TableHead><TableHead>Consumo</TableHead><TableHead>Percorrenza</TableHead><TableHead>Costi annui</TableHead><TableHead>Costo/km verificato</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{doc.vehicles.map((vehicle) => { const preview = vehicleCostPreviews[vehicle.id]; const fixed = Number(vehicle.annualInsurance) + Number(vehicle.annualTax) + Number(vehicle.annualMaintenance); return <TableRow key={vehicle.id}><TableCell><div className="font-medium">{vehicle.name}</div><div className="text-xs text-muted-foreground">{vehicle.fuel}</div></TableCell><TableCell>{formatNumber(vehicle.consumption, 2)} {vehicle.consumptionUnit}</TableCell><TableCell>{formatNumber(vehicle.annualKm, 1)} km</TableCell><TableCell className="tabular-nums">{eur(fixed.toFixed(2))}</TableCell><TableCell>{preview ? <><strong className="tabular-nums">{preview.costPerKm} €/km</strong><div className="text-xs text-muted-foreground">MIMIT {dateIt(preview.referenceDate)}</div></> : <Button variant="outline" size="sm" onClick={() => void checkVehicleCost(vehicle.id)}>Verifica ora</Button>}</TableCell><TableCell><RowMenu label={vehicle.name} onEdit={() => setEditor({ kind: "vehicle", id: vehicle.id })} onDelete={() => requestDelete({ kind: "vehicle", id: vehicle.id, label: vehicle.name })} /></TableCell></TableRow> })}</TableBody></Table> : <Empty title="Nessun veicolo" description="Crea un veicolo per poter calcolare le trasferte." action="Nuovo veicolo" onAction={() => setEditor({ kind: "vehicle" })} />}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="sites">
          <Card><CardHeader><div><CardTitle>Sedi</CardTitle><CardDescription>Luoghi riutilizzabili con distanza di sola andata dalla tua base.</CardDescription></div><CardAction><Button onClick={() => setEditor({ kind: "site" })}><Plus />Nuova sede</Button></CardAction></CardHeader><CardContent>
            {doc.sites.length ? <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Indirizzo</TableHead><TableHead>Distanza</TableHead><TableHead>Cliente associato</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{doc.sites.map((site) => <TableRow key={site.id}><TableCell className="font-medium">{site.name}</TableCell><TableCell>{site.address}</TableCell><TableCell>{site.oneWayKm === undefined ? "Non indicata" : `${formatNumber(site.oneWayKm, 1)} km`}</TableCell><TableCell>{site.client ? <><span>{site.client.displayName}</span><Badge className="ml-2" variant="outline">{site.client.source === "local" ? "Locale" : "FIC"}</Badge></> : "Nessuno"}</TableCell><TableCell><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${site.name}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setEditor({ kind: "site", id: site.id })}>Modifica</DropdownMenuItem>{doc.settings.fic.enabled ? <DropdownMenuItem onClick={() => { setRemoteSiteId(site.id); setRemoteResults([]) }}>Associa cliente FIC</DropdownMenuItem> : null}<DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "site", id: site.id, label: site.name })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <Empty title="Nessuna sede" description="Le sedi vengono proposte quando aggiungi una trasferta." action="Nuova sede" onAction={() => setEditor({ kind: "site" })} />}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <CostDialog open={editor?.kind === "cost"} onOpenChange={(open) => { if (!open) setEditor(null) }} appState={appState} cost={editor?.kind === "cost" ? doc.businessCosts.find((entry) => entry.id === editor.id) : undefined} />
      <VehicleDialog open={editor?.kind === "vehicle"} onOpenChange={(open) => { if (!open) setEditor(null) }} appState={appState} vehicle={editor?.kind === "vehicle" ? doc.vehicles.find((entry) => entry.id === editor.id) : undefined} />
      <SiteDialog open={editor?.kind === "site"} onOpenChange={(open) => { if (!open) setEditor(null) }} appState={appState} doc={doc} site={editor?.kind === "site" ? doc.sites.find((entry) => entry.id === editor.id) : undefined} />

      <Dialog open={Boolean(remoteSiteId)} onOpenChange={(open) => { if (!open) { setRemoteSiteId(undefined); setRemoteResults([]) } }}><DialogContent>
        <DialogHeader><DialogTitle>Associa cliente Fatture in Cloud</DialogTitle><DialogDescription>La sede conserverà un riferimento leggibile; non viene creato un abbinamento automatico.</DialogDescription></DialogHeader>
        <form className="flex items-end gap-2" onSubmit={(event) => void searchRemote(event)}><Field className="flex-1"><FieldLabel htmlFor="site-remote-query">Cerca cliente</FieldLabel><Input id="site-remote-query" name="query" autoFocus required /></Field><Button type="submit" disabled={remoteLoading}>{remoteLoading ? "Ricerca…" : "Cerca"}</Button></form>
        <div className="max-h-72 space-y-2 overflow-y-auto">{remoteResults.map((client) => <Button key={client.clientId} variant="outline" className="h-auto w-full justify-between py-3" onClick={() => associateRemote(client)}><span>{client.displayName}</span><span className="text-muted-foreground">{client.vatNumber ?? "P.IVA assente"}</span></Button>)}</div>
        <DialogFooter><Button variant="outline" onClick={() => setRemoteSiteId(undefined)}>Annulla</Button></DialogFooter>
      </DialogContent></Dialog>
    </>
  )
}

function RowMenu({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => void }) {
  return <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${label}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onEdit}>Modifica</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={onDelete}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
}

function Empty({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <div className="grid min-h-48 place-items-center rounded-lg border border-dashed p-8 text-center"><div><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p><Button className="mt-4" size="sm" onClick={onAction}><Plus />{action}</Button></div></div>
}
