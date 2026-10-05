import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { meta } from '../../src/domain/model';
import { TemplateItemCard } from '../../src/renderer/components/catalog/TemplateItemCard';

describe('modifica delle attività del template', () => {
  it('espone azioni dirette per aggiungere e modificare le attività', () => {
    const html = renderToStaticMarkup(
      <TemplateItemCard
        item={{
          ...meta(),
          name: 'Installazione',
          subItems: [
            {
              ...meta(),
              kind: 'time',
              description: 'Configurazione',
              minutes: 60,
            },
          ],
          variantGroups: [],
        }}
        itemIndex={0}
        canDelete={false}
        hasReusableItems
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onReferenceChange={vi.fn()}
        onEditSub={vi.fn()}
        onAddSub={vi.fn()}
        onAddReusable={vi.fn()}
        onVariantsChange={vi.fn()}
        onDefinition={vi.fn()}
      />,
    );

    expect(html).toContain('Aggiungi attività');
    expect(html).toContain('Aggiungi altro');
    expect(html).toContain('aria-label="Modifica Configurazione"');
  });
});
