import {
  Archive,
  ChartNoAxesCombined,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  CloudCog,
  Database,
  FileText,
  Gauge,
  LoaderCircle,
  MoreHorizontal,
  Save,
  Settings,
  Users,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { AppState } from '../state';
import type { DeleteTarget, View } from '../types';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';

const entries: Array<{ key: View; label: string; icon: typeof Gauge }> = [
  { key: 'dashboard', label: 'Panoramica', icon: Gauge },
  { key: 'quotes', label: 'Preventivi', icon: FileText },
  { key: 'clients', label: 'Clienti', icon: Users },
  { key: 'catalog', label: 'Catalogo', icon: BookOpen },
  { key: 'financial-analysis', label: 'Panoramica', icon: ChartNoAxesCombined },
  { key: 'settings', label: 'Impostazioni', icon: Settings },
];

const titles: Record<View, string> = {
  dashboard: 'Panoramica',
  quotes: 'Preventivi',
  clients: 'Clienti',
  'financial-analysis': 'Panoramica finanziaria',
  'bank-summary': 'Spese · Riepilogo',
  'bank-movements': 'Spese · Movimenti',
  'bank-categories': 'Spese · Categorie',
  catalog: 'Catalogo',
  settings: 'Impostazioni',
};

const descriptions: Record<View, string> = {
  dashboard: 'Obiettivi, fiscalità e capacità',
  quotes: 'Componi e verifica le tue offerte',
  clients: 'Clienti Fatture in Cloud e sedi correlate',
  'financial-analysis': 'Obiettivi e dati amministrativi registrati',
  'bank-summary': 'Analisi delle uscite dal conto',
  'bank-movements': 'Importazione e categorizzazione delle uscite',
  'bank-categories': 'Organizza categorie e sottocategorie',
  catalog: 'Template e contenuti riutilizzabili',
  settings: 'Profili, risorse, integrazioni e archivio',
};

function BrandLogo({ className }: { className: string }) {
  return (
    <span className={className} role="img" aria-label="Cash">
      <img
        src="assets/logo-light.svg"
        alt=""
        className="size-full dark:hidden"
      />
      <img
        src="assets/logo-dark.svg"
        alt=""
        className="hidden size-full dark:block"
      />
    </span>
  );
}

export function GlobalError({ appState }: { appState: AppState }) {
  if (!appState.error) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{appState.error.message}</AlertTitle>
      <AlertDescription>
        {appState.error.action ? <div>{appState.error.action}</div> : null}
        {appState.error.details?.length ? (
          <ul className="mt-2 list-disc pl-4">
            {appState.error.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
      <AlertAction>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Chiudi messaggio"
          onClick={() => appState.clearError()}
        >
          <X />
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function Onboarding({ appState }: { appState: AppState }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <BrandLogo className="mb-2 size-16" />
          <Badge className="mb-3">Client desktop locale</Badge>
          <CardTitle className="text-3xl">
            Preventivi con una base verificabile.
          </CardTitle>
          <CardDescription className="text-base">
            Cash mette insieme obiettivo economico, tempo, trasferte e spese. Il
            prezzo finale resta sempre una tua decisione.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GlobalError appState={appState} />
        </CardContent>
        <CardFooter className="justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Per Google Drive scegli una cartella “Il mio Drive” in modalità
            Duplica file.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => void appState.open()}>
              Apri archivio
            </Button>
            <Button onClick={() => void appState.create()}>
              Crea archivio
            </Button>
          </div>
        </CardFooter>
      </Card>
    </main>
  );
}

export function AppShell({
  appState,
  view,
  onView,
  years,
  selectedYear,
  onYearChange,
  children,
}: {
  appState: AppState;
  view: View;
  onView: (view: View) => void;
  years: number[];
  selectedYear: number | undefined;
  onYearChange: (year: number) => void;
  children: ReactNode;
}) {
  const statusCritical =
    appState.status.includes('Errore') ||
    appState.status.includes('Conflitto') ||
    appState.status === 'Dati da correggere' ||
    appState.status === 'Sola lettura';
  const StatusIcon =
    appState.status === 'Salvato'
      ? CheckCircle2
      : appState.status === 'Salvataggio'
        ? LoaderCircle
        : statusCritical
          ? CircleAlert
          : CloudCog;
  return (
    <SidebarProvider>
      <Sidebar collapsible="none">
        <SidebarHeader className="gap-4 p-4">
          <div className="flex items-center">
            <BrandLogo className="size-14 shrink-0" />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="app-year"
              className="text-xs font-medium text-sidebar-foreground/70"
            >
              Anno
            </label>
            <NativeSelect
              id="app-year"
              className="w-full"
              value={selectedYear ?? ''}
              disabled={!years.length}
              onChange={(event) => onYearChange(Number(event.target.value))}
            >
              {years.map((year) => (
                <NativeSelectOption key={year} value={year}>
                  {year}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </SidebarHeader>
        <SidebarContent>
          {[
            {
              label: 'Preventivazione',
              keys: ['dashboard', 'quotes', 'clients', 'catalog'],
            },
            { label: 'Analisi finanziaria', keys: ['financial-analysis'] },
            { label: 'Configurazione', keys: ['settings'] },
          ].map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {entries
                    .filter((entry) => group.keys.includes(entry.key))
                    .map(({ key, label, icon: Icon }) => (
                      <SidebarMenuItem key={key}>
                        <SidebarMenuButton
                          isActive={view === key}
                          aria-current={view === key ? 'page' : undefined}
                          onClick={() => onView(key)}
                        >
                          <Icon aria-hidden="true" />
                          <span>{label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  {group.label === 'Analisi finanziaria' ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={view.startsWith('bank-')}
                        onClick={() => onView('bank-summary')}
                      >
                        <ChartNoAxesCombined aria-hidden="true" />
                        <span>Spese</span>
                      </SidebarMenuButton>
                      <SidebarMenuSub>
                        {(
                          [
                            { key: 'bank-summary', label: 'Riepilogo' },
                            { key: 'bank-movements', label: 'Movimenti' },
                            { key: 'bank-categories', label: 'Categorie' },
                          ] as const
                        ).map((entry) => (
                          <SidebarMenuSubItem key={entry.key}>
                            <SidebarMenuSubButton
                              render={<button type="button" />}
                              isActive={view === entry.key}
                              aria-current={
                                view === entry.key ? 'page' : undefined
                              }
                              onClick={() => onView(entry.key)}
                            >
                              {entry.label}
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </SidebarMenuItem>
                  ) : null}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="p-4">
          <div className="flex gap-3 rounded-lg border border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
            <Database className="mt-0.5 size-4 shrink-0" />
            <div>
              <strong className="font-medium text-sidebar-foreground">
                Archivio locale
              </strong>
              <p className="mt-1">
                Attendi “Salvato” prima di cambiare postazione.
              </p>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-6 py-3 backdrop-blur 2xl:px-8">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              {descriptions[view]}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">
              {titles[view]}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant={statusCritical ? 'destructive' : 'outline'}
              role="status"
              className="gap-1.5"
            >
              <StatusIcon
                className={
                  appState.status === 'Salvataggio' ? 'animate-spin' : undefined
                }
              />
              {appState.status}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Azioni archivio"
                  />
                }
              >
                <Archive />
                Archivio <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Archivio</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void appState.open()}>
                    Apri archivio
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={appState.status === 'Salvato'}
                    onClick={() => void appState.save()}
                  >
                    <Save />
                    Salva ora
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void appState.recovery()}>
                    Copia di recupero
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void appState.restoreBackup()}
                  >
                    Ripristina backup
                  </DropdownMenuItem>
                </DropdownMenuGroup>
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
  );
}

export function DeleteDialog({
  target,
  onOpenChange,
  onConfirm,
}: {
  target: DeleteTarget | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target?.kind === 'item'
              ? 'Confermare definitivamente?'
              : 'Eliminare questo elemento?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target?.kind === 'item'
              ? `La voce “${target.label ?? 'senza nome'}” verrà eliminata definitivamente dal preventivo.`
              : target?.label
                ? `“${target.label}” verrà eliminato dall’archivio.`
                : 'L’operazione aggiornerà l’archivio corrente.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {target?.kind === 'item' ? 'Elimina definitivamente' : 'Elimina'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
