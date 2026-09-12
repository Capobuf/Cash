import { useState, type FormEvent } from "react"
import { calculateProfile, previewProfile, type ProfileAnalysis } from "../../domain/calculations"
import { confirmProfile, saveProfileRevision } from "../../domain/profiles"
import { createFiscalPreset2026, type CashDocument, type EconomicProfile } from "../../domain/model"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckboxField, Field, MoneyField, Option, SelectField, SuffixField } from "@/components/FormControls"
import { dateIt, eur, formReader } from "@/lib/format"
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
    <div className="app-grid">
      <Card className="card"><CardContent><div className="muted small">Valore medio da generare</div><div className="metric">{values ? `${eur(values.hourlyTarget)}/h` : "—"}</div><div className="small muted">Non è una tariffa obbligatoria.</div></CardContent></Card>
      <Card className="card"><CardContent><div className="muted small">Netto fiscale stimato</div><div className="metric">{eur(values?.fiscalNet)}</div><div className="small muted">Stima interna, non fiscale/contabile.</div></CardContent></Card>
      <Card className="card"><CardContent><div className="muted small">Disponibile stimato</div><div className="metric">{eur(values?.availableIncome)}</div><div className="small muted">Dopo costi aziendali e spese specifiche.</div></CardContent></Card>
      {!profile ? (
        <Card className="card full empty"><CardHeader><CardTitle>Configura il profilo 2026</CardTitle></CardHeader><CardContent><p>Parti dal preset previsto dalla specifica e conferma i parametri.</p><Button onClick={() => appState.mutate((document) => document.profiles.push(createFiscalPreset2026()))}>Crea preset 2026</Button></CardContent></Card>
      ) : (
        <>
          <Card className="card wide profile-card"><CardHeader className="section-heading"><div><span className="eyebrow">Parametri annuali</span><CardTitle>Profilo economico {profile.year}</CardTitle></div><Badge variant={profile.confirmed ? "default" : "secondary"}>{profile.confirmed ? "Confermato" : "Da verificare"}</Badge></CardHeader><CardContent>
            {!profile.confirmed ? <Alert className="compact-notice"><AlertDescription>Controlla i parametri fiscali e conferma il profilo per attivare tutte le proiezioni.</AlertDescription></Alert> : null}
            <form className="form-grid profile-form" onSubmit={submitProfile} onInput={updatePreview}>
              <div className="form-section-title full"><span>Obiettivi</span><small>Valori economici usati per la proiezione</small></div>
              <Field label="Anno fiscale" name="year" value={profile.year} type="number" min={2000} max={2200} step={1} required />
              <MoneyField label="Fatturato obiettivo" name="revenueTarget" value={profile.revenueTarget} required />
              <MoneyField label="Spese specifiche annue" name="specificAnnualExpenses" value={profile.specificAnnualExpenses} required />
              <div className="form-section-title full"><span>Capacità lavorativa</span><small>Disponibilità e tempo fatturabile</small></div>
              <SuffixField label="Ore lavorative al giorno" name="hoursPerDay" value={profile.capacity.hoursPerDay} suffix="ore" min={0.01} max={24} step={0.01} required />
              <SuffixField label="Tempo dedicabile ai clienti" name="clientTimePercentage" value={profile.capacity.clientTimePercentage} suffix="%" min={0.0001} max={100} step={0.0001} required />
              <SuffixField label="Ferie" name="vacationDays" value={profile.capacity.vacationDays} suffix="giorni" min={0} step={1} required />
              <SuffixField label="Malattia e imprevisti" name="unplannedDays" value={profile.capacity.unplannedDays} suffix="giorni" min={0} step={1} required />
              <SuffixField label="Velocità media trasferta" name="travelSpeedKmh" value={profile.capacity.travelSpeedKmh ?? ""} suffix="km/h" min={0.1} step={0.1} />
              <Field label="Festività locali" name="localHolidays" value={profile.capacity.localHolidays.map((holiday) => holiday.kind === "recurring" ? `${String(holiday.month).padStart(2, "0")}-${String(holiday.day).padStart(2, "0")}` : holiday.date).join(", ")} placeholder="es. 06-29, 2026-12-07" hint="Formato MM-GG ricorrente o AAAA-MM-GG" />
              <div className="form-section-title full"><span>Regime fiscale</span><small>Parametri da verificare con il proprio consulente</small></div>
              <Field label="Codice ATECO 2025" name="atecoCode" value={profile.fiscal.atecoCode} required />
              <SuffixField label="Coefficiente di redditività" name="profitabilityCoefficient" value={profile.fiscal.profitabilityCoefficient} suffix="%" min={0.0001} max={100} step={0.0001} required />
              <SuffixField label="Aliquota Gestione Separata" name="contributionRate" value={profile.fiscal.contributionRate} suffix="%" min={0} max={100} step={0.0001} required />
              <MoneyField label="Massimale contributivo" name="contributionCeiling" value={profile.fiscal.contributionCeiling} required />
              <SelectField label="Fase attività" name="activityPhase" value={profile.fiscal.activityPhase}><Option value="ordinary">Regime ordinario / agevolazione non spettante</Option><Option value="reduced_eligible">Primi 5 periodi · agevolazione spettante</Option></SelectField>
              <SuffixField label="Aliquota agevolata" name="reducedSubstituteTaxRate" value={profile.fiscal.reducedSubstituteTaxRate} suffix="%" min={0} max={100} step={0.0001} required />
              <SuffixField label="Aliquota ordinaria" name="ordinarySubstituteTaxRate" value={profile.fiscal.ordinarySubstituteTaxRate} suffix="%" min={0} max={100} step={0.0001} required />
              <MoneyField label="Soglia regime ordinario" name="ordinaryThreshold" value={profile.fiscal.ordinaryThreshold} required />
              <MoneyField label="Soglia di cessazione" name="cessationThreshold" value={profile.fiscal.cessationThreshold} required />
              <CheckboxField className="full" name="reducedEligibilityConfirmed" checked={profile.fiscal.reducedEligibilityConfirmed}>Confermo i requisiti per l’aliquota agevolata</CheckboxField>
              <CheckboxField className="full" name="ordinaryApplicabilityConfirmed" checked={profile.fiscal.ordinaryApplicabilityConfirmed}>Confermo l’applicabilità oltre la soglia ordinaria</CheckboxField>
              <div className="full"><Preview {...livePreview} /></div>
              <div className="full actions form-actions"><Button type="submit" name="profileAction" value="confirm">Conferma profilo</Button><Button type="submit" variant="secondary" name="profileAction" value="save">Salva come da verificare</Button><Button type="button" variant="ghost" onClick={() => onCopyProfile(profile.id)}>Copia per nuovo anno</Button></div>
            </form>
          </CardContent></Card>
          <Card className="card"><CardHeader><CardTitle>Capacità</CardTitle></CardHeader><CardContent><div className="list"><div className="row"><span>Giorni teorici</span><strong>{values?.theoreticalWorkdays ?? "—"}</strong></div><div className="row"><span>Giorni disponibili</span><strong>{values?.availableDays ?? "—"}</strong></div><div className="row"><span>Ore clienti</span><strong>{values ? (values.availableClientMinutes / 60).toFixed(1) : "—"}</strong></div><div className="row"><span>Costi annui</span><strong>{eur(values?.annualBusinessCosts)}</strong></div></div>{analysis && !analysis.ok ? <Alert variant="destructive"><AlertDescription>{analysis.error.message}</AlertDescription></Alert> : null}</CardContent></Card>
        </>
      )}
      <Card className="card full"><CardHeader><CardTitle>Preventivi recenti</CardTitle></CardHeader><CardContent>{doc.quotes.length ? <div className="list">{doc.quotes.slice(-5).reverse().map((quote) => <div className="row" key={quote.id}><div><div className="row-title">{quote.items.map((item) => item.name).join(", ") || "Preventivo incompleto"}</div><div className="row-detail">{dateIt(quote.date)} · {quote.items.length} voci</div></div><Button onClick={() => onOpenQuote(quote.id)}>Apri</Button></div>)}</div> : <div className="empty">Nessun preventivo. Creane uno dalla sezione Preventivi.</div>}</CardContent></Card>
    </div>
  )
}
