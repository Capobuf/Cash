import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkItemRow } from '../../src/renderer/components/WorkItemRow';

describe('WorkItemRow', () => {
  it('mostra il dettaglio sintetico una sola volta', () => {
    const html = renderToStaticMarkup(
      <WorkItemRow
        kind="time"
        description="Aggiornamento firmware"
        detail="30m"
      />,
    );

    expect(html.match(/30m/g)).toHaveLength(1);
  });

  it('mostra il tipo come etichetta quando una trasferta non ha descrizione', () => {
    const html = renderToStaticMarkup(
      <WorkItemRow
        kind="travel"
        description=""
        detail="10 km"
        onClick={() => undefined}
      />,
    );

    expect(html).toContain('Trasferta');
    expect(html).toContain('title="Modifica Trasferta"');
  });
});
