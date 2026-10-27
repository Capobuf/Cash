import { describe, expect, it } from 'vitest';
import {
  meta,
  type Template,
  type Site,
  type FicClientSnapshot,
} from '../../src/domain/model';
import {
  normalizeSearch,
  templateSearchText,
} from '../../src/renderer/lib/template-search';
import { siteOptions } from '../../src/renderer/lib/site-options';

describe('ricerca e sedi dell’editor operativo', () => {
  it('trova testi presenti solo nelle sottovoci e nelle opzioni di variante come nel Catalogo', () => {
    const template: Template = {
      ...meta(),
      name: 'Infrastruttura',
      items: [
        {
          ...meta(),
          name: 'Installazione',
          subItems: [
            {
              ...meta(),
              kind: 'time',
              description: 'Configurazione NAS',
              minutes: 60,
            },
          ],
          variantGroups: [
            {
              ...meta(),
              name: 'Archiviazione',
              options: [
                {
                  ...meta(),
                  name: 'Ridondanza',
                  subItems: [
                    {
                      kind: 'expense',
                      description: 'Disco sostitutivo',
                      amount: '90.00',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    for (const query of [
      ' NAS ',
      'INSTALLAZIONE',
      'archiviazione',
      'ridondanza',
      'disco sostitutivo',
    ]) {
      expect(templateSearchText(template)).toContain(normalizeSearch(query));
    }
    expect(templateSearchText(template)).not.toContain('inesistente');
  });

  it('distingue sedi omonime, separa il cliente corrente e conserva gli altri clienti nelle trasferte', () => {
    const client: FicClientSnapshot = {
      source: 'fatture_in_cloud',
      companyId: '1',
      clientId: '2',
      displayName: 'Alfa',
    };
    const sites: Site[] = [
      { ...meta(), name: 'Ufficio', address: 'Via Libera 1' },
      { ...meta(), name: 'Ufficio', address: 'Via Cliente 2', client },
      {
        ...meta(),
        name: 'Ufficio',
        address: 'Via Altra 3',
        client: { ...client, companyId: '9', displayName: 'Beta' },
      },
    ];
    const main = siteOptions(sites, client, true);
    expect(main.map((option) => option.value)).toEqual([
      sites[1]!.id,
      sites[0]!.id,
    ]);
    expect(main.map((option) => option.group)).toEqual([
      'Sedi del Cliente selezionato',
      'Altre sedi senza Cliente',
    ]);
    const all = siteOptions(sites, client);
    expect(all).toHaveLength(3);
    expect(new Set(all.map((option) => option.label)).size).toBe(3);
    expect(all[0]!.label).toContain('Via Cliente 2 · Cliente corrente: Alfa');
    expect(all[1]!.label).toContain('Via Altra 3 · Cliente: Beta');
    expect(all[2]!.label).toContain('Senza Cliente');
    expect(
      siteOptions(sites, undefined, true).map((option) => option.value),
    ).toEqual([sites[0]!.id]);
  });
});
