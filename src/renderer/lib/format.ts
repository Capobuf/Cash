export const eur = (value?: string): string =>
  value === undefined
    ? "—"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value))

export const formatNumber = (value?: string | number, decimals = 0): string =>
  value === undefined
    ? "—"
    : new Intl.NumberFormat("it-IT", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(Number(value))

export const dateIt = (value: string): string =>
  new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`))

export const hours = (minutes?: number): string =>
  minutes === undefined
    ? "—"
    : minutes < 60
      ? `${minutes}m`
      : minutes % 60 === 0
        ? `${minutes / 60}h`
        : `${Math.floor(minutes / 60)}h ${minutes % 60}m`

export const moneyInputValue = (value: unknown): string => {
  if (String(value ?? "").trim() === "") return ""
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parsed)
    : String(value ?? "")
}

export const decimalInputValue = (value: string): string => {
  const normalized = value.replace(/[\s€]/g, "")
  if (!normalized) return ""
  if (normalized.includes(",")) return normalized.replace(/\./g, "").replace(",", ".")
  return /^-?\d{1,3}(?:\.\d{3})+$/.test(normalized) ? normalized.replace(/\./g, "") : normalized
}

export const formReader = (form: HTMLFormElement) => {
  const data = new FormData(form)
  const get = (name: string): string => String(data.get(name) ?? "").trim()
  return { data, get, money: (name: string): string => decimalInputValue(get(name)) }
}
