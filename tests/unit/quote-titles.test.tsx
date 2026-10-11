import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyDocument, meta } from '../../src/domain/model';
import { addQuote } from '../../src/domain/quotes';
import { QuotesView } from '../../src/renderer/views/QuotesView';
import { DashboardView } from '../../src/renderer/views/DashboardView';
import { AppState } from '../../src/renderer/state';

describe('titoli e riepilogo nelle viste dei preventivi', () => {
  it('usa lo stesso titolo in elenco, dettaglio, dashboard ed etichette accessibili', () => {
    const doc = createEmptyDocument();
    doc.nextQuoteNumber = 12;
    const quote = addQuote(doc);
    quote.client = {
      source: 'fatture_in_cloud',
      companyId: '1',
      clientId: '2',
      displayName: 'MCH Italia',
    };
    quote.items = [
      {
        ...meta(),
        name: 'Nome voce commerciale',
        chosenPrice: '400.00',
        subItems: [],
        variantGroups: [],
        variantSelections: [],
      },
    ];
    const appState = new AppState();
    const renderQuotes = (activeQuoteId?: string) =>
      renderToStaticMarkup(
        <QuotesView
          doc={doc}
          hasToken={false}
          appState={appState}
          activeQuoteId={activeQuoteId}
          setActiveQuoteId={vi.fn()}
          requestDelete={vi.fn()}
        />,
      );
    const renderDashboard = () =>
      renderToStaticMarkup(
        <DashboardView
          doc={doc}
          year={2026}
          appState={appState}
          onEditProfile={vi.fn()}
          onOpenQuote={vi.fn()}
          onNewQuote={vi.fn()}
        />,
      );
    for (const name of ['MCH Italia', 'Altro cliente', undefined]) {
      quote.client = name
        ? {
            source: 'fatture_in_cloud',
            companyId: '1',
            clientId: '2',
            displayName: name,
          }
        : undefined;
      const title = name ? `${name} - Preventivo #12` : 'Preventivo #12';
      const list = renderQuotes();
      const detail = renderQuotes(quote.id);
      const dashboard = renderDashboard();
      expect(list).toContain(title);
      expect(list).toContain(`aria-label="Azioni ${title}"`);
      expect(detail).toContain(title);
      expect(detail).toContain('400,00');
      expect(detail).not.toContain('Dati tecnici da completare');
      expect(dashboard).toContain(title);
      expect(dashboard).toContain(`aria-label="Apri ${title}`);
      expect(list).not.toContain('Nome voce commerciale');
      expect(dashboard).not.toContain('Nome voce commerciale');
    }
  });

  it('mostra prezzo parziale, prezzo assente e zero esplicito senza confonderli', () => {
    const doc = createEmptyDocument();
    const quote = addQuote(doc);
    const appState = new AppState();
    const render = () =>
      renderToStaticMarkup(
        <QuotesView
          doc={doc}
          hasToken={false}
          appState={appState}
          activeQuoteId={quote.id}
          setActiveQuoteId={vi.fn()}
          requestDelete={vi.fn()}
        />,
      );
    quote.items = ['400.00', '250.00', '150.00', undefined].map(
      (chosenPrice) => ({
        ...meta(),
        name: 'Voce',
        chosenPrice,
        subItems: [],
        variantGroups: [],
        variantSelections: [],
      }),
    );
    expect(render()).toContain('800,00');
    expect(render()).toContain('Parziale');
    quote.items = [quote.items[3]!];
    expect(render()).toContain('Non inserito');
    expect(render()).toContain('Non calcolabile');
    quote.items[0]!.chosenPrice = '0.00';
    expect(render()).toContain('0,00');
    expect(render()).not.toContain('Non inserito');
    expect(render()).not.toContain('Parziale');
  });
});
