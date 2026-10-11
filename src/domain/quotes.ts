import { meta, type CashDocument, type Quote } from './model';
import { snapshotProfile } from './refresh';
import { localDate } from './calendar';

export function createQuote(document: CashDocument): Quote {
  const date = localDate();
  const profile = document.profiles.find(
    (entry) => entry.confirmed && entry.year === Number(date.slice(0, 4)),
  );
  const snapshot = profile
    ? snapshotProfile(profile, document.businessCosts)
    : undefined;
  return {
    ...meta(),
    number: document.nextQuoteNumber,
    date,
    ...(snapshot?.ok
      ? { profileId: snapshot.value.sourceId, profileSnapshot: snapshot.value }
      : {}),
    items: [],
    snapshotRevision: 0,
    exportAttempts: [],
  };
}

export function quoteTitle(quote: Quote): string {
  const title = `Preventivo #${quote.number}`;
  return quote.client ? `${quote.client.displayName} - ${title}` : title;
}

export function addQuote(document: CashDocument): Quote {
  const quote = createQuote(document);
  document.quotes.push(quote);
  document.nextQuoteNumber += 1;
  return quote;
}

// Validate transitions too: a valid snapshot alone cannot detect number reuse.
export function quoteNumberingError(
  previous: CashDocument,
  next: CashDocument,
): string | undefined {
  const existing = new Map(
    previous.quotes.map((quote) => [quote.id, quote.number]),
  );
  const added = next.quotes.filter((quote) => !existing.has(quote.id));
  if (
    next.quotes.some(
      (quote) =>
        existing.has(quote.id) && existing.get(quote.id) !== quote.number,
    ) ||
    next.nextQuoteNumber !== previous.nextQuoteNumber + added.length ||
    added.some(
      (quote) =>
        quote.number < previous.nextQuoteNumber ||
        quote.number >= next.nextQuoteNumber,
    )
  )
    return 'La numerazione dei preventivi è immutabile e il progressivo non può essere riutilizzato.';
}
