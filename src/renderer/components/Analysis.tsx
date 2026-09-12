import type { calculateItem, calculateQuote } from "../../domain/calculations"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { eur, hours } from "@/lib/format"

type AnalysisValue = ReturnType<typeof calculateItem> | ReturnType<typeof calculateQuote>

export function Analysis({ value }: { value: AnalysisValue }) {
  return (
    <>
      <div className="analysis">
        <div><span className="small muted">Tempo</span><strong>{hours(value.minutes)}</strong></div>
        <div><span className="small muted">Spese</span><strong>{eur(value.expenses)}</strong></div>
        <div><span className="small muted">Teorico</span><strong>{eur(value.theoreticalValue)}</strong></div>
        <div><span className="small muted">Resa</span><strong>{value.yieldPerHour ? `${eur(value.yieldPerHour)}/h` : "—"}</strong></div>
        <div><span className="small muted">Scostamento</span><strong>{value.deviationPercent ? `${value.deviationPercent}%` : "—"}</strong></div>
        <div><span className="small muted">Tempo coerente</span><strong>{hours(value.coherentMinutes)}</strong></div>
      </div>
      {value.deficit ? <Alert variant="destructive"><AlertDescription>Disavanzo: {eur(value.deficit)}</AlertDescription></Alert> : null}
      {value.blockers.length ? <Alert><AlertDescription>{value.blockers.map((blocker) => <div key={blocker}>{blocker}</div>)}</AlertDescription></Alert> : null}
    </>
  )
}
