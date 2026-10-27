import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  meta,
  type QuoteItem,
} from '../../src/domain/model';
import {
  QuoteItemRow,
  type QuoteItemActions,
} from '../../src/renderer/components/quotes/QuoteItemRow';

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
    saveSimpleSub: vi.fn(),
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
  it('mostra nome editabile e azioni contestuali nella riga senza dialog', () => {
    const item = {
      ...meta(),
      name: 'Installazione',
      subItems: [],
      variantGroups: [],
      variantSelections: [],
    };
    const html = renderToStaticMarkup(
      <QuoteItemRow
        item={item}
        doc={createEmptyDocument()}
        actions={{
          rename: vi.fn(),
          saveSimpleSub: vi.fn(),
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

    expect(html).toContain('aria-label="Nome voce Installazione"');
    expect(html).toContain('aria-label="Azioni voce Installazione"');
    expect(html).toContain('aria-label="Aggiungi sottoriga a Installazione"');
    expect(html).not.toContain('aria-label="Azioni per Installazione"');
  });

  it('nasconde varianti e attività nella voce chiusa mantenendo il riepilogo', () => {
    const html = renderToStaticMarkup(
      <QuoteItemRow
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
      'aria-label="Nome voce Installazione/configurazione NAS"',
    );
  });

  it('rivela varianti e selezione quando si apre un dato tecnico mancante', () => {
    const item = nasItem();
    const html = renderToStaticMarkup(
      <QuoteItemRow
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
    expect(html).toContain('data-quote-sub=');
    expect(html).toContain('Completa le attività.');
  });
  it('affianca ogni selettore alle proprie spese senza mescolare gruppi o duplicare il prezzo scelto', () => {
    const item = nasItem();
    const firstGroup = item.variantGroups[0]!;
    const secondOption = { ...meta(), name: 'Esteso', subItems: [] };
    const secondGroup = {
      ...meta(),
      name: 'Supporto',
      options: [secondOption],
    };
    item.variantGroups.push(secondGroup);
    item.variantSelections.push({
      groupId: secondGroup.id,
      optionId: secondOption.id,
    });
    const firstExpense = {
      ...meta(),
      kind: 'expense' as const,
      description: 'Dischi RAID',
      amount: '100.00',
      variantOwner: {
        groupId: firstGroup.id,
        optionId: firstGroup.options[0]!.id,
        definitionIndex: 0,
      },
    };
    const secondExpense = {
      ...meta(),
      kind: 'expense' as const,
      description: 'Licenza supporto',
      amount: '20.00',
      variantOwner: {
        groupId: secondGroup.id,
        optionId: secondOption.id,
        definitionIndex: 0,
      },
    };
    item.subItems.push(secondExpense, firstExpense);
    const html = renderToStaticMarkup(
      <QuoteItemRow
        item={item}
        hourly="50.00"
        doc={createEmptyDocument()}
        actions={actions()}
        missingTargets={[
          {
            id: `quote-technical-${item.id}`,
            itemId: item.id,
            message: 'Dettagli',
          },
        ]}
      />,
    );
    const firstSelector = html.indexOf(
      `data-quote-variant-selector="${firstGroup.id}"`,
    );
    const secondSelector = html.indexOf(
      `data-quote-variant-selector="${secondGroup.id}"`,
    );
    const firstRow = html.indexOf(`id="quote-sub-${firstExpense.id}"`);
    const secondRow = html.indexOf(`id="quote-sub-${secondExpense.id}"`);
    expect(secondRow).toBeLessThan(secondSelector);
    expect(secondSelector).toBeLessThan(firstRow);
    expect(firstRow).toBeLessThan(firstSelector);
    expect(html.slice(firstRow)).toContain(
      `id="variant-${item.id}-${firstGroup.id}"`,
    );
    expect(html.slice(firstRow)).toContain('Importo Dischi RAID');
    expect(html).toContain(
      `aria-describedby="variant-${item.id}-${firstGroup.id}-label"`,
    );
    expect(html).toContain(
      `aria-describedby="variant-${item.id}-${secondGroup.id}-label"`,
    );
    expect(html.match(/aria-label="Prezzo scelto di /g)).toHaveLength(1);
    expect(item.subItems.at(-1)).toBe(firstExpense);
  });
});
