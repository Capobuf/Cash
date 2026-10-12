import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let fic: typeof import('../../src/native/integrations/fatture-in-cloud');
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-12T05:15:00Z'));
  fic = await import('../../src/native/integrations/fatture-in-cloud');
});
afterEach(() => vi.useRealTimers());
const headers = {
  'RateLimit-HourlyRemaining': '840',
  'RateLimit-HourlyLimit': '1000',
  'RateLimit-MonthlyRemaining': '38420',
  'RateLimit-MonthlyLimit': '40000',
};
const page = () => ({ data: [], current_page: 1, last_page: 1 });
const response = (
  data: unknown,
  status = 200,
  quotaHeaders: Record<string, string> = {},
) => new Response(JSON.stringify(data), { status, headers: quotaHeaders });
const exportInput = {
  companyId: '1',
  clientId: '2',
  productId: '3',
  attemptId: 'attempt',
  lines: [],
  product: { id: '3', name: 'Consulenza', vat: { id: '4' } },
};

it.each([200, 422])(
  'osserva tutti gli header anche su HTTP %s e rimuove il listener',
  async (status) => {
    const listener = vi.fn();
    const unsubscribe = fic.onFicQuota(listener);
    const fetcher = vi.fn<typeof fetch>(async () =>
      response(page(), status, headers),
    );
    await fic.searchClients('1', '', 'secret', fetcher);
    expect(fic.getFicQuota('1')).toEqual({
      companyId: '1',
      hourlyRemaining: 840,
      hourlyLimit: 1000,
      monthlyRemaining: 38420,
      monthlyLimit: 40000,
      observedAt: '2026-10-12T05:15:00.000Z',
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(JSON.stringify(listener.mock.calls)).not.toContain('secret');
    expect(fic.getFicQuota('2')).toBeNull();
    unsubscribe();
    await fic.searchClients('1', '', 'secret', fetcher);
    expect(listener).toHaveBeenCalledOnce();
  },
);

it('ignora header assenti, malformati e quote non attribuibili; il nuovo processo non le conserva', async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    response(page(), 200, headers),
  );
  await fic.searchClients('1', '', 'secret', fetcher);
  const previous = fic.getFicQuota('1');
  await fic.listCompanies('secret', async () =>
    response({ data: { companies: [] } }, 200, headers),
  );
  expect(fic.getFicQuota('1')).toEqual(previous);
  await fic.searchClients('2', '', 'secret', async () =>
    response(page(), 200, {
      'RateLimit-HourlyRemaining': '',
      'RateLimit-HourlyLimit': '-1',
      'RateLimit-MonthlyRemaining': 'NaN',
      'RateLimit-MonthlyLimit': '1.5',
    }),
  );
  expect(fic.getFicQuota('2')).toMatchObject({
    hourlyRemaining: undefined,
    hourlyLimit: undefined,
    monthlyRemaining: undefined,
    monthlyLimit: undefined,
  });
  vi.resetModules();
  const restarted =
    await import('../../src/native/integrations/fatture-in-cloud');
  expect(restarted.getFicQuota('1')).toBeNull();
});

it('mantiene azienda e osservazione corrette con risposte fuori ordine', async () => {
  let finish!: (response: Response) => void;
  const first = fic.searchClients(
    '1',
    '',
    'secret',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await fic.searchClients('2', '', 'secret', async () =>
    response(page(), 200, { ...headers, 'RateLimit-HourlyRemaining': '123' }),
  );
  finish(response(page(), 200, headers));
  await first;
  expect(fic.getFicQuota('1')?.hourlyRemaining).toBe(840);
  expect(fic.getFicQuota('2')?.hourlyRemaining).toBe(123);
});

it.each([403, 429])(
  'HTTP %s con Retry-After interrompe e impedisce GET e POST durante il cooldown',
  async (status) => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({}, status, { ...headers, 'Retry-After': '30' }),
    );
    expect(await fic.searchClients('1', '', 'secret', fetcher)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMIT' },
    });
    const previous = fic.getFicQuota('1');
    expect(previous?.suspendedUntil).toBe('2026-10-12T05:15:30.000Z');
    expect(await fic.verifyPermissions('1', 'secret', fetcher)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMIT', requestSent: false },
    });
    expect(await fic.exportQuote(exportInput, 'secret', fetcher)).toMatchObject(
      {
        ok: true,
        value: {
          outcome: 'rejected',
          requestSent: false,
          diagnostic: expect.stringContaining('Non inviato'),
        },
      },
    );
    expect(fetcher).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30000);
    expect(fic.getFicQuota('1')).toEqual(previous);
    await fic.searchClients('1', '', 'secret', async () => response(page()));
  },
);

it.each([undefined, 'invalid', '-1'])(
  '429 senza attesa valida (%s) non inventa un cooldown né ritenta',
  async (wait) => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({}, 429, wait ? { 'Retry-After': wait } : {}),
    );
    expect(await fic.searchClients('1', '', 'secret', fetcher)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMIT' },
    });
    expect(fic.getFicQuota('1')?.suspendedUntil).toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  },
);

it('ritenta GET dopo un’attesa breve rispettando tre tentativi complessivi', async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    response({}, 429, { 'Retry-After': '2' }),
  );
  const result = fic.searchClients('1', '', 'secret', fetcher);
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetcher).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(2001);
  expect(await result).toMatchObject({
    ok: false,
    error: { code: 'RATE_LIMIT' },
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it.each(['network', 'server'])(
  'limita i retry GET temporanei (%s) e può recuperare',
  async (failure) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => {
        if (failure === 'network') throw new TypeError('temporary');
        return response({}, 503);
      })
      .mockImplementation(async () => response(page()));
    const result = fic.searchClients('1', '', 'secret', fetcher);
    await vi.runAllTimersAsync();
    expect((await result).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);

it.each([
  ['INSUFFICIENT_SCOPE', 'CREDENTIALS', 'scope'],
  ['LICENSE_EXPIRED', 'SOURCE_UNAVAILABLE', 'licenza'],
  ['UNKNOWN', 'SOURCE_UNAVAILABLE', 'causa non identificata'],
] as const)('distingue 403 %s', async (code, expected, message) => {
  const result = await fic.getTaxProfile('1', 'secret', async () =>
    response({ error: { code } }, 403),
  );
  expect(result).toMatchObject({ ok: false, error: { code: expected } });
  if (!result.ok)
    expect(`${result.error.message} ${result.error.action}`).toContain(message);
});

it('riconosce quota zero nel 403 senza Retry-After', async () => {
  expect(
    await fic.getTaxProfile('1', 'secret', async () =>
      response({}, 403, { 'RateLimit-MonthlyRemaining': '0' }),
    ),
  ).toMatchObject({ ok: false, error: { code: 'RATE_LIMIT' } });
});

it('estrae validazioni leggibili e limitate senza token o payload intero', async () => {
  const result = await fic.exportQuote(exportInput, 'secret', async () =>
    response(
      {
        error: {
          code: 'VALIDATION',
          message: 'Campo errato',
          validation_result: {
            items_list: { net_price: ['Deve essere positivo'] },
            token: 'secret',
          },
        },
      },
      422,
    ),
  );
  expect(result).toMatchObject({
    ok: true,
    value: {
      outcome: 'rejected',
      requestSent: true,
      error: { code: 'SOURCE_INVALID' },
      diagnostic: expect.stringContaining(
        'items_list.net_price: Deve essere positivo',
      ),
    },
  });
  expect(JSON.stringify(result)).not.toContain('secret');
});

it('interpreta la struttura OAuth e ignora un body non JSON', async () => {
  expect(
    await fic.listCompanies('secret', async () =>
      response(
        { error: 'invalid_request', error_description: 'Parametro errato' },
        400,
      ),
    ),
  ).toMatchObject({
    ok: false,
    error: { message: expect.stringContaining('Parametro errato') },
  });
  expect(
    await fic.getTaxProfile(
      '1',
      'secret',
      async () => new Response('<html>secret</html>', { status: 404 }),
    ),
  ).toMatchObject({
    ok: false,
    error: {
      code: 'SOURCE_UNAVAILABLE',
      message: expect.not.stringContaining('secret'),
    },
  });
});

it('non ritenta una POST in timeout e conserva l’esito incerto', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('timeout', 'AbortError')),
        );
      }),
  );
  const result = fic.exportQuote(exportInput, 'secret', fetcher);
  await vi.advanceTimersByTimeAsync(15000);
  expect(await result).toMatchObject({
    ok: true,
    value: { outcome: 'uncertain', requestSent: true },
  });
  expect(fetcher).toHaveBeenCalledOnce();
});

it('interrompe le sonde permessi al primo rate limit', async () => {
  const fetcher = vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith('/company/info')
      ? response({
          data: { id: 1, name: 'Studio', access_info: { permissions: {} } },
        })
      : response({}, 403, { 'Retry-After': '60' }),
  );
  expect(await fic.verifyPermissions('1', 'secret', fetcher)).toMatchObject({
    ok: false,
    error: { code: 'RATE_LIMIT' },
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
