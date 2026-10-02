import { describe, expect, it } from 'vitest';
import { meta, type Template } from '../../src/domain/model';
import {
  findTemplatePackConflicts,
  materializeTemplatePack,
  parseTemplatePack,
  type TemplatePack,
} from '../../src/domain/template-pack';

const minimalPack = (): unknown => ({
  format: 'cash-template-pack',
  formatVersion: 1,
  templates: [
    {
      name: 'Configurazione server',
      items: [
        {
          name: 'Installazione',
          subItems: [
            { kind: 'time', description: 'Preparazione', minutes: 30 },
          ],
          variantGroups: [],
        },
      ],
    },
  ],
});

const parseValid = (input: unknown): TemplatePack => {
  const parsed = parseTemplatePack(input);
  if (!parsed.ok)
    throw new Error(parsed.error.details?.join('\n') ?? parsed.error.message);
  return parsed.value;
};

const variantPack = (): unknown => ({
  format: 'cash-template-pack',
  formatVersion: 1,
  templates: [
    {
      name: 'Server',
      items: [
        {
          name: 'RAID',
          referencePrice: { amount: '150.00', period: '2026-09' },
          subItems: [{ kind: 'time', description: 'Preparazione', minutes: 5 }],
          variantGroups: [
            {
              name: 'Configurazione',
              defaultOption: 'Media',
              options: [
                {
                  name: 'Base',
                  subItems: [
                    { kind: 'time', description: 'RAID base', minutes: 10 },
                  ],
                },
                {
                  name: 'Media',
                  subItems: [
                    { kind: 'time', description: 'RAID media', minutes: 30 },
                  ],
                },
                {
                  name: 'Avanzata',
                  subItems: [
                    { kind: 'time', description: 'RAID avanzata', minutes: 60 },
                  ],
                },
                { name: 'Nessuna', subItems: [] },
              ],
            },
          ],
        },
      ],
    },
  ],
});

describe('cash-template-pack v1', () => {
  it('accetta un pack minimo valido', () => {
    const parsed = parseTemplatePack(minimalPack());
    expect(parsed.ok).toBe(true);
  });

  it('accetta le varianti Base, Media e Avanzata', () => {
    const pack = parseValid(variantPack());
    expect(
      pack.templates[0]?.items[0]?.variantGroups[0]?.options.map(
        (option) => option.name,
      ),
    ).toEqual(['Base', 'Media', 'Avanzata', 'Nessuna']);
  });

  it('rappresenta Nessuna come opzione con subItems vuoto', () => {
    const pack = parseValid(variantPack());
    expect(pack.templates[0]?.items[0]?.variantGroups[0]?.options[3]).toEqual({
      name: 'Nessuna',
      subItems: [],
    });
  });

  it('materializza nuove identità e collega il default alla nuova opzione', () => {
    const templates = materializeTemplatePack(parseValid(variantPack()));
    const template = templates[0]!;
    const item = template.items[0]!;
    const group = item.variantGroups[0]!;
    const ids = [
      template.id,
      item.id,
      item.subItems[0]!.id,
      group.id,
      ...group.options.map((option) => option.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[0-9a-f-]{36}$/i.test(id))).toBe(true);
    expect(
      group.options.find((option) => option.id === group.defaultOptionId)?.name,
    ).toBe('Media');
    expect(group.options[0]?.subItems[0]).not.toHaveProperty('id');
  });

  it('rifiuta campi sconosciuti anche negli oggetti annidati', () => {
    const input = minimalPack() as {
      templates: Array<{ items: Array<Record<string, unknown>> }>;
    };
    input.templates[0]!.items[0]!.unexpected = true;
    const parsed = parseTemplatePack(input);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok)
      expect(parsed.error.details?.join(' ')).toContain(
        'templates[0].items[0]',
      );
  });

  it('rifiuta formato e versione errati', () => {
    expect(
      parseTemplatePack({
        ...(minimalPack() as object),
        format: 'cash-archive',
      }).ok,
    ).toBe(false);
    expect(
      parseTemplatePack({ ...(minimalPack() as object), formatVersion: 2 }).ok,
    ).toBe(false);
  });

  it('rifiuta un defaultOption inesistente', () => {
    const input = variantPack() as {
      templates: Array<{
        items: Array<{ variantGroups: Array<{ defaultOption: string }> }>;
      }>;
    };
    input.templates[0]!.items[0]!.variantGroups[0]!.defaultOption =
      'Inesistente';
    expect(parseTemplatePack(input).ok).toBe(false);
  });

  it('rifiuta una durata time minore o uguale a zero', () => {
    const input = minimalPack() as {
      templates: Array<{
        items: Array<{ subItems: Array<{ minutes: number }> }>;
      }>;
    };
    input.templates[0]!.items[0]!.subItems[0]!.minutes = 0;
    expect(parseTemplatePack(input).ok).toBe(false);
  });

  it('rifiuta una voce senza alcun time o travel', () => {
    const input = minimalPack() as {
      templates: Array<{ items: Array<{ subItems: unknown[] }> }>;
    };
    input.templates[0]!.items[0]!.subItems = [
      { kind: 'expense', description: 'Materiale', amount: '10.00' },
    ];
    expect(parseTemplatePack(input).ok).toBe(false);
  });

  it('rifiuta nomi opzione duplicati ignorando case e whitespace esterno', () => {
    const input = variantPack() as {
      templates: Array<{
        items: Array<{
          variantGroups: Array<{ options: Array<{ name: string }> }>;
        }>;
      }>;
    };
    input.templates[0]!.items[0]!.variantGroups[0]!.options[1]!.name = ' base ';
    expect(parseTemplatePack(input).ok).toBe(false);
  });

  it('rileva il conflitto con un template esistente ignorando case e whitespace esterno', () => {
    const existing: Template = {
      ...meta(),
      name: '  configurazione SERVER ',
      items: [
        {
          ...meta(),
          name: 'Voce',
          subItems: [
            { ...meta(), kind: 'time', description: 'Lavoro', minutes: 1 },
          ],
          variantGroups: [],
        },
      ],
    };
    const conflicts = findTemplatePackConflicts(parseValid(minimalPack()), [
      existing,
    ]);
    expect(conflicts).toEqual([
      {
        templateIndex: 0,
        name: 'Configurazione server',
        existingTemplateIds: [existing.id],
      },
    ]);
  });

  it('materializza più template senza collisioni', () => {
    const input = minimalPack() as {
      templates: Array<Record<string, unknown>>;
    };
    input.templates.push({
      name: 'Assistenza',
      items: [
        {
          name: 'Intervento',
          subItems: [],
          variantGroups: [
            {
              name: 'Modalità',
              options: [
                {
                  name: 'Remoto',
                  subItems: [
                    { kind: 'time', description: 'Supporto', minutes: 45 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const templates = materializeTemplatePack(parseValid(input));
    expect(templates.map((template) => template.name)).toEqual([
      'Configurazione server',
      'Assistenza',
    ]);
    expect(new Set(templates.map((template) => template.id)).size).toBe(2);
  });
});
