import { MoreHorizontal } from "lucide-react"
import { useState, type FormEvent } from "react"
import { calculateVehicleCost } from "../../domain/calculations"
import { meta, type CashDocument, type Vehicle } from "../../domain/model"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { dateIt, decimalInputValue, eur, formatNumber, formReader, moneyInputValue } from "@/lib/format"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

const promptRequired = (message: string, initial = ""): string | undefined => window.prompt(message, initial)?.trim() || undefined

export function ResourcesView({ doc, appState, requestDelete }: {
  doc: CashDocument
  appState: AppState
  requestDelete: (target: DeleteTarget) => void
}) {
  const [editingVehicleId, setEditingVehicleId] = useState<string>()
  const [editingCostId, setEditingCostId] = useState<string>()
  const [editingSiteId, setEditingSiteId] = useState<string>()
  const [vehicleCostPreviews, setVehicleCostPreviews] = useState<Record<string, { costPerKm: string; referenceDate: string }>>({})
  const editingVehicle = doc.vehicles.find((vehicle) => vehicle.id === editingVehicleId)
  const editingCost = doc.businessCosts.find((cost) => cost.id === editingCostId)
  const editingSite = doc.sites.find((site) => site.id === editingSiteId)
  const vehicle = editingVehicle ?? { name: "", fuel: "Benzina" as const, consumption: "6.00", annualKm: "10000", annualInsurance: "0.00", annualTax: "0.00", annualMaintenance: "0.00" }
  const annualCosts = doc.businessCosts.reduce((sum, cost) => sum + Number(cost.monthlyAmount) * 12, 0).toFixed(2)

  const addCost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { get, money } = formReader(event.currentTarget)
    appState.mutate((document) => document.businessCosts.push({ ...meta(), category: get("category"), description: get("description"), monthlyAmount: Number(money("monthlyAmount")).toFixed(2) }))
    event.currentTarget.reset()
  }

  const editCost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingCost) return
    const { get } = formReader(event.currentTarget)
    const category = get("category")
    const description = get("description")
    const parsedAmount = Number(decimalInputValue(get("monthlyAmount")))
    if (!category || !description || !Number.isFinite(parsedAmount) || parsedAmount < 0) return
    appState.mutate((document) => Object.assign(document.businessCosts.find((candidate) => candidate.id === editingCost.id)!, { category, description, monthlyAmount: parsedAmount.toFixed(2), updatedAt: new Date().toISOString() }))
    setEditingCostId(undefined)
  }

  const saveVehicle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { get, money } = formReader(event.currentTarget)
    const values = {
      name: get("name"), fuel: get("fuel") as Vehicle["fuel"], consumption: get("consumption"),
      consumptionUnit: get("fuel") === "Metano" ? "kg/100km" as const : "l/100km" as const,
      annualKm: get("annualKm"), annualInsurance: Number(money("annualInsurance")).toFixed(2),
      annualTax: Number(money("annualTax")).toFixed(2), annualMaintenance: Number(money("annualMaintenance")).toFixed(2),
    }
    if (editingVehicleId) {
      appState.mutate((document) => {
        const target = document.vehicles.find((candidate) => candidate.id === editingVehicleId)
        if (target) Object.assign(target, values, { updatedAt: new Date().toISOString() })
      })
      setVehicleCostPreviews((current) => { const next = { ...current }; delete next[editingVehicleId]; return next })
      setEditingVehicleId(undefined)
    } else {
      appState.mutate((document) => document.vehicles.push({ ...meta(), ...values }))
      event.currentTarget.reset()
    }
  }

  const checkVehicleCost = async (id: string) => {
    const selected = doc.vehicles.find((candidate) => candidate.id === id)
    if (!selected || !doc.settings.fuelTerritory) { window.alert("Configurare veicolo e territorio MIMIT."); return }
    const fuel = await window.cash.mimit.latestFuelPrice({ territory: doc.settings.fuelTerritory, fuel: selected.fuel })
    if (!fuel.ok) { appState.setError(fuel.error); return }
    const calculated = calculateVehicleCost(selected, fuel.value)
    if (!calculated.ok) { appState.setError(calculated.error); return }
    setVehicleCostPreviews((current) => ({ ...current, [id]: { costPerKm: calculated.value.costPerKm, referenceDate: fuel.value.referenceDate } }))
  }

  const addSite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { get } = formReader(event.currentTarget)
    const client = doc.localClients.find((candidate) => candidate.id === get("localClientId"))
    appState.mutate((document) => document.sites.push({
      ...meta(), name: get("name"), address: get("address"),
      ...(client ? { client: { source: "local", localClientId: client.id, displayName: client.displayName } as const } : {}),
      ...(get("oneWayKm") ? { oneWayKm: Number(get("oneWayKm")).toFixed(1) } : {}),
    }))
    event.currentTarget.reset()
  }

  const editSite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingSite) return
    const { get } = formReader(event.currentTarget)
    const name = get("name")
    const address = get("address")
    const km = get("oneWayKm")
    const clientChoice = get("localClientId")
    if (!name || !address) return
    const selected = doc.localClients.find((client) => client.id === clientChoice)
    appState.mutate((document) => {
      const target = document.sites.find((candidate) => candidate.id === editingSite.id)!
      target.name = name; target.address = address; target.oneWayKm = km.trim() ? Number(km).toFixed(1) : undefined
      if (clientChoice === "__preserve__") { /* conserva associazione remota */ }
      else if (!clientChoice) target.client = undefined
      else if (selected) target.client = { source: "local", localClientId: selected.id, displayName: selected.displayName }
      target.updatedAt = new Date().toISOString()
    })
    setEditingSiteId(undefined)
  }

  const associateRemoteSite = async (id: string) => {
    const company = doc.settings.fic.company
    if (!doc.settings.fic.enabled || !company) return
    const query = promptRequired("Cerca cliente Fatture in Cloud")
    if (!query) return
    const found = await window.cash.fic.searchClients({ companyId: company.id, query })
    if (!found.ok) { appState.setError(found.error); return }
    const selected = found.value[Number(promptRequired(`Cliente:\n${found.value.map((client, index) => `${index + 1}. ${client.displayName}`).join("\n")}`)) - 1]
    if (selected) appState.mutate((document) => { document.sites.find((candidate) => candidate.id === id)!.client = { source: "fatture_in_cloud", companyId: selected.companyId, clientId: selected.clientId, displayName: selected.displayName } })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[["Costi aziendali annui", eur(annualCosts)], ["Veicoli configurati", doc.vehicles.length], ["Sedi operative", doc.sites.length]].map(([label, value]) => <Card key={label}><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl tabular-nums">{value}</CardTitle></CardHeader></Card>)}
      </div>
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-4"><CardHeader><CardTitle>Costi aziendali</CardTitle><CardDescription>Spese ricorrenti mensili.</CardDescription></CardHeader><CardContent className="space-y-4">
          <form onSubmit={addCost}><FieldGroup>
            <Field><FieldLabel htmlFor="cost-category">Categoria</FieldLabel><Input id="cost-category" name="category" placeholder="es. Software" required /></Field>
            <Field><FieldLabel htmlFor="cost-description">Descrizione</FieldLabel><Input id="cost-description" name="description" placeholder="es. Gestionale" required /></Field>
            <Field><FieldLabel htmlFor="cost-amount">Importo mensile</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id="cost-amount" name="monthlyAmount" defaultValue="0.00" inputMode="decimal" required /></InputGroup></Field>
            <Button type="submit">Aggiungi costo</Button>
          </FieldGroup></form><Separator />
          {doc.businessCosts.length ? <Table><TableBody>{doc.businessCosts.map((cost) => <TableRow key={cost.id}><TableCell><div className="font-medium">{cost.category}</div><div className="text-muted-foreground">{cost.description}</div></TableCell><TableCell className="text-right">{eur(cost.monthlyAmount)}/mese</TableCell><TableCell className="w-12 text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${cost.description}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setEditingCostId(cost.id)}>Modifica</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "cost", id: cost.id, label: cost.description })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <p className="py-6 text-center text-sm text-muted-foreground">Nessun elemento.</p>}
        </CardContent></Card>
        <Card className="col-span-8"><CardHeader><CardTitle>{editingVehicle ? "Modifica veicolo" : "Veicoli"}</CardTitle><CardDescription>Mobilità e costo chilometrico.</CardDescription>{editingVehicle ? <CardAction><Badge variant="secondary">Modifica in corso</Badge></CardAction> : null}</CardHeader><CardContent className="space-y-4">
          <form key={editingVehicleId ?? "new"} onSubmit={saveVehicle}><FieldGroup className="grid grid-cols-4">
            <Field><FieldLabel htmlFor="vehicle-name">Nome veicolo</FieldLabel><Input id="vehicle-name" name="name" defaultValue={vehicle.name} autoComplete="off" placeholder="es. Auto principale" required /></Field>
            <Field><FieldLabel htmlFor="vehicle-fuel">Carburante</FieldLabel><NativeSelect className="w-full" id="vehicle-fuel" name="fuel" defaultValue={vehicle.fuel} required>{(["Benzina", "Gasolio", "GPL", "Metano"] as const).map((fuel) => <NativeSelectOption key={fuel} value={fuel}>{fuel}</NativeSelectOption>)}</NativeSelect></Field>
            <Field><FieldLabel htmlFor="vehicle-consumption">Consumo medio</FieldLabel><InputGroup><InputGroupInput id="vehicle-consumption" name="consumption" type="number" defaultValue={vehicle.consumption} min={.01} step={.01} required /><InputGroupAddon align="inline-end"><InputGroupText>{vehicle.fuel === "Metano" ? "kg / 100 km" : "l / 100 km"}</InputGroupText></InputGroupAddon></InputGroup></Field>
            <Field><FieldLabel htmlFor="vehicle-km">Percorrenza annua</FieldLabel><InputGroup><InputGroupInput id="vehicle-km" name="annualKm" type="number" defaultValue={vehicle.annualKm} min={1} step={.1} required /><InputGroupAddon align="inline-end"><InputGroupText>km</InputGroupText></InputGroupAddon></InputGroup></Field>
            {[["annualInsurance", "Assicurazione annua", vehicle.annualInsurance], ["annualTax", "Bollo annuo", vehicle.annualTax], ["annualMaintenance", "Manutenzione annua", vehicle.annualMaintenance]].map(([name, label, value]) => <Field key={name}><FieldLabel htmlFor={`vehicle-${name}`}>{label}</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id={`vehicle-${name}`} name={name} defaultValue={moneyInputValue(value)} inputMode="decimal" required /></InputGroup></Field>)}
            <div className="col-span-4 flex gap-2"><Button type="submit">{editingVehicle ? "Salva modifiche" : "Aggiungi veicolo"}</Button>{editingVehicle ? <Button type="button" variant="outline" onClick={() => setEditingVehicleId(undefined)}>Annulla</Button> : null}</div>
          </FieldGroup></form><Separator />
          {doc.vehicles.length ? <Table><TableHeader><TableRow><TableHead>Veicolo</TableHead><TableHead>Consumo</TableHead><TableHead>Percorrenza</TableHead><TableHead>Costi fissi</TableHead><TableHead>Costo/km</TableHead><TableHead className="w-12 text-right">Azioni</TableHead></TableRow></TableHeader><TableBody>{doc.vehicles.map((entry) => { const preview = vehicleCostPreviews[entry.id]; const fixed = (Number(entry.annualInsurance) + Number(entry.annualTax) + Number(entry.annualMaintenance)).toFixed(2); return <TableRow key={entry.id} data-state={editingVehicleId === entry.id ? "selected" : undefined}><TableCell><div className="font-medium">{entry.name || "Veicolo senza nome"}</div><div className="text-muted-foreground">{entry.fuel}</div></TableCell><TableCell>{formatNumber(entry.consumption, 2)} {entry.consumptionUnit}</TableCell><TableCell>{formatNumber(entry.annualKm)} km/anno</TableCell><TableCell>{eur(fixed)}</TableCell><TableCell>{preview ? `${eur(preview.costPerKm)}/km · ${dateIt(preview.referenceDate)}` : "—"}</TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${entry.name}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setEditingVehicleId(entry.id)}>Modifica</DropdownMenuItem><DropdownMenuItem onClick={() => void checkVehicleCost(entry.id)}>Calcola costo/km</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "vehicle", id: entry.id, label: entry.name })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow> })}</TableBody></Table> : <p className="py-6 text-center text-sm text-muted-foreground">Nessun veicolo configurato. Aggiungine uno per calcolare le trasferte.</p>}
        </CardContent></Card>
        <Card className="col-span-12"><CardHeader><CardTitle>Sedi operative</CardTitle><CardDescription>Luoghi di lavoro, distanze e clienti associati.</CardDescription></CardHeader><CardContent className="space-y-4">
          <form onSubmit={addSite}><FieldGroup className="grid grid-cols-4">
            <Field><FieldLabel htmlFor="site-name">Nome sede</FieldLabel><Input id="site-name" name="name" placeholder="es. Sede cliente" required /></Field>
            <Field><FieldLabel htmlFor="site-address">Indirizzo</FieldLabel><Input id="site-address" name="address" placeholder="Via, città" required /></Field>
            <Field><FieldLabel htmlFor="site-client">Cliente locale associato</FieldLabel><NativeSelect className="w-full" id="site-client" name="localClientId"><NativeSelectOption value="">Nessuno</NativeSelectOption>{doc.localClients.map((client) => <NativeSelectOption key={client.id} value={client.id}>{client.displayName}</NativeSelectOption>)}</NativeSelect></Field>
            <Field><FieldLabel htmlFor="site-distance">Distanza sola andata</FieldLabel><InputGroup><InputGroupInput id="site-distance" name="oneWayKm" type="number" min={0} step={.1} /><InputGroupAddon align="inline-end"><InputGroupText>km</InputGroupText></InputGroupAddon></InputGroup></Field>
            <Button type="submit" className="col-span-4">Aggiungi sede</Button>
          </FieldGroup></form><Separator />
          {doc.sites.length ? <Table><TableHeader><TableRow><TableHead>Sede</TableHead><TableHead>Indirizzo</TableHead><TableHead>Distanza</TableHead><TableHead>Cliente</TableHead><TableHead className="w-12 text-right">Azioni</TableHead></TableRow></TableHeader><TableBody>{doc.sites.map((site) => <TableRow key={site.id}><TableCell className="font-medium">{site.name}</TableCell><TableCell>{site.address}</TableCell><TableCell>{site.oneWayKm !== undefined ? `${formatNumber(site.oneWayKm, 1)} km` : "—"}</TableCell><TableCell>{site.client?.displayName ?? "Nessun cliente associato"}</TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni per ${site.name}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setEditingSiteId(site.id)}>Modifica</DropdownMenuItem>{doc.settings.fic.enabled ? <DropdownMenuItem onClick={() => void associateRemoteSite(site.id)}>Associa Cliente FIC</DropdownMenuItem> : null}<DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "site", id: site.id, label: site.name })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <p className="py-6 text-center text-sm text-muted-foreground">Nessuna sede configurata.</p>}
        </CardContent></Card>
      </div>
      <Dialog open={Boolean(editingCost)} onOpenChange={(open) => { if (!open) setEditingCostId(undefined) }}>
        <DialogContent><form key={editingCost?.id} onSubmit={editCost} className="contents"><DialogHeader><DialogTitle>Modifica costo aziendale</DialogTitle><DialogDescription>Aggiorna la spesa ricorrente mensile.</DialogDescription></DialogHeader><FieldGroup>
          <Field><FieldLabel htmlFor="edit-cost-category">Categoria</FieldLabel><Input id="edit-cost-category" name="category" defaultValue={editingCost?.category} required /></Field>
          <Field><FieldLabel htmlFor="edit-cost-description">Descrizione</FieldLabel><Input id="edit-cost-description" name="description" defaultValue={editingCost?.description} required /></Field>
          <Field><FieldLabel htmlFor="edit-cost-amount">Importo mensile</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id="edit-cost-amount" name="monthlyAmount" defaultValue={moneyInputValue(editingCost?.monthlyAmount)} inputMode="decimal" required /></InputGroup></Field>
        </FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setEditingCostId(undefined)}>Annulla</Button><Button type="submit">Salva modifiche</Button></DialogFooter></form></DialogContent>
      </Dialog>
      <Dialog open={Boolean(editingSite)} onOpenChange={(open) => { if (!open) setEditingSiteId(undefined) }}>
        <DialogContent><form key={editingSite?.id} onSubmit={editSite} className="contents"><DialogHeader><DialogTitle>Modifica sede operativa</DialogTitle><DialogDescription>Aggiorna luogo, distanza e Cliente locale associato.</DialogDescription></DialogHeader><FieldGroup>
          <Field><FieldLabel htmlFor="edit-site-name">Nome sede</FieldLabel><Input id="edit-site-name" name="name" defaultValue={editingSite?.name} required /></Field>
          <Field><FieldLabel htmlFor="edit-site-address">Indirizzo</FieldLabel><Input id="edit-site-address" name="address" defaultValue={editingSite?.address} required /></Field>
          <Field><FieldLabel htmlFor="edit-site-distance">Distanza sola andata</FieldLabel><InputGroup><InputGroupInput id="edit-site-distance" name="oneWayKm" type="number" defaultValue={editingSite?.oneWayKm} min={0} step={.1} /><InputGroupAddon align="inline-end"><InputGroupText>km</InputGroupText></InputGroupAddon></InputGroup></Field>
          <Field><FieldLabel htmlFor="edit-site-client">Cliente locale associato</FieldLabel><NativeSelect className="w-full" id="edit-site-client" name="localClientId" defaultValue={editingSite?.client?.source === "local" ? editingSite.client.localClientId : editingSite?.client ? "__preserve__" : ""}>{editingSite?.client?.source === "fatture_in_cloud" ? <NativeSelectOption value="__preserve__">{editingSite.client.displayName} · Fatture in Cloud</NativeSelectOption> : null}<NativeSelectOption value="">Nessuno</NativeSelectOption>{doc.localClients.map((client) => <NativeSelectOption key={client.id} value={client.id}>{client.displayName}</NativeSelectOption>)}</NativeSelect></Field>
        </FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setEditingSiteId(undefined)}>Annulla</Button><Button type="submit">Salva modifiche</Button></DialogFooter></form></DialogContent>
      </Dialog>
    </div>
  )
}
