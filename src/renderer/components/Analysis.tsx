import { AlertCircle, Clock3, Gauge, ReceiptText } from 'lucide-react';
import type { calculateItem, calculateQuote } from '../../domain/calculations';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PartialBadge } from '@/components/PartialBadge';
import type { PartialMetric } from '@/lib/quote-analysis-navigation';
import { eur, hours } from '@/lib/format';

type AnalysisValue =
  ReturnType<typeof calculateItem> | ReturnType<typeof calculateQuote>;

export function Analysis({
  value,
  chosenPrice,
  compact = false,
  totals = false,
  onShowMissing,
}: {
  value: AnalysisValue;
  chosenPrice?: string;
  compact?: boolean;
  totals?: boolean;
  onShowMissing?: (metric: PartialMetric) => void;
}) {
  const selected =
    'chosenPartial' in value
      ? value.chosenTotal
      : (value.chosenPrice ?? chosenPrice);
  if (totals)
    return (
      <section
        data-quote-totals
        aria-label="Analisi economica"
        className="min-w-0 overflow-hidden rounded-xl border bg-card"
      >
        <h3 className="border-b px-5 py-4 text-sm font-medium">
          Totali preventivo
        </h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 p-5 lg:grid-cols-4">
          <TotalMetric
            label="Tempo"
            value={hours(value.minutes)}
            partial={value.minutes !== undefined && value.minutesPartial}
            onShowMissing={() => onShowMissing?.('minutes')}
          />
          <TotalMetric
            label="Spese"
            value={eur(value.expenses)}
            partial={value.expenses !== undefined && value.expensesPartial}
            onShowMissing={() => onShowMissing?.('expenses')}
          />
          <TotalMetric
            label="Valore teorico"
            value={eur(value.theoreticalValue)}
            partial={value.theoreticalPartial}
            missing={
              value.theoreticalValue === undefined
                ? 'Non calcolabile'
                : undefined
            }
            onShowMissing={() => onShowMissing?.('theoretical')}
          />
          <TotalMetric
            label="Prezzo scelto"
            emphasized
            value={eur(selected)}
            partial={'chosenPartial' in value && value.chosenPartial}
            missing={selected === undefined ? 'Non inserito' : undefined}
            onShowMissing={() => onShowMissing?.('chosen')}
          />
        </dl>
        <dl className="grid gap-4 border-t bg-muted/15 px-5 py-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Resa prevista</dt>
            <dd className="mt-1 tabular-nums">
              {value.yieldPerHour !== undefined
                ? `${eur(value.yieldPerHour)}/h`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Scostamento dall’obiettivo
            </dt>
            <dd className="mt-1 tabular-nums">
              {value.deviationPercent !== undefined
                ? `${value.deviationPercent}% · ${Number(value.deviationPercent) >= 0 ? 'Sopra obiettivo' : 'Sotto obiettivo'}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tempo coerente</dt>
            <dd className="mt-1 tabular-nums">
              {hours(value.coherentMinutes)}
            </dd>
          </div>
        </dl>
        {value.deficit ? (
          <p className="border-t px-5 py-3 text-sm text-destructive">
            Prezzo inferiore alle spese · Disavanzo previsto:{' '}
            {eur(value.deficit)}. Non esiste un tempo positivo coerente.
          </p>
        ) : null}
        {value.blockers.length ? (
          <details className="border-t px-5 py-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">
              Dati tecnici da completare ({value.blockers.length})
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {value.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Metric
          label="Prezzo scelto"
          value={eur(selected)}
          emphasized
          onShowMissing={() => onShowMissing?.('chosen')}
          badge={
            'chosenPartial' in value && value.chosenPartial
              ? 'Parziale'
              : selected === undefined
                ? 'Non inserito'
                : undefined
          }
        />
        <Metric
          label="Valore teorico"
          value={eur(value.theoreticalValue)}
          onShowMissing={() => onShowMissing?.('theoretical')}
          badge={
            value.theoreticalPartial
              ? 'Parziale'
              : value.theoreticalValue === undefined
                ? 'Non calcolabile'
                : undefined
          }
        />
        <Metric
          label="Resa prevista"
          value={
            value.yieldPerHour !== undefined
              ? `${eur(value.yieldPerHour)}/h`
              : '—'
          }
          icon={Gauge}
        />
        <Metric
          label="Scostamento dall’obiettivo"
          value={
            value.deviationPercent !== undefined
              ? `${value.deviationPercent}%`
              : '—'
          }
          badge={
            value.deviationPercent !== undefined
              ? Number(value.deviationPercent) >= 0
                ? 'Sopra obiettivo'
                : 'Sotto obiettivo'
              : undefined
          }
        />
      </div>
      {!compact ? (
        <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/20 p-3">
          <Secondary
            icon={Clock3}
            label="Tempo"
            value={hours(value.minutes)}
            partial={value.minutes !== undefined && value.minutesPartial}
            onShowMissing={() => onShowMissing?.('minutes')}
          />
          <Secondary
            icon={ReceiptText}
            label="Spese"
            value={eur(value.expenses)}
            partial={value.expenses !== undefined && value.expensesPartial}
            onShowMissing={() => onShowMissing?.('expenses')}
          />
          <Secondary
            icon={Clock3}
            label="Tempo coerente"
            value={hours(value.coherentMinutes)}
          />
        </div>
      ) : null}
      {value.deficit ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Prezzo inferiore alle spese</AlertTitle>
          <AlertDescription>
            Disavanzo previsto: {eur(value.deficit)}. Non esiste un tempo
            positivo coerente.
          </AlertDescription>
        </Alert>
      ) : null}
      {value.blockers.length ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>Dati tecnici da completare</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {value.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function TotalMetric({
  label,
  value,
  partial,
  missing,
  onShowMissing,
  emphasized = false,
}: {
  label: string;
  value: string;
  partial?: boolean;
  missing?: string;
  onShowMissing: () => void;
  emphasized?: boolean;
}) {
  return (
    <div className={`min-w-0 space-y-2 ${emphasized ? 'border-l pl-5' : ''}`}>
      <dt
        className={`text-xs ${emphasized ? 'font-medium' : 'text-muted-foreground'}`}
      >
        {label}
      </dt>
      <dd
        className={`break-words font-semibold tracking-tight tabular-nums ${emphasized ? 'text-2xl' : 'text-xl'}`}
      >
        {value}
      </dd>
      {partial ? (
        <dd>
          <PartialBadge label={label} onClick={onShowMissing} />
        </dd>
      ) : missing ? (
        <dd className="text-xs text-muted-foreground">{missing}</dd>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  emphasized = false,
  icon: Icon,
  badge,
  onShowMissing,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  icon?: typeof Gauge;
  badge?: string;
  onShowMissing?: () => void;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${emphasized ? 'border-primary/30 bg-primary/10' : 'bg-card'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-3.5 text-muted-foreground" /> : null}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {badge === 'Parziale' ? (
        <PartialBadge className="mt-2" label={label} onClick={onShowMissing} />
      ) : badge ? (
        <Badge
          className="mt-2"
          variant={badge === 'Sopra obiettivo' ? 'secondary' : 'outline'}
        >
          {badge}
        </Badge>
      ) : null}
    </div>
  );
}
function Secondary({
  icon: Icon,
  label,
  value,
  partial = false,
  onShowMissing,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  partial?: boolean;
  onShowMissing?: () => void;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
      {partial ? <PartialBadge label={label} onClick={onShowMissing} /> : null}
    </div>
  );
}
