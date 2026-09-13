import { useState, type FormEvent } from "react"
import { createLocalClient, updateLocalClient } from "../../domain/clients"
import { meta, type BusinessCost, type CashDocument, type FicClientSnapshot, type LocalClient, type Site, type Vehicle } from "../../domain/model"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { formReader, moneyInputValue } from "@/lib/format"
import type { AppState } from "../state"

interface DialogBaseProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (id: string) => void
}

export function ClientDialog({ open, onOpenChange, appState, client, onSaved }: DialogBaseProps & { appState: AppState; client?: LocalClient }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { get } = formReader(event.currentTarget)
    const result = client
      ? updateLocalClient(client, get("displayName"), get("vatNumber"))
      : createLocalClient(get("displayName"), get("vatNumber"))
    if (!result.ok) { appState.setError(result.error); return }
    appState.mutate((document) => {
      if (client) {
        const index = document.localClients.findIndex((entry) => entry.id === client.id)
        document.localClients[index] = result.value
        for (const site of document.sites) {
          if (site.client?.source === "local" && site.client.localClientId === client.id) site.client.displayName = result.value.displayName
        }
      } else document.localClients.push(result.value)
    })
    onSaved?.(result.value.id)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent><form key={client?.id ?? "new-client"} onSubmit={submit} className="contents">
        <DialogHeader><DialogTitle>{client ? "Modifica cliente" : "Nuovo cliente"}</DialogTitle><DialogDescription>Anagrafica locale essenziale, indipendente da Fatture in Cloud.</DialogDescription></DialogHeader>
        <FieldGroup>
          <Field><FieldLabel htmlFor="client-name">Denominazione</FieldLabel><Input id="client-name" name="displayName" defaultValue={client?.displayName} autoFocus required /></Field>
          <Field><FieldLabel htmlFor="client-vat">Partita IVA (facoltativa)</FieldLabel><Input id="client-vat" name="vatNumber" defaultValue={client?.vatNumber} /></Field>
        </FieldGroup>
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button><Button type="submit">{client ? "Aggiorna cliente" : "Crea cliente"}</Button></DialogFooter>
      </form></DialogContent>
    </Dialog>
  )
}

export function CostDialog({ open, onOpenChange, appState, cost }: DialogBaseProps & { appState: AppState; cost?: BusinessCost }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { get, money } = formReader(event.currentTarget)
    const amount = Number(money("monthlyAmount"))
    if (!get("category") || !get("description") || !Number.isFinite(amount) || amount < 0) {
      appState.setError({ code: "VALIDATION", message: "Completa categoria, descrizione e importo mensile.", action: "Correggi i campi del costo aziendale." })
      return
    }
    const id = cost?.id ?? meta().id
    appState.mutate((document) => {
      if (cost) Object.assign(document.businessCosts.find((entry) => entry.id === cost.id)!, { category: get("category"), description: get("description"), monthlyAmount: amount.toFixed(2), updatedAt: new Date().toISOString() })
      else document.businessCosts.push({ ...meta(), id, category: get("category"), description: get("description"), monthlyAmount: amount.toFixed(2) })
    })
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form key={cost?.id ?? "new-cost"} onSubmit={submit} className="contents">
      <DialogHeader><DialogTitle>{cost ? "Modifica costo" : "Nuovo costo aziendale"}</DialogTitle><DialogDescription>Indica il valore medio mensile; Cash calcola il totale annuale.</DialogDescription></DialogHeader>
      <FieldGroup>
        <Field><FieldLabel htmlFor="cost-category">Categoria</FieldLabel><Input id="cost-category" name="category" defaultValue={cost?.category} placeholder="Software" autoFocus required /></Field>
        <Field><FieldLabel htmlFor="cost-description">Descrizione</FieldLabel><Input id="cost-description" name="description" defaultValue={cost?.description} placeholder="Microsoft 365" required /></Field>
        <Field><FieldLabel htmlFor="cost-amount">Importo mensile</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id="cost-amount" name="monthlyAmount" defaultValue={moneyInputValue(cost?.monthlyAmount ?? "0.00")} inputMode="decimal" required /></InputGroup></Field>
      </FieldGroup>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button><Button type="submit">{cost ? "Aggiorna costo" : "Crea costo"}</Button></DialogFooter>
    </form></DialogContent></Dialog>
  )
}

export function SiteDialog({ open, onOpenChange, appState, doc: _doc, site, fixedClient, onSaved }: DialogBaseProps & { appState: AppState; doc: CashDocument; site?: Site; fixedClient?: FicClientSnapshot }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { get } = formReader(event.currentTarget)
    const km = get("oneWayKm")
    const kmValue = km ? Number(km) : undefined
    if (!get("name") || !get("address") || (kmValue !== undefined && (!Number.isFinite(kmValue) || kmValue < 0))) {
      appState.setError({ code: "VALIDATION", message: "Nome, indirizzo o distanza della sede non sono validi.", action: "Correggi i campi indicati." })
      return
    }
    const id = site?.id ?? meta().id
    appState.mutate((document) => {
      const values = {
        name: get("name"), address: get("address"), oneWayKm: kmValue === undefined ? undefined : kmValue.toFixed(1),
        client: fixedClient ? { source: "fatture_in_cloud" as const, companyId: fixedClient.companyId, clientId: fixedClient.clientId, displayName: fixedClient.displayName }
          : undefined,
      }
      if (site) Object.assign(document.sites.find((entry) => entry.id === site.id)!, values, { updatedAt: new Date().toISOString() })
      else document.sites.push({ ...meta(), id, ...values })
    })
    onSaved?.(id)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form key={site?.id ?? "new-site"} onSubmit={submit} className="contents">
      <DialogHeader><DialogTitle>{site ? "Modifica sede" : "Nuova sede"}</DialogTitle><DialogDescription>La distanza è sempre di sola andata dalla tua sede o laboratorio.</DialogDescription></DialogHeader>
      <FieldGroup>
        <Field><FieldLabel htmlFor="site-name">Nome</FieldLabel><Input id="site-name" name="name" defaultValue={site?.name} placeholder="Sede cliente" autoFocus required /></Field>
        <Field><FieldLabel htmlFor="site-address">Indirizzo</FieldLabel><Input id="site-address" name="address" defaultValue={site?.address} placeholder="Via, città" required /></Field>
        <Field><FieldLabel htmlFor="site-distance">Distanza sola andata</FieldLabel><InputGroup><InputGroupInput id="site-distance" name="oneWayKm" type="number" defaultValue={site?.oneWayKm} min={0} step={0.1} /><InputGroupAddon align="inline-end"><InputGroupText>km</InputGroupText></InputGroupAddon></InputGroup></Field>
        <Field><FieldLabel>Cliente</FieldLabel><div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{fixedClient?.displayName ?? (site?.client?.source === "local" ? `${site.client.displayName} (dato locale esistente)` : "Nessuno — altra sede")}</div></Field>
      </FieldGroup>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button><Button type="submit">{site ? "Aggiorna sede" : "Crea sede"}</Button></DialogFooter>
    </form></DialogContent></Dialog>
  )
}

const blankVehicle: Pick<Vehicle, "name" | "fuel" | "consumption" | "annualKm" | "annualInsurance" | "annualTax" | "annualMaintenance"> = {
  name: "", fuel: "Benzina", consumption: "16.67", annualKm: "10000", annualInsurance: "0.00", annualTax: "0.00", annualMaintenance: "0.00",
}

export function VehicleDialog({ open, onOpenChange, appState, vehicle: existing, onSaved }: DialogBaseProps & { appState: AppState; vehicle?: Vehicle }) {
  const vehicle = existing ?? blankVehicle
  const [fuel, setFuel] = useState<Vehicle["fuel"]>(vehicle.fuel)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { get, money } = formReader(event.currentTarget)
    const id = existing?.id ?? meta().id
    const consumption = Number(get("consumption"))
    const annualKm = Number(get("annualKm"))
    const annualInsurance = Number(money("annualInsurance"))
    const annualTax = Number(money("annualTax"))
    const annualMaintenance = Number(money("annualMaintenance"))
    if (!get("name") || !Number.isFinite(consumption) || consumption <= 0 || !Number.isFinite(annualKm) || annualKm <= 0 || [annualInsurance, annualTax, annualMaintenance].some((value) => !Number.isFinite(value) || value < 0)) {
      appState.setError({ code: "VALIDATION", message: "I dati del veicolo non sono validi.", action: "Controlla nome, consumo, percorrenza e costi annuali." })
      return
    }
    const values = {
      name: get("name"), fuel: get("fuel") as Vehicle["fuel"], consumption: get("consumption"),
      consumptionUnit: get("fuel") === "Metano" ? "kg/100km" as const : "km/l" as const,
      annualKm: get("annualKm"), annualInsurance: annualInsurance.toFixed(2),
      annualTax: annualTax.toFixed(2), annualMaintenance: annualMaintenance.toFixed(2),
    }
    appState.mutate((document) => {
      if (existing) Object.assign(document.vehicles.find((entry) => entry.id === existing.id)!, values, { updatedAt: new Date().toISOString() })
      else document.vehicles.push({ ...meta(), id, ...values })
    })
    onSaved?.(id)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-2xl"><form key={existing?.id ?? "new-vehicle"} onSubmit={submit} className="contents">
      <DialogHeader><DialogTitle>{existing ? "Modifica veicolo" : "Nuovo veicolo"}</DialogTitle><DialogDescription>I costi annuali qui indicati vengono recuperati nel costo chilometrico e non vanno duplicati nei costi aziendali.</DialogDescription></DialogHeader>
      <FieldGroup className="grid grid-cols-2">
        <Field><FieldLabel htmlFor="vehicle-name">Nome</FieldLabel><Input id="vehicle-name" name="name" defaultValue={vehicle.name} placeholder="Auto principale" autoFocus required /></Field>
        <Field><FieldLabel htmlFor="vehicle-fuel">Carburante</FieldLabel><NativeSelect id="vehicle-fuel" name="fuel" value={fuel} onChange={(event) => setFuel(event.target.value as Vehicle["fuel"])}>{(["Benzina", "Gasolio", "GPL", "Metano"] as const).map((value) => <NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}</NativeSelect></Field>
        <Field><FieldLabel htmlFor="vehicle-consumption">Consumo medio</FieldLabel><InputGroup><InputGroupInput id="vehicle-consumption" name="consumption" type="number" defaultValue={vehicle.consumption} min={0.01} step={0.01} required /><InputGroupAddon align="inline-end"><InputGroupText>{fuel === "Metano" ? "kg/100 km" : "km/l"}</InputGroupText></InputGroupAddon></InputGroup></Field>
        <Field><FieldLabel htmlFor="vehicle-km">Percorrenza annua</FieldLabel><InputGroup><InputGroupInput id="vehicle-km" name="annualKm" type="number" defaultValue={vehicle.annualKm} min={1} step={0.1} required /><InputGroupAddon align="inline-end"><InputGroupText>km</InputGroupText></InputGroupAddon></InputGroup></Field>
        {([['annualInsurance', 'Assicurazione annua', vehicle.annualInsurance], ['annualTax', 'Bollo annuo', vehicle.annualTax], ['annualMaintenance', 'Manutenzione annua', vehicle.annualMaintenance]] as const).map(([name, label, value]) => <Field key={name}><FieldLabel htmlFor={`vehicle-${name}`}>{label}</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id={`vehicle-${name}`} name={name} defaultValue={moneyInputValue(value)} inputMode="decimal" required /></InputGroup></Field>)}
      </FieldGroup>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button><Button type="submit">{existing ? "Aggiorna veicolo" : "Crea veicolo"}</Button></DialogFooter>
    </form></DialogContent></Dialog>
  )
}
