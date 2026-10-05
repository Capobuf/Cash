import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyDocument, meta } from '../../src/domain/model';
import { QuoteItemCard } from '../../src/renderer/components/QuoteItemCard';

describe('azioni della voce del preventivo', () => {
  it('mostra direttamente matita e cestino al posto del menu a tre puntini', () => {
    const item = {
      ...meta(),
      name: 'Installazione',
      subItems: [],
      variantGroups: [],
      variantSelections: [],
    };
    const html = renderToStaticMarkup(
      <QuoteItemCard
        item={item}
        doc={createEmptyDocument()}
        actions={{
          rename: vi.fn(),
          updateChosenPrice: vi.fn(),
          updateReferencePrice: vi.fn(),
          editSub: vi.fn(),
          saveSub: vi.fn(),
          changeVariant: vi.fn(),
          addSub: vi.fn(),
          addCatalog: vi.fn(),
          requestDelete: vi.fn(),
        }}
      />,
    );

    expect(html).toContain('aria-label="Rinomina Installazione"');
    expect(html).toContain('aria-label="Elimina Installazione"');
    expect(html).not.toContain('aria-label="Azioni per Installazione"');
  });
});
