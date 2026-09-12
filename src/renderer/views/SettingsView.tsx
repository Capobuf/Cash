import type { FormEvent } from "react"
import { createBlankProfile, type CashDocument } from "../../domain/model"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/FormControls"
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
  doc: CashDocument
  appState: AppState
  ficUi: FicUiState
  onEditProfile: (id: string) => void
  onCopyProfile: (id: string) => void
  requestDelete: (target: DeleteTarget) => void
}) {
  const fic = doc.settings.fic
  const deviceState = !fic.enabled ? "Disattivata" : ficUi.connectionError || fic.lastVerification?.result === "error" ? "Errore collegamento" : !ficUi.hasToken ? "Richiede configurazione locale" : "Attiva"

  const saveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const territory = formReader(event.currentTarget).get("fuelTerritory")
    appState.mutate((document) => { document.settings = { ...(territory ? { fuelTerritory: territory } : {}), fic: document.settings.fic } })
  }

  const addBlankProfile = () => {
    const year = Number(promptRequired("Anno del nuovo profilo", String(new Date().getFullYear())))
    if (!year) return
    if (doc.profiles.some((profile) => profile.year === year)) { window.alert("Esiste già un profilo per questo anno."); return }
    const profile = createBlankProfile(year)
    appState.mutate((document) => document.profiles.unshift(profile))
    onEditProfile(profile.id)
  }

  const activateFic = async () => {
    if (!ficUi.setupInfo.clientId) { window.alert("Questa build non contiene il Client ID dell’app privata. Ricompilarla impostando CASH_FIC_CLIENT_ID."); return }
    await appState.save()
    if (appState.status !== "Salvato" || !appState.session?.document) return
    const token = promptRequired("Incolla il token manuale. Client ID e permessi richiesti sono indicati nelle istruzioni della scheda.")
    if (!token) return
    const companies = await window.cash.fic.listCompaniesForActivation(token)
    if (!companies.ok) { ficUi.setConnectionError(true); appState.setError(companies.error); return }
    const company = companies.value[Number(promptRequired(`Seleziona azienda:\n${companies.value.map((entry, index) => `${index + 1}. ${entry.name}`).join("\n")}`)) - 1]
    if (!company) return
    const products = await window.cash.fic.listProductsForActivation({ token, companyId: company.id })
    if (!products.ok) { ficUi.setConnectionError(true); appState.setError(products.error); return }
    if (!products.value.length) { window.alert("Nessun prodotto con nome esatto “Consulenza”. Crearlo in Fatture in Cloud e riprovare."); return }
    const productIndex = products.value.length === 1 ? 0 : Number(promptRequired(`Seleziona prodotto Consulenza:\n${products.value.map((entry, index) => `${index + 1}. ${entry.name} (${entry.id})`).join("\n")}`)) - 1
    const product = products.value[productIndex]
    if (!product) return
    const completed = await window.cash.fic.completeActivation({ token, companyId: company.id, productId: product.id, path: appState.session.path, document: appState.session.document, concurrencyToken: appState.session.token })
    if (!completed.ok) { ficUi.setConnectionError(true); appState.setError(completed.error); return }
    ficUi.setHasToken(true); ficUi.setConnectionError(false); appState.acceptNativeSession(completed.value)
  }

  const removeFic = async () => {
    if (!window.confirm("Rimuovere configurazione condivisa e token locale? Gli snapshot storici resteranno invariati.")) return
    await appState.save()
    if (appState.status !== "Salvato" || !appState.session?.document) return
    const removed = await window.cash.fic.removeLink({ path: appState.session.path, document: appState.session.document, concurrencyToken: appState.session.token })
    if (!removed.ok) { appState.setError(removed.error); return }
    ficUi.setHasToken(false); appState.acceptNativeSession(removed.value)
  }

  return (
    <div className="app-grid">
      <Card className="card"><CardHeader><CardTitle>Pianificazione</CardTitle></CardHeader><CardContent><form className="form-grid" onSubmit={saveSettings}><Field label="Regione / provincia MIMIT" name="fuelTerritory" value={doc.settings.fuelTerritory ?? ""} /><Button type="submit" className="full">Salva</Button></form></CardContent></Card>
      <Card className="card wide"><CardHeader><CardTitle>Fatture in Cloud</CardTitle></CardHeader><CardContent>
        <Alert><AlertTitle>{deviceState}</AlertTitle><AlertDescription>{fic.enabled ? <>{fic.company?.name ?? "Azienda non configurata"} · {fic.product?.name ?? "Prodotto non configurato"} · ultima verifica {fic.lastVerification?.at ?? "—"}</> : <>Nessuna chiamata al servizio. Tutte le funzioni locali restano disponibili.</>}</AlertDescription></Alert>
        <p className="small muted">Client ID app privata: <strong>{ficUi.setupInfo.clientId || "non configurato nella build"}</strong><br />Permessi: {ficUi.setupInfo.requiredScopes.join(", ")}. Il token resta nel Gestore credenziali di Windows.</p>
        <div className="actions">{fic.enabled ? <Button variant="secondary" onClick={() => appState.mutate((document) => { document.settings.fic.enabled = false })}>Disattiva</Button> : <Button onClick={() => void activateFic()}>Usa Fatture in Cloud</Button>}<Button variant="ghost" onClick={() => void activateFic()}>{fic.enabled ? "Riconfigura postazione" : "Avvia configurazione guidata"}</Button><Button variant="destructive" onClick={() => void removeFic()}>Rimuovi collegamento</Button></div>
      </CardContent></Card>
      <Card className="card full"><CardHeader className="section-heading"><CardTitle>Profili annuali</CardTitle><Button onClick={addBlankProfile}>Nuovo vuoto</Button></CardHeader><CardContent>
        {doc.profiles.length ? <div className="list">{doc.profiles.map((profile) => <div className="row" key={profile.id}><div><strong>{profile.year}</strong><div className="row-detail">rev. {profile.revision} · {profile.confirmed ? "Confermato" : "Da verificare"}</div></div><div className="row-actions"><Button size="sm" onClick={() => onEditProfile(profile.id)}>Modifica</Button><Button variant="secondary" size="sm" onClick={() => onCopyProfile(profile.id)}>Copia per nuovo anno</Button><Button variant="destructive" size="sm" onClick={() => requestDelete({ kind: "profile", id: profile.id, label: `Profilo ${profile.year}` })}>Elimina</Button></div></div>)}</div> : <div className="empty">Nessun profilo.</div>}
      </CardContent></Card>
      <Alert className="card full"><AlertTitle>Uso su più postazioni</AlertTitle><AlertDescription>Chiudi Cash solo quando compare “Salvato”, attendi la sincronizzazione Drive sulla prima postazione e poi sulla seconda. L’uso simultaneo non è supportato.</AlertDescription></Alert>
    </div>
  )
}
