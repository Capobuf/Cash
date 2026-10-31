import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  meta,
  ok,
  err,
  type QuoteLayoutEntry,
} from '../../src/domain/model';
import { addQuote } from '../../src/domain/quotes';
import {
  quoteLayout,
  orderedQuoteItems,
  removeQuoteItem,
} from '../../src/domain/quote-layout';
import { cashDocumentSchema } from '../../src/domain/schema';
import { calculateQuote } from '../../src/domain/calculations';
import { buildExportLines } from '../../src/domain/export';
import { AppState } from '../../src/renderer/state';
import { useQuoteController } from '../../src/renderer/hooks/use-quote-controller';

function setup() {
  const doc = createEmptyDocument();
  const quote = addQuote(doc);
  quote.client = {
    source: 'fatture_in_cloud',
    companyId: '1',
    clientId: '2',
    displayName: 'Cliente',
  };
  quote.items = ['Router', 'Switch', 'Firewall'].map((name) => ({
    ...meta(),
    name,
    chosenPrice: '100.00',
    variantGroups: [],
    variantSelections: [],
    subItems: [{ ...meta(), kind: 'time', description: name, minutes: 60 }],
  }));
  const template = {
    ...meta(),
    name: 'Rete',
    items: ['LAN', 'Wi-Fi'].map((name) => ({
      ...meta(),
      name,
      subItems: [],
      variantGroups: [],
    })),
  };
  doc.catalog.templates.push(template);
  const state = new AppState();
  const save = vi.fn<Window['cash']['archive']['save']>(
    async (path, document) =>
      ok({
        path,
        document,
        readOnly: false,
        token: { documentId: document.documentId, revision: document.revision },
      }),
  );
  vi.stubGlobal('window', { cash: { setDirty: vi.fn(), archive: { save } } });
  state.acceptNativeSession({
    path: 'test.sqlite',
    document: doc,
    readOnly: false,
    token: { documentId: doc.documentId, revision: doc.revision },
  });
  const controller = () => {
    let result!: ReturnType<typeof useQuoteController>;
    function Harness() {
      result = useQuoteController({
        doc: state.document!,
        hasToken: false,
        appState: state,
        activeQuoteId: quote.id,
        setActiveQuoteId: vi.fn(),
        requestDelete: vi.fn(),
      });
      return null;
    }
    renderToStaticMarkup(<Harness />);
    return result;
  };
  const current = () => state.document!.quotes[0]!;
  const container = () =>
    current().layout!.find((entry) => entry.kind === 'container')! as Extract<
      QuoteLayoutEntry,
      { kind: 'container' }
    >;
  return { doc, quote, state, save, controller, current, container, template };
}

afterEach(() => vi.unstubAllGlobals());

describe('disposizione dei preventivi', () => {
  it.each([false, true])(
    'inserisce una voce da catalogo nel punto scelto senza creare righe intermedie (contenitore: %s)',
    async (inContainer) => {
      const { controller, current, state } = setup();
      const original = structuredClone(current().items);
      let containerId: string | undefined;
      if (inContainer) {
        containerId = meta().id;
        controller().saveLayout([
          {
            kind: 'container',
            id: containerId,
            name: 'Servizi',
            itemIds: original.map((item) => item.id),
          },
        ]);
      }
      const entry = {
        ...meta(),
        kind: 'expense' as const,
        description: 'Licenza',
        amount: '12.00',
      };
      expect(
        await controller().addReusable(
          { containerId, afterItemId: original[0]!.id },
          entry,
        ),
      ).toBe(true);
      const inserted = current().items.at(-1)!;
      expect(current().items).toHaveLength(4);
      expect(inserted).toMatchObject({
        name: 'Licenza',
        subItems: [{ kind: 'expense', amount: '12.00' }],
      });
      expect(orderedQuoteItems(current()).map((item) => item.id)).toEqual([
        original[0]!.id,
        inserted.id,
        original[1]!.id,
        original[2]!.id,
      ]);
      expect(current().items.slice(0, 3)).toEqual(original);
      await state.save();
    },
  );

  it('inserisce un template accorpato nella nuova riga senza sostituire le voci esistenti', async () => {
    const { controller, current, state, template } = setup();
    state.document!.catalog.templates[0]!.items.forEach((item) => {
      item.subItems = [
        { ...meta(), kind: 'time', description: item.name, minutes: 30 },
      ];
    });
    const original = structuredClone(current().items);
    const source = structuredClone(state.document!.catalog.templates[0]);
    expect(
      await controller().insertTemplate(
        template.id,
        {},
        {},
        undefined,
        original[0]!.id,
        undefined,
        true,
      ),
    ).toBe(true);
    const inserted = current().items.at(-1)!;
    expect(current().items).toHaveLength(4);
    expect(inserted).toMatchObject({
      name: 'Rete',
      subItems: [
        { description: 'LAN', minutes: 30 },
        { description: 'Wi-Fi', minutes: 30 },
      ],
    });
    expect(orderedQuoteItems(current()).map((item) => item.id)).toEqual([
      original[0]!.id,
      inserted.id,
      original[1]!.id,
      original[2]!.id,
    ]);
    expect(current().items.slice(0, 3)).toEqual(original);
    expect(state.document!.catalog.templates[0]).toEqual(source);
    await state.save();
  });
  it('nomina la trasferta con partenza e destinazione senza sovrascrivere un nome personalizzato', async () => {
    const { controller, current, state } = setup();
    const departure = { ...meta(), name: 'Magazzino' };
    const destination = { ...meta(), name: 'Cliente' };
    const other = { ...meta(), name: 'Sede secondaria' };
    state.document!.sites.push(departure, destination, other);
    state.document!.settings.defaultDepartureSiteId = departure.id;
    current().mainSite = { sourceId: destination.id, name: destination.name };
    const row = current().items[0]!;
    row.name = 'Trasferta - Magazzino <--> Cliente';
    row.subItems = [];
    const input = {
      description: '',
      departureSiteId: departure.id,
      destinationSiteId: destination.id,
      roundTrip: true,
      occurrences: 1,
    };
    expect(await controller().saveTravel(row.id, input)).toBe(true);
    let saved = current().items[0]!;
    expect(saved.name).toBe('Trasferta - Magazzino <--> Cliente');
    expect(saved.subItems[0]!.description).toBe(saved.name);
    const subId = saved.subItems[0]!.id;
    expect(
      await controller().saveTravel(
        row.id,
        { ...input, destinationSiteId: other.id },
        subId,
      ),
    ).toBe(true);
    saved = current().items[0]!;
    expect(saved.name).toBe('Trasferta - Magazzino <--> Sede secondaria');
    expect(saved.subItems).toHaveLength(1);
    expect(saved.subItems[0]!.id).toBe(subId);
    expect(controller().renameItem(row.id, 'Consegna urgente')).toBe(true);
    expect(
      await controller().saveTravel(
        row.id,
        { ...input, description: 'Ritiro materiale' },
        subId,
      ),
    ).toBe(true);
    expect(current().items[0]!.name).toBe('Consegna urgente');
    expect(current().items[0]!.subItems[0]!.description).toBe(
      'Ritiro materiale',
    );
    expect(current().items[0]!.chosenPrice).toBe('100.00');
    expect(cashDocumentSchema.safeParse(state.document).success).toBe(true);
  });

  it.each([false, true])(
    'duplica una riga con varianti subito dopo l’originale (nel contenitore: %s)',
    async (grouped) => {
      const { controller, current, state, container } = setup();
      const source = current().items[0]!;
      const option = {
        ...meta(),
        name: 'Base',
        subItems: [
          { kind: 'time' as const, description: 'Attività', minutes: 30 },
        ],
      };
      const group = {
        ...meta(),
        name: 'Configurazione',
        options: [option],
        defaultOptionId: option.id,
      };
      source.variantGroups = [group];
      source.variantSelections = [{ groupId: group.id, optionId: option.id }];
      source.subItems[0]!.variantOwner = {
        groupId: group.id,
        optionId: option.id,
        definitionIndex: 0,
      };
      source.subItems[0]!.manuallyModified = true;
      source.subItems.push({
        ...meta(),
        kind: 'travel',
        description: 'Trasferta',
        roundTrip: true,
        occurrences: 2,
      });
      if (grouped) {
        controller().addContainer();
        expect(
          controller().saveLayout([
            { ...container(), itemIds: [source.id] },
            ...current()
              .items.slice(1)
              .map((item) => ({ kind: 'item' as const, itemId: item.id })),
          ]),
        ).toBe(true);
      }
      const before = structuredClone(current().items[0]!);
      const id = controller().duplicateItem(source.id);
      expect(id).toBeTypeOf('string');
      const copy = current().items.find((item) => item.id === id)!;
      expect(current().items).toHaveLength(4);
      expect(
        orderedQuoteItems(current())
          .slice(0, 2)
          .map((item) => item.id),
      ).toEqual([source.id, id]);
      if (grouped) expect(container().itemIds).toEqual([source.id, id]);
      expect(copy).toMatchObject({
        name: before.name,
        chosenPrice: before.chosenPrice,
      });
      expect(copy.subItems.map((sub) => sub.id)).not.toEqual(
        before.subItems.map((sub) => sub.id),
      );
      const copiedGroup = copy.variantGroups[0]!;
      expect(copiedGroup.id).not.toBe(group.id);
      expect(copiedGroup.options[0]!.id).not.toBe(option.id);
      expect(copiedGroup.defaultOptionId).toBe(copiedGroup.options[0]!.id);
      expect(copy.variantSelections).toEqual([
        { groupId: copiedGroup.id, optionId: copiedGroup.options[0]!.id },
      ]);
      expect(copy.subItems[0]).toMatchObject({
        minutes: 60,
        manuallyModified: true,
        variantOwner: {
          groupId: copiedGroup.id,
          optionId: copiedGroup.options[0]!.id,
          definitionIndex: 0,
        },
      });
      expect(copy.subItems[1]).toMatchObject({
        kind: 'travel',
        roundTrip: true,
        occurrences: 2,
      });
      expect(controller().renameItem(copy.id, 'Copia modificata')).toBe(true);
      expect(current().items[0]).toEqual(before);
      expect(cashDocumentSchema.safeParse(state.document).success).toBe(true);
      const count = current().items.length;
      state.session!.readOnly = true;
      expect(controller().duplicateItem(source.id)).toBe(false);
      expect(current().items).toHaveLength(count);
    },
  );

  it('cambia tipo conservando identità, dati commerciali e posizione della voce', async () => {
    const { controller, current, state } = setup();
    const original = structuredClone(current().items[0]!);
    const layout = quoteLayout(current());
    expect(await controller().changeItemKind(original.id, 'expense')).toBe(
      true,
    );
    let item = current().items[0]!;
    expect(item).toMatchObject({
      id: original.id,
      name: original.name,
      chosenPrice: original.chosenPrice,
      createdAt: original.createdAt,
    });
    expect(item.subItems).toHaveLength(1);
    expect(item.subItems[0]).toMatchObject({
      kind: 'expense',
      description: original.subItems[0]!.description,
    });
    expect(item.subItems[0]).not.toHaveProperty('amount');
    expect(item.subItems[0]).not.toHaveProperty('minutes');
    expect(quoteLayout(current())).toEqual(layout);
    expect(await controller().changeItemKind(original.id, 'travel')).toBe(true);
    expect(current().items[0]!.subItems[0]).toMatchObject({
      kind: 'travel',
      roundTrip: true,
      occurrences: 1,
    });
    expect(await controller().changeItemKind(original.id, 'generic')).toBe(
      true,
    );
    item = current().items[0]!;
    expect(item.subItems).toEqual([]);
    expect(item.variantGroups).toEqual([]);
    expect(item.chosenPrice).toBe(original.chosenPrice);
    expect(cashDocumentSchema.safeParse(state.document).success).toBe(true);
    await state.save();
  });

  it('sostituisce dal catalogo senza aggiungere sottorighe residue o perdere il prezzo', async () => {
    const { controller, current, state } = setup();
    const original = structuredClone(current().items[0]!);
    const option = { ...meta(), name: 'A', subItems: [] };
    const group = { ...meta(), name: 'Scelta', options: [option] };
    current().items[0]!.variantGroups = [group];
    current().items[0]!.variantSelections = [
      { groupId: group.id, optionId: option.id },
    ];
    const entry = {
      ...meta(),
      kind: 'expense' as const,
      description: 'Licenza',
      amount: '25.00',
    };
    expect(await controller().addReusable(original.id, entry, {}, true)).toBe(
      true,
    );
    const item = current().items[0]!;
    expect(item.subItems).toHaveLength(1);
    expect(item.subItems[0]).toMatchObject({
      kind: 'expense',
      description: 'Licenza',
      amount: '25.00',
    });
    expect(item).toMatchObject({
      name: entry.description,
      chosenPrice: original.chosenPrice,
      variantGroups: [],
      variantSelections: [],
    });
    expect(cashDocumentSchema.safeParse(state.document).success).toBe(true);
    await state.save();
  });

  it('riunisce un template in una sola riga conservando dati commerciali e varianti indipendenti', async () => {
    const { controller, current, state } = setup();
    const original = structuredClone(current().items[0]!);
    const layout = quoteLayout(current());
    const template = state.document!.catalog.templates[0]!;
    for (const [index, item] of template.items.entries()) {
      item.subItems = [
        { ...meta(), kind: 'time', description: item.name, minutes: 30 },
      ];
      const option = {
        ...meta(),
        name: 'Base',
        subItems: [
          {
            kind: 'expense' as const,
            description: item.name,
            amount: `${index + 1}.00`,
          },
        ],
      };
      item.variantGroups = [
        { ...meta(), name: 'Configurazione', options: [option] },
      ];
    }
    const source = structuredClone(template);
    const choices = Object.fromEntries(
      template.items.map((item) => [
        item.variantGroups[0]!.id,
        item.variantGroups[0]!.options[0]!.id,
      ]),
    );
    expect(
      await controller().applyTemplateToItem(
        original.id,
        template.id,
        choices,
        {},
      ),
    ).toBe(true);
    const item = current().items[0]!;
    expect(current().items).toHaveLength(3);
    expect(item).toMatchObject({
      id: original.id,
      name: template.name,
      chosenPrice: original.chosenPrice,
      createdAt: original.createdAt,
    });
    expect(quoteLayout(current())).toEqual(layout);
    expect(item.subItems.map((sub) => sub.description)).toEqual([
      'LAN',
      'LAN',
      'Wi-Fi',
      'Wi-Fi',
    ]);
    expect(item.variantGroups.map((group) => group.name)).toEqual([
      'LAN · Configurazione',
      'Wi-Fi · Configurazione',
    ]);
    expect(item.variantSelections).toHaveLength(2);
    for (const [index, group] of item.variantGroups.entries()) {
      expect(group.id).not.toBe(source.items[index]!.variantGroups[0]!.id);
      expect(item.variantSelections[index]).toEqual({
        groupId: group.id,
        optionId: group.options[0]!.id,
      });
      expect(item.subItems[index * 2 + 1]!.variantOwner).toMatchObject({
        groupId: group.id,
        optionId: group.options[0]!.id,
      });
    }
    expect(state.document!.catalog.templates[0]).toEqual(source);
    expect(cashDocumentSchema.safeParse(state.document).success).toBe(true);
    await state.save();
  });

  it('non sostituisce parzialmente una riga quando manca una scelta del template', async () => {
    const { controller, current, state } = setup();
    const before = structuredClone(current());
    const template = state.document!.catalog.templates[0]!;
    template.items[1]!.variantGroups = [
      {
        ...meta(),
        name: 'Configurazione',
        options: [{ ...meta(), name: 'Base', subItems: [] }],
      },
    ];
    expect(
      await controller().applyTemplateToItem(
        before.items[0]!.id,
        template.id,
        {},
        {},
      ),
    ).toBe(false);
    expect(current()).toEqual(before);
  });

  it('non applica un template se il contesto cambia durante la preparazione', async () => {
    const { controller, current, state } = setup();
    const before = structuredClone(current());
    const template = state.document!.catalog.templates[0]!;
    template.items[1]!.subItems = [
      {
        ...meta(),
        kind: 'travel',
        description: 'Viaggio',
        roundTrip: true,
        occurrences: 1,
      },
    ];
    const operation = controller().applyTemplateToItem(
      before.items[0]!.id,
      template.id,
      {},
      {},
    );
    state.session!.readOnly = true;
    expect(await operation).toBe(false);
    expect(current()).toEqual(before);
    expect(
      await controller().applyTemplateToItem(
        before.items[0]!.id,
        template.id,
        {},
        {},
      ),
    ).toBe(false);
  });

  it('non converte una voce se il contesto cambia durante la preparazione', async () => {
    const { controller, current, state } = setup();
    const before = structuredClone(current());
    const operation = controller().changeItemKind(
      before.items[0]!.id,
      'travel',
    );
    state.session!.readOnly = true;
    expect(await operation).toBe(false);
    expect(current()).toEqual(before);
    expect(
      await controller().changeItemKind(before.items[0]!.id, 'expense'),
    ).toBe(false);
  });

  it('crea e completa righe tecniche vuote conservando identità, ordine e prezzo indipendente', async () => {
    const { controller, current, state } = setup();
    const baseline = calculateQuote(current().items, '50.00');
    expect(
      controller().addItem('', undefined, undefined, {
        kind: 'time',
        description: '',
      }),
    ).toBe(true);
    const row = current().items.at(-1)!;
    const activityId = row.subItems[0]!.id;
    expect(row.subItems[0]).toMatchObject({ kind: 'time', description: '' });
    expect(row.subItems[0]).not.toHaveProperty('minutes');
    const expenseId = await controller().addSubItem(row.id, 'expense');
    expect(expenseId).toBeTypeOf('string');
    expect(current().items.at(-1)!.subItems.at(-1)).toMatchObject({
      id: expenseId,
      kind: 'expense',
      description: '',
    });
    expect(current().items.at(-1)!.subItems.at(-1)).not.toHaveProperty(
      'amount',
    );
    expect(cashDocumentSchema.safeParse(state.document).success).toBe(true);
    expect(calculateQuote(current().items, '50.00')).toMatchObject({
      minutes: baseline.minutes,
      chosenTotal: baseline.chosenTotal,
      minutesPartial: true,
      expensesPartial: true,
    });
    expect(controller().updateChosenPrice(row.id, '0')).toBe(true);
    expect(controller().renameItem(row.id, 'Gestione cliente')).toBe(true);
    expect(buildExportLines(current()).ok).toBe(true);
    expect(controller().saveSubToCatalog(row.id, activityId)).toBe(false);
    expect(
      controller().saveSimpleSub(
        row.id,
        { kind: 'time', description: 'WhatsApp', minutes: 30 },
        activityId,
      ),
    ).toBe(true);
    expect(
      controller().saveSimpleSub(
        row.id,
        { kind: 'expense', description: 'Telefonia', amount: '8.00' },
        String(expenseId),
      ),
    ).toBe(true);
    expect(
      current()
        .items.at(-1)!
        .subItems.map((sub) => sub.id),
    ).toEqual([activityId, expenseId]);
    expect(controller().saveSubToCatalog(row.id, activityId)).toBe(true);
    expect(
      controller().saveSimpleSub(
        row.id,
        { kind: 'time', description: 'WhatsApp' },
        activityId,
      ),
    ).toBe(true);
    expect(current().items.at(-1)!.subItems[0]).toMatchObject({
      id: activityId,
      minutes: undefined,
    });
    const count = current().items.at(-1)!.subItems.length;
    expect(
      controller().saveSimpleSub(
        row.id,
        { kind: 'time', description: '', minutes: 0 },
        activityId,
      ),
    ).toBe(false);
    expect(
      controller().saveSimpleSub(
        row.id,
        { kind: 'expense', description: '', amount: '-1' },
        String(expenseId),
      ),
    ).toBe(false);
    expect(current().items.at(-1)!.subItems).toHaveLength(count);
    expect(await controller().addSubItem('missing-item', 'time')).toBe(false);
    state.session!.readOnly = true;
    expect(await controller().addSubItem(row.id, 'expense')).toBe(false);
    state.session!.readOnly = false;
    await state.save();
  });

  it('inserisce attività valide o righe da stimare fra voci senza duplicare dati economici', async () => {
    const { controller, current, quote, state } = setup();
    const first = quote.items[0]!.id;
    expect(controller().addItem('Acquisizione', undefined, first)).toBe(true);
    expect(
      controller().addItem('Configurazione', undefined, first, {
        kind: 'time',
        description: 'Configurazione NAS',
        minutes: 90,
      }),
    ).toBe(true);
    expect(orderedQuoteItems(current()).map((item) => item.name)).toEqual([
      'Router',
      'Configurazione',
      'Acquisizione',
      'Switch',
      'Firewall',
    ]);
    expect(current().items.at(-2)!.subItems).toEqual([]);
    expect(current().items.at(-2)!.chosenPrice).toBeUndefined();
    expect(current().items.at(-1)!.subItems).toHaveLength(1);
    expect(calculateQuote(current().items, '50.00').minutes).toBe(270);
    const before = structuredClone(current());
    expect(
      controller().addItem('Invalida', undefined, first, {
        kind: 'time',
        description: 'Zero',
        minutes: 0,
      }),
    ).toBe(false);
    expect(
      controller().addItem('Invalida', undefined, first, {
        kind: 'expense',
        description: 'Spesa',
        amount: '-1',
      }),
    ).toBe(false);
    expect(current()).toEqual(before);
    expect(cashDocumentSchema.safeParse(state.document).success).toBe(true);
    await state.save();
  });

  it('inserisce tutte le voci di un template dopo una riga, anche dentro un contenitore', async () => {
    const { controller, current, container, template, state } = setup();
    const first = current().items[0]!.id;
    expect(
      await controller().insertTemplate(template.id, {}, {}, undefined, first),
    ).toBe(true);
    expect(orderedQuoteItems(current()).map((item) => item.name)).toEqual([
      'Router',
      'LAN',
      'Wi-Fi',
      'Switch',
      'Firewall',
    ]);
    expect(controller().addContainer('Sede Nord')).toBe(true);
    const id = container().id;
    expect(container().name).toBe('Sede Nord');
    expect(controller().addItem('A', id)).toBe(true);
    const anchor = current().items.at(-1)!.id;
    expect(controller().addItem('B', id)).toBe(true);
    expect(
      await controller().insertTemplate(template.id, {}, {}, id, anchor),
    ).toBe(true);
    expect(
      container().itemIds.map(
        (itemId) => current().items.find((item) => item.id === itemId)!.name,
      ),
    ).toEqual(['A', 'LAN', 'Wi-Fi', 'B']);
    expect(
      new Set(orderedQuoteItems(current()).map((item) => item.id)).size,
    ).toBe(current().items.length);
    expect(cashDocumentSchema.safeParse(state.document).success).toBe(true);
    await state.save();
  });

  it('rifiuta inserimenti in posizioni rimosse o spostate e modifiche da un altro archivio', async () => {
    const { controller, current, state, template } = setup();
    const previous = controller();
    const first = current().items[0]!.id;
    state.mutate((doc) => removeQuoteItem(doc.quotes[0]!, first));
    const before = structuredClone(current());
    expect(previous.addItem('Stale', undefined, first)).toBe(false);
    expect(
      await controller().insertTemplate(template.id, {}, {}, undefined, first),
    ).toBe(false);
    expect(current()).toEqual(before);
    const stale = controller();
    state.acceptNativeSession({ ...state.session!, path: 'other.sqlite' });
    expect(stale.renameItem(current().items[0]!.id, 'Altro')).toBe(false);
    expect(stale.updateChosenPrice(current().items[0]!.id, '200')).toBe(false);
    expect(
      stale.saveSimpleSub(current().items[0]!.id, {
        kind: 'time',
        description: 'Attività',
        minutes: 20,
      }),
    ).toBe(false);
    expect(current()).toEqual(before);
    await state.save();
  });

  it('lascia i preventivi legacy senza metadati e con ordine e totale originali', () => {
    const { doc, quote } = setup();
    expect(cashDocumentSchema.parse(doc).quotes[0]!.layout).toBeUndefined();
    expect(orderedQuoteItems(quote)).toBe(quote.items);
    expect(quoteLayout(quote)).toEqual(
      quote.items.map((item) => ({ kind: 'item', itemId: item.id })),
    );
  });

  it('crea, rinomina e riordina contenitori misti senza alterare voci, prezzi o totali', async () => {
    const { controller, current, container, quote, state } = setup();
    const original = structuredClone(quote.items);
    const total = calculateQuote(quote.items, '50.00');
    expect(controller().addContainer()).toBe(true);
    const first = container();
    expect(controller().renameContainer(first.id, 'Sede Nord')).toBe(true);
    expect(controller().addContainer()).toBe(true);
    const last = current().layout!.at(-1)!;
    const [a, b, c] = original;
    const layout: QuoteLayoutEntry[] = [
      last,
      { kind: 'item', itemId: c!.id },
      { ...container(), itemIds: [b!.id, a!.id] },
    ];
    expect(controller().saveLayout(layout)).toBe(true);
    expect(orderedQuoteItems(current()).map((item) => item.id)).toEqual([
      c!.id,
      b!.id,
      a!.id,
    ]);
    expect(current().items).toEqual(original);
    expect(calculateQuote(current().items, '50.00')).toEqual(total);
    expect(buildExportLines(current())).toMatchObject({
      ok: true,
      value: [
        { itemIds: [c!.id], amount: '100.00' },
        { itemIds: [b!.id], amount: '100.00' },
        { itemIds: [a!.id], amount: '100.00' },
      ],
    });
    expect(
      controller().saveTemplate(
        'Ordinato',
        original.map((item) => item.id),
      ),
    ).toBe(true);
    expect(
      state.document!.catalog.templates.at(-1)!.items.map((item) => item.name),
    ).toEqual(['Firewall', 'Switch', 'Router']);
    expect(controller().deleteContainer(first.id)).toBe(true);
    expect(current().layout).toEqual([
      last,
      ...[c!, b!, a!].map((item) => ({ kind: 'item', itemId: item.id })),
    ]);
    expect(current().items).toEqual(original);
    await state.save();
  });

  it('inserisce tutte le voci di un template nel contenitore e pulisce le cancellazioni', async () => {
    const { controller, current, container, template, state } = setup();
    controller().addContainer();
    const id = container().id;
    expect(controller().addItem('', id)).toBe(true);
    expect(await controller().insertTemplate(template.id, {}, {}, id)).toBe(
      true,
    );
    const ids = container().itemIds;
    expect(ids).toHaveLength(3);
    expect(
      current()
        .items.filter((item) => ids.includes(item.id))
        .map((item) => item.name),
    ).toEqual(['', 'LAN', 'Wi-Fi']);
    expect(controller().addItem('Fuori')).toBe(true);
    expect(current().layout!.at(-1)).toEqual({
      kind: 'item',
      itemId: current().items.at(-1)!.id,
    });
    expect(
      state.mutate((doc) => removeQuoteItem(doc.quotes[0]!, ids[1]!)),
    ).toBe(true);
    expect(container().itemIds).toEqual([ids[0], ids[2]]);
    expect(controller().deleteContainer(id)).toBe(true);
    expect(current().items).toHaveLength(6);
    expect(cashDocumentSchema.safeParse(state.document).success).toBe(true);
    await state.save();
  });

  it.each([
    'duplicate',
    'missing',
    'unknown',
    'nested',
    'duplicate-container',
  ] as const)('rifiuta layout %s in modo atomico', async (fault) => {
    const { controller, state, current, container } = setup();
    controller().addContainer();
    const layout = structuredClone(current().layout!);
    const last = layout.at(-1)!;
    if (fault === 'duplicate' && last.kind === 'container')
      last.itemIds.push(current().items[0]!.id);
    if (fault === 'missing') layout.shift();
    if (fault === 'unknown') layout.push({ kind: 'item', itemId: meta().id });
    if (fault === 'nested')
      Object.assign(layout.at(-1)!, {
        children: [{ ...container(), id: meta().id }],
      });
    if (fault === 'duplicate-container') layout.push(container());
    const before = structuredClone(state.document);
    expect(controller().saveLayout(layout)).toBe(false);
    expect(state.document).toEqual(before);
    await state.save();
  });

  it('non salva il no-op e rifiuta contesti obsoleti, sola lettura e archivi cambiati', async () => {
    const { controller, state, current, container, save } = setup();
    const initial = controller();
    expect(initial.saveLayout(quoteLayout(current()))).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(initial.addContainer()).toBe(true);
    expect(initial.saveLayout(quoteLayout(initial.quote!))).toBe(false);
    const latest = controller();
    state.session!.readOnly = true;
    expect(latest.addContainer()).toBe(false);
    state.session!.readOnly = false;
    state.acceptNativeSession({ ...state.session!, path: 'other.sqlite' });
    expect(latest.renameContainer(container().id, 'Altro')).toBe(false);
    await state.save();
  });

  it('un template non valido non inserisce voci parziali né riferimenti', async () => {
    const { controller, current, container, template, state } = setup();
    controller().addContainer();
    state.document!.catalog.templates[0]!.items[1]!.variantGroups.push({
      ...meta(),
      name: 'Scelta',
      options: [{ ...meta(), name: 'A', subItems: [] }],
    });
    const before = structuredClone(current());
    expect(
      await controller().insertTemplate(template.id, {}, {}, container().id),
    ).toBe(false);
    expect(current()).toEqual(before);
    await state.save();
  });

  it('mantiene il layout locale e segnala un errore di scrittura senza dichiarare il salvataggio', async () => {
    const { controller, current, state, save } = setup();
    save.mockResolvedValue(
      err({ code: 'IO', message: 'Disco non disponibile' }),
    );
    expect(controller().addContainer()).toBe(true);
    await state.save();
    expect(current().layout!.at(-1)!.kind).toBe('container');
    expect(state.error?.code).toBe('IO');
    expect(state.status).not.toBe('Salvato');
  });
});
