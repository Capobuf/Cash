import { useState, type FormEvent } from "react"
import { coordinatesInput, parseCoordinates } from "../../domain/locations"
import { meta, type BusinessCost, type CashDocument, type FicClientSnapshot, type GeocodingResult, type ResolvedLocation, type Site, type Vehicle } from "../../domain/model"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { formReader, moneyInputValue } from "@/lib/format"
import type { AppState } from "../state"

interface DialogBaseProps { open: boolean; onOpenChange: (open: boolean) => void; onSaved?: (id: string) => void }

export function CostDialog({ open, onOpenChange, appState, cost }: DialogBaseProps & { appState: AppState; cost?: BusinessCost }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const { get, money } = formReader(event.currentTarget); const amount = Number(money("monthlyAmount"))
    if (!get("category") || !get("description") || !Number.isFinite(amount) || amount < 0) { appState.setError({ code: "VALIDATION", message: "Completa categoria, descrizione e importo mensile." }); return }
    const id = cost?.id ?? meta().id
    appState.mutate((document) => { if (cost) Object.assign(document.businessCosts.find((entry) => entry.id === cost.id)!, { category: get("category"), description: get("description"), monthlyAmount: amount.toFixed(2), updatedAt: new Date().toISOString() }); else document.businessCosts.push({ ...meta(), id, category: get("category"), description: get("description"), monthlyAmount: amount.toFixed(2) }) })
    onOpenChange(false)
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form key={cost?.id ?? "new-cost"} onSubmit={submit} className="contents"><DialogHeader><DialogTitle>{cost ? "Modifica costo" : "Nuovo costo aziendale"}</DialogTitle><DialogDescription>Indica il valore medio mensile; Cash calcola il totale annuale.</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="cost-category">Categoria</FieldLabel><Input id="cost-category" name="category" defaultValue={cost?.category} required /></Field><Field><FieldLabel htmlFor="cost-description">Descrizione</FieldLabel><Input id="cost-description" name="description" defaultValue={cost?.description} required /></Field><Field><FieldLabel htmlFor="cost-amount">Importo mensile</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id="cost-amount" name="monthlyAmount" defaultValue={moneyInputValue(cost?.monthlyAmount ?? "0.00")} required /></InputGroup></Field></FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button><Button type="submit">Salva</Button></DialogFooter></form></DialogContent></Dialog>
}

export function SiteDialog({ open, onOpenChange, appState, site, fixedClient, onSaved }: DialogBaseProps & { appState: AppState; doc: CashDocument; site?: Site; fixedClient?: FicClientSnapshot }) {
  const [mode, setMode] = useState<"address" | "coordinates">(site?.location?.inputKind ?? "address")
  const [address, setAddress] = useState(site?.address ?? "")
  const [coordinateText, setCoordinateText] = useState(site?.location ? coordinatesInput(site.location.coordinates) : "")
  const [resolved, setResolved] = useState<ResolvedLocation | undefined>(() => site?.location?.inputKind === "coordinates" ? { ...site.location, inputValue: coordinatesInput(site.location.coordinates) } : site?.location)
  const [results, setResults] = useState<GeocodingResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState("")

  const choose = (result: GeocodingResult) => { setAddress(result.label); setCoordinateText(coordinatesInput(result.coordinates)); setResolved({ coordinates: result.coordinates, inputKind: "address", inputValue: result.label }); setResults([]); setSearchError("") }
  const search = async () => {
    setSearching(true); setSearchError(""); setResults([])
    if (mode === "address") {
      const response = await window.cash.ors.searchAddress(address)
      setSearching(false)
      if (!response.ok) { setSearchError(response.error.message); return }
      if (!response.value.length) { setSearchError("Nessun risultato trovato per l’indirizzo."); return }
      setResults(response.value); return
    }
    const parsed = parseCoordinates(coordinateText)
    if (!parsed.ok) { setSearching(false); setSearchError(parsed.error.message); return }
    const response = await window.cash.ors.reverseCoordinates(parsed.value); setSearching(false)
    if (!response.ok) { setSearchError(response.error.message); return }
    const label = response.value[0]?.label
    if (label) setAddress(label)
    const normalized = coordinatesInput(parsed.value); setCoordinateText(normalized); setResolved({ coordinates: parsed.value, inputKind: "coordinates", inputValue: normalized })
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name") ?? "").trim()
    if (!name || (!address.trim() && !coordinateText.trim())) { appState.setError({ code: "VALIDATION", message: "Inserisci nome e almeno un indirizzo o coordinate." }); return }
    let location = resolved
    if (location?.inputKind === "address" && location.inputValue !== address.trim()) location = undefined
    if (location?.inputKind === "coordinates" && location.inputValue !== coordinateText.trim()) location = undefined
    const id = site?.id ?? meta().id
    appState.mutate((document) => { const values = { name, address: address.trim() || undefined, location, client: fixedClient ? { source: "fatture_in_cloud" as const, companyId: fixedClient.companyId, clientId: fixedClient.clientId, displayName: fixedClient.displayName } : site?.client }; if (site) Object.assign(document.sites.find((entry) => entry.id === site.id)!, values, { updatedAt: new Date().toISOString() }); else document.sites.push({ ...meta(), id, ...values }) })
    onSaved?.(id); onOpenChange(false)
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-2xl"><form key={site?.id ?? "new-site"} onSubmit={submit} className="contents"><DialogHeader><DialogTitle>{site ? "Modifica sede" : "Nuova sede"}</DialogTitle><DialogDescription>Localizza la Sede con un’azione esplicita. Nessuna ricerca viene eseguita mentre digiti.</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="site-name">Nome</FieldLabel><Input id="site-name" name="name" defaultValue={site?.name} required /></Field><Field><FieldLabel htmlFor="site-mode">Cerca tramite</FieldLabel><NativeSelect id="site-mode" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><NativeSelectOption value="address">Indirizzo</NativeSelectOption><NativeSelectOption value="coordinates">Coordinate</NativeSelectOption></NativeSelect></Field>{mode === "address" ? <Field><FieldLabel htmlFor="site-address">Indirizzo</FieldLabel><Input id="site-address" value={address} onChange={(event) => { setAddress(event.target.value); setResolved(undefined) }} placeholder="Via, città" /><FieldDescription>Dopo una modifica usa di nuovo Cerca prima del routing.</FieldDescription></Field> : <Field><FieldLabel htmlFor="site-coordinates">Coordinate</FieldLabel><Input id="site-coordinates" value={coordinateText} onChange={(event) => { setCoordinateText(event.target.value); setResolved(undefined) }} placeholder="41.4682252, 14.5621986" /><FieldDescription>Formato Google Maps: latitudine, longitudine.</FieldDescription></Field>}<Button type="button" variant="secondary" onClick={() => void search()} disabled={searching}>{searching ? "Ricerca…" : "Cerca"}</Button>{searchError ? <Alert variant="destructive"><AlertDescription>{searchError}</AlertDescription></Alert> : null}{results.length ? <div className="space-y-2" role="listbox" aria-label="Risultati indirizzo">{results.map((result) => <Button key={result.id} type="button" variant="outline" className="h-auto w-full justify-start whitespace-normal py-3 text-left" onClick={() => choose(result)}>{result.label}</Button>)}</div> : null}<Field><FieldLabel>Cliente</FieldLabel><div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{fixedClient?.displayName ?? site?.client?.displayName ?? "Nessuno — Altre sedi"}</div></Field></FieldGroup><DialogFooter>{site ? <Button type="button" variant="secondary" className="mr-auto" onClick={() => appState.mutate((document) => { document.settings.defaultDepartureSiteId = site.id })}>Imposta come partenza predefinita</Button> : null}<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button><Button type="submit">Salva sede</Button></DialogFooter></form></DialogContent></Dialog>
}

const blankVehicle: Pick<Vehicle, "name" | "fuel" | "consumption" | "annualKm" | "annualInsurance" | "annualTax" | "annualMaintenance"> = { name: "", fuel: "Benzina", consumption: "16.67", annualKm: "10000", annualInsurance: "0.00", annualTax: "0.00", annualMaintenance: "0.00" }
export function VehicleDialog({ open, onOpenChange, appState, vehicle: existing, onSaved }: DialogBaseProps & { appState: AppState; vehicle?: Vehicle }) {
  const vehicle = existing ?? blankVehicle; const [fuel, setFuel] = useState<Vehicle["fuel"]>(vehicle.fuel)
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const { get, money } = formReader(event.currentTarget); const id = existing?.id ?? meta().id; const consumption = Number(get("consumption")); const annualKm = Number(get("annualKm")); const costs = [Number(money("annualInsurance")), Number(money("annualTax")), Number(money("annualMaintenance"))]; if (!get("name") || consumption <= 0 || annualKm <= 0 || costs.some((value) => !Number.isFinite(value) || value < 0)) { appState.setError({ code: "VALIDATION", message: "I dati del veicolo non sono validi." }); return } const values = { name: get("name"), fuel: get("fuel") as Vehicle["fuel"], consumption: get("consumption"), consumptionUnit: get("fuel") === "Metano" ? "kg/100km" as const : "km/l" as const, annualKm: get("annualKm"), annualInsurance: costs[0]!.toFixed(2), annualTax: costs[1]!.toFixed(2), annualMaintenance: costs[2]!.toFixed(2) }; appState.mutate((document) => { if (existing) Object.assign(document.vehicles.find((entry) => entry.id === existing.id)!, values, { updatedAt: new Date().toISOString() }); else document.vehicles.push({ ...meta(), id, ...values }) }); onSaved?.(id); onOpenChange(false) }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-2xl"><form key={existing?.id ?? "new-vehicle"} onSubmit={submit} className="contents"><DialogHeader><DialogTitle>{existing ? "Modifica veicolo" : "Nuovo veicolo"}</DialogTitle><DialogDescription>I costi annuali confluiscono nel costo chilometrico e non vanno duplicati nei costi aziendali.</DialogDescription></DialogHeader><FieldGroup className="grid grid-cols-2"><Field><FieldLabel htmlFor="vehicle-name">Nome</FieldLabel><Input id="vehicle-name" name="name" defaultValue={vehicle.name} required /></Field><Field><FieldLabel htmlFor="vehicle-fuel">Carburante</FieldLabel><NativeSelect id="vehicle-fuel" name="fuel" value={fuel} onChange={(event) => setFuel(event.target.value as Vehicle["fuel"])}>{(["Benzina", "Gasolio", "GPL", "Metano"] as const).map((value) => <NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}</NativeSelect></Field><NumberInput id="consumption" label="Consumo medio" value={vehicle.consumption} suffix={fuel === "Metano" ? "kg/100 km" : "km/l"} /><NumberInput id="annualKm" label="Percorrenza annua" value={vehicle.annualKm} suffix="km" />{([['annualInsurance', 'Assicurazione annua', vehicle.annualInsurance], ['annualTax', 'Bollo annuo', vehicle.annualTax], ['annualMaintenance', 'Manutenzione annua', vehicle.annualMaintenance]] as const).map(([name, label, value]) => <Field key={name}><FieldLabel htmlFor={`vehicle-${name}`}>{label}</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id={`vehicle-${name}`} name={name} defaultValue={moneyInputValue(value)} required /></InputGroup></Field>)}</FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button><Button type="submit">Salva veicolo</Button></DialogFooter></form></DialogContent></Dialog>
}
function NumberInput({ id, label, value, suffix }: { id: string; label: string; value: string; suffix: string }) { return <Field><FieldLabel htmlFor={`vehicle-${id}`}>{label}</FieldLabel><InputGroup><InputGroupInput id={`vehicle-${id}`} name={id} type="number" defaultValue={value} min={0.01} step={0.01} required /><InputGroupAddon align="inline-end"><InputGroupText>{suffix}</InputGroupText></InputGroupAddon></InputGroup></Field> }
