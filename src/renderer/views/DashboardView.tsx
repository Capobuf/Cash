import { useId } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  FilePlus2,
  Info,
  Settings2,
  WalletCards,
} from 'lucide-react';
import { calculateProfile } from '../../domain/calculations';
import { quoteTitle } from '../../domain/quotes';
import { createManualProfile, type CashDocument } from '../../domain/model';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { dateIt, eur, formatNumber, hours } from '@/lib/format';
import type { AppState } from '../state';

export function DashboardView({
  doc,
  year,
  appState,
  onEditProfile,
  onOpenQuote,
  onNewQuote,
}: {
  doc: CashDocument;
  year: number;
  appState: AppState;
  onEditProfile: (id: string) => void;
  onOpenQuote: (id: string) => void;
  onNewQuote: () => void;
}) {
  const hourlyHelpId = useId();
  const profile = doc.profiles.find((entry) => entry.year === year);
  const calculated = profile?.confirmed
    ? calculateProfile(profile, doc.businessCosts)
    : undefined;
  const values = calculated?.ok ? calculated.value : undefined;
  const recentQuotes = doc.quotes.slice(-6).reverse();
  const latestQuote = recentQuotes[0];
  const profileStatus = !profile
    ? 'Profilo annuale mancante'
    : !profile.confirmed
      ? 'Profilo da verificare'
      : !values
        ? 'Calcolo non disponibile'
        : 'Profilo confermato';
  const unavailableNote = !profile
    ? 'Crea il profilo annuale per calcolare il tuo riferimento economico.'
    : !profile.confirmed
      ? 'Verifica e conferma il profilo prima di usare le proiezioni.'
      : calculated && !calculated.ok
        ? calculated.error.message
        : '';
  const editProfile = () => {
    if (profile) {
      onEditProfile(profile.id);
      return;
    }
    const created = createManualProfile(year);
    if (!appState.mutate((document) => document.profiles.push(created))) return;
    onEditProfile(created.id);
  };
  const missing = [
    !doc.settings.fuelTerritory
      ? 'Configura il territorio carburanti'
      : undefined,
    !doc.sites.length ? 'Aggiungi una sede per le trasferte' : undefined,
    !doc.vehicles.length ? 'Aggiungi un veicolo per le trasferte' : undefined,
  ].filter((entry): entry is string => Boolean(entry));

  return (
    <div className="min-w-0 space-y-5">
      <Card className="dashboard-hero dashboard-enter [--card-spacing:--spacing(5)] xl:[--card-spacing:--spacing(6)]">
        <CardContent className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-center xl:gap-8">
          <div className="dashboard-enter dashboard-intro min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase">
              <span
                className="size-2 rounded-full bg-primary"
                aria-hidden="true"
              />
              Cash · Il tuo spazio di preventivazione
            </p>
            <h2 className="mt-5 text-3xl leading-tight font-semibold tracking-tight 2xl:text-4xl">
              Il tuo lavoro.
              <br />
              Il suo valore.
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-foreground/75">
              Tempi, spese e trasferte per valutare il tuo lavoro. Il prezzo
              finale lo scegli tu.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" className="h-11 px-4" onClick={onNewQuote}>
                <FilePlus2 aria-hidden="true" />
                Nuovo preventivo
              </Button>
              {latestQuote ? (
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 gap-2 bg-card/80 px-4"
                  onClick={() => onOpenQuote(latestQuote.id)}
                >
                  Riprendi il lavoro
                  <ArrowRight
                    aria-hidden="true"
                    className="transition-transform duration-200 motion-safe:group-hover/button:translate-x-0.5"
                  />
                </Button>
              ) : null}
            </div>
          </div>
          <div className="dashboard-enter dashboard-value min-w-0 rounded-xl border border-border bg-card/90 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <p className="text-sm font-medium">Valore orario obiettivo</p>
                <Tooltip>
                  <TooltipTrigger
                    aria-describedby={hourlyHelpId}
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Come interpretare il valore orario"
                      />
                    }
                  >
                    <Info aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent id={hourlyHelpId} role="tooltip">
                    Il valore da generare per ogni ora dedicata ai clienti. Un
                    riferimento economico, non una tariffa obbligatoria.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Badge variant="secondary">{year}</Badge>
            </div>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
              <span className="min-w-0 text-4xl font-semibold tracking-tight break-all 2xl:text-5xl">
                {values ? formatNumber(values.hourlyTarget, 2) : '—'}
              </span>
              <span className="text-lg font-medium text-card-foreground/75">
                €/h
              </span>
            </p>
            {!values ? (
              <p className="mt-3 text-sm leading-relaxed text-card-foreground/75">
                {unavailableNote}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <span className="flex items-center gap-2 text-xs font-medium">
                {values ? (
                  <CheckCircle2
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle className="size-4" aria-hidden="true" />
                )}
                {profileStatus}
              </span>
              {!values ? (
                <Button variant="outline" size="sm" onClick={editProfile}>
                  {profile ? 'Verifica profilo' : `Crea profilo ${year}`}
                  <ArrowRight aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="dashboard-metrics grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Metric
          icon={WalletCards}
          label="Fatturato obiettivo"
          value={profile ? eur(profile.revenueTarget) : '—'}
          note={
            profile
              ? profile.confirmed
                ? undefined
                : 'Obiettivo del profilo da verificare'
              : 'Profilo non configurato'
          }
        />
        <Metric
          icon={CheckCircle2}
          label="Netto fiscale stimato"
          value={eur(values?.fiscalNet)}
          help={
            values?.fiscalNet !== undefined
              ? 'Stima interna non contabile'
              : undefined
          }
          note={
            values && values.fiscalNet === undefined
              ? 'Proiezione fiscale non disponibile'
              : undefined
          }
        />
        <Metric
          icon={Clock3}
          label="Capacità cliente"
          value={values ? hours(values.availableClientMinutes) : '—'}
          help={
            values ? `${values.availableDays} giorni disponibili` : undefined
          }
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.65fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <div>
              <CardTitle>Preventivi recenti</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {doc.quotes.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Preventivo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Voci</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentQuotes.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell className="max-w-64 min-w-40 font-medium whitespace-normal">
                        {quoteTitle(quote)}
                      </TableCell>
                      <TableCell className="max-w-48 text-foreground/75 whitespace-normal">
                        {quote.client?.displayName ?? 'Nessun cliente'}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {dateIt(quote.date)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {quote.items.length}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Apri ${quoteTitle(quote)} del ${dateIt(quote.date)}`}
                          onClick={() => onOpenQuote(quote.id)}
                        >
                          Apri{' '}
                          <ArrowRight
                            aria-hidden="true"
                            className="transition-transform duration-200 motion-safe:group-hover/button:translate-x-0.5"
                          />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="grid min-h-44 place-items-center rounded-lg border border-dashed bg-muted/30 p-5 text-center">
                <div className="max-w-sm">
                  <span className="mx-auto mb-4 grid size-11 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                    <FileText className="size-5" aria-hidden="true" />
                  </span>
                  <p className="font-medium">Nessun preventivo</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Il primo preventivo può partire vuoto o da un template.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <CalendarDays className="size-4" aria-hidden="true" />
                  Profilo annuale
                </CardTitle>
                <CardDescription>
                  {profile
                    ? `Revisione ${profile.revision}`
                    : 'Nessun profilo annuale'}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <SmallMetric
                  label="Disponibile stimato"
                  value={eur(values?.availableIncome)}
                />
                <SmallMetric
                  label="Costi aziendali annui"
                  value={eur(values?.annualBusinessCosts)}
                />
              </div>
              {profile ? (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => onEditProfile(profile.id)}
                >
                  <Settings2 aria-hidden="true" />
                  {profile.confirmed ? 'Modifica profilo' : 'Verifica profilo'}
                </Button>
              ) : null}
              {values?.warnings.length ? (
                <Alert>
                  <AlertTriangle aria-hidden="true" />
                  <AlertTitle>Indicazioni sul profilo</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {values.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
          {missing.length ? (
            <Alert>
              <AlertTriangle />
              <AlertTitle>
                {missing.length} configurazioni da completare
              </AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  note,
  help,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  note?: string;
  help?: string;
}) {
  const helpId = useId();
  return (
    <Card className="dashboard-enter min-w-0 gap-2 transition-colors duration-200 hover:bg-secondary/20 hover:ring-primary/40">
      <CardHeader className="gap-2">
        <div className="flex min-h-8 items-center justify-between gap-3">
          <CardTitle className="text-sm">
            {help ? (
              <Tooltip>
                <TooltipTrigger
                  aria-describedby={helpId}
                  className="cursor-help rounded-sm text-left underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  {label}
                </TooltipTrigger>
                <TooltipContent id={helpId} role="tooltip">
                  {help}
                </TooltipContent>
              </Tooltip>
            ) : (
              label
            )}
          </CardTitle>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
        <p className="text-2xl font-semibold tracking-tight break-words tabular-nums 2xl:text-3xl">
          {value}
        </p>
      </CardHeader>
      {note ? (
        <CardContent className="mt-auto">
          <CardDescription className="text-xs">{note}</CardDescription>
        </CardContent>
      ) : null}
    </Card>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold break-words tabular-nums">{value}</p>
    </div>
  );
}
