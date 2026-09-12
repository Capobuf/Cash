import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, FilePlus2, Settings2, WalletCards } from "lucide-react"
import { calculateProfile } from "../../domain/calculations"
import { createFiscalPreset2026, type CashDocument } from "../../domain/model"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { dateIt, eur, formatNumber, hours } from "@/lib/format"
import type { AppState } from "../state"

export function DashboardView({ doc, appState, onEditProfile, onOpenQuote, onNewQuote }: {
  doc: CashDocument
  appState: AppState
  onEditProfile: (id: string) => void
  onOpenQuote: (id: string) => void
  onNewQuote: () => void
}) {
  const profile = [...doc.profiles].sort((a, b) => b.year - a.year)[0]
  const calculated = profile?.confirmed ? calculateProfile(profile, doc.businessCosts) : undefined
  const values = calculated?.ok ? calculated.value : undefined
  const missing = [
    !profile ? "Crea il profilo annuale" : !profile.confirmed ? `Conferma il profilo ${profile.year}` : undefined,
    !doc.settings.fuelTerritory ? "Configura il territorio carburanti" : undefined,
    !doc.sites.length ? "Aggiungi una sede per le trasferte" : undefined,
    !doc.vehicles.length ? "Aggiungi un veicolo per le trasferte" : undefined,
  ].filter((entry): entry is string => Boolean(entry))

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <CardContent className="flex items-center justify-between gap-8 py-6">
          <div className="max-w-2xl"><Badge variant="secondary">Workspace di preventivazione</Badge><h2 className="mt-3 text-2xl font-semibold tracking-tight">Costruisci il prossimo preventivo mentre ragioni sul lavoro.</h2><p className="mt-2 text-sm text-muted-foreground">Aggiungi voci, template, spese e trasferte liberamente. Il prezzo commerciale resta sempre una tua scelta.</p></div>
          <Button size="lg" onClick={onNewQuote}><FilePlus2 />Nuovo preventivo</Button>
        </CardContent>
      </Card>

      {!profile ? <Alert><AlertTriangle /><AlertTitle>Configurazione iniziale incompleta</AlertTitle><AlertDescription className="flex items-center justify-between gap-4"><span>Crea il profilo annuale per ottenere valore medio, capacità e proiezioni.</span><Button size="sm" onClick={() => { const created = createFiscalPreset2026(); appState.mutate((document) => document.profiles.push(created)); onEditProfile(created.id) }}>Crea profilo 2026</Button></AlertDescription></Alert> : null}

      <div className="grid grid-cols-4 gap-4">
        <Metric icon={WalletCards} label="Valore medio da generare" value={values ? `${eur(values.hourlyTarget)}/h` : "—"} note="Riferimento, non tariffa obbligatoria" primary />
        <Metric icon={CalendarDays} label="Fatturato obiettivo" value={profile ? eur(profile.revenueTarget) : "—"} note={profile ? `Profilo ${profile.year} · rev. ${profile.revision}` : "Profilo non configurato"} />
        <Metric icon={CheckCircle2} label="Netto fiscale stimato" value={eur(values?.fiscalNet)} note="Stima interna non contabile" />
        <Metric icon={Clock3} label="Capacità cliente" value={values ? hours(values.availableClientMinutes) : "—"} note={values ? `${values.availableDays} giorni disponibili` : "Richiede un profilo confermato"} />
      </div>

      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(320px,.65fr)] gap-4">
        <Card><CardHeader><div><CardTitle>Preventivi recenti</CardTitle><CardDescription>Riprendi rapidamente il lavoro dove lo avevi lasciato.</CardDescription></div><CardAction><Button variant="outline" onClick={onNewQuote}><FilePlus2 />Nuovo</Button></CardAction></CardHeader><CardContent>
          {doc.quotes.length ? <Table><TableHeader><TableRow><TableHead>Preventivo</TableHead><TableHead>Cliente</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Voci</TableHead><TableHead className="w-24" /></TableRow></TableHeader><TableBody>{doc.quotes.slice(-6).reverse().map((quote) => <TableRow key={quote.id}><TableCell className="font-medium">{quote.items.map((item) => item.name).join(", ") || "Preventivo incompleto"}</TableCell><TableCell className="text-muted-foreground">{quote.client?.displayName ?? "Nessun cliente"}</TableCell><TableCell>{dateIt(quote.date)}</TableCell><TableCell className="text-right tabular-nums">{quote.items.length}</TableCell><TableCell><Button size="sm" variant="ghost" onClick={() => onOpenQuote(quote.id)}>Apri <ArrowRight /></Button></TableCell></TableRow>)}</TableBody></Table> : <div className="grid min-h-52 place-items-center rounded-lg border border-dashed text-center"><div><p className="font-medium">Nessun preventivo</p><p className="mt-1 text-sm text-muted-foreground">Il primo preventivo può partire vuoto o da un template.</p><Button className="mt-4" size="sm" onClick={onNewQuote}>Crea il primo preventivo</Button></div></div>}
        </CardContent></Card>

        <div className="space-y-4">
          <Card><CardHeader><div><CardTitle className="flex items-center gap-2">Profilo attivo {profile ? <Badge variant={profile.confirmed ? "default" : "secondary"}>{profile.confirmed ? "Confermato" : "Da verificare"}</Badge> : null}</CardTitle><CardDescription>{profile ? `${profile.year} · revisione ${profile.revision}` : "Nessun profilo annuale"}</CardDescription></div></CardHeader><CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3"><SmallMetric label="Disponibile stimato" value={eur(values?.availableIncome)} /><SmallMetric label="Ore cliente" value={values ? formatNumber(values.availableClientMinutes / 60, 1) : "—"} /></div>
            {profile ? <Button className="w-full" variant="outline" onClick={() => onEditProfile(profile.id)}><Settings2 />Modifica profilo</Button> : null}
          </CardContent></Card>
          {missing.length ? <Alert><AlertTriangle /><AlertTitle>{missing.length} configurazioni da completare</AlertTitle><AlertDescription><ul className="mt-1 list-disc space-y-1 pl-4">{missing.map((item) => <li key={item}>{item}</li>)}</ul></AlertDescription></Alert> : <Alert><CheckCircle2 /><AlertTitle>Configurazione operativa</AlertTitle><AlertDescription>Hai i dati essenziali per preventivi e trasferte.</AlertDescription></Alert>}
        </div>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, label, value, note, primary = false }: { icon: typeof Clock3; label: string; value: string; note: string; primary?: boolean }) {
  return <Card className={primary ? "border-primary/30" : undefined}><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardDescription>{label}</CardDescription><Icon className="size-4 text-muted-foreground" /></div><CardTitle className="text-2xl tabular-nums">{value}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">{note}</CardContent></Card>
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>
}
