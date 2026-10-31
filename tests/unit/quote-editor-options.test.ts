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

  it('mostra solo le sedi del cliente corrente e quelle senza cliente, distinguendo le sedi omonime', () => {
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
      {
        ...meta(),
        name: 'Ufficio',
        address: 'Via Altro Cliente 4',
        client: { ...client, clientId: '3', displayName: 'Gamma' },
      },
    ];
    const options = siteOptions(sites, client);
    expect(options.map((option) => option.value)).toEqual([
      sites[1]!.id,
      sites[0]!.id,
    ]);
    expect(options.map((option) => option.group)).toEqual([
      'Sedi del Cliente selezionato',
      'Altre sedi senza Cliente',
    ]);
    expect(new Set(options.map((option) => option.label)).size).toBe(2);
    expect(options[0]!.label).toContain(
      'Via Cliente 2 · Cliente corrente: Alfa',
    );
    expect(options[1]!.label).toContain('Senza Cliente');
    expect(siteOptions(sites).map((option) => option.value)).toEqual([
      sites[0]!.id,
    ]);
  });
});
