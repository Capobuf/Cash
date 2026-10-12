import { describe, expect, it, vi } from 'vitest';
import { createClient } from '../../src/native/integrations/fatture-in-cloud';
import type { FicCreateClientInput } from '../../src/shared/fic';

const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('creazione cliente FIC', () => {
  it('invia solo i dati minimi e restituisce il cliente remoto', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({ data: { id: 42, name: 'Nuovo cliente' } }),
    );
    expect(
      await createClient(
        'azienda',
        { name: '  Nuovo cliente  ', type: 'company' },
        'secret',
        fetcher,
      ),
    ).toEqual({
      ok: true,
      value: {
        outcome: 'created',
        client: {
          source: 'fatture_in_cloud',
          companyId: 'azienda',
          clientId: '42',
          displayName: 'Nuovo cliente',
        },
      },
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      'https://api-v2.fattureincloud.it/c/azienda/entities/clients',
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      data: { name: 'Nuovo cliente', type: 'company' },
    });
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret' });
  });

  it('trasmette i campi avanzati documentati senza perdere false e zero', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({
        data: { id: 43, name: 'Cliente', vat_number: 'IT01234567890' },
      }),
    );
    const client: FicCreateClientInput = {
      name: 'Cliente',
      type: 'company',
      vat_number: 'IT01234567890',
      code: 'C42',
      address_extra: 'Interno 2',
      tax_code: '01234567890',
      contact_person: 'Mario',
      e_invoice: false,
      default_payment_terms: 0,
      default_payment_terms_type: 'end_of_month',
      default_discount: 0,
      notes: 'Nota',
      certified_email: 'cliente@pec.it',
      bank_iban: 'IBAN',
    };
    expect(
      await createClient('azienda', client, 'secret', fetcher),
    ).toMatchObject({
      ok: true,
      value: { outcome: 'created', client: { vatNumber: 'IT01234567890' } },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
      data: client,
    });
  });

  it.each([
    { name: '   ', type: 'company' },
    { name: 'Cliente' },
    { name: 'Cliente', type: 'sconosciuto' },
    { name: 'Cliente', type: 'company', email: 'errata' },
    { name: 'Cliente', type: 'company', default_payment_terms: -1 },
    { name: 'Cliente', type: 'company', default_discount: 101 },
    {
      name: 'Cliente',
      type: 'company',
      courtesy_invoice_config: { enabled: true },
    },
  ])('rifiuta dati non validi prima dell’invio: %j', async (client) => {
    const fetcher = vi.fn<typeof fetch>();
    expect(
      await createClient(
        'azienda',
        client as FicCreateClientInput,
        'secret',
        fetcher,
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([403, 409, 422])(
    'mantiene gli errori FIC HTTP %s e non ripete il POST',
    async (status) => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        response(
          { error: { code: 'FORBIDDEN', message: 'Operazione rifiutata' } },
          status,
        ),
      );
      const result = await createClient(
        'azienda',
        { name: 'Cliente', type: 'company' },
        'secret',
        fetcher,
      );
      expect(result.ok).toBe(false);
      if (!result.ok && status === 403)
        expect(result.error.action).toContain('entity.clients:a');
      if (!result.ok && status === 409)
        expect(result.error.code).toBe('CONFLICT');
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it.each(['network', 'server', 'invalid-response'])(
    'segnala esito incerto e non ripete il POST: %s',
    async (failure) => {
      const fetcher = vi.fn<typeof fetch>(async () => {
        if (failure === 'network') throw new Error('Connection closed');
        return failure === 'server'
          ? response({}, 500)
          : response({ data: { id: 42 } });
      });
      expect(
        await createClient(
          'azienda',
          { name: 'Cliente', type: 'company' },
          'secret',
          fetcher,
        ),
      ).toMatchObject({ ok: true, value: { outcome: 'uncertain' } });
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
});
