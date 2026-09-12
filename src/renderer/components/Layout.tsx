import { Archive, BookOpen, CheckCircle2, CircleAlert, CloudCog, Database, FileText, Gauge, LoaderCircle, MoreHorizontal, Save, Settings, Users, X } from "lucide-react"
import type { ReactNode } from "react"
import type { AppState } from "../state"
import type { DeleteTarget, View } from "../types"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider,
} from "@/components/ui/sidebar"

const entries: Array<{ key: View; label: string; icon: typeof Gauge }> = [
  { key: "dashboard", label: "Panoramica", icon: Gauge },
  { key: "quotes", label: "Preventivi", icon: FileText },
  { key: "clients", label: "Clienti", icon: Users },
  { key: "catalog", label: "Catalogo", icon: BookOpen },
  { key: "settings", label: "Impostazioni", icon: Settings },
]

const titles: Record<View, string> = {
  dashboard: "Panoramica", quotes: "Preventivi", clients: "Clienti",
  catalog: "Catalogo", settings: "Impostazioni",
}

const descriptions: Record<View, string> = {
  dashboard: "Obiettivi, fiscalità e capacità", quotes: "Componi e verifica le tue offerte",
  clients: "Anagrafiche locali essenziali",
  catalog: "Sottovoci e template riutilizzabili", settings: "Profili, risorse, integrazioni e archivio",
}

export function GlobalError({ appState }: { appState: AppState }) {
  if (!appState.error) return null
  return (
    <Alert variant="destructive">
      <AlertTitle>{appState.error.message}</AlertTitle>
      <AlertDescription>
        {appState.error.action ? <div>{appState.error.action}</div> : null}
        {appState.error.details?.length ? <ul className="mt-2 list-disc pl-4">{appState.error.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
      </AlertDescription>
      <AlertAction><Button variant="ghost" size="icon-sm" aria-label="Chiudi messaggio" onClick={() => appState.clearError()}><X /></Button></AlertAction>
    </Alert>
  )
}

export function Onboarding({ appState }: { appState: AppState }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <Badge className="mb-3">Client desktop locale</Badge>
          <CardTitle className="text-3xl">Preventivi con una base verificabile.</CardTitle>
          <CardDescription className="text-base">Cash mette insieme obiettivo economico, tempo, trasferte e spese. Il prezzo finale resta sempre una tua decisione.</CardDescription>
        </CardHeader>
        <CardContent><GlobalError appState={appState} /></CardContent>
        <CardFooter className="justify-between gap-4">
          <p className="text-sm text-muted-foreground">Per Google Drive scegli una cartella “Il mio Drive” in modalità Duplica file.</p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => void appState.open()}>Apri archivio</Button>
            <Button onClick={() => void appState.create()}>Crea archivio</Button>
          </div>
        </CardFooter>
      </Card>
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
  const statusCritical = appState.status.includes("Errore") || appState.status.includes("Conflitto") || appState.status === "Dati da correggere" || appState.status === "Sola lettura"
  const StatusIcon = appState.status === "Salvato" ? CheckCircle2 : appState.status === "Salvataggio" ? LoaderCircle : statusCritical ? CircleAlert : CloudCog
  return (
    <SidebarProvider>
      <Sidebar collapsible="none">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">C</div>
            <div><div className="font-semibold">Cash</div><div className="text-xs text-sidebar-foreground/70">Preventivi verificabili</div></div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Applicazione</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {entries.map(({ key, label, icon: Icon }) => (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton isActive={view === key} aria-current={view === key ? "page" : undefined} onClick={() => onView(key)}>
                      <Icon aria-hidden="true" /><span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-4">
          <div className="flex gap-3 rounded-lg border border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
            <Database className="mt-0.5 size-4 shrink-0" />
            <div><strong className="font-medium text-sidebar-foreground">Archivio locale</strong><p className="mt-1">Attendi “Salvato” prima di cambiare postazione.</p></div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-6 border-b bg-background/95 px-8 py-3 backdrop-blur">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{descriptions[view]}</p>
            <h1 className="text-xl font-semibold tracking-tight">{titles[view]}</h1>
            {archiveName ? <p className="max-w-lg truncate text-xs text-muted-foreground" title={appState.session?.path}>{archiveName}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={statusCritical ? "destructive" : "outline"} role="status" className="gap-1.5"><StatusIcon className={appState.status === "Salvataggio" ? "animate-spin" : undefined} />{appState.status}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label="Azioni archivio" />}><Archive />Archivio <MoreHorizontal /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Archivio</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void appState.open()}>Apri archivio</DropdownMenuItem>
                <DropdownMenuItem disabled={appState.status === "Salvato"} onClick={() => void appState.save()}><Save />Salva ora</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void appState.recovery()}>Copia di recupero</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void appState.restoreBackup()}>Ripristina backup</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <Separator />
        <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-4 p-6 2xl:p-8">
          <GlobalError appState={appState} />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
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
