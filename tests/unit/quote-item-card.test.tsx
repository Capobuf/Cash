import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  meta,
  type QuoteItem,
} from '../../src/domain/model';
import {
  QuoteItemCard,
  type QuoteItemActions,
} from '../../src/renderer/components/QuoteItemCard';

function nasItem(): QuoteItem {
  const option = { ...meta(), name: 'Nessuna', subItems: [] };
  const group = {
    ...meta(),
    name: 'Configurazione iniziale / storage / RAID',
    options: [option],
  };
  return {
    ...meta(),
    name: 'Installazione/configurazione NAS',
    chosenPrice: '0.00',
    subItems: [
      { ...meta(), kind: 'time', description: 'Installazione', minutes: 60 },
    ],
    variantGroups: [group],
    variantSelections: [{ groupId: group.id, optionId: option.id }],
  };
}

function actions(): QuoteItemActions {
  return {
    rename: vi.fn(),
    updateChosenPrice: vi.fn(),
    editSub: vi.fn(),
    saveSub: vi.fn(),
    changeVariant: vi.fn(),
    addSub: vi.fn(),
    addCatalog: vi.fn(),
    requestDelete: vi.fn(),
  };
}

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

  it('nasconde varianti e attività nella voce chiusa mantenendo il riepilogo', () => {
    const html = renderToStaticMarkup(
      <QuoteItemCard
        item={nasItem()}
        hourly="100.00"
        doc={createEmptyDocument()}
        actions={actions()}
      />,
    );

    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Configurazione iniziale / storage / RAID');
    expect(html).not.toContain('Attività e costi');
    expect(html).toContain('Installazione/configurazione NAS');
    expect(html).toContain('Prezzo scelto');
    expect(html).toContain('Valore teorico');
    expect(html).toContain(
      'aria-label="Rinomina Installazione/configurazione NAS"',
    );
  });

  it('rivela varianti e selezione quando si apre un dato tecnico mancante', () => {
    const item = nasItem();
    const html = renderToStaticMarkup(
      <QuoteItemCard
        item={item}
        hourly="100.00"
        doc={createEmptyDocument()}
        actions={actions()}
        missingTargets={[
          {
            id: `quote-technical-${item.id}`,
            itemId: item.id,
            message: 'Completa le attività.',
          },
        ]}
      />,
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Configurazione iniziale / storage / RAID');
    expect(html).toContain(`value="${item.variantSelections[0]!.optionId}"`);
    expect(html).toContain('Attività e costi');
    expect(html).toContain('Completa le attività.');
  });
});
