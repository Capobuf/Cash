import { CalendarPlus, CheckCircle2, Copy, MoreHorizontal } from "lucide-react"
import { useState, type FormEvent } from "react"
import { previewProfile, type ProfileAnalysis } from "../../domain/calculations"
import { confirmProfile, saveProfileRevision } from "../../domain/profiles"
import type { CashDocument, EconomicProfile, LocalHoliday } from "../../domain/model"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { eur, formReader, moneyInputValue } from "@/lib/format"
import type { AppState } from "../state"

function draftFromForm(source: EconomicProfile, form: HTMLFormElement, localHolidays: LocalHoliday[]): EconomicProfile {
  const { data, get, money } = formReader(form)
  const draft = structuredClone(source)
  draft.year = Number(get("year"))
  draft.revenueTarget = Number(money("revenueTarget")).toFixed(2)
  draft.specificAnnualExpenses = Number(money("specificAnnualExpenses")).toFixed(2)
  Object.assign(draft.capacity, {
    hoursPerDay: get("hoursPerDay"), clientTimePercentage: get("clientTimePercentage"),
    vacationDays: Number(get("vacationDays")), unplannedDays: Number(get("unplannedDays")),
    travelSpeedKmh: get("travelSpeedKmh") || undefined, localHolidays,
  })
  Object.assign(draft.fiscal, {
    atecoCode: get("atecoCode"), profitabilityCoefficient: get("profitabilityCoefficient"), contributionRate: get("contributionRate"),
    contributionCeiling: Number(money("contributionCeiling")).toFixed(2), activityPhase: get("activityPhase") as EconomicProfile["fiscal"]["activityPhase"],
    reducedEligibilityConfirmed: data.get("reducedEligibilityConfirmed") === "on", ordinaryApplicabilityConfirmed: data.get("ordinaryApplicabilityConfirmed") === "on",
    reducedSubstituteTaxRate: get("reducedSubstituteTaxRate"), ordinarySubstituteTaxRate: get("ordinarySubstituteTaxRate"),
    ordinaryThreshold: Number(money("ordinaryThreshold")).toFixed(2), cessationThreshold: Number(money("cessationThreshold")).toFixed(2),
  })
  return draft
}

export function ProfileEditor({ profile, doc, appState, onCopy }: { profile: EconomicProfile; doc: CashDocument; appState: AppState; onCopy: (id: string) => void }) {
  const [holidays, setHolidays] = useState<LocalHoliday[]>(() => structuredClone(profile.capacity.localHolidays))
  const [holidayIndex, setHolidayIndex] = useState<number | null>()
  const [preview, setPreview] = useState<{ value?: ProfileAnalysis; error?: string }>(() => {
    const result = previewProfile(profile, doc.businessCosts)
    return result.ok ? { value: result.value } : { error: result.error.message }
  })
  const editingHoliday = typeof holidayIndex === "number" ? holidays[holidayIndex] : undefined

  const updatePreview = (event: FormEvent<HTMLFormElement>) => {
    const result = previewProfile(draftFromForm(profile, event.currentTarget, holidays), doc.businessCosts)
    setPreview(result.ok ? { value: result.value } : { error: result.error.message })
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const draft = draftFromForm(profile, event.currentTarget, holidays)
    if (doc.profiles.some((entry) => entry.id !== profile.id && entry.year === draft.year)) {
      appState.setError({ code: "CONFLICT", field: "profile.year", message: `Esiste già un profilo per il ${draft.year}.`, action: "Scegli un anno diverso o modifica il profilo esistente." })
      return
    }
    let saved = saveProfileRevision(profile, draft)
    const action = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    if (action?.value === "confirm") {
      const confirmed = confirmProfile(saved, doc.businessCosts)
      if (!confirmed.ok) { appState.setError(confirmed.error); return }
      saved = confirmed.value
    }
    appState.mutate((document) => { document.profiles[document.profiles.findIndex((entry) => entry.id === profile.id)] = saved })
  }

  return (
    <Card><CardHeader><div><CardTitle className="flex items-center gap-2">Profilo {profile.year}<Badge variant={profile.confirmed ? "default" : "secondary"}>{profile.confirmed ? "Confermato" : "Da verificare"}</Badge></CardTitle><CardDescription>Le modifiche creano una nuova revisione e richiedono una nuova conferma.</CardDescription></div><CardAction><Button variant="outline" onClick={() => onCopy(profile.id)}><Copy />Copia per nuovo anno</Button></CardAction></CardHeader><CardContent>
      <form onSubmit={submit} onInput={updatePreview} className="space-y-5">
        <Tabs defaultValue="goals" className="space-y-5">
          <TabsList><TabsTrigger value="goals">Obiettivi</TabsTrigger><TabsTrigger value="capacity">Capacità lavorativa</TabsTrigger><TabsTrigger value="fiscal">Fiscalità</TabsTrigger><TabsTrigger value="preview">Anteprima</TabsTrigger></TabsList>
          <TabsContent value="goals"><Section title="Obiettivi annuali" description="Il fatturato da generare con il tempo esclude le spese specifiche previste."><FieldGroup className="grid grid-cols-3">
            <Field><FieldLabel htmlFor="profile-year">Anno fiscale</FieldLabel><Input id="profile-year" name="year" type="number" defaultValue={profile.year} min={2000} max={2200} required /></Field>
            <MoneyField id="revenueTarget" label="Fatturato obiettivo" value={profile.revenueTarget} />
            <MoneyField id="specificAnnualExpenses" label="Spese specifiche annue" value={profile.specificAnnualExpenses} />
          </FieldGroup></Section></TabsContent>
          <TabsContent value="capacity" className="space-y-4"><Section title="Capacità lavorativa" description="Disponibilità reale dedicabile ai lavori dei clienti."><FieldGroup className="grid grid-cols-3">
            <NumberField id="hoursPerDay" label="Ore al giorno" value={profile.capacity.hoursPerDay} suffix="ore" step={0.01} max={24} />
            <NumberField id="clientTimePercentage" label="Tempo dedicabile ai clienti" value={profile.capacity.clientTimePercentage} suffix="%" step={0.0001} max={100} />
            <NumberField id="vacationDays" label="Ferie" value={profile.capacity.vacationDays} suffix="giorni" step={1} />
            <NumberField id="unplannedDays" label="Malattia e imprevisti" value={profile.capacity.unplannedDays} suffix="giorni" step={1} />
            <NumberField id="travelSpeedKmh" label="Velocità media trasferta" value={profile.capacity.travelSpeedKmh ?? ""} suffix="km/h" step={0.1} required={false} />
          </FieldGroup></Section>
          <div className="rounded-lg border"><div className="flex items-center justify-between border-b p-4"><div><p className="font-medium">Festività locali</p><p className="text-sm text-muted-foreground">Date ricorrenti o specifiche per l’anno.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setHolidayIndex(null)}><CalendarPlus />Aggiungi</Button></div>{holidays.length ? <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Data</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{holidays.map((holiday, index) => <TableRow key={`${holiday.name}-${index}`}><TableCell className="font-medium">{holiday.name}</TableCell><TableCell>{holiday.kind === "recurring" ? "Ricorrente" : "Specifica"}</TableCell><TableCell>{holiday.kind === "recurring" ? `${String(holiday.day).padStart(2, "0")}/${String(holiday.month).padStart(2, "0")}` : holiday.date}</TableCell><TableCell><DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Azioni per ${holiday.name}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setHolidayIndex(index)}>Modifica</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setHolidays((current) => current.filter((_, candidate) => candidate !== index))}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <p className="p-6 text-center text-sm text-muted-foreground">Nessuna festività locale configurata.</p>}</div>
          </TabsContent>
          <TabsContent value="fiscal"><Section title="Parametri fiscali" description="Verifica questi dati con il tuo consulente prima di confermare."><FieldGroup className="grid grid-cols-3">
            <Field><FieldLabel htmlFor="atecoCode">Codice ATECO 2025</FieldLabel><Input id="atecoCode" name="atecoCode" defaultValue={profile.fiscal.atecoCode} required /></Field>
            <NumberField id="profitabilityCoefficient" label="Coefficiente di redditività" value={profile.fiscal.profitabilityCoefficient} suffix="%" step={0.0001} max={100} />
            <NumberField id="contributionRate" label="Aliquota Gestione Separata" value={profile.fiscal.contributionRate} suffix="%" step={0.0001} max={100} />
            <MoneyField id="contributionCeiling" label="Massimale contributivo" value={profile.fiscal.contributionCeiling} />
            <Field><FieldLabel htmlFor="activityPhase">Fase attività</FieldLabel><NativeSelect id="activityPhase" name="activityPhase" defaultValue={profile.fiscal.activityPhase}><NativeSelectOption value="ordinary">Oltre i primi 5 periodi / non spettante</NativeSelectOption><NativeSelectOption value="reduced_eligible">Primi 5 periodi · agevolazione spettante</NativeSelectOption></NativeSelect></Field>
            <NumberField id="reducedSubstituteTaxRate" label="Aliquota agevolata" value={profile.fiscal.reducedSubstituteTaxRate} suffix="%" step={0.0001} max={100} />
            <NumberField id="ordinarySubstituteTaxRate" label="Aliquota ordinaria" value={profile.fiscal.ordinarySubstituteTaxRate} suffix="%" step={0.0001} max={100} />
            <MoneyField id="ordinaryThreshold" label="Soglia ordinaria" value={profile.fiscal.ordinaryThreshold} />
            <MoneyField id="cessationThreshold" label="Soglia di cessazione" value={profile.fiscal.cessationThreshold} />
            <Field orientation="horizontal" className="col-span-3"><Checkbox id="reducedEligibilityConfirmed" name="reducedEligibilityConfirmed" defaultChecked={profile.fiscal.reducedEligibilityConfirmed} /><FieldLabel htmlFor="reducedEligibilityConfirmed">Confermo di possedere i requisiti per l’aliquota agevolata</FieldLabel></Field>
            <Field orientation="horizontal" className="col-span-3"><Checkbox id="ordinaryApplicabilityConfirmed" name="ordinaryApplicabilityConfirmed" defaultChecked={profile.fiscal.ordinaryApplicabilityConfirmed} /><FieldLabel htmlFor="ordinaryApplicabilityConfirmed">Confermo l’applicabilità oltre la soglia ordinaria</FieldLabel></Field>
          </FieldGroup></Section></TabsContent>
          <TabsContent value="preview"><Preview value={preview.value} error={preview.error} /></TabsContent>
        </Tabs>
        <div className="flex items-center justify-between border-t pt-5"><p className="max-w-2xl text-xs text-muted-foreground">Cash fornisce una stima interna per la preventivazione e non sostituisce il commercialista.</p><div className="flex gap-2"><Button type="submit" name="profileAction" value="save" variant="secondary">Salva come Da verificare</Button><Button type="submit" name="profileAction" value="confirm"><CheckCircle2 />Conferma profilo</Button></div></div>
      </form>
      {holidayIndex !== undefined ? <HolidayDialog open value={editingHoliday} onOpenChange={(open) => { if (!open) setHolidayIndex(undefined) }} onSave={(holiday) => { setHolidays((current) => holidayIndex === null ? [...current, holiday] : current.map((entry, index) => index === holidayIndex ? holiday : entry)); setHolidayIndex(undefined) }} /> : null}
    </CardContent></Card>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <div className="space-y-4 rounded-lg border p-5"><div><h3 className="font-medium">{title}</h3><p className="text-sm text-muted-foreground">{description}</p></div>{children}</div> }
function MoneyField({ id, label, value }: { id: string; label: string; value: string }) { return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id={id} name={id} defaultValue={moneyInputValue(value)} inputMode="decimal" required /></InputGroup></Field> }
function NumberField({ id, label, value, suffix, step, max, required = true }: { id: string; label: string; value: string | number; suffix: string; step: number; max?: number; required?: boolean }) { return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><InputGroup><InputGroupInput id={id} name={id} type="number" defaultValue={value} min={0} max={max} step={step} required={required} /><InputGroupAddon align="inline-end"><InputGroupText>{suffix}</InputGroupText></InputGroupAddon></InputGroup></Field> }

function Preview({ value, error }: { value?: ProfileAnalysis; error?: string }) {
  if (error) return <Alert variant="destructive"><AlertTitle>Anteprima non disponibile</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  return <div className="grid grid-cols-4 gap-3">{[["Aliquota effettiva", value?.effectiveTaxRate ? `${value.effectiveTaxRate}%` : "—"], ["Reddito forfettario", eur(value?.forfaitIncome)], ["Contributi", eur(value?.contributions)], ["Imposta", eur(value?.substituteTax)], ["Netto fiscale", eur(value?.fiscalNet)], ["Disponibile", eur(value?.availableIncome)], ["Ore cliente", value ? `${(value.availableClientMinutes / 60).toFixed(1)} h` : "—"], ["Valore medio", value ? `${eur(value.hourlyTarget)}/h` : "—"]].map(([label, result]) => <div key={label} className="rounded-lg border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{result}</p></div>)}</div>
}

function HolidayDialog({ open, value, onOpenChange, onSave }: { open: boolean; value?: LocalHoliday; onOpenChange: (open: boolean) => void; onSave: (holiday: LocalHoliday) => void }) {
  const [kind, setKind] = useState<LocalHoliday["kind"]>(value?.kind ?? "recurring")
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const { get } = formReader(event.currentTarget); const holiday: LocalHoliday = kind === "recurring" ? { kind, name: get("name"), month: Number(get("month")), day: Number(get("day")) } : { kind, name: get("name"), date: get("date") }; onSave(holiday) }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form key={value ? JSON.stringify(value) : "new-holiday"} onSubmit={submit} className="contents"><DialogHeader><DialogTitle>{value ? "Modifica festività" : "Aggiungi festività locale"}</DialogTitle><DialogDescription>Usa una ricorrenza annuale oppure una data specifica.</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="holiday-name">Nome</FieldLabel><Input id="holiday-name" name="name" defaultValue={value?.name} autoFocus required /></Field><Field><FieldLabel htmlFor="holiday-kind">Tipo</FieldLabel><NativeSelect id="holiday-kind" value={kind} onChange={(event) => setKind(event.target.value as LocalHoliday["kind"])}><NativeSelectOption value="recurring">Ricorrente ogni anno</NativeSelectOption><NativeSelectOption value="specific">Specifica per un anno</NativeSelectOption></NativeSelect></Field>{kind === "recurring" ? <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="holiday-day">Giorno</FieldLabel><Input id="holiday-day" name="day" type="number" defaultValue={value?.kind === "recurring" ? value.day : 1} min={1} max={31} required /></Field><Field><FieldLabel htmlFor="holiday-month">Mese</FieldLabel><Input id="holiday-month" name="month" type="number" defaultValue={value?.kind === "recurring" ? value.month : 1} min={1} max={12} required /></Field></div> : <Field><FieldLabel htmlFor="holiday-date">Data</FieldLabel><Input id="holiday-date" name="date" type="date" defaultValue={value?.kind === "specific" ? value.date : ""} required /></Field>}</FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button><Button type="submit">Conferma</Button></DialogFooter></form></DialogContent></Dialog>
}
