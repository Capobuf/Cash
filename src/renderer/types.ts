export type View = "dashboard" | "quotes" | "clients" | "catalog" | "financial-analysis" | "bank-summary" | "bank-movements" | "bank-categories" | "settings"

export interface DeleteTarget {
  kind: string
  id: string
  label?: string
}
