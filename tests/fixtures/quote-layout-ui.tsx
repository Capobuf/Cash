import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CSPProvider } from '@base-ui/react/csp-provider';
import {
  createEmptyDocument,
  createFiscalPreset2026,
  meta,
  ok,
} from '../../src/domain/model';
import { snapshotProfile } from '../../src/domain/refresh';
import { addQuote } from '../../src/domain/quotes';
import {
  removeQuoteItem,
  orderedQuoteItems,
} from '../../src/domain/quote-layout';
import { calculateQuote } from '../../src/domain/calculations';
import { cashDocumentSchema } from '../../src/domain/schema';
import { AppState } from '../../src/renderer/state';
import { useAppState } from '../../src/renderer/hooks/use-app-state';
import { QuotesView } from '../../src/renderer/views/QuotesView';
import { ExportDialog } from '../../src/renderer/components/quotes/ExportDialog';
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip';

const state = new AppState();
const root = createRoot(document.getElementById('root')!);
let writes = 0;
let rootQuoteId = '';
let originalItems = '';
let originalTotal = '';
let deleteRequests = 0;
export const settle = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

function Harness() {
  useAppState(state);
  const [active, setActive] = useState(rootQuoteId);
  return (
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <QuotesView
          key={`${state.archiveContext}:${active}`}
          doc={state.document!}
          appState={state}
          hasToken={false}
          activeQuoteId={active}
          setActiveQuoteId={(id) => setActive(id ?? rootQuoteId)}
          requestDelete={(target) => {
            deleteRequests++;
            if (target.kind === 'item')
              state.mutate((doc) => removeQuoteItem(doc.quotes[0]!, target.id));
            if (target.kind === 'sub')
              state.mutate((doc) => {
                const [itemId, subId] = target.id.split(':');
                const item = doc.quotes[0]!.items.find(
                  (entry) => entry.id === itemId,
                )!;
                item.subItems = item.subItems.filter((sub) => sub.id !== subId);
              });
          }}
        />
      </TooltipProvider>
    </CSPProvider>
  );
}

export async function setup(empty = false) {
  writes = 0;
  deleteRequests = 0;
  Object.assign(window, {
    cash: {
      setDirty() {},
      archive: {
        save: async (
          path: string,
          doc: ReturnType<typeof createEmptyDocument>,
        ) => {
          writes++;
          return ok({
            path,
            document: doc,
            readOnly: false,
            token: { documentId: doc.documentId, revision: doc.revision },
          });
        },
      },
    },
  });
  const doc = createEmptyDocument();
  const quote = addQuote(doc);
  rootQuoteId = quote.id;
  const profile = createFiscalPreset2026();
  profile.confirmed = true;
  profile.revenueTarget = '50000.00';
  doc.profiles.push(profile);
  const snapshot = snapshotProfile(profile, []);
  if (!snapshot.ok) throw new Error(snapshot.error.message);
  quote.profileId = profile.id;
  quote.profileSnapshot = snapshot.value;
  quote.client = {
    source: 'fatture_in_cloud',
    companyId: '1',
    clientId: '2',
    displayName: 'Cliente demo',
  };
  quote.items = ['Router', 'Switch', 'Firewall'].map((name) => ({
    ...meta(),
    name,
    chosenPrice: '100.00',
    subItems: [{ ...meta(), kind: 'time', description: name, minutes: 60 }],
    variantGroups: [],
    variantSelections: [],
  }));
  doc.catalog.templates.push({
    ...meta(),
    name: 'Rete completa',
    items: ['LAN', 'Wi-Fi'].map((name) => ({
      ...meta(),
      name,
      subItems: [],
      variantGroups: [],
    })),
  });
  if (empty) {
    quote.items = [];
    doc.catalog.subItems.push({
      ...meta(),
      kind: 'expense',
      description: 'Cancelleria',
      amount: '12.00',
    });
    const basic = {
      ...meta(),
      name: 'Base',
      subItems: [
        {
          kind: 'time' as const,
          description: 'Configurazione NAS',
          minutes: 60,
        },
        {
          kind: 'expense' as const,
          description: 'Licenza NAS base',
          amount: '25.00',
        },
      ],
    };
    const advanced = {
      ...meta(),
      name: 'Avanzata',
      subItems: [
        {
          kind: 'time' as const,
          description: 'Configurazione NAS avanzata',
          minutes: 120,
        },
        {
          kind: 'expense' as const,
          description: 'Licenza NAS avanzata',
          amount: '80.00',
        },
      ],
    };
    doc.catalog.templates.push({
      ...meta(),
      name: 'Infrastruttura',
      items: [
        {
          ...meta(),
          name: 'Storage',
          subItems: [],
          variantGroups: [
            {
              ...meta(),
              name: 'Configurazione',
              options: [basic, advanced],
            },
          ],
        },
        {
          ...meta(),
          name: 'Backup',
          subItems: [
            {
              ...meta(),
              kind: 'expense',
              description: 'Disco',
              amount: '80.00',
            },
          ],
          variantGroups: [],
        },
      ],
    });
    doc.sites.push(
      { ...meta(), name: 'Ufficio', address: 'Via Libera 1' },
      {
        ...meta(),
        name: 'Ufficio',
        address: 'Via Cliente 2',
        client: quote.client,
      },
      {
        ...meta(),
        name: 'Ufficio',
        address: 'Via Altra 3',
        client: {
          ...quote.client,
          clientId: '3',
          displayName: 'Altro cliente',
        },
      },
    );
    const vehicle = {
      ...meta(),
      name: 'Auto',
      fuel: 'Benzina' as const,
      consumption: '20',
      consumptionUnit: 'km/l' as const,
      annualKm: '10000',
      annualInsurance: '500',
      annualTax: '200',
      annualMaintenance: '300',
    };
    doc.vehicles.push(vehicle);
    doc.settings.defaultVehicleId = vehicle.id;
    doc.settings.defaultDepartureSiteId = doc.sites[0]!.id;
  }
  originalItems = JSON.stringify(
    cashDocumentSchema.parse(doc).quotes[0]!.items,
  );
  originalTotal = JSON.stringify(
    calculateQuote(quote.items, quote.profileSnapshot.hourlyTarget),
  );
  state.acceptNativeSession({
    path: 'test.sqlite',
    document: doc,
    readOnly: false,
    token: { documentId: doc.documentId, revision: doc.revision },
  });
  flushSync(() => root.render(<Harness key={rootQuoteId} />));
  await settle();
  return quote.items.map((item) => item.id);
}

export function info() {
  const quote = state.document!.quotes[0]!;
  return {
    quote,
    writes,
    deleteRequests,
    error: state.error,
    order: orderedQuoteItems(quote).map((item) => item.name),
    valid: cashDocumentSchema.safeParse(state.document).success,
    unchangedItems: JSON.stringify(quote.items) === originalItems,
    unchangedTotal:
      JSON.stringify(
        calculateQuote(quote.items, quote.profileSnapshot?.hourlyTarget),
      ) === originalTotal,
    domOrder: [...document.querySelectorAll('[data-quote-item]')].map(
      (element) => element.getAttribute('data-quote-item'),
    ),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  };
}

export async function click(text: string) {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>('button, [role=menuitem]'),
  ];
  const matches = (element: HTMLElement) =>
    element.textContent?.trim() === text ||
    element.getAttribute('aria-label') === text;
  const button =
    candidates.find(
      (element) =>
        element.getAttribute('role') === 'menuitem' && matches(element),
    ) ?? candidates.find(matches);
  if (
    !button &&
    (text.startsWith('Inserisci dopo ') || text.startsWith('Elimina '))
  ) {
    const name = text.replace(/^(Inserisci dopo |Elimina )/, '');
    await click(`Azioni voce ${name}`);
    await click(text);
    return;
  }
  if (!button) throw new Error(`Pulsante mancante: ${text}`);
  button.click();
  await settle();
}

export async function fill(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  input.focus();
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

export async function renameLastContainer(name: string) {
  const containers = [...document.querySelectorAll('[data-quote-container]')];
  const id = containers.at(-1)!.getAttribute('data-quote-container');
  const selector = `[data-quote-container="${id}"] input[aria-label^="Titolo contenitore"]`;
  await fill(selector, name);
  document
    .querySelector(selector)!
    .dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  await settle();
}

export async function choose(selector: string, label: string) {
  const trigger = document.querySelector<HTMLElement>(selector)!;
  if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
  await settle();
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role=option]'),
  ].find((element) => element.textContent?.includes(label));
  if (!option) throw new Error(`Opzione mancante: ${label}`);
  option.click();
  await settle();
}

export async function setReadOnly(value: boolean) {
  flushSync(() =>
    state.acceptNativeSession({ ...state.session!, readOnly: value }),
  );
  await settle();
}

export async function switchArchive() {
  flushSync(() =>
    state.acceptNativeSession({ ...state.session!, path: 'other.sqlite' }),
  );
  await settle();
}

export async function showExport() {
  const doc = state.document!;
  const exportDoc = {
    ...doc,
    settings: {
      ...doc.settings,
      fic: {
        enabled: true,
        company: { id: '1', name: 'Demo' },
        product: { id: '1', name: 'Consulenza' },
      },
    },
  };
  flushSync(() =>
    root.render(
      <CSPProvider disableStyleElements>
        <ExportDialog
          quote={doc.quotes[0]!}
          doc={exportDoc}
          results={[]}
          onSearch={async () => {}}
          onClose={() => {}}
          onExport={async () => false}
        />
      </CSPProvider>,
    ),
  );
  await settle();
  return [...document.querySelectorAll('label[for^="export-select-"]')].map(
    (label) => label.textContent?.split(' ·')[0],
  );
}

export async function runTypeConversionChecks() {
  await setup();
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const item = () => state.document!.quotes[0]!.items[0]!;
  const originalSub = structuredClone(item().subItems[0]!);
  const visibleRows = () =>
    document.querySelectorAll(`[data-quote-item="${item().id}"] [role=row]`)
      .length;
  assert(visibleRows() === 1, 'Attività singola senza duplicazioni');
  await fill(`#quote-duration-${item().id}`, '90m');
  document
    .getElementById(`quote-duration-${item().id}`)!
    .dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  await settle();
  assert(
    visibleRows() === 1 &&
      item().subItems.length === 1 &&
      item().subItems[0]!.id === originalSub.id,
    'Compilazione durata non aggiunge righe',
  );
  await click('Cambia tipo riga Router');
  await click('Spesa');
  assert(
    document.querySelector('[role=alertdialog]'),
    'Conferma perdita durata',
  );
  await click('Annulla');
  assert(item().subItems[0]!.kind === 'time', 'Annullamento senza modifiche');
  await click('Cambia tipo riga Router');
  await click('Spesa');
  await click('Converti');
  assert(item().subItems[0]!.kind === 'expense', 'Conversione riga in spesa');
  assert(
    item().subItems[0]!.id === originalSub.id &&
      item().chosenPrice === '100.00',
    'Identità e prezzo conservati',
  );
  assert(!('minutes' in item().subItems[0]!), 'Durata rimossa');
  await click('Cambia tipo riga Router');
  await click('Trasferta');
  assert(
    item().subItems[0]!.kind === 'travel',
    'Conversione spesa vuota senza conferma',
  );
  assert(
    document.querySelector('[data-quote-sub-editor=travel]'),
    'Editor trasferta aperto',
  );
  await click('Annulla');
  assert(visibleRows() === 1, 'Trasferta singola senza duplicazioni');
  await click('Configura trasferta di Router');
  assert(
    document.querySelector('[data-quote-sub-editor=travel]'),
    'Editor trasferta riapribile dalla principale',
  );
  await click('Annulla');
  await click('Cambia tipo riga Router');
  await click('Attività');
  await click('Converti');
  assert(
    item().subItems[0]!.kind === 'time',
    'Conversione dal simbolo sottoriga',
  );
  assert(!('roundTrip' in item().subItems[0]!), 'Dati viaggio rimossi');
  await click('Mostra dati mancanti di Router');
  assert(
    document.activeElement?.id === `quote-sub-${originalSub.id}` &&
      visibleRows() === 1,
    'Dati mancanti puntano alla riga principale',
  );
  await click('Aggiungi sottoriga a Router');
  await click('Spesa');
  assert(
    visibleRows() === 3 && item().subItems.length === 2,
    'Seconda sottoriga rende visibili entrambi i dettagli',
  );
  await click('Cambia tipo sottoriga Router');
  await click('Spesa');
  assert(
    item().subItems[0]!.kind === 'expense',
    'Conversione sottoriga nella vista complessa',
  );
  await click('Azioni per Spesa senza descrizione');
  await click('Elimina sottoriga Spesa senza descrizione');
  assert(
    visibleRows() === 1 && item().subItems.length === 1,
    'Eliminando la seconda sottoriga scompare il dettaglio duplicato',
  );
  await setReadOnly(true);
  assert(
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        'button[aria-label^="Cambia tipo"]',
      ),
    ].every((button) => button.disabled),
    'Cambio tipo disabilitato in sola lettura',
  );
  await setReadOnly(false);
  state.mutate((doc) => {
    doc.quotes[0]!.items[0]!.subItems.push({
      ...meta(),
      kind: 'expense',
      description: 'Licenza',
      amount: '10.00',
    });
    doc.quotes[0]!.items.push({
      ...meta(),
      name: 'Nota',
      subItems: [],
      variantGroups: [],
      variantSelections: [],
    });
  });
  await settle();
  await click('Cambia tipo riga Router');
  assert(
    document.body.textContent?.includes(
      'Cambia il tipo delle singole sottorighe',
    ),
    'Spiegazione per aggregati',
  );
  assert(
    [...document.querySelectorAll('[role=menuitem]')]
      .slice(0, 3)
      .every((entry) => entry.getAttribute('aria-disabled') === 'true'),
    'Nessuna conversione distruttiva aggregati',
  );
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await settle();
  await click('Cambia tipo riga Nota');
  await click('Attività');
  assert(
    state.document!.quotes[0]!.items.at(-1)!.subItems[0]?.kind === 'time',
    'Tipo persistente per riga generica',
  );
  await click('Cambia tipo riga Router');
  await click('Riga generica');
  assert(
    document.querySelector('[role=alertdialog]'),
    'Conferma rimozione sottorighe',
  );
  await click('Annulla');
  assert(
    item().subItems.length === 2,
    'Annullamento riga generica conserva sottorighe',
  );
  await click('Cambia tipo riga Router');
  await click('Riga generica');
  await click('Converti');
  assert(
    item().subItems.length === 0 &&
      item().variantGroups.length === 0 &&
      item().chosenPrice === '100.00',
    'Riga generica conserva prezzo e rimuove struttura',
  );
  const beforeTemplate = JSON.stringify(state.document!.quotes[0]!);
  await click('Cambia tipo riga Router');
  await click('Da template');
  await choose('#quote-template-picker', 'Rete completa');
  assert(
    JSON.stringify(state.document!.quotes[0]!) === beforeTemplate,
    'Anteprima non modifica preventivo',
  );
  await click('Annulla');
  assert(
    JSON.stringify(state.document!.quotes[0]!) === beforeTemplate,
    'Annullamento template senza modifiche',
  );
  await click('Cambia tipo riga Router');
  await click('Da template');
  await choose('#quote-template-picker', 'Rete completa');
  await click('Sostituisci riga');
  assert(
    item().name === 'LAN' && item().chosenPrice === '100.00',
    'Prima voce template conserva prezzo',
  );
  assert(
    orderedQuoteItems(state.document!.quotes[0]!)
      .map((entry) => entry.name)
      .join(',') === 'LAN,Wi-Fi,Switch,Firewall,Nota',
    'Template sostituisce in posizione senza duplicare originale',
  );
  await state.save();
  assert(
    cashDocumentSchema.safeParse(state.document).success,
    'Archivio valido dopo conversioni',
  );
  return 'TYPE_CONVERSION_UI_OK';
}

export async function runOperationalChecks() {
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const current = () => state.document!.quotes[0]!;
  const commit = async (selector: string, value: string) => {
    await fill(selector, value);
    document
      .querySelector(selector)!
      .dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await settle();
  };
  const create = async (kind: string, containerId?: string) => {
    const count = current().items.length;
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-quote-add-menu] button',
      ),
    ];
    const button = containerId
      ? document.querySelector<HTMLButtonElement>(
          `[data-quote-container="${containerId}"] [data-quote-add-menu] button`,
        )
      : buttons
          .filter((entry) => !entry.closest('[data-quote-container]'))
          .at(-1);
    button!.click();
    await settle();
    await click(kind);
    assert(
      current().items.length === count + 1,
      'La scelta crea subito una vera voce nel documento',
    );
    const item = current().items.at(-1)!;
    assert(
      item.name === '' &&
        item.subItems.length === 0 &&
        item.chosenPrice === undefined &&
        !document.querySelector('[data-quote-quick-add]'),
      'Riga effettiva senza sottorighe automatiche o salvataggi preliminari',
    );
    assert(
      document.activeElement?.id === `quote-name-${item.id}`,
      'Focus sulla descrizione della riga effettiva',
    );
    return item.id;
  };
  const add = async (name: string, kind = 'Riga generica') => {
    const id = await create(kind);
    await commit(`#quote-name-${id}`, name);
    return id;
  };
  await setup(true);
  assert(
    current().layout === undefined && info().writes === 0,
    'Apertura senza scritture automatiche',
  );
  assert(
    document.querySelectorAll('[data-quote-layout] [role=table]').length === 1,
    'Tabella subito disponibile',
  );
  assert(
    !document.querySelector('[data-quote-item]') &&
      document.querySelector('[data-quote-add-menu] button'),
    'Tabella vuota con pulsante centrale',
  );
  const totals = document.querySelector('[data-quote-totals]')!;
  assert(
    !document.querySelector('aside') &&
      !!(
        document
          .querySelector('[data-quote-layout]')!
          .compareDocumentPosition(totals) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
    'Totali dopo le tabelle',
  );
  await commit(
    'input[aria-label="Titolo del contenitore iniziale"]',
    'Servizi',
  );
  const container = current().layout!.find(
    (entry) => entry.kind === 'container',
  )!;
  assert(
    container.kind === 'container',
    'Titolo iniziale conservato nel modello esistente',
  );
  await commit('input[aria-label="Titolo contenitore Servizi"]', 'Assistenza');
  const parentId = await create(
    'Attività',
    container.kind === 'container' ? container.id : '',
  );
  await commit(`#quote-name-${parentId}`, 'Gestione cliente');
  const parent = () => current().items.find((item) => item.id === parentId)!;
  const countBeforeHeader = current().items.length;
  document
    .querySelector<HTMLButtonElement>(
      `[data-quote-container="${container.kind === 'container' ? container.id : ''}"] button[data-slot="dropdown-menu-trigger"]`,
    )!
    .click();
  await settle();
  await click('Aggiungi riga');
  assert(
    current().items.length === countBeforeHeader + 1,
    'Aggiungi riga del contenitore crea subito la voce',
  );
  const emptyItemId = current().items.at(-1)!.id;
  assert(
    document.activeElement?.id === `quote-name-${emptyItemId}`,
    'Focus sulla nuova riga dal contenitore',
  );
  const bareExpenseId = await create(
    'Spesa',
    container.kind === 'container' ? container.id : '',
  );
  assert(
    current().items.find((item) => item.id === bareExpenseId)!.subItems
      .length === 0,
    'Anche la riga Spesa nasce senza sottorighe',
  );
  for (const [description, duration] of [
    ['WhatsApp', '30m'],
    ['Telefono', '1h'],
  ]) {
    const count = parent().subItems.length;
    await click('Aggiungi sottoriga a Gestione cliente');
    await click('Attività');
    const sub = parent().subItems.at(-1)!;
    assert(
      parent().subItems.length === count + 1 &&
        sub.description === '' &&
        sub.kind === 'time' &&
        sub.minutes === undefined,
      'Sottoriga salvata subito, senza durata fittizia',
    );
    const rows = document.querySelectorAll(
      `[data-quote-item="${parentId}"] [data-quote-sub]`,
    );
    assert(
      count === 0
        ? rows.length === 0
        : rows[rows.length - 1]!.getAttribute('data-quote-sub') === sub.id,
      'Prima attività sulla principale, ulteriori sottorighe nel dettaglio',
    );
    assert(
      !document.querySelector('[data-quote-sub-editor]') &&
        !document.querySelector('[role=dialog]'),
      'Nessun form o pulsante Salva per le sottorighe semplici',
    );
    if (count === 0) {
      await commit(`#quote-duration-${parentId}`, duration!);
    } else {
      await commit(
        `#quote-sub-description-${parent().subItems[0]!.id}`,
        'WhatsApp',
      );
      await commit(`#quote-sub-description-${sub.id}`, description!);
      await commit(`input[aria-label="Durata ${description}"]`, duration!);
    }
    assert(
      parent().subItems.at(-1)!.id === sub.id,
      'Identità stabile durante la compilazione inline',
    );
  }
  const main = document.querySelector<HTMLElement>(
    `[data-quote-item="${parentId}"] [role=row]`,
  )!;
  const mainCells = main.querySelectorAll<HTMLElement>(':scope > [role=cell]');
  assert(
    mainCells[2]!.textContent === '1h 30m',
    'Aggregazione dei tempi sulla riga principale',
  );
  assert(main.dataset.quoteParent === 'true', 'Riga padre riconoscibile');
  for (const row of document.querySelectorAll<HTMLElement>(
    `[data-quote-item="${parentId}"] [data-quote-sub]`,
  )) {
    const cells = row.querySelectorAll<HTMLElement>(':scope > [role=cell]');
    assert(
      cells.length === 7 && !cells[5]!.querySelector('input'),
      'Sette colonne senza prezzo scelto sulle sottorighe',
    );
    cells.forEach((cell, index) =>
      assert(
        Math.abs(
          cell.getBoundingClientRect().x -
            mainCells[index]!.getBoundingClientRect().x,
        ) < 1,
        'Colonne allineate',
      ),
    );
    assert(
      getComputedStyle(main).backgroundColor !==
        getComputedStyle(row).backgroundColor,
      'Sfondo del padre distinto dalle sottorighe',
    );
  }
  await commit(`#chosen-${parentId}`, '0');
  assert(
    parent().chosenPrice === '0.00',
    'Prezzo scelto indipendente dai costi',
  );
  await commit('input[aria-label="Durata WhatsApp"]', '');
  assert(
    parent().subItems[0]?.kind === 'time' &&
      parent().subItems[0].minutes === undefined,
    'Durata svuotabile senza eliminare la sottoriga',
  );
  await commit('input[aria-label="Durata WhatsApp"]', '45m');
  await click('Aggiungi sottoriga a Gestione cliente');
  await click('Spesa');
  const expense = parent().subItems.at(-1)!;
  assert(
    expense.kind === 'expense' && expense.amount === undefined,
    'Spesa vuota effettiva senza importo zero artificiale',
  );
  await commit(
    `[data-quote-sub="${expense.id}"] input[aria-label^="Importo"]`,
    '8,00',
  );
  await commit(`#quote-sub-description-${expense.id}`, 'Telefonia');
  assert(
    document
      .querySelector('button[aria-label="Apri o chiudi Gestione cliente"]')
      ?.getAttribute('aria-expanded') === 'true',
    'Sottospesa visibile dopo la compilazione',
  );
  await click('Aggiungi sottoriga a Gestione cliente');
  await click('Dal catalogo');
  const catalogEditor = document.querySelector('[data-quote-catalog-editor]')!;
  assert(
    !!(
      document
        .getElementById(`quote-sub-${expense.id}`)!
        .compareDocumentPosition(catalogEditor) &
      Node.DOCUMENT_POSITION_FOLLOWING
    ),
    'Editor di inserimento in fondo alle sottovoci',
  );
  await choose(`#catalog-entry-${parentId}`, 'Cancelleria');
  document
    .querySelector<HTMLFormElement>('[data-quote-catalog-editor]')!
    .requestSubmit();
  await settle();
  assert(
    parent().subItems.at(-1)?.kind === 'expense' &&
      parent().subItems.at(-1)?.description === 'Cancelleria',
    'Copia dal catalogo in fondo',
  );
  const preserved = JSON.stringify(current());
  await state.save();
  await setReadOnly(true);
  await setReadOnly(false);
  assert(
    JSON.stringify(current()) === preserved &&
      current().items.some((item) => item.id === emptyItemId),
    'Anche la riga vuota rimane alla riapertura',
  );

  await setup(true);
  for (const name of [
    'Acquisizione',
    'Ricerca prodotti',
    'Ritiro materiale',
    'Configurazione',
    'Consegna',
    'Installazione',
    'Assistenza',
  ])
    await add(name);
  const first = current().items[0]!.id;
  await commit(`#quote-name-${first}`, 'Acquisizione cliente');
  await commit(
    `[data-quote-item="${first}"] input[aria-label^="Durata di"]`,
    '30m',
  );
  const firstSubId = current().items[0]!.subItems[0]!.id;
  await commit(
    `[data-quote-item="${first}"] input[aria-label^="Durata di"]`,
    '0',
  );
  assert(
    current().items[0]!.subItems[0]?.kind === 'time' &&
      current().items[0]!.subItems[0].minutes === 30,
    'Durata non positiva rifiutata',
  );
  await commit(
    `[data-quote-item="${first}"] input[aria-label^="Durata di"]`,
    '45m',
  );
  assert(
    current().items[0]!.subItems[0]!.id === firstSubId,
    'La quantificazione non duplica la sottoriga',
  );
  await fill(`#chosen-${first}`, '150,00');
  assert(
    current().items[0]!.chosenPrice === undefined &&
      document
        .querySelector('[data-quote-totals]')!
        .textContent!.includes('150,00'),
    'Anteprima prezzo prima del blur',
  );
  await commit(`#chosen-${first}`, '180,00');
  await click('Azioni voce Assistenza');
  const actionMenu = document.querySelector<HTMLElement>(
    '[data-slot="dropdown-menu-content"]',
  )!;
  assert(
    actionMenu.textContent?.trim() === '' &&
      actionMenu.getBoundingClientRect().width < 64,
    'Azioni compatte con sole icone',
  );
  assert(
    [...actionMenu.querySelectorAll('[role=menuitem]')].every(
      (entry) =>
        entry.hasAttribute('aria-label') && entry.hasAttribute('title'),
    ),
    'Icone accessibili',
  );
  await click('Elimina Assistenza');
  assert(info().deleteRequests === 1, 'Una sola richiesta di eliminazione');
  await click('Inserisci dopo Acquisizione cliente');
  const inserted = current().items.at(-1)!;
  assert(
    inserted.name === '' && info().domOrder[1] === inserted.id,
    'Riga immediata anche nell’inserimento dopo una voce',
  );
  await commit(`#quote-name-${inserted.id}`, 'Voce intermedia');
  await click('Azioni voce Acquisizione cliente');
  await click('Inserisci template dopo Acquisizione cliente');
  const panel = document.querySelector('[data-quote-template-editor]')!;
  assert(
    !panel.querySelector('[role=table]') &&
      !panel.querySelector('input[aria-label="Cerca template da inserire"]'),
    'Template senza scelta automatica e senza ricerca duplicata',
  );
  document.querySelector<HTMLButtonElement>('#quote-template-picker')!.click();
  await settle();
  await fill('input[aria-label="Cerca opzioni"]', 'NAS');
  const options = () =>
    [...document.querySelectorAll('[role=option]')]
      .map((entry) => entry.textContent)
      .join('|');
  assert(
    options().includes('Infrastruttura') &&
      !options().includes('Rete completa') &&
      !panel.querySelector('[role=table]'),
    'Una sola ricerca nelle sottovoci, senza cambiare anteprima',
  );
  await fill('input[aria-label="Cerca opzioni"]', 'nessuna corrispondenza');
  assert(!document.querySelector('[role=option]'), 'Ricerca vuota coerente');
  await fill('input[aria-label="Cerca opzioni"]', 'NAS');
  await choose('#quote-template-picker', 'Infrastruttura');
  const previewQuote = JSON.stringify(current());
  const group = state.document!.catalog.templates.find(
    (entry) => entry.name === 'Infrastruttura',
  )!.items[0]!.variantGroups[0]!;
  const confirm = [...panel.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Inserisci 2 voci',
  )!;
  assert(confirm.disabled, 'Varianti obbligatorie prima dell’inserimento');
  await choose(`#template-choice-${group.id}`, 'Base');
  assert(
    panel.textContent!.includes('Configurazione NAS') &&
      JSON.stringify(current()) === previewQuote,
    'Anteprima non persistita',
  );
  await click('Inserisci 2 voci');
  assert(
    info().order.slice(0, 4).join('|') ===
      'Acquisizione cliente|Storage|Backup|Voce intermedia',
    'Template nel punto corrente',
  );
  const storage = () =>
    current().items.find((item) => item.name === 'Storage')!;
  await click('Apri o chiudi Storage');
  const variantSelector = `#variant-${storage().id}-${storage().variantGroups[0]!.id}`;
  const firstVariantRow = document.querySelector<HTMLElement>(
    `[data-quote-item="${storage().id}"] [data-quote-variant-selector]`,
  )!;
  assert(
    firstVariantRow ===
      document.querySelector(
        `[data-quote-item="${storage().id}"] [data-quote-sub]`,
      ),
    'Selettore nella prima sottoriga generata',
  );
  const center = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return rect.y + rect.height / 2;
  };
  assert(
    Math.abs(
      center(document.querySelector<HTMLElement>(variantSelector)!) -
        center(
          firstVariantRow.querySelector<HTMLElement>(
            'input[aria-label^="Descrizione"]',
          )!,
        ),
    ) < 1,
    'Variante e descrizione sulla stessa linea',
  );
  document.querySelector<HTMLButtonElement>(variantSelector)!.click();
  await settle();
  assert(
    !document.querySelector('input[aria-label="Cerca opzioni"]'),
    'Nessuna ricerca nel menu delle varianti',
  );
  await choose(variantSelector, 'Base');
  await click('Aggiungi sottoriga a Storage');
  await click('Attività');
  const manualId = storage().subItems.at(-1)!.id;
  const storageRows = document.querySelectorAll(
    `[data-quote-item="${storage().id}"] [data-quote-sub]`,
  );
  assert(
    storageRows[storageRows.length - 1]!.getAttribute('data-quote-sub') ===
      manualId && storage().subItems.at(-1)!.variantOwner === undefined,
    'Nuove sottovoci dopo quelle prodotte dalle varianti',
  );
  await commit(`#quote-sub-description-${manualId}`, 'Verifica finale');
  await commit('input[aria-label="Durata Verifica finale"]', '15m');
  await choose(variantSelector, 'Avanzata');
  const variantTime = () =>
    storage().subItems.find((sub) => sub.kind === 'time' && sub.variantOwner)!;
  assert(
    variantTime().kind === 'time' &&
      (variantTime() as { minutes?: number }).minutes === 120,
    'Variante aggiornata',
  );
  await commit(
    `[data-quote-sub="${variantTime().id}"] input[aria-label^="Durata"]`,
    '150m',
  );
  assert(
    variantTime().manuallyModified,
    'Provenienza conservata dopo modifica inline',
  );
  await choose(variantSelector, 'Base');
  assert(
    document.querySelector('[role=alertdialog]'),
    'Conferma prima di sostituire modifiche manuali',
  );
  await click('Annulla');
  assert(
    (variantTime() as { minutes?: number }).minutes === 150,
    'Annullamento preserva le modifiche',
  );
  await choose(variantSelector, 'Base');
  await click('Conferma cambio');
  assert(
    (variantTime() as { minutes?: number }).minutes === 60 &&
      storage().subItems.some((sub) => sub.id === manualId),
    'Sostituzione non tocca le sottovoci manuali',
  );
  assert(
    [
      ...document.querySelectorAll(
        `[data-quote-item="${storage().id}"] [data-quote-sub]`,
      ),
    ]
      .map((row) => row.getAttribute('data-quote-sub'))
      .join('|') ===
      storage()
        .subItems.map((sub) => sub.id)
        .join('|'),
    'Ordine visivo identico a quello conservato',
  );

  await choose('#quote-site', 'Via Cliente 2');
  for (const [name, destination] of [
    ['Ritiro dal fornitore', 'Via Altra 3'],
    ['Trasporto al cliente', 'Via Cliente 2'],
  ]) {
    const id = await add(name!, 'Trasferta');
    const item = () => current().items.find((entry) => entry.id === id)!;
    assert(
      item().subItems.length === 0,
      'La riga Trasferta nasce senza sottorighe',
    );
    await click(`Aggiungi sottoriga a ${name}`);
    await click('Trasferta');
    const travelId = item().subItems[0]!.id;
    assert(
      item().subItems[0]?.kind === 'travel',
      'Sottoriga Trasferta aggiunta solo con azione esplicita',
    );
    await click(`Configura trasferta di ${name}`);
    assert(
      !document.querySelector('[role=dialog]'),
      'Configurazione trasferta inline',
    );
    await fill('#sub-description', name!);
    await choose('#travel-destination', destination!);
    await fill('#travel-duration', '20m');
    document
      .querySelector<HTMLFormElement>('[data-quote-sub-editor]')!
      .requestSubmit();
    await settle();
    assert(
      item().subItems[0]!.id === travelId &&
        item().subItems[0]?.kind === 'travel',
      'Configurazione aggiorna la riga senza duplicazioni',
    );
  }
  const templateCount = state.document!.catalog.templates.length;
  await click('Altre azioni preventivo');
  await click('Salva come template');
  await fill('#template-new-name', 'Servizi riutilizzabili');
  await click('Crea template');
  assert(
    state.document!.catalog.templates.length === templateCount + 1,
    'Template completo creato dal controller',
  );
  assert(info().valid, 'Archivio valido dopo il flusso operativo');
  const preservedAfter = JSON.stringify(current());
  await setReadOnly(true);
  assert(
    [
      ...document.querySelectorAll<HTMLInputElement>('[data-quote-item] input'),
    ].every((input) => input.disabled),
    'Sola lettura rispettata',
  );
  await setReadOnly(false);
  assert(
    JSON.stringify(current()) === preservedAfter,
    'Nessuna perdita o duplicazione alla riapertura',
  );
  await state.save();
  return 'OPERATIONAL_UI_OK';
}
