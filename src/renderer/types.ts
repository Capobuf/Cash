export type View = "dashboard" | "quotes" | "clients" | "catalog" | "settings"

export interface DeleteTarget {
  kind: string
  id: string
  label?: string
}
