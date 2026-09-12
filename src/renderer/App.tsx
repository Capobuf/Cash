import { useEffect, useState } from "react"
import { deleteLocalClient } from "../domain/clients"
import { copyProfileToYear } from "../domain/profiles"
import type { CashDocument } from "../domain/model"
import { AppShell, DeleteDialog, Onboarding } from "@/components/Layout"
import { useAppState } from "@/hooks/use-app-state"
import { state } from "./state"
import type { DeleteTarget, View } from "./types"
import { CatalogView } from "./views/CatalogView"
import { ClientsView } from "./views/ClientsView"
import { DashboardView } from "./views/DashboardView"
import { QuotesView } from "./views/QuotesView"
import { ResourcesView } from "./views/ResourcesView"
import { SettingsView } from "./views/SettingsView"

export function App() {
  const appState = useAppState(state)
  const [view, setView] = useState<View>("dashboard")
  const [activeQuoteId, setActiveQuoteId] = useState<string>()
  const [activeProfileId, setActiveProfileId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [hasFicToken, setHasFicToken] = useState(false)
  const [ficConnectionError, setFicConnectionError] = useState(false)
  const [ficSetupInfo, setFicSetupInfo] = useState<{ clientId: string; requiredScopes: string[] }>({ clientId: "", requiredScopes: [] })

  useEffect(() => {
    void state.initialize()
    void window.cash.credentials.hasFicToken().then((result) => { setHasFicToken(result.ok && result.value); setFicConnectionError(!result.ok) })
    void window.cash.fic.setupInfo().then(setFicSetupInfo)
    return window.cash.onCloseRequested(() => {
      void (async () => {
        const choice = window.prompt("Modifiche non salvate. Digita: salva, recupero, scarta oppure annulla.", "annulla")?.trim().toLocaleLowerCase("it")
        if (choice === "salva") { await state.save(); window.cash.resolveClose(state.status === "Salvato" ? "discard" : "cancel") }
        else if (choice === "recupero") window.cash.resolveClose(await state.recovery() ? "discard" : "cancel")
        else if (choice === "scarta") window.cash.resolveClose("discard")
        else window.cash.resolveClose("cancel")
      })()
    })
  }, [])

  const navigate = (next: View) => { setView(next); setActiveQuoteId(undefined) }

  const copyProfile = (id: string) => {
    const doc = appState.document
    const source = doc?.profiles.find((profile) => profile.id === id)
    const year = Number(window.prompt("Anno del nuovo profilo", String((source?.year ?? 2025) + 1))?.trim())
    if (!source || !year) return
    if (doc?.profiles.some((profile) => profile.year === year)) { window.alert("Esiste già un profilo per questo anno."); return }
    const copied = copyProfileToYear(source, year)
    if (!copied.ok) { appState.setError(copied.error); return }
    setActiveProfileId(copied.value.id)
    appState.mutate((document) => document.profiles.unshift(copied.value))
    setView("dashboard")
  }

  const deleteEntity = (doc: CashDocument, target: DeleteTarget) => {
    if (target.kind === "local-client") {
      const result = deleteLocalClient(doc, target.id)
      if (!result.ok) { appState.setError(result.error); return }
      appState.mutate((document) => { document.localClients = result.value.localClients })
      return
    }
    if (target.kind === "profile") {
      const references = doc.quotes.filter((quote) => quote.profileId === target.id).map((quote) => `${quote.date} · ${quote.items.map((item) => item.name).join(", ") || "preventivo incompleto"}`)
      if (references.length) { appState.setError({ code: "CONFLICT", field: "profile", message: "Il profilo è ancora il riferimento corrente di uno o più preventivi.", details: references }); return }
    }
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
  const content = view === "dashboard"
    ? <DashboardView key={activeProfileId ?? doc.profiles[0]?.id ?? "empty"} doc={doc} appState={appState} activeProfileId={activeProfileId} onCopyProfile={copyProfile} onOpenQuote={(id) => { setActiveQuoteId(id); setView("quotes") }} />
    : view === "quotes"
      ? <QuotesView doc={doc} appState={appState} activeQuoteId={activeQuoteId} setActiveQuoteId={setActiveQuoteId} requestDelete={setDeleteTarget} />
      : view === "clients"
        ? <ClientsView doc={doc} appState={appState} requestDelete={setDeleteTarget} />
        : view === "resources"
          ? <ResourcesView doc={doc} appState={appState} requestDelete={setDeleteTarget} />
          : view === "catalog"
            ? <CatalogView doc={doc} appState={appState} requestDelete={setDeleteTarget} />
            : <SettingsView doc={doc} appState={appState} ficUi={{ hasToken: hasFicToken, connectionError: ficConnectionError, setupInfo: ficSetupInfo, setHasToken: setHasFicToken, setConnectionError: setFicConnectionError }} onEditProfile={(id) => { setActiveProfileId(id); setView("dashboard") }} onCopyProfile={copyProfile} requestDelete={setDeleteTarget} />

  return <><AppShell appState={appState} view={view} onView={navigate}>{content}</AppShell><DeleteDialog target={deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }} onConfirm={() => { if (deleteTarget) deleteEntity(doc, deleteTarget); setDeleteTarget(null) }} /></>
}
