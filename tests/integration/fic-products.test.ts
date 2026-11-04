import { expect, it, vi } from 'vitest';
import { searchProducts } from '../../src/native/integrations/fatture-in-cloud';

it('cerca tutti i prodotti, protegge gli apostrofi e mantiene la paginazione', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 42, name: 'Installazione' },
            { id: 43, name: 'Supporto' },
          ],
          current_page: 2,
          last_page: 3,
        }),
      ),
  );
  expect(await searchProducts('1', "d'ufficio", 'token', fetcher, 2)).toEqual({
    ok: true,
    value: {
      products: [
        { id: '42', name: 'Installazione' },
        { id: '43', name: 'Supporto' },
      ],
      page: 2,
      nextPage: 3,
    },
  });
  const url = new URL(String(fetcher.mock.calls[0]![0]));
  expect(url.searchParams.get('q')).toBe("name contains 'd''ufficio'");
  expect(url.searchParams.get('page')).toBe('2');
});

it('rifiuta pagine incoerenti e dati prodotto malformati', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify({ data: [], current_page: 1, last_page: 2 })),
  );
  expect((await searchProducts('1', '', 'token', fetcher, 2)).ok).toBe(false);
  fetcher.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ data: [{ id: 2 }], current_page: 1, last_page: 1 }),
    ),
  );
  expect((await searchProducts('1', '', 'token', fetcher)).ok).toBe(false);
});
