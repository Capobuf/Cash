import { Building2, Car, MoreHorizontal, Plus, ReceiptText } from "lucide-react"
import { useState } from "react"
import { calculateVehicleCost } from "../../domain/calculations"
import type { CashDocument } from "../../domain/model"
import { CostDialog, SiteDialog, VehicleDialog } from "@/components/EntityDialogs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { dateIt, eur, formatNumber } from "@/lib/format"
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
  const otherSites = doc.sites.filter((site) => !site.client || site.client.source === "local")
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

  return (
    <>
      <Tabs defaultValue="costs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="costs"><ReceiptText />Costi aziendali</TabsTrigger>
          <TabsTrigger value="vehicles"><Car />Veicoli</TabsTrigger>
          <TabsTrigger value="sites"><Building2 />Altre sedi</TabsTrigger>
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
          <Card><CardHeader><div><CardTitle>Altre sedi</CardTitle><CardDescription>Fornitori, laboratorio, magazzini e luoghi non associati a un cliente.</CardDescription></div><CardAction><Button onClick={() => setEditor({ kind: "site" })}><Plus />Nuova sede</Button></CardAction></CardHeader><CardContent>
            {otherSites.length ? <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Indirizzo</TableHead><TableHead>Distanza</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{otherSites.map((site) => <TableRow key={site.id}><TableCell className="font-medium">{site.name}</TableCell><TableCell>{site.address}</TableCell><TableCell>{site.oneWayKm === undefined ? "Non indicata" : `${formatNumber(site.oneWayKm, 1)} km`}</TableCell><TableCell><RowMenu label={site.name} onEdit={() => setEditor({ kind: "site", id: site.id })} onDelete={() => requestDelete({ kind: "site", id: site.id, label: site.name })} /></TableCell></TableRow>)}</TableBody></Table> : <Empty title="Nessuna altra sede" description="Aggiungi fornitori, laboratorio, magazzini o altri luoghi indipendenti." action="Nuova sede" onAction={() => setEditor({ kind: "site" })} />}
          </CardContent></Card>
        </TabsContent>

      </Tabs>

      <CostDialog open={editor?.kind === "cost"} onOpenChange={(open) => { if (!open) setEditor(null) }} appState={appState} cost={editor?.kind === "cost" ? doc.businessCosts.find((entry) => entry.id === editor.id) : undefined} />
      <VehicleDialog open={editor?.kind === "vehicle"} onOpenChange={(open) => { if (!open) setEditor(null) }} appState={appState} vehicle={editor?.kind === "vehicle" ? doc.vehicles.find((entry) => entry.id === editor.id) : undefined} />
      <SiteDialog open={editor?.kind === "site"} onOpenChange={(open) => { if (!open) setEditor(null) }} appState={appState} doc={doc} site={editor?.kind === "site" ? doc.sites.find((entry) => entry.id === editor.id) : undefined} />
    </>
  )
}

function RowMenu({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => void }) {
  return <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${label}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onEdit}>Modifica</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={onDelete}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
}

function Empty({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <div className="grid min-h-48 place-items-center rounded-lg border border-dashed p-8 text-center"><div><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p><Button className="mt-4" size="sm" onClick={onAction}><Plus />{action}</Button></div></div>
}
