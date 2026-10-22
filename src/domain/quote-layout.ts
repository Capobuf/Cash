import type { Quote, QuoteItem, QuoteLayoutEntry } from './model';

// Layout contains references only. Economic data always lives in Quote.items.
export function quoteLayout(quote: Quote): QuoteLayoutEntry[] {
  return (
    quote.layout ??
    quote.items.map((item) => ({ kind: 'item', itemId: item.id }))
  );
}

export function layoutItemIds(layout: QuoteLayoutEntry[]): string[] {
  return layout.flatMap((entry) =>
    entry.kind === 'item' ? [entry.itemId] : entry.itemIds,
  );
}

export function orderedQuoteItems(quote: Quote): QuoteItem[] {
  if (!quote.layout) return quote.items;
  const items = new Map(quote.items.map((item) => [item.id, item]));
  return layoutItemIds(quote.layout).map((id) => items.get(id)!);
}

export function appendQuoteItems(
  quote: Quote,
  items: QuoteItem[],
  containerId?: string,
): void {
  const container = containerId
    ? quote.layout?.find(
        (entry) => entry.kind === 'container' && entry.id === containerId,
      )
    : undefined;
  if (containerId && container?.kind !== 'container')
    throw new Error('Contenitore non disponibile.');
  quote.items.push(...items);
  if (container?.kind === 'container')
    container.itemIds.push(...items.map((item) => item.id));
  else if (quote.layout)
    quote.layout.push(
      ...items.map((item): QuoteLayoutEntry => ({
        kind: 'item',
        itemId: item.id,
      })),
    );
}

export function removeQuoteItem(quote: Quote, itemId: string): void {
  quote.items = quote.items.filter((item) => item.id !== itemId);
  if (quote.layout)
    quote.layout = quote.layout.flatMap((entry): QuoteLayoutEntry[] =>
      entry.kind === 'item'
        ? entry.itemId === itemId
          ? []
          : [entry]
        : [{ ...entry, itemIds: entry.itemIds.filter((id) => id !== itemId) }],
    );
}

export function removeQuoteContainer(
  layout: QuoteLayoutEntry[],
  containerId: string,
): QuoteLayoutEntry[] {
  return layout.flatMap((entry): QuoteLayoutEntry[] =>
    entry.kind === 'container' && entry.id === containerId
      ? entry.itemIds.map((itemId) => ({ kind: 'item', itemId }))
      : [entry],
  );
}
