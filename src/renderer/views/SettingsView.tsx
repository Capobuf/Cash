import { ArrowLeft, ArrowRight, Check, Cloud, Database, MoreHorizontal, Plus, Settings2 } from "lucide-react"
import { useState } from "react"
import { createBlankProfile, type CashDocument } from "../../domain/model"
import { ProfileEditor } from "@/components/ProfileEditor"
import { ResourcesView } from "./ResourcesView"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

export interface FicUiState {
  hasToken: boolean
  connectionError: boolean
  setupInfo: { clientId: string; requiredScopes: string[] }
  setHasToken: (value: boolean) => void
  setConnectionError: (value: boolean) => void
}

export function SettingsView({ doc, appState, ficUi, activeProfileId, onEditProfile, onCopyProfile, requestDelete }: {
  doc: CashDocument; appState: AppState; ficUi: FicUiState; activeProfileId?: string
  onEditProfile: (id?: string) => void; onCopyProfile: (id: string) => void; requestDelete: (target: DeleteTarget) => void
}) {
  const [tab, setTab] = useState(activeProfileId ? "profiles" : "profiles")
  const [newProfileOpen, setNewProfileOpen] = useState(false)
  const [removeFicOpen, setRemoveFicOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const profile = doc.profiles.find((entry) => entry.id === activeProfileId)
  const fic = doc.settings.fic
  const deviceState = !fic.enabled ? "Disattivata" : ficUi.connectionError || fic.lastVerification?.result === "error" ? "Errore collegamento" : !ficUi.hasToken ? "Richiede configurazione locale" : "Attiva"

  const createProfile = (year: number) => {
    if (!Number.isInteger(year) || doc.profiles.some((entry) => entry.year === year)) {
      appState.setError({ code: "CONFLICT", field: "profile.year", message: `Non è possibile creare il profilo ${year}.`, action: "Verifica che l’anno sia valido e non esista già." })
      return
    }
    const created = createBlankProfile(year)
    appState.mutate((document) => document.profiles.unshift(created))
    setNewProfileOpen(false)
    onEditProfile(created.id)
  }

  const removeFic = async () => {
    await appState.save()
    if (appState.status !== "Salvato" || !appState.session?.document) return
    const removed = await window.cash.fic.removeLink({ path: appState.session.path, document: appState.session.document, concurrencyToken: appState.session.token })
    if (!removed.ok) { appState.setError(removed.error); return }
    ficUi.setHasToken(false)
    appState.acceptNativeSession(removed.value)
  }

  return (
    <>
      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="profiles">Profili annuali</TabsTrigger>
          <TabsTrigger value="planning">Pianificazione</TabsTrigger>
          <TabsTrigger value="resources">Costi, trasferte e sedi</TabsTrigger>
          <TabsTrigger value="integrations">Integrazioni</TabsTrigger>
          <TabsTrigger value="archive">Archivio</TabsTrigger>
        </TabsList>

        <TabsContent value="profiles">
          {profile ? <div className="space-y-3"><Button variant="ghost" onClick={() => onEditProfile(undefined)}><ArrowLeft />Tutti i profili</Button><ProfileEditor key={profile.id} profile={profile} doc={doc} appState={appState} onCopy={onCopyProfile} /></div> : <Card><CardHeader><div><CardTitle>Profili annuali</CardTitle><CardDescription>Parametri economici, capacità e fiscalità usati negli snapshot dei preventivi.</CardDescription></div><CardAction><Button onClick={() => setNewProfileOpen(true)}><Plus />Nuovo profilo</Button></CardAction></CardHeader><CardContent>{doc.profiles.length ? <Table><TableHeader><TableRow><TableHead>Anno</TableHead><TableHead>Revisione</TableHead><TableHead>Stato</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{[...doc.profiles].sort((a, b) => b.year - a.year).map((entry) => <TableRow key={entry.id}><TableCell className="font-medium">{entry.year}</TableCell><TableCell>{entry.revision}</TableCell><TableCell><Badge variant={entry.confirmed ? "default" : "secondary"}>{entry.confirmed ? "Confermato" : "Da verificare"}</Badge></TableCell><TableCell><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni profilo ${entry.year}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onEditProfile(entry.id)}>Apri editor</DropdownMenuItem><DropdownMenuItem onClick={() => onCopyProfile(entry.id)}>Copia per nuovo anno</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "profile", id: entry.id, label: `Profilo ${entry.year}` })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <div className="grid min-h-56 place-items-center rounded-lg border border-dashed text-center"><div><p className="font-medium">Nessun profilo annuale</p><p className="mt-1 text-sm text-muted-foreground">Crea un profilo per calcolare il valore medio da generare.</p><Button className="mt-4" size="sm" onClick={() => setNewProfileOpen(true)}>Nuovo profilo</Button></div></div>}</CardContent></Card>}
        </TabsContent>

        <TabsContent value="planning"><Card><CardHeader><div><CardTitle>Pianificazione generale</CardTitle><CardDescription>Dati condivisi usati dalle fonti correnti.</CardDescription></div></CardHeader><CardContent><Field className="max-w-lg"><FieldLabel htmlFor="fuel-territory">Regione / provincia autonoma MIMIT</FieldLabel><Input id="fuel-territory" defaultValue={doc.settings.fuelTerritory ?? ""} placeholder="es. Lazio" onBlur={(event) => { const value = event.currentTarget.value.trim(); if (value && value !== doc.settings.fuelTerritory) appState.mutate((document) => { document.settings.fuelTerritory = value }) }} /><FieldDescription>Usata per il prezzo carburante. La modalità SELF/SERVITO deriva dal tipo di carburante.</FieldDescription></Field></CardContent></Card></TabsContent>

        <TabsContent value="resources"><ResourcesView doc={doc} appState={appState} requestDelete={requestDelete} /></TabsContent>

        <TabsContent value="integrations"><Card><CardHeader><div><CardTitle>Fatture in Cloud</CardTitle><CardDescription>Integrazione facoltativa; tutto il flusso locale resta disponibile anche se disattivata.</CardDescription></div><CardAction><Badge variant={deviceState === "Attiva" ? "default" : deviceState === "Errore collegamento" ? "destructive" : "secondary"}>{deviceState}</Badge></CardAction></CardHeader><CardContent className="space-y-5">
          <Alert><Cloud /><AlertTitle>{fic.company?.name ?? "Azienda non configurata"}</AlertTitle><AlertDescription>{fic.enabled ? `${fic.product?.name ?? "Prodotto non configurato"} · ultima verifica ${fic.lastVerification?.at ?? "—"}` : "Nessuna chiamata al servizio viene eseguita."}</AlertDescription></Alert>
          <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm"><div><p className="text-muted-foreground">Client ID app privata</p><p className="mt-1 font-medium">{ficUi.setupInfo.clientId || "Non configurato nella build"}</p></div><div><p className="text-muted-foreground">Token</p><p className="mt-1 font-medium">{ficUi.hasToken ? "Presente nel Gestore credenziali" : "Assente su questa postazione"}</p></div><div className="col-span-2"><p className="text-muted-foreground">Permessi richiesti</p><p className="mt-1 font-mono text-xs">{ficUi.setupInfo.requiredScopes.join(" · ")}</p></div></div>
          <div className="flex flex-wrap gap-2">{fic.enabled ? <Button variant="secondary" onClick={() => appState.mutate((document) => { document.settings.fic.enabled = false })}>Disattiva</Button> : null}<Button onClick={() => setWizardOpen(true)}>{fic.enabled ? "Riconfigura postazione" : "Configura Fatture in Cloud"}</Button><Button variant="destructive" onClick={() => setRemoveFicOpen(true)} disabled={!fic.company && !ficUi.hasToken}>Rimuovi collegamento</Button></div>
        </CardContent></Card></TabsContent>

        <TabsContent value="archive"><div className="grid grid-cols-2 gap-4"><Card><CardHeader><div><CardTitle>Archivio corrente</CardTitle><CardDescription>Unico file canonico dei dati di Cash.</CardDescription></div><CardAction><Database className="size-5 text-muted-foreground" /></CardAction></CardHeader><CardContent className="space-y-3 text-sm"><Row label="File" value={(appState.session?.path ?? "").split(/[\\/]/).pop() ?? "—"} /><Row label="Revisione" value={String(doc.revision)} /><Row label="Stato" value={appState.status} /><div className="flex gap-2 pt-2"><Button variant="outline" onClick={() => void appState.open()}>Apri altro archivio</Button><Button variant="outline" onClick={() => void appState.recovery()}>Copia di recupero</Button></div></CardContent></Card><Alert><Settings2 /><AlertTitle>Uso sequenziale con Google Drive</AlertTitle><AlertDescription>Chiudi Cash soltanto quando lo stato è “Salvato”. Attendi la sincronizzazione sulla prima postazione e poi sulla seconda prima di riaprire il file. L’uso simultaneo non è supportato.</AlertDescription></Alert></div></TabsContent>
      </Tabs>

      <Dialog open={newProfileOpen} onOpenChange={setNewProfileOpen}><DialogContent><form onSubmit={(event) => { event.preventDefault(); createProfile(Number(new FormData(event.currentTarget).get("year"))) }} className="contents"><DialogHeader><DialogTitle>Nuovo profilo annuale</DialogTitle><DialogDescription>Il profilo nasce Da verificare e non abilita proiezioni fiscali finché non viene confermato.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="new-profile-year">Anno</FieldLabel><Input id="new-profile-year" name="year" type="number" defaultValue={new Date().getFullYear()} min={2000} max={2200} autoFocus required /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setNewProfileOpen(false)}>Annulla</Button><Button type="submit">Crea profilo</Button></DialogFooter></form></DialogContent></Dialog>
      <FicWizard open={wizardOpen} onOpenChange={setWizardOpen} appState={appState} ficUi={ficUi} />
      <AlertDialog open={removeFicOpen} onOpenChange={setRemoveFicOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Rimuovere il collegamento?</AlertDialogTitle><AlertDialogDescription>Il token locale e la configurazione condivisa saranno rimossi. Clienti locali, preventivi e snapshot storici resteranno invariati.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void removeFic()}>Rimuovi collegamento</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>
  )
}

function FicWizard({ open, onOpenChange, appState, ficUi }: { open: boolean; onOpenChange: (open: boolean) => void; appState: AppState; ficUi: FicUiState }) {
  const [step, setStep] = useState(1)
  const [token, setToken] = useState("")
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [companyId, setCompanyId] = useState("")
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([])
  const [productId, setProductId] = useState("")
  const [busy, setBusy] = useState(false)
  const company = companies.find((entry) => entry.id === companyId)
  const product = products.find((entry) => entry.id === productId)

  const next = async () => {
    if (step === 1) {
      if (!ficUi.setupInfo.clientId) { appState.setError({ code: "MISSING_DATA", source: "FattureInCloud", message: "Questa build non contiene il Client ID dell’app privata.", action: "Ricompila impostando CASH_FIC_CLIENT_ID." }); return }
      setStep(2); return
    }
    if (step === 2) { if (token.trim()) setStep(3); return }
    if (step === 3) {
      setBusy(true); const result = await window.cash.fic.listCompaniesForActivation(token.trim()); setBusy(false)
      if (!result.ok) { ficUi.setConnectionError(true); appState.setError(result.error); return }
      setCompanies(result.value); setCompanyId(result.value[0]?.id ?? ""); setStep(4); return
    }
    if (step === 4) {
      if (!companyId) return
      setBusy(true); const result = await window.cash.fic.listProductsForActivation({ token: token.trim(), companyId }); setBusy(false)
      if (!result.ok) { ficUi.setConnectionError(true); appState.setError(result.error); return }
      setProducts(result.value); setProductId(result.value[0]?.id ?? ""); setStep(5); return
    }
    if (step === 5) { if (productId) setStep(6); return }
    if (step === 6) { setStep(7); return }
    await appState.save()
    if (appState.status !== "Salvato" || !appState.session?.document) return
    setBusy(true)
    const completed = await window.cash.fic.completeActivation({ token: token.trim(), companyId, productId, path: appState.session.path, document: appState.session.document, concurrencyToken: appState.session.token })
    setBusy(false)
    if (!completed.ok) { ficUi.setConnectionError(true); appState.setError(completed.error); return }
    ficUi.setHasToken(true); ficUi.setConnectionError(false); appState.acceptNativeSession(completed.value); onOpenChange(false); setStep(1); setToken("")
  }

  return <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) setStep(1) }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Configura Fatture in Cloud</DialogTitle><DialogDescription>Passaggio {step} di 7 · {['Attivazione', 'Token manuale', 'Verifica token', 'Azienda', 'Prodotto Consulenza', 'Riepilogo', 'Conferma'][step - 1]}</DialogDescription></DialogHeader><div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${(step / 7) * 100}%` }} /></div><div className="min-h-52 py-2">
    {step === 1 ? <WizardCopy title="Collega questa postazione" body="Il collegamento è facoltativo. Il token resterà soltanto nel Gestore credenziali di Windows e non entrerà mai nell’archivio condiviso." /> : null}
    {step === 2 ? <Field><FieldLabel htmlFor="fic-token">Token manuale</FieldLabel><Input id="fic-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} autoFocus /><FieldDescription>Richiede soltanto i permessi indicati nella schermata Integrazioni.</FieldDescription></Field> : null}
    {step === 3 ? <WizardCopy title="Verifica collegamento" body="Cash verificherà il token e caricherà l’elenco delle aziende accessibili. Nessun preventivo verrà creato." /> : null}
    {step === 4 ? <ChoiceList title="Scegli l’azienda" entries={companies} value={companyId} onChange={setCompanyId} empty="Il token non espone aziende selezionabili." /> : null}
    {step === 5 ? <ChoiceList title="Scegli il prodotto Consulenza" entries={products} value={productId} onChange={setProductId} empty="Nessun prodotto con nome esatto “Consulenza”. Crealo in Fatture in Cloud e ripeti la verifica." /> : null}
    {step >= 6 ? <div className="space-y-3 rounded-lg border p-4"><Row label="Azienda" value={company?.name ?? "—"} /><Row label="Prodotto" value={product?.name ?? "—"} /><Row label="Token" value="Gestore credenziali locale" /><Row label="Permessi" value={ficUi.setupInfo.requiredScopes.join(", ")} />{step === 7 ? <Alert><Check /><AlertTitle>Pronto per l’attivazione</AlertTitle><AlertDescription>La verifica finale e il salvataggio di azienda, prodotto e token avverranno come un’unica operazione.</AlertDescription></Alert> : null}</div> : null}
  </div><DialogFooter className="justify-between"><Button variant="outline" onClick={() => step === 1 ? onOpenChange(false) : setStep((current) => current - 1)}>{step === 1 ? "Annulla" : <><ArrowLeft />Indietro</>}</Button><Button onClick={() => void next()} disabled={busy || (step === 2 && !token.trim()) || (step === 4 && !companyId) || (step === 5 && !productId)}>{busy ? "Verifica…" : step === 7 ? <><Check />Conferma e attiva</> : <>Continua <ArrowRight /></>}</Button></DialogFooter></DialogContent></Dialog>
}

function WizardCopy({ title, body }: { title: string; body: string }) { return <div className="grid min-h-48 place-items-center rounded-lg border bg-muted/20 p-8 text-center"><div><Cloud className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-medium">{title}</h3><p className="mt-2 max-w-md text-sm text-muted-foreground">{body}</p></div></div> }
function ChoiceList({ title, entries, value, onChange, empty }: { title: string; entries: Array<{ id: string; name: string }>; value: string; onChange: (value: string) => void; empty: string }) { return <div><p className="mb-3 font-medium">{title}</p>{entries.length ? <div className="space-y-2">{entries.map((entry) => <button type="button" key={entry.id} onClick={() => onChange(entry.id)} className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm ${value === entry.id ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'}`}><span>{entry.name}</span>{value === entry.id ? <Check className="size-4" /> : null}</button>)}</div> : <Alert variant="destructive"><AlertDescription>{empty}</AlertDescription></Alert>}</div> }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4"><span className="text-muted-foreground">{label}</span><strong className="text-right font-medium">{value}</strong></div> }
