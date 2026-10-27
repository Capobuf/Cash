import type { Quote, QuoteItem } from '../../domain/model';
import { appendQuoteItems, quoteLayout } from '../../domain/quote-layout';

export interface QuoteInsertionPoint {
  containerId?: string;
  afterItemId?: string;
}

export function canInsertAt(quote: Quote, point: QuoteInsertionPoint): boolean {
  const layout = quoteLayout(quote);
  const container = point.containerId
    ? layout.find(
        (entry) => entry.kind === 'container' && entry.id === point.containerId,
      )
    : undefined;
  if (point.containerId && container?.kind !== 'container') return false;
  return (
    !point.afterItemId ||
    (container?.kind === 'container'
      ? container.itemIds.includes(point.afterItemId)
      : layout.some(
          (entry) =>
            entry.kind === 'item' && entry.itemId === point.afterItemId,
        ))
  );
}

// Only rearrange layout references; append the economic objects exactly once.
export function insertQuoteItems(
  quote: Quote,
  items: QuoteItem[],
  point: QuoteInsertionPoint,
) {
  if (!canInsertAt(quote, point))
    throw new Error('Posizione di inserimento non disponibile.');
  if (point.afterItemId && !quote.layout) quote.layout = quoteLayout(quote);
  appendQuoteItems(quote, items, point.containerId);
  if (!point.afterItemId) return;
  const ids = new Set(items.map((item) => item.id));
  const container = quote.layout?.find(
    (entry) => entry.kind === 'container' && entry.id === point.containerId,
  );
  if (container?.kind === 'container') {
    container.itemIds = container.itemIds.filter((id) => !ids.has(id));
    container.itemIds.splice(
      container.itemIds.indexOf(point.afterItemId) + 1,
      0,
      ...ids,
    );
  } else {
    quote.layout = quote.layout!.filter(
      (entry) => entry.kind !== 'item' || !ids.has(entry.itemId),
    );
    const index = quote.layout.findIndex(
      (entry) => entry.kind === 'item' && entry.itemId === point.afterItemId,
    );
    quote.layout.splice(
      index + 1,
      0,
      ...items.map((item) => ({ kind: 'item' as const, itemId: item.id })),
    );
  }
}
