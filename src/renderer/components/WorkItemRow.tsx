import { Clock3, MapPin, ReceiptText } from "lucide-react"
import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type WorkKind = "time" | "expense" | "travel"

const labels: Record<WorkKind, string> = {
  time: "Attività",
  expense: "Spesa",
  travel: "Trasferta",
}

const icons = {
  time: Clock3,
  expense: ReceiptText,
  travel: MapPin,
}

export function WorkItemRow({
  kind,
  description,
  detail,
  note,
  action,
  onClick,
  className,
}: {
  kind: WorkKind
  description: string
  detail: string
  note?: string
  action?: ReactNode
  onClick?: () => void
  className?: string
}) {
  const Icon = icons[kind]
  const content = (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{description}</span>
          {kind !== "time" ? <Badge variant="outline">{labels[kind]}</Badge> : null}
        </span>
        {note ? <span className="mt-0.5 block text-xs text-muted-foreground">{note}</span> : null}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{detail}</span>
    </>
  )

  return (
    <div className={cn("flex min-h-12 items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:border-input hover:bg-muted/20", className)}>
      {onClick ? (
        <button type="button" className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left" title={`Modifica ${description}`} onClick={onClick}>
          {content}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
      )}
      {action}
    </div>
  )
}
