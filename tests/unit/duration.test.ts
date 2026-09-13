import { describe, expect, it } from "vitest"
import { parseDuration } from "../../src/domain/duration"
import { hours } from "../../src/renderer/lib/format"

describe("durate", () => {
  it.each([
    ["150", 150],
    ["150m", 150],
    ["2h", 120],
    ["2h30m", 150],
    ["2h 30m", 150],
    ["2H 30M", 150],
  ])("converte %s in minuti interi", (input, expected) => {
    expect(parseDuration(input)).toEqual({ ok: true, value: expected })
    const result = parseDuration(input)
    expect(result.ok && Number.isInteger(result.value)).toBe(true)
  })

  it.each(["", "2:30", "2 ore", "1.5h", "2h 90m", "0", "-30m", "30xyz"])("rifiuta %s senza fallback", (input) => {
    const result = parseDuration(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.field).toBe("minutes")
  })

  it("mostra le durate senza componenti a zero", () => {
    expect(hours(30)).toBe("30m")
    expect(hours(60)).toBe("1h")
    expect(hours(150)).toBe("2h 30m")
  })
})
