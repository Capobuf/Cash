import { useState, type FormEvent } from "react"
import { calculateVehicleCost } from "../../domain/calculations"
import { meta, type CashDocument, type Vehicle } from "../../domain/model"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Field, MoneyField, Option, SelectField, SuffixField } from "@/components/FormControls"
import { dateIt, decimalInputValue, eur, formatNumber, formReader } from "@/lib/format"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

const promptRequired = (message: string, initial = ""): string | undefined => window.prompt(message, initial)?.trim() || undefined

export function ResourcesView({ doc, appState, requestDelete }: {
  doc: CashDocument
  appState: AppState
  requestDelete: (target: DeleteTarget) => void
}) {
  const [editingVehicleId, setEditingVehicleId] = useState<string>()
  const [vehicleCostPreviews, setVehicleCostPreviews] = useState<Record<string, { costPerKm: string; referenceDate: string }>>({})
  const editingVehicle = doc.vehicles.find((vehicle) => vehicle.id === editingVehicleId)
  const vehicle = editingVehicle ?? { name: "", fuel: "Benzina" as const, consumption: "6.00", annualKm: "10000", annualInsurance: "0.00", annualTax: "0.00", annualMaintenance: "0.00" }
  const annualCosts = doc.businessCosts.reduce((sum, cost) => sum + Number(cost.monthlyAmount) * 12, 0).toFixed(2)

  const addCost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { get, money } = formReader(event.currentTarget)
    appState.mutate((document) => document.businessCosts.push({ ...meta(), category: get("category"), description: get("description"), monthlyAmount: Number(money("monthlyAmount")).toFixed(2) }))
    event.currentTarget.reset()
  }

  const editCost = (id: string) => {
    const cost = doc.businessCosts.find((candidate) => candidate.id === id)
    if (!cost) return
    const category = promptRequired("Categoria", cost.category)
    const description = promptRequired("Descrizione", cost.description)
    const amount = promptRequired("Importo mensile (€)", cost.monthlyAmount)
    const parsedAmount = Number(decimalInputValue(amount ?? ""))
    if (!category || !description || !Number.isFinite(parsedAmount) || parsedAmount < 0) return
    appState.mutate((document) => Object.assign(document.businessCosts.find((candidate) => candidate.id === id)!, { category, description, monthlyAmount: parsedAmount.toFixed(2), updatedAt: new Date().toISOString() }))
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

  const editSite = (id: string) => {
    const site = doc.sites.find((candidate) => candidate.id === id)
    if (!site) return
    const name = promptRequired("Nome Sede", site.name)
    const address = promptRequired("Indirizzo", site.address)
    const km = window.prompt("Km sola andata (vuoto = non configurati)", site.oneWayKm ?? "")
    const clientChoice = window.prompt(`Cliente: P conserva, 0 nessuno, oppure numero Cliente locale\n${doc.localClients.map((client, index) => `${index + 1}. ${client.displayName}`).join("\n")}`, "P")
    if (!name || !address || km === null || clientChoice === null) return
    const selected = doc.localClients[Number(clientChoice) - 1]
    appState.mutate((document) => {
      const target = document.sites.find((candidate) => candidate.id === id)!
      target.name = name; target.address = address; target.oneWayKm = km.trim() ? Number(km).toFixed(1) : undefined
      if (clientChoice.toLocaleUpperCase("it") === "P") { /* conserva */ }
      else if (clientChoice === "0") target.client = undefined
      else if (selected) target.client = { source: "local", localClientId: selected.id, displayName: selected.displayName }
      target.updatedAt = new Date().toISOString()
    })
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
    <>
      <div className="resource-summary"><div><span>Costi aziendali annui</span><strong>{eur(annualCosts)}</strong></div><div><span>Veicoli configurati</span><strong>{doc.vehicles.length}</strong></div><div><span>Sedi operative</span><strong>{doc.sites.length}</strong></div></div>
      <div className="app-grid resource-grid">
        <Card className="card"><CardHeader><span className="eyebrow">Spese ricorrenti</span><CardTitle>Costi aziendali</CardTitle></CardHeader><CardContent>
          <form className="form-grid" onSubmit={addCost}><Field label="Categoria" name="category" placeholder="es. Software" required /><Field label="Descrizione" name="description" placeholder="es. Gestionale" required /><MoneyField label="Importo mensile" name="monthlyAmount" value="0.00" required /><Button type="submit" className="full">Aggiungi costo</Button></form>
          <Separator className="section-divider" />
          {doc.businessCosts.length ? <div className="list">{doc.businessCosts.map((cost) => <div className="row" key={cost.id}><div className="row-main"><div className="row-title">{cost.category} · {cost.description}</div><div className="row-detail">{eur(cost.monthlyAmount)} al mese</div></div><div className="row-actions"><Button variant="secondary" size="sm" onClick={() => editCost(cost.id)}>Modifica</Button><Button variant="destructive" size="sm" onClick={() => requestDelete({ kind: "cost", id: cost.id, label: cost.description })}>Elimina</Button></div></div>)}</div> : <div className="empty">Nessun elemento</div>}
        </CardContent></Card>
        <Card className={`card wide ${editingVehicle ? "editing" : ""}`}><CardHeader className="section-heading"><div><span className="eyebrow">Mobilità</span><CardTitle>{editingVehicle ? "Modifica veicolo" : "Veicoli"}</CardTitle></div>{editingVehicle ? <Badge variant="secondary">Modifica in corso</Badge> : null}</CardHeader><CardContent>
          <form key={editingVehicleId ?? "new"} className="form-grid vehicle-form" onSubmit={saveVehicle}>
            <Field label="Nome veicolo" name="name" value={vehicle.name} autoComplete="off" placeholder="es. Auto principale" required />
            <SelectField label="Carburante" name="fuel" value={vehicle.fuel} required>{(["Benzina", "Gasolio", "GPL", "Metano"] as const).map((fuel) => <Option key={fuel} value={fuel}>{fuel}</Option>)}</SelectField>
            <SuffixField label="Consumo medio" name="consumption" value={vehicle.consumption} suffix={vehicle.fuel === "Metano" ? "kg / 100 km" : "l / 100 km"} min={0.01} step={0.01} required />
            <SuffixField label="Percorrenza annua" name="annualKm" value={vehicle.annualKm} suffix="km" min={1} step={0.1} required />
            <MoneyField label="Assicurazione annua" name="annualInsurance" value={vehicle.annualInsurance} required /><MoneyField label="Bollo annuo" name="annualTax" value={vehicle.annualTax} required /><MoneyField label="Manutenzione annua" name="annualMaintenance" value={vehicle.annualMaintenance} required />
            <div className="full actions form-actions"><Button type="submit">{editingVehicle ? "Salva modifiche" : "Aggiungi veicolo"}</Button>{editingVehicle ? <Button type="button" variant="ghost" onClick={() => setEditingVehicleId(undefined)}>Annulla</Button> : null}</div>
          </form>
          <Separator className="section-divider" />
          {doc.vehicles.length ? <div className="list">{doc.vehicles.map((entry) => { const preview = vehicleCostPreviews[entry.id]; const fixed = (Number(entry.annualInsurance) + Number(entry.annualTax) + Number(entry.annualMaintenance)).toFixed(2); return <div className={`row ${editingVehicleId === entry.id ? "selected" : ""}`} key={entry.id}><div className="row-main"><div className="row-title">{entry.name || "Veicolo senza nome"}</div><div className="row-detail"><span>{entry.fuel}</span><span>{formatNumber(entry.consumption, 2)} {entry.consumptionUnit}</span><span>{formatNumber(entry.annualKm)} km/anno</span><span>{eur(fixed)} costi fissi</span>{preview ? <span className="highlight">{eur(preview.costPerKm)}/km · dato {dateIt(preview.referenceDate)}</span> : null}</div></div><div className="row-actions"><Button variant="secondary" size="sm" onClick={() => setEditingVehicleId(entry.id)}>Modifica</Button><Button variant="secondary" size="sm" onClick={() => void checkVehicleCost(entry.id)}>Costo/km</Button><Button variant="destructive" size="sm" onClick={() => requestDelete({ kind: "vehicle", id: entry.id, label: entry.name })}>Elimina</Button></div></div> })}</div> : <div className="empty small-empty"><strong>Nessun veicolo configurato</strong><span>Aggiungine uno per calcolare il costo reale delle trasferte.</span></div>}
        </CardContent></Card>
        <Card className="card full"><CardHeader><span className="eyebrow">Luoghi di lavoro</span><CardTitle>Sedi operative</CardTitle></CardHeader><CardContent>
          <form className="form-grid site-form" onSubmit={addSite}><Field label="Nome sede" name="name" placeholder="es. Sede cliente" required /><Field label="Indirizzo" name="address" placeholder="Via, città" required /><SelectField label="Cliente locale associato" name="localClientId"><Option value="">Nessuno</Option>{doc.localClients.map((client) => <Option key={client.id} value={client.id}>{client.displayName}</Option>)}</SelectField><SuffixField label="Distanza sola andata" name="oneWayKm" suffix="km" min={0} step={0.1} /><Button type="submit" className="full">Aggiungi sede</Button></form>
          <Separator className="section-divider" />
          {doc.sites.length ? <div className="list">{doc.sites.map((site) => <div className="row" key={site.id}><div><strong>{site.name}</strong><div className="row-detail"><span>{site.address}</span>{site.oneWayKm !== undefined ? <span>{formatNumber(site.oneWayKm, 1)} km sola andata</span> : null}<span>{site.client?.displayName ?? "Nessun cliente associato"}</span></div></div><div className="row-actions"><Button variant="secondary" size="sm" onClick={() => editSite(site.id)}>Modifica</Button>{doc.settings.fic.enabled ? <Button variant="secondary" size="sm" onClick={() => void associateRemoteSite(site.id)}>Cliente FIC</Button> : null}<Button variant="destructive" size="sm" onClick={() => requestDelete({ kind: "site", id: site.id, label: site.name })}>Elimina</Button></div></div>)}</div> : <div className="empty small-empty"><strong>Nessuna sede configurata</strong><span>Le sedi permettono di riutilizzare indirizzi e distanze.</span></div>}
        </CardContent></Card>
      </div>
    </>
  )
}
