export type View = "dashboard" | "quotes" | "clients" | "resources" | "catalog" | "settings"

export interface DeleteTarget {
  kind: string
  id: string
  label?: string
}
