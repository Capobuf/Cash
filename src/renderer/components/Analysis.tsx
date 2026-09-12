import type { calculateItem, calculateQuote } from "../../domain/calculations"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { eur, hours } from "@/lib/format"

type AnalysisValue = ReturnType<typeof calculateItem> | ReturnType<typeof calculateQuote>

export function Analysis({ value }: { value: AnalysisValue }) {
  const rows = [
    ["Tempo", hours(value.minutes)],
    ["Spese", eur(value.expenses)],
    ["Teorico", eur(value.theoreticalValue)],
    ["Resa", value.yieldPerHour ? `${eur(value.yieldPerHour)}/h` : "—"],
    ["Scostamento", value.deviationPercent ? `${value.deviationPercent}%` : "—"],
    ["Tempo coerente", hours(value.coherentMinutes)],
  ]
  return (
    <div className="space-y-4">
      <Table><TableBody>{rows.map(([label, result]) => <TableRow key={label}><TableCell className="text-muted-foreground">{label}</TableCell><TableCell className="text-right font-medium tabular-nums">{result}</TableCell></TableRow>)}</TableBody></Table>
      {value.deficit ? <Alert variant="destructive"><AlertDescription>Disavanzo: {eur(value.deficit)}</AlertDescription></Alert> : null}
      {value.blockers.length ? <Alert><AlertDescription>{value.blockers.map((blocker) => <div key={blocker}>{blocker}</div>)}</AlertDescription></Alert> : null}
    </div>
  )
}
