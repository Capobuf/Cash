export type View = "dashboard" | "quotes" | "clients" | "catalog" | "financial-analysis" | "settings"

export interface DeleteTarget {
  kind: string
  id: string
  label?: string
}
