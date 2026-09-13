import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { WorkItemRow } from "../../src/renderer/components/WorkItemRow"

describe("WorkItemRow", () => {
  it("mostra il dettaglio sintetico una sola volta", () => {
    const html = renderToStaticMarkup(
      <WorkItemRow kind="time" description="Aggiornamento firmware" detail="30m" />,
    )

    expect(html.match(/30m/g)).toHaveLength(1)
  })
})
