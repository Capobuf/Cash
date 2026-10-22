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
