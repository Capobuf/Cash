import { useState, type FormEvent } from "react"
import { calculateProfile, previewProfile, type ProfileAnalysis } from "../../domain/calculations"
import { confirmProfile, saveProfileRevision } from "../../domain/profiles"
import { createFiscalPreset2026, type CashDocument, type EconomicProfile } from "../../domain/model"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { dateIt, eur, formReader, moneyInputValue } from "@/lib/format"
import type { AppState } from "../state"

const parseLocalHolidays = (value: string): EconomicProfile["capacity"]["localHolidays"] =>
  value.split(",").map((item) => item.trim()).filter(Boolean).map((item, index) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(item)) return { kind: "specific" as const, name: `Festività locale ${index + 1}`, date: item }
    const match = /^(\d{2})-(\d{2})$/.exec(item)
    return { kind: "recurring" as const, name: `Festività locale ${index + 1}`, month: Number(match?.[1] ?? 0), day: Number(match?.[2] ?? 0) }
  })

function draftFromForm(source: EconomicProfile, form: HTMLFormElement): EconomicProfile {
  const { data, get, money } = formReader(form)
  const draft = structuredClone(source)
  draft.year = Number(get("year"))
  draft.revenueTarget = money("revenueTarget")
  draft.specificAnnualExpenses = money("specificAnnualExpenses")
  draft.capacity = {
    ...draft.capacity,
    hoursPerDay: get("hoursPerDay"), clientTimePercentage: get("clientTimePercentage"),
    vacationDays: Number(get("vacationDays")), unplannedDays: Number(get("unplannedDays")),
    travelSpeedKmh: get("travelSpeedKmh") || undefined, localHolidays: parseLocalHolidays(get("localHolidays")),
  }
  draft.fiscal = {
    ...draft.fiscal, atecoCode: get("atecoCode"), profitabilityCoefficient: get("profitabilityCoefficient"),
    contributionRate: get("contributionRate"), contributionCeiling: money("contributionCeiling"),
    activityPhase: get("activityPhase") as EconomicProfile["fiscal"]["activityPhase"],
    reducedEligibilityConfirmed: data.get("reducedEligibilityConfirmed") === "on",
    ordinaryApplicabilityConfirmed: data.get("ordinaryApplicabilityConfirmed") === "on",
    reducedSubstituteTaxRate: get("reducedSubstituteTaxRate"), ordinarySubstituteTaxRate: get("ordinarySubstituteTaxRate"),
    ordinaryThreshold: money("ordinaryThreshold"), cessationThreshold: money("cessationThreshold"),
  }
  return draft
}

function Preview({ value, error }: { value?: ProfileAnalysis; error?: string }) {
  if (error) return <Alert variant="destructive"><AlertDescription>Anteprima non disponibile: {error}</AlertDescription></Alert>
  return <Alert><AlertDescription>Anteprima: aliquota effettiva <strong>{value?.effectiveTaxRate ?? "—"}%</strong> · reddito forfettario {eur(value?.forfaitIncome)} · base contributiva {eur(value?.contributionBase)} · contributi {eur(value?.contributions)} · base imposta {eur(value?.taxBase)} · imposta {eur(value?.substituteTax)}</AlertDescription></Alert>
}

export function DashboardView({ doc, appState, activeProfileId, onCopyProfile, onOpenQuote }: {
  doc: CashDocument
  appState: AppState
  activeProfileId?: string
  onCopyProfile: (id: string) => void
  onOpenQuote: (id: string) => void
}) {
  const profile = doc.profiles.find((candidate) => candidate.id === activeProfileId) ?? doc.profiles[0]
  const analysis = profile?.confirmed ? calculateProfile(profile, doc.businessCosts) : undefined
  const initialPreview = profile ? previewProfile(profile, doc.businessCosts) : undefined
  const values = analysis?.ok ? analysis.value : undefined
  const [livePreview, setLivePreview] = useState<{ value?: ProfileAnalysis; error?: string }>(() => initialPreview?.ok ? { value: initialPreview.value } : { error: initialPreview?.error.message })

  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!profile) return
    const draft = draftFromForm(profile, event.currentTarget)
    if (doc.profiles.some((candidate) => candidate.id !== profile.id && candidate.year === draft.year)) { window.alert("Esiste già un profilo per questo anno."); return }
    let saved = saveProfileRevision(profile, draft)
    const action = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    if (action?.value === "confirm") {
      const confirmed = confirmProfile(saved, doc.businessCosts)
      if (!confirmed.ok) { appState.setError(confirmed.error); return }
      saved = confirmed.value
    }
    appState.mutate((document) => {
      const index = document.profiles.findIndex((candidate) => candidate.id === profile.id)
      document.profiles[index] = saved
    })
  }

  const updatePreview = (event: FormEvent<HTMLFormElement>) => {
    if (!profile) return
    const result = previewProfile(draftFromForm(profile, event.currentTarget), doc.businessCosts)
    setLivePreview(result.ok ? { value: result.value } : { error: result.error.message })
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      {[
        ["Valore medio da generare", values ? `${eur(values.hourlyTarget)}/h` : "—", "Non è una tariffa obbligatoria."],
        ["Netto fiscale stimato", eur(values?.fiscalNet), "Stima interna, non fiscale/contabile."],
        ["Disponibile stimato", eur(values?.availableIncome), "Dopo costi aziendali e spese specifiche."],
      ].map(([label, value, description]) => <Card className="col-span-4" key={label}><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl tabular-nums">{value}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{description}</CardContent></Card>)}
      {!profile ? (
        <Card className="col-span-12"><CardHeader><CardTitle>Configura il profilo 2026</CardTitle><CardDescription>Parti dal preset previsto dalla specifica e conferma i parametri.</CardDescription></CardHeader><CardContent><Button onClick={() => appState.mutate((document) => document.profiles.push(createFiscalPreset2026()))}>Crea preset 2026</Button></CardContent></Card>
      ) : (
        <>
          <Card className="col-span-8">
            <CardHeader><CardTitle>Profilo economico {profile.year}</CardTitle><CardDescription>Parametri annuali usati per proiezioni, capacità e fiscalità.</CardDescription><CardAction><Badge variant={profile.confirmed ? "default" : "secondary"}>{profile.confirmed ? "Confermato" : "Da verificare"}</Badge></CardAction></CardHeader>
            <CardContent className="space-y-6">
              {!profile.confirmed ? <Alert><AlertDescription>Controlla i parametri fiscali e conferma il profilo per attivare tutte le proiezioni.</AlertDescription></Alert> : null}
              <form className="space-y-6" onSubmit={submitProfile} onInput={updatePreview}>
                <FieldSet><FieldLegend>Obiettivi</FieldLegend><FieldDescription>Valori economici usati per la proiezione.</FieldDescription><FieldGroup className="grid grid-cols-2">
                  <Field><FieldLabel htmlFor="year">Anno fiscale</FieldLabel><Input id="year" name="year" type="number" defaultValue={profile.year} min={2000} max={2200} step={1} required /></Field>
                  {[["revenueTarget", "Fatturato obiettivo", profile.revenueTarget], ["specificAnnualExpenses", "Spese specifiche annue", profile.specificAnnualExpenses]].map(([id, label, value]) => <Field key={id}><FieldLabel htmlFor={String(id)}>{label}</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id={String(id)} name={String(id)} defaultValue={moneyInputValue(value)} inputMode="decimal" required /></InputGroup></Field>)}
                </FieldGroup></FieldSet>
                <Separator />
                <FieldSet><FieldLegend>Capacità lavorativa</FieldLegend><FieldDescription>Disponibilità e tempo fatturabile.</FieldDescription><FieldGroup className="grid grid-cols-2">
                  {[
                    ["hoursPerDay", "Ore lavorative al giorno", profile.capacity.hoursPerDay, "ore", .01, 24, .01, true],
                    ["clientTimePercentage", "Tempo dedicabile ai clienti", profile.capacity.clientTimePercentage, "%", .0001, 100, .0001, true],
                    ["vacationDays", "Ferie", profile.capacity.vacationDays, "giorni", 0, undefined, 1, true],
                    ["unplannedDays", "Malattia e imprevisti", profile.capacity.unplannedDays, "giorni", 0, undefined, 1, true],
                    ["travelSpeedKmh", "Velocità media trasferta", profile.capacity.travelSpeedKmh ?? "", "km/h", .1, undefined, .1, false],
                  ].map(([id, label, value, suffix, min, max, step, required]) => <Field key={String(id)}><FieldLabel htmlFor={String(id)}>{label}</FieldLabel><InputGroup><InputGroupInput id={String(id)} name={String(id)} type="number" defaultValue={String(value)} min={min as number} max={max as number | undefined} step={step as number} required={Boolean(required)} /><InputGroupAddon align="inline-end"><InputGroupText>{suffix}</InputGroupText></InputGroupAddon></InputGroup></Field>)}
                  <Field><FieldLabel htmlFor="localHolidays">Festività locali</FieldLabel><Input id="localHolidays" name="localHolidays" defaultValue={profile.capacity.localHolidays.map((holiday) => holiday.kind === "recurring" ? `${String(holiday.month).padStart(2, "0")}-${String(holiday.day).padStart(2, "0")}` : holiday.date).join(", ")} placeholder="es. 06-29, 2026-12-07" /><FieldDescription>Formato MM-GG ricorrente o AAAA-MM-GG.</FieldDescription></Field>
                </FieldGroup></FieldSet>
                <Separator />
                <FieldSet><FieldLegend>Regime fiscale</FieldLegend><FieldDescription>Parametri da verificare con il proprio consulente.</FieldDescription><FieldGroup className="grid grid-cols-2">
                  <Field><FieldLabel htmlFor="atecoCode">Codice ATECO 2025</FieldLabel><Input id="atecoCode" name="atecoCode" defaultValue={profile.fiscal.atecoCode} required /></Field>
                  {[["profitabilityCoefficient", "Coefficiente di redditività", profile.fiscal.profitabilityCoefficient, .0001], ["contributionRate", "Aliquota Gestione Separata", profile.fiscal.contributionRate, 0]].map(([id, label, value, min]) => <Field key={String(id)}><FieldLabel htmlFor={String(id)}>{label}</FieldLabel><InputGroup><InputGroupInput id={String(id)} name={String(id)} type="number" defaultValue={String(value)} min={min as number} max={100} step={.0001} required /><InputGroupAddon align="inline-end"><InputGroupText>%</InputGroupText></InputGroupAddon></InputGroup></Field>)}
                  <Field><FieldLabel htmlFor="contributionCeiling">Massimale contributivo</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id="contributionCeiling" name="contributionCeiling" defaultValue={moneyInputValue(profile.fiscal.contributionCeiling)} inputMode="decimal" required /></InputGroup></Field>
                  <Field><FieldLabel htmlFor="activityPhase">Fase attività</FieldLabel><NativeSelect className="w-full" id="activityPhase" name="activityPhase" defaultValue={profile.fiscal.activityPhase}><NativeSelectOption value="ordinary">Regime ordinario / agevolazione non spettante</NativeSelectOption><NativeSelectOption value="reduced_eligible">Primi 5 periodi · agevolazione spettante</NativeSelectOption></NativeSelect></Field>
                  {[["reducedSubstituteTaxRate", "Aliquota agevolata", profile.fiscal.reducedSubstituteTaxRate], ["ordinarySubstituteTaxRate", "Aliquota ordinaria", profile.fiscal.ordinarySubstituteTaxRate]].map(([id, label, value]) => <Field key={id}><FieldLabel htmlFor={String(id)}>{label}</FieldLabel><InputGroup><InputGroupInput id={String(id)} name={String(id)} type="number" defaultValue={String(value)} min={0} max={100} step={.0001} required /><InputGroupAddon align="inline-end"><InputGroupText>%</InputGroupText></InputGroupAddon></InputGroup></Field>)}
                  {[["ordinaryThreshold", "Soglia regime ordinario", profile.fiscal.ordinaryThreshold], ["cessationThreshold", "Soglia di cessazione", profile.fiscal.cessationThreshold]].map(([id, label, value]) => <Field key={id}><FieldLabel htmlFor={String(id)}>{label}</FieldLabel><InputGroup><InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon><InputGroupInput id={String(id)} name={String(id)} defaultValue={moneyInputValue(value)} inputMode="decimal" required /></InputGroup></Field>)}
                  <Field orientation="horizontal" className="col-span-2"><Checkbox id="reducedEligibilityConfirmed" name="reducedEligibilityConfirmed" defaultChecked={profile.fiscal.reducedEligibilityConfirmed} /><FieldLabel htmlFor="reducedEligibilityConfirmed">Confermo i requisiti per l’aliquota agevolata</FieldLabel></Field>
                  <Field orientation="horizontal" className="col-span-2"><Checkbox id="ordinaryApplicabilityConfirmed" name="ordinaryApplicabilityConfirmed" defaultChecked={profile.fiscal.ordinaryApplicabilityConfirmed} /><FieldLabel htmlFor="ordinaryApplicabilityConfirmed">Confermo l’applicabilità oltre la soglia ordinaria</FieldLabel></Field>
                </FieldGroup></FieldSet>
                <Preview {...livePreview} />
                <div className="flex flex-wrap gap-2"><Button type="submit" name="profileAction" value="confirm">Conferma profilo</Button><Button type="submit" variant="secondary" name="profileAction" value="save">Salva come da verificare</Button><Button type="button" variant="ghost" onClick={() => onCopyProfile(profile.id)}>Copia per nuovo anno</Button></div>
              </form>
            </CardContent>
          </Card>
          <Card className="col-span-4"><CardHeader><CardTitle>Capacità</CardTitle></CardHeader><CardContent><Table><TableBody>{[["Giorni teorici", values?.theoreticalWorkdays ?? "—"], ["Giorni disponibili", values?.availableDays ?? "—"], ["Ore clienti", values ? (values.availableClientMinutes / 60).toFixed(1) : "—"], ["Costi annui", eur(values?.annualBusinessCosts)]].map(([label, value]) => <TableRow key={label}><TableCell className="text-muted-foreground">{label}</TableCell><TableCell className="text-right font-medium tabular-nums">{value}</TableCell></TableRow>)}</TableBody></Table>{analysis && !analysis.ok ? <Alert variant="destructive" className="mt-4"><AlertDescription>{analysis.error.message}</AlertDescription></Alert> : null}</CardContent></Card>
        </>
      )}
      <Card className="col-span-12"><CardHeader><CardTitle>Preventivi recenti</CardTitle></CardHeader><CardContent>{doc.quotes.length ? <Table><TableHeader><TableRow><TableHead>Preventivo</TableHead><TableHead>Data</TableHead><TableHead>Voci</TableHead><TableHead className="text-right">Azione</TableHead></TableRow></TableHeader><TableBody>{doc.quotes.slice(-5).reverse().map((quote) => <TableRow key={quote.id}><TableCell className="font-medium">{quote.items.map((item) => item.name).join(", ") || "Preventivo incompleto"}</TableCell><TableCell>{dateIt(quote.date)}</TableCell><TableCell>{quote.items.length}</TableCell><TableCell className="text-right"><Button size="sm" onClick={() => onOpenQuote(quote.id)}>Apri</Button></TableCell></TableRow>)}</TableBody></Table> : <p className="py-8 text-center text-sm text-muted-foreground">Nessun preventivo. Creane uno dalla sezione Preventivi.</p>}</CardContent></Card>
    </div>
  )
}
