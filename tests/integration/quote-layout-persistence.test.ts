import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { expect, it } from 'vitest';
import { meta, type Result } from '../../src/domain/model';
import { orderedQuoteItems } from '../../src/domain/quote-layout';
import {
  createArchive,
  saveArchive,
  openArchive,
  closeArchive,
} from '../../src/native/persistence';
import { comprehensiveDocument } from '../fixtures/sqlite-document';

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

it('riapre archivi senza layout e conserva disposizione, contenitori vuoti e dati economici nel payload SQLite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cash-quote-layout-'));
  const path = join(directory, 'Cash.sqlite');
  try {
    unwrap(await createArchive(path, comprehensiveDocument()));
    closeArchive(path);
    let session = unwrap(await openArchive(path));
    expect(session.document!.quotes[0]!.layout).toBeUndefined();
    const document = structuredClone(session.document!);
    const quote = document.quotes[0]!;
    const original = structuredClone(quote.items);
    quote.layout = [
      {
        kind: 'container',
        id: meta().id,
        name: 'Sede Nord',
        itemIds: quote.items.map((item) => item.id).reverse(),
      },
      { kind: 'container', id: meta().id, name: 'Sede Sud', itemIds: [] },
    ];
    session = unwrap(await saveArchive(path, document, session.token));
    closeArchive(path);
    const reopened = unwrap(await openArchive(path));
    expect(reopened.document!.quotes[0]!.layout).toEqual(quote.layout);
    expect(reopened.document!.quotes[0]!.items).toEqual(original);
    expect(
      orderedQuoteItems(reopened.document!.quotes[0]!).map((item) => item.id),
    ).toEqual(original.map((item) => item.id).reverse());
  } finally {
    closeArchive(path);
    if (resolve(directory).startsWith(resolve(tmpdir()) + sep))
      await rm(directory, { recursive: true, force: true });
  }
});
