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
  onShowMissing,
}: {
  value: AnalysisValue;
  chosenPrice?: string;
  compact?: boolean;
  onShowMissing?: (metric: PartialMetric) => void;
}) {
  const selected =
    'chosenPartial' in value
      ? value.chosenTotal
      : (value.chosenPrice ?? chosenPrice);
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
