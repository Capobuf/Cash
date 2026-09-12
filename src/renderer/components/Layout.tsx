import { Archive, BookOpen, Boxes, FileText, Gauge, MoreHorizontal, Settings, Users, X } from "lucide-react"
import type { ReactNode } from "react"
import type { AppState } from "../state"
import type { DeleteTarget, View } from "../types"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

const entries: Array<{ key: View; label: string; icon: typeof Gauge }> = [
  { key: "dashboard", label: "Panoramica", icon: Gauge },
  { key: "quotes", label: "Preventivi", icon: FileText },
  { key: "clients", label: "Clienti", icon: Users },
  { key: "resources", label: "Risorse", icon: Boxes },
  { key: "catalog", label: "Catalogo", icon: BookOpen },
  { key: "settings", label: "Impostazioni", icon: Settings },
]

const titles: Record<View, string> = {
  dashboard: "Panoramica", quotes: "Preventivi", clients: "Clienti",
  resources: "Risorse", catalog: "Catalogo", settings: "Impostazioni",
}

const descriptions: Record<View, string> = {
  dashboard: "Obiettivi, fiscalità e capacità", quotes: "Componi e verifica le tue offerte",
  clients: "Gestisci le anagrafiche locali", resources: "Costi, veicoli e sedi operative",
  catalog: "Contenuti e modelli riutilizzabili", settings: "Archivio e integrazioni",
}

export function GlobalError({ appState }: { appState: AppState }) {
  if (!appState.error) return null
  return (
    <Alert variant="destructive" className="global-error">
      <AlertTitle>{appState.error.message}</AlertTitle>
      <AlertDescription>
        {appState.error.action ? <div>{appState.error.action}</div> : null}
        {appState.error.details?.length ? <ul className="error-list">{appState.error.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
      </AlertDescription>
      <AlertAction><Button variant="ghost" size="icon-sm" aria-label="Chiudi messaggio" onClick={() => appState.clearError()}><X /></Button></AlertAction>
    </Alert>
  )
}

export function Onboarding({ appState }: { appState: AppState }) {
  return (
    <main className="onboarding">
      <section className="welcome">
        <span className="pill">Client desktop locale</span>
        <h1>Preventivi con una base verificabile.</h1>
        <p>Cash mette insieme obiettivo economico, tempo, trasferte e spese. Il prezzo finale resta sempre una tua decisione.</p>
        <GlobalError appState={appState} />
        <div className="actions">
          <Button onClick={() => void appState.create()}>Crea archivio</Button>
          <Button variant="secondary" onClick={() => void appState.open()}>Apri archivio</Button>
        </div>
        <p className="small">Per l’uso con Google Drive scegli una cartella “Il mio Drive” in modalità Duplica file.</p>
      </section>
    </main>
  )
}

export function AppShell({ appState, view, onView, children }: {
  appState: AppState
  view: View
  onView: (view: View) => void
  children: ReactNode
}) {
  const archiveName = (appState.session?.path ?? "").split(/[\\/]/).pop() ?? ""
  const statusClass = appState.status === "Salvato" ? "" : appState.status.includes("Errore") || appState.status.includes("Conflitto") ? "bad" : "warn"
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span>C</span><div>Cash<small>preventivi verificabili</small></div></div>
        <nav className="nav" aria-label="Navigazione principale">
          {entries.map(({ key, label, icon: Icon }) => (
            <Button key={key} variant="ghost" className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} onClick={() => onView(key)}>
              <Icon className="nav-icon" aria-hidden="true" />{label}
            </Button>
          ))}
        </nav>
        <div className="sidebar-note"><strong>Archivio locale</strong><p>Attendi lo stato “Salvato” prima di cambiare postazione.</p></div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="page-heading"><div className="eyebrow">{descriptions[view]}</div><h1>{titles[view]}</h1>{archiveName ? <div className="archive-name" title={appState.session?.path}>{archiveName}</div> : null}</div>
          <div className="topbar-actions">
            <span className={`status ${statusClass}`.trim()} role="status">{appState.status}</span>
            <Button variant="ghost" size="sm" onClick={() => void appState.open()}><Archive />Apri archivio</Button>
            <Button onClick={() => void appState.save()} disabled={appState.status === "Salvato"}>Salva ora</Button>
            <details className="more-actions"><summary aria-label="Altre azioni"><MoreHorizontal /></summary><div>
              <Button variant="ghost" onClick={() => void appState.recovery()}>Copia di recupero</Button>
              <Button variant="ghost" onClick={() => void appState.restoreBackup()}>Ripristina backup</Button>
            </div></details>
          </div>
        </header>
        <GlobalError appState={appState} />
        {children}
      </main>
    </div>
  )
}

export function DeleteDialog({ target, onOpenChange, onConfirm }: {
  target: DeleteTarget | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare questo elemento?</AlertDialogTitle>
          <AlertDialogDescription>{target?.label ? `“${target.label}” verrà eliminato dall’archivio.` : "L’operazione aggiornerà l’archivio corrente."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>Elimina</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
