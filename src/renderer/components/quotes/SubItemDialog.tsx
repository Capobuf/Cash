import { MapPin, Plus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { routeValuesRequireOverwriteConfirmation, valuesFromRoute } from "../../../domain/calculations"
import { parseDuration } from "../../../domain/duration"
import { siteHasUsableLocation } from "../../../domain/locations"
import { type CashDocument, type FicClientSnapshot, type QuoteSubItem } from "../../../domain/model"
import { SiteDialog, VehicleDialog } from "@/components/EntityDialogs"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { formReader, hours, moneyInputValue } from "@/lib/format"
import type { TravelInput, SimpleSubInput } from "@/hooks/use-quote-controller"
import type { AppState } from "../../state"

export function SubItemDialog({ sub, initialKind, doc, appState, quoteClient, defaultDestinationSiteId, onClose, onSaveSimple, onSaveTravel }: { sub?: QuoteSubItem; initialKind?: "time" | "expense" | "travel"; doc: CashDocument; appState: AppState; quoteClient?: FicClientSnapshot; defaultDestinationSiteId?: string; onClose: () => void; onSaveSimple: (input: SimpleSubInput) => boolean; onSaveTravel: (input: TravelInput) => Promise<boolean> }) {
  const kind = sub?.kind ?? initialKind ?? "time"
  const travel = sub?.kind === "travel" ? sub : undefined
  const [departureSiteId, setDepartureSiteId] = useState(travel?.departure?.sourceId ?? doc.settings.defaultDepartureSiteId ?? "")
  const [destinationSiteId, setDestinationSiteId] = useState(travel?.destination?.sourceId ?? defaultDestinationSiteId ?? "")
  const [vehicleId, setVehicleId] = useState(travel?.vehicleId ?? doc.settings.defaultVehicleId ?? "")
  const [roundTrip, setRoundTrip] = useState(travel?.roundTrip ?? true)
  const [distance, setDistance] = useState(travel?.distanceKmPerOccurrence ?? "")
  const [minutes, setMinutes] = useState(travel?.travelMinutesPerOccurrence === undefined ? "" : hours(travel.travelMinutesPerOccurrence))
  const [distanceSource, setDistanceSource] = useState<"route" | "manual" | undefined>(travel?.distanceSource)
  const [durationSource, setDurationSource] = useState<"route" | "manual" | undefined>(travel?.durationSource)
  const [siteOpen, setSiteOpen] = useState(false)
  const [vehicleOpen, setVehicleOpen] = useState(false)
  const [confirmRecalculation, setConfirmRecalculation] = useState(false)
  const [busy, setBusy] = useState(false)
  const [durationError, setDurationError] = useState<string>()
  const destinationSites = quoteClient ? doc.sites.filter((site) => site.client?.companyId === quoteClient.companyId && site.client.clientId === quoteClient.clientId) : []

  const calculateRoute = async (overwrite = false) => {
    const departure = doc.sites.find((site) => site.id === departureSiteId)
    const destination = doc.sites.find((site) => site.id === destinationSiteId)
    if (!departure || !destination || !siteHasUsableLocation(departure) || !siteHasUsableLocation(destination)) {
      appState.setError({ code: "MISSING_DATA", source: "OpenRouteService", message: "Partenza e Destinazione devono avere coordinate risolte.", action: "Apri la Sede, esegui Cerca e scegli un risultato." })
      return
    }
    if (routeValuesRequireOverwriteConfirmation(distance, minutes) && !overwrite) { setConfirmRecalculation(true); return }
    setBusy(true)
    const result = await window.cash.ors.route({ departure: departure.location!.coordinates, destination: destination.location!.coordinates })
    if (!result.ok) appState.setError(result.error)
    else {
      const values = valuesFromRoute(result.value, roundTrip)
      if (!values.ok) appState.setError(values.error)
      else { setDistance(values.value.distanceKmPerOccurrence); setMinutes(String(values.value.travelMinutesPerOccurrence)); setDistanceSource("route"); setDurationSource("route") }
    }
    setBusy(false)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const { get, money } = formReader(event.currentTarget)
    if (kind === "time") {
      const duration = parseDuration(get("minutes"))
      if (!duration.ok) { setDurationError(duration.error.message); return }
      if (onSaveSimple({ kind, description: get("description"), minutes: duration.value })) onClose()
      return
    }
    if (kind === "expense") { if (onSaveSimple({ kind, description: get("description"), amount: money("amount") })) onClose(); return }
    const parsedTravelDuration = minutes ? parseDuration(minutes) : undefined
    if (parsedTravelDuration && !parsedTravelDuration.ok) { setDurationError(parsedTravelDuration.error.message); return }
    const occurrences = Number(get("occurrences")); const distanceValue = distance ? Number(distance.replace(",", ".")) : undefined; const minutesValue = parsedTravelDuration?.ok ? parsedTravelDuration.value : undefined
    if (!Number.isInteger(occurrences) || occurrences <= 0 || (distanceValue !== undefined && (!Number.isFinite(distanceValue) || distanceValue < 0)) || (minutesValue !== undefined && (!Number.isInteger(minutesValue) || minutesValue <= 0))) { appState.setError({ code: "VALIDATION", field: "travel", message: "Occorrenze, distanza o tempo della Trasferta non sono validi." }); return }
    setBusy(true)
    const saved = await onSaveTravel({
      description: get("description"), departureSiteId: departureSiteId || undefined, destinationSiteId: destinationSiteId || undefined,
      vehicleId: vehicleId || undefined, roundTrip, occurrences,
      ...(distanceValue !== undefined ? { distanceKmPerOccurrence: distanceValue.toFixed(1), distanceSource: distanceSource ?? "manual" } : {}),
      ...(minutesValue !== undefined ? { travelMinutesPerOccurrence: minutesValue, durationSource: durationSource ?? "manual" } : {}),
    })
    setBusy(false); if (saved) onClose()
  }

  const dialogTitle = sub
    ? `Modifica ${kind === "time" ? "attività" : kind === "expense" ? "spesa" : "trasferta"}`
    : `Aggiungi ${kind === "time" ? "attività" : kind === "expense" ? "spesa" : "trasferta"}`
  return <><Dialog open onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className={kind === "travel" ? "sm:max-w-2xl" : undefined}><form onSubmit={(event) => void submit(event)} className="contents"><DialogHeader><DialogTitle>{dialogTitle}</DialogTitle>{kind === "travel" ? <DialogDescription>Il percorso viene calcolato solo su richiesta e i valori manuali restano indipendenti.</DialogDescription> : null}</DialogHeader><FieldGroup><Field><FieldLabel htmlFor="sub-description">Descrizione</FieldLabel><Input id="sub-description" name="description" defaultValue={sub?.description} autoFocus required /></Field>{kind === "time" ? <Field><FieldLabel htmlFor="sub-minutes">Durata</FieldLabel><Input id="sub-minutes" name="minutes" defaultValue={sub?.kind === "time" ? hours(sub.minutes) : ""} placeholder="es. 2h 30m" onChange={() => setDurationError(undefined)} required />{durationError ? <FieldDescription className="text-destructive">{durationError}</FieldDescription> : <FieldDescription>Puoi usare minuti oppure ore e minuti.</FieldDescription>}</Field> : null}{kind === "expense" ? <Field><FieldLabel htmlFor="sub-amount">Importo</FieldLabel><Input id="sub-amount" name="amount" defaultValue={sub?.kind === "expense" ? moneyInputValue(sub.amount) : ""} inputMode="decimal" required /></Field> : null}{kind === "travel" ? <><div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="travel-departure">Partenza</FieldLabel><NativeSelect id="travel-departure" value={departureSiteId} onChange={(event) => setDepartureSiteId(event.target.value)}><NativeSelectOption value="">Scegli sede</NativeSelectOption>{doc.sites.map((site) => <NativeSelectOption key={site.id} value={site.id}>{site.name}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="travel-destination">Destinazione</FieldLabel><NativeSelect id="travel-destination" value={destinationSiteId} onChange={(event) => setDestinationSiteId(event.target.value)}><NativeSelectOption value="">{quoteClient ? "Scegli sede del cliente" : "Seleziona prima un cliente"}</NativeSelectOption>{destinationSites.map((site) => <NativeSelectOption key={site.id} value={site.id}>{site.name}</NativeSelectOption>)}</NativeSelect></Field></div><div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><Field><FieldLabel htmlFor="travel-vehicle">Veicolo</FieldLabel><NativeSelect id="travel-vehicle" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><NativeSelectOption value="">Scegli veicolo</NativeSelectOption>{doc.vehicles.map((vehicle) => <NativeSelectOption key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.fuel}</NativeSelectOption>)}</NativeSelect></Field><Button type="button" variant="outline" onClick={() => setVehicleOpen(true)}><Plus />Nuovo veicolo</Button></div><div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="travel-occurrences">Occorrenze</FieldLabel><Input id="travel-occurrences" name="occurrences" type="number" defaultValue={travel?.occurrences ?? 1} min={1} step={1} required /></Field><Field orientation="horizontal"><Checkbox id="travel-roundtrip" checked={roundTrip} onCheckedChange={(checked) => { setRoundTrip(Boolean(checked)); setDistance(""); setMinutes(""); setDistanceSource(undefined); setDurationSource(undefined); setDurationError(undefined) }} /><FieldLabel htmlFor="travel-roundtrip">Andata e ritorno</FieldLabel></Field></div><Button type="button" variant="secondary" onClick={() => void calculateRoute()} disabled={busy}><MapPin />{distanceSource === "route" || durationSource === "route" ? "Ricalcola percorso" : "Calcola percorso"}</Button><div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="travel-distance">{roundTrip ? "Distanza A/R" : "Distanza andata"}</FieldLabel><InputGroup><InputGroupInput id="travel-distance" value={distance} onChange={(event) => { setDistance(event.target.value); setDistanceSource("manual") }} inputMode="decimal" placeholder="0" /><InputGroupAddon align="inline-end"><InputGroupText>km</InputGroupText></InputGroupAddon></InputGroup></Field><Field><FieldLabel htmlFor="travel-duration">{roundTrip ? "Tempo di viaggio A/R" : "Tempo di viaggio andata"}</FieldLabel><Input id="travel-duration" value={minutes} onChange={(event) => { setMinutes(event.target.value); setDurationSource("manual"); setDurationError(undefined) }} placeholder="es. 45m" />{durationError ? <FieldDescription className="text-destructive">{durationError}</FieldDescription> : null}</Field></div><FieldDescription>Valori per singola occorrenza, modificabili indipendentemente. Le modifiche manuali non vengono sovrascritte senza conferma.</FieldDescription><Button type="button" variant="outline" onClick={() => setSiteOpen(true)}><Plus />Nuova sede</Button></> : null}</FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Annulla</Button><Button type="submit" disabled={busy}>{busy ? "Elaborazione…" : sub ? "Aggiorna" : kind === "time" ? "Aggiungi attività" : "Aggiungi"}</Button></DialogFooter></form></DialogContent></Dialog><SiteDialog open={siteOpen} onOpenChange={setSiteOpen} appState={appState} doc={doc} /><VehicleDialog open={vehicleOpen} onOpenChange={setVehicleOpen} appState={appState} onSaved={setVehicleId} /><AlertDialog open={confirmRecalculation} onOpenChange={setConfirmRecalculation}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Ricalcolare il percorso?</AlertDialogTitle><AlertDialogDescription>Distanza e tempo correnti verranno sostituiti dai nuovi valori OpenRouteService.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={() => void calculateRoute(true)}>Ricalcola e sostituisci</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>
}
