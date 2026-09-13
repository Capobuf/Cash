import { useEffect, useState } from "react"
import { meta, type CashDocument, type Quote } from "../domain/model"
import { copyProfileToYear } from "../domain/profiles"
import { snapshotProfile } from "../domain/refresh"
import { AppShell, DeleteDialog, Onboarding } from "@/components/Layout"
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAppState } from "@/hooks/use-app-state"
import { state, type ArchiveDecision } from "./state"
import type { DeleteTarget, View } from "./types"
import { CatalogView } from "./views/CatalogView"
import { ClientsView } from "./views/ClientsView"
import { DashboardView } from "./views/DashboardView"
import { QuotesView } from "./views/QuotesView"
import { SettingsView } from "./views/SettingsView"

export function App() {
  const appState = useAppState(state)
  const [view, setView] = useState<View>("dashboard")
  const [activeQuoteId, setActiveQuoteId] = useState<string>()
  const [activeProfileId, setActiveProfileId] = useState<string>()
  const [copyProfileId, setCopyProfileId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [decisionResolver, setDecisionResolver] = useState<((choice: ArchiveDecision) => void) | null>(null)
  const [hasFicToken, setHasFicToken] = useState(false)
  const [ficConnectionError, setFicConnectionError] = useState(false)
  const [ficSetupInfo, setFicSetupInfo] = useState<{ clientId: string; requiredScopes: string[] }>({ clientId: "", requiredScopes: [] })

  const requestArchiveDecision = () => new Promise<ArchiveDecision>((resolve) => setDecisionResolver(() => resolve))

  useEffect(() => {
    state.setArchiveDecisionHandler(requestArchiveDecision)
    void state.initialize()
    void window.cash.credentials.hasFicToken().then((result) => { setHasFicToken(result.ok && result.value); setFicConnectionError(!result.ok) })
    void window.cash.fic.setupInfo().then(setFicSetupInfo)
    return window.cash.onCloseRequested(() => {
      void requestArchiveDecision().then(async (choice) => {
        if (choice === "save") { await state.save(); window.cash.resolveClose(state.status === "Salvato" ? "discard" : "cancel") }
        else if (choice === "recovery") window.cash.resolveClose(await state.recovery() ? "discard" : "cancel")
        else window.cash.resolveClose(choice === "discard" ? "discard" : "cancel")
      })
    })
  }, [])

  const navigate = (next: View) => { setView(next); setActiveQuoteId(undefined); if (next !== "settings") setActiveProfileId(undefined) }

  const createQuote = () => {
    const doc = appState.document
    if (!doc) return
    const profile = [...doc.profiles].sort((a, b) => b.year - a.year).find((entry) => entry.confirmed)
    const snapshot = profile ? snapshotProfile(profile, doc.businessCosts) : undefined
    const created: Quote = { ...meta(), date: new Date().toISOString().slice(0, 10), ...(profile ? { profileId: profile.id } : {}), ...(snapshot?.ok ? { profileSnapshot: snapshot.value } : {}), items: [], snapshotRevision: 0, exportAttempts: [] }
    appState.mutate((document) => document.quotes.push(created))
    setActiveQuoteId(created.id)
    setView("quotes")
  }

  const copyProfile = (year: number) => {
    const doc = appState.document
    const source = doc?.profiles.find((profile) => profile.id === copyProfileId)
    if (!source || !doc) return
    if (doc.profiles.some((profile) => profile.year === year)) {
      appState.setError({ code: "CONFLICT", field: "profile.year", message: `Esiste già un profilo per il ${year}.`, action: "Scegli un anno diverso." })
      return
    }
    const copied = copyProfileToYear(source, year)
    if (!copied.ok) { appState.setError(copied.error); return }
    appState.mutate((document) => document.profiles.unshift(copied.value))
    setCopyProfileId(undefined)
    setActiveProfileId(copied.value.id)
    setView("settings")
  }

  const deleteEntity = (doc: CashDocument, target: DeleteTarget) => {
    if (target.kind === "local-client") return
    if (target.kind === "profile") {
      const references = doc.quotes.filter((quote) => quote.profileId === target.id).map((quote) => `${quote.date} · ${quote.items.map((item) => item.name).join(", ") || "preventivo incompleto"}`)
      if (references.length) { appState.setError({ code: "CONFLICT", field: "profile", message: "Il profilo è ancora il riferimento corrente di uno o più preventivi.", details: references }); return }
    }
    if (target.kind === "site" && doc.settings.defaultDepartureSiteId === target.id) { appState.setError({ code: "CONFLICT", message: "La Sede è la partenza predefinita.", action: "Scegli o rimuovi prima la partenza predefinita." }); return }
    if (target.kind === "vehicle" && doc.settings.defaultVehicleId === target.id) { appState.setError({ code: "CONFLICT", message: "Il Veicolo è quello predefinito.", action: "Scegli o rimuovi prima il Veicolo predefinito." }); return }
    appState.mutate((document) => {
      if (target.kind === "cost") document.businessCosts = document.businessCosts.filter((entry) => entry.id !== target.id)
      else if (target.kind === "vehicle") document.vehicles = document.vehicles.filter((entry) => entry.id !== target.id)
      else if (target.kind === "site") document.sites = document.sites.filter((entry) => entry.id !== target.id)
      else if (target.kind === "catalog") document.catalog.subItems = document.catalog.subItems.filter((entry) => entry.id !== target.id)
      else if (target.kind === "template") document.catalog.templates = document.catalog.templates.filter((entry) => entry.id !== target.id)
      else if (target.kind === "profile") { document.profiles = document.profiles.filter((entry) => entry.id !== target.id); if (activeProfileId === target.id) setActiveProfileId(undefined) }
      else if (target.kind === "quote") { document.quotes = document.quotes.filter((entry) => entry.id !== target.id); if (activeQuoteId === target.id) setActiveQuoteId(undefined) }
      else if (target.kind === "item") { const quote = document.quotes.find((entry) => entry.id === activeQuoteId); if (quote) quote.items = quote.items.filter((entry) => entry.id !== target.id) }
      else if (target.kind === "sub") { const [itemId, subId] = target.id.split(":"); const item = document.quotes.find((entry) => entry.id === activeQuoteId)?.items.find((entry) => entry.id === itemId); if (item) item.subItems = item.subItems.filter((entry) => entry.id !== subId) }
    })
  }

  if (!appState.document) return <Onboarding appState={appState} />
  const doc = appState.document
  const openProfile = (id?: string) => { setActiveProfileId(id); setView("settings") }
  const content = view === "dashboard"
    ? <DashboardView doc={doc} appState={appState} onEditProfile={openProfile} onOpenQuote={(id) => { setActiveQuoteId(id); setView("quotes") }} onNewQuote={createQuote} />
    : view === "quotes"
      ? <QuotesView doc={doc} appState={appState} activeQuoteId={activeQuoteId} setActiveQuoteId={setActiveQuoteId} requestDelete={setDeleteTarget} />
      : view === "clients"
        ? <ClientsView doc={doc} appState={appState} requestDelete={setDeleteTarget} />
        : view === "catalog"
          ? <CatalogView doc={doc} appState={appState} requestDelete={setDeleteTarget} />
          : <SettingsView doc={doc} appState={appState} activeProfileId={activeProfileId} ficUi={{ hasToken: hasFicToken, connectionError: ficConnectionError, setupInfo: ficSetupInfo, setSetupInfo: setFicSetupInfo, setHasToken: setHasFicToken, setConnectionError: setFicConnectionError }} onEditProfile={setActiveProfileId} onCopyProfile={setCopyProfileId} requestDelete={setDeleteTarget} />

  const copySource = doc.profiles.find((profile) => profile.id === copyProfileId)
  return <>
    <AppShell appState={appState} view={view} onView={navigate}>{content}</AppShell>
    <DeleteDialog target={deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }} onConfirm={() => { if (deleteTarget) deleteEntity(doc, deleteTarget); setDeleteTarget(null) }} />
    <Dialog open={Boolean(copySource)} onOpenChange={(open) => { if (!open) setCopyProfileId(undefined) }}><DialogContent><form onSubmit={(event) => { event.preventDefault(); copyProfile(Number(new FormData(event.currentTarget).get("year"))) }} className="contents"><DialogHeader><DialogTitle>Copia profilo {copySource?.year}</DialogTitle><DialogDescription>La copia avrà una nuova identità e sarà Da verificare.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="copy-profile-year">Nuovo anno</FieldLabel><Input id="copy-profile-year" name="year" type="number" defaultValue={(copySource?.year ?? 2025) + 1} min={2000} max={2200} autoFocus required /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setCopyProfileId(undefined)}>Annulla</Button><Button type="submit">Crea copia</Button></DialogFooter></form></DialogContent></Dialog>
    <AlertDialog open={Boolean(decisionResolver)} onOpenChange={(open) => { if (!open && decisionResolver) { decisionResolver("cancel"); setDecisionResolver(null) } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Ci sono modifiche non ancora salvate</AlertDialogTitle><AlertDialogDescription>Prima di aprire un altro archivio o chiudere Cash puoi attendere il salvataggio, creare una copia di recupero oppure scartare le modifiche locali.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="flex-wrap"><Button variant="outline" onClick={() => { decisionResolver?.("cancel"); setDecisionResolver(null) }}>Annulla</Button><Button variant="outline" onClick={() => { decisionResolver?.("recovery"); setDecisionResolver(null) }}>Copia di recupero</Button><Button variant="destructive" onClick={() => { decisionResolver?.("discard"); setDecisionResolver(null) }}>Scarta modifiche</Button><Button onClick={() => { decisionResolver?.("save"); setDecisionResolver(null) }}>Salva e continua</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>
}
