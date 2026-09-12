import { MoreHorizontal } from "lucide-react"
import { useState, type FormEvent } from "react"
import { createBlankProfile, type CashDocument } from "../../domain/model"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formReader } from "@/lib/format"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

const promptRequired = (message: string, initial = ""): string | undefined => window.prompt(message, initial)?.trim() || undefined

export interface FicUiState {
  hasToken: boolean
  connectionError: boolean
  setupInfo: { clientId: string; requiredScopes: string[] }
  setHasToken: (value: boolean) => void
  setConnectionError: (value: boolean) => void
}

export function SettingsView({ doc, appState, ficUi, onEditProfile, onCopyProfile, requestDelete }: {
  doc: CashDocument; appState: AppState; ficUi: FicUiState; onEditProfile: (id: string) => void
  onCopyProfile: (id: string) => void; requestDelete: (target: DeleteTarget) => void
}) {
  const fic = doc.settings.fic
  const [newProfileOpen, setNewProfileOpen] = useState(false)
  const [removeFicOpen, setRemoveFicOpen] = useState(false)
  const deviceState = !fic.enabled ? "Disattivata" : ficUi.connectionError || fic.lastVerification?.result === "error" ? "Errore collegamento" : !ficUi.hasToken ? "Richiede configurazione locale" : "Attiva"

  const saveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const territory = formReader(event.currentTarget).get("fuelTerritory")
    appState.mutate((document) => { document.settings = { ...(territory ? { fuelTerritory: territory } : {}), fic: document.settings.fic } })
  }
  const addBlankProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const year = Number(formReader(event.currentTarget).get("year"))
    if (!year) return
    if (doc.profiles.some((profile) => profile.year === year)) { window.alert("Esiste già un profilo per questo anno."); return }
    const profile = createBlankProfile(year)
    appState.mutate((document) => document.profiles.unshift(profile)); setNewProfileOpen(false); onEditProfile(profile.id)
  }
  const activateFic = async () => {
    if (!ficUi.setupInfo.clientId) { window.alert("Questa build non contiene il Client ID dell’app privata. Ricompilarla impostando CASH_FIC_CLIENT_ID."); return }
    await appState.save(); if (appState.status !== "Salvato" || !appState.session?.document) return
    const token = promptRequired("Incolla il token manuale. Client ID e permessi richiesti sono indicati nelle istruzioni della scheda."); if (!token) return
    const companies = await window.cash.fic.listCompaniesForActivation(token)
    if (!companies.ok) { ficUi.setConnectionError(true); appState.setError(companies.error); return }
    const company = companies.value[Number(promptRequired(`Seleziona azienda:\n${companies.value.map((entry, index) => `${index + 1}. ${entry.name}`).join("\n")}`)) - 1]; if (!company) return
    const products = await window.cash.fic.listProductsForActivation({ token, companyId: company.id })
    if (!products.ok) { ficUi.setConnectionError(true); appState.setError(products.error); return }
    if (!products.value.length) { window.alert("Nessun prodotto con nome esatto “Consulenza”. Crearlo in Fatture in Cloud e riprovare."); return }
    const productIndex = products.value.length === 1 ? 0 : Number(promptRequired(`Seleziona prodotto Consulenza:\n${products.value.map((entry, index) => `${index + 1}. ${entry.name} (${entry.id})`).join("\n")}`)) - 1
    const product = products.value[productIndex]; if (!product) return
    const completed = await window.cash.fic.completeActivation({ token, companyId: company.id, productId: product.id, path: appState.session.path, document: appState.session.document, concurrencyToken: appState.session.token })
    if (!completed.ok) { ficUi.setConnectionError(true); appState.setError(completed.error); return }
    ficUi.setHasToken(true); ficUi.setConnectionError(false); appState.acceptNativeSession(completed.value)
  }
  const removeFic = async () => {
    await appState.save(); if (appState.status !== "Salvato" || !appState.session?.document) return
    const removed = await window.cash.fic.removeLink({ path: appState.session.path, document: appState.session.document, concurrencyToken: appState.session.token })
    if (!removed.ok) { appState.setError(removed.error); return }
    ficUi.setHasToken(false); appState.acceptNativeSession(removed.value)
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-4"><CardHeader><CardTitle>Pianificazione</CardTitle><CardDescription>Territorio usato per i dati carburante MIMIT.</CardDescription></CardHeader><CardContent><form onSubmit={saveSettings}><FieldGroup><Field><FieldLabel htmlFor="fuelTerritory">Regione / provincia MIMIT</FieldLabel><Input id="fuelTerritory" name="fuelTerritory" defaultValue={doc.settings.fuelTerritory ?? ""} /></Field><Button type="submit">Salva</Button></FieldGroup></form></CardContent></Card>
      <Card className="col-span-8"><CardHeader><CardTitle>Fatture in Cloud</CardTitle><CardDescription>Integrazione opzionale; le funzioni locali restano sempre disponibili.</CardDescription><CardAction><Badge variant={deviceState === "Attiva" ? "default" : deviceState === "Errore collegamento" ? "destructive" : "secondary"}>{deviceState}</Badge></CardAction></CardHeader><CardContent className="space-y-4">
        <Alert><AlertTitle>{fic.company?.name ?? "Azienda non configurata"}</AlertTitle><AlertDescription>{fic.enabled ? <>{fic.product?.name ?? "Prodotto non configurato"} · ultima verifica {fic.lastVerification?.at ?? "—"}</> : <>Nessuna chiamata al servizio.</>}</AlertDescription></Alert>
        <p className="text-sm text-muted-foreground">Client ID app privata: <strong className="text-foreground">{ficUi.setupInfo.clientId || "non configurato nella build"}</strong><br />Permessi: {ficUi.setupInfo.requiredScopes.join(", ")}. Il token resta nel Gestore credenziali di Windows.</p>
        <div className="flex flex-wrap gap-2">{fic.enabled ? <Button variant="secondary" onClick={() => appState.mutate((document) => { document.settings.fic.enabled = false })}>Disattiva</Button> : <Button onClick={() => void activateFic()}>Usa Fatture in Cloud</Button>}<Button variant="outline" onClick={() => void activateFic()}>{fic.enabled ? "Riconfigura postazione" : "Avvia configurazione guidata"}</Button><Button variant="destructive" onClick={() => setRemoveFicOpen(true)}>Rimuovi collegamento</Button></div>
      </CardContent></Card>
      <Card className="col-span-12"><CardHeader><CardTitle>Profili annuali</CardTitle><CardDescription>Revisioni economiche disponibili nell’archivio.</CardDescription><CardAction><Button onClick={() => setNewProfileOpen(true)}>Nuovo vuoto</Button></CardAction></CardHeader><CardContent>{doc.profiles.length ? <Table><TableHeader><TableRow><TableHead>Anno</TableHead><TableHead>Revisione</TableHead><TableHead>Stato</TableHead><TableHead className="w-16 text-right">Azioni</TableHead></TableRow></TableHeader><TableBody>{doc.profiles.map((profile) => <TableRow key={profile.id}><TableCell className="font-medium">{profile.year}</TableCell><TableCell>{profile.revision}</TableCell><TableCell><Badge variant={profile.confirmed ? "default" : "secondary"}>{profile.confirmed ? "Confermato" : "Da verificare"}</Badge></TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Azioni profilo ${profile.year}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onEditProfile(profile.id)}>Modifica</DropdownMenuItem><DropdownMenuItem onClick={() => onCopyProfile(profile.id)}>Copia per nuovo anno</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => requestDelete({ kind: "profile", id: profile.id, label: `Profilo ${profile.year}` })}>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table> : <p className="py-8 text-center text-sm text-muted-foreground">Nessun profilo.</p>}</CardContent></Card>
      <Alert className="col-span-12"><AlertTitle>Uso su più postazioni</AlertTitle><AlertDescription>Chiudi Cash solo quando compare “Salvato”, attendi la sincronizzazione Drive sulla prima postazione e poi sulla seconda. L’uso simultaneo non è supportato.</AlertDescription></Alert>
      <Dialog open={newProfileOpen} onOpenChange={setNewProfileOpen}><DialogContent><form onSubmit={addBlankProfile} className="contents"><DialogHeader><DialogTitle>Nuovo profilo annuale</DialogTitle><DialogDescription>Crea un profilo vuoto da completare nella Panoramica.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="new-profile-year">Anno</FieldLabel><Input id="new-profile-year" name="year" type="number" defaultValue={new Date().getFullYear()} min={2000} max={2200} required /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setNewProfileOpen(false)}>Annulla</Button><Button type="submit">Crea profilo</Button></DialogFooter></form></DialogContent></Dialog>
      <AlertDialog open={removeFicOpen} onOpenChange={setRemoveFicOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Rimuovere il collegamento?</AlertDialogTitle><AlertDialogDescription>La configurazione condivisa e il token locale verranno rimossi. Gli snapshot storici resteranno invariati.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void removeFic()}>Rimuovi collegamento</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  )
}
