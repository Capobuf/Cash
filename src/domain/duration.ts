import { err, ok, type Result } from "./model"

const MINUTES_ONLY = /^(\d+)\s*m$/i
const HOURS = /^(\d+)\s*h(?:\s*(\d+)\s*m)?$/i

function validMinutes(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

export function parseDuration(value: string): Result<number> {
  const normalized = value.trim()
  let minutes: number

  if (/^\d+$/.test(normalized)) {
    minutes = Number(normalized)
  } else {
    const minutesOnly = normalized.match(MINUTES_ONLY)
    if (minutesOnly) {
      minutes = Number(minutesOnly[1])
    } else {
      const hours = normalized.match(HOURS)
      if (!hours) return invalidDuration()
      const hourValue = Number(hours[1])
      const minuteValue = hours[2] === undefined ? 0 : Number(hours[2])
      if (!Number.isSafeInteger(hourValue) || !Number.isSafeInteger(minuteValue) || minuteValue >= 60) return invalidDuration()
      minutes = hourValue * 60 + minuteValue
    }
  }

  return validMinutes(minutes) ? ok(minutes) : invalidDuration()
}

function invalidDuration(): Result<number> {
  return err({
    code: "VALIDATION",
    field: "minutes",
    message: "Inserisci una durata valida, ad esempio 150, 150m, 2h o 2h 30m.",
  })
}
