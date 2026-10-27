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
    const basic = {
      ...meta(),
      name: 'Base',
      subItems: [
        {
          kind: 'time' as const,
          description: 'Configurazione NAS',
          minutes: 60,
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
              defaultOptionId: basic.id,
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
  flushSync(() => root.render(<Harness />));
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

export async function runOperationalChecks() {
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const current = () => state.document!.quotes[0]!;
  const commit = async (selector: string, value: string) => {
    await fill(selector, value);
    document
      .querySelector<HTMLInputElement>(selector)!
      .dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await settle();
  };
  const quick = '[data-quote-quick-add="root:end"]';
  const add = async (name: string) => {
    await fill(
      `${quick} input[aria-label="Nome del lavoro da aggiungere"]`,
      name,
    );
    document.querySelector<HTMLFormElement>(quick)!.requestSubmit();
    await settle();
  };
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
  assert(
    current().items.length === 7 &&
      current().items.every(
        (item) => !item.subItems.length && item.chosenPrice === undefined,
      ),
    'La sequenza iniziale non deve creare sottovoci o prezzi fittizi',
  );
  assert(
    !document.querySelector('[role=dialog]'),
    'Inserimento nomi senza dialog',
  );
  const first = current().items[0]!.id;
  await commit(`#quote-name-${first}`, 'Acquisizione cliente');
  assert(
    current().items[0]!.name === 'Acquisizione cliente',
    'Rinomina in linea',
  );
  await commit(
    `[data-quote-item="${first}"] input[aria-label^="Durata di"]`,
    '30m',
  );
  assert(
    current().items[0]!.subItems[0]?.kind === 'time',
    'Quantificazione direttamente dalla riga',
  );
  await commit(
    `[data-quote-item="${first}"] input[aria-label^="Durata di"]`,
    '0',
  );
  assert(
    current().items[0]!.subItems[0]?.kind === 'time' &&
      current().items[0]!.subItems[0].minutes === 30,
    'Una durata invalida non modifica i dati',
  );
  assert(
    document.querySelector(
      `[data-quote-item="${first}"] input[aria-invalid=true]`,
    ),
    'Input invalido riconoscibile',
  );
  await commit(
    `[data-quote-item="${first}"] input[aria-label^="Durata di"]`,
    '45m',
  );
  await fill(`#chosen-${first}`, '150,00');
  assert(
    current().items[0]!.chosenPrice === undefined,
    'Anteprima indipendente dal salvataggio su blur',
  );
  assert(
    document.querySelector('aside')!.textContent!.includes('150,00'),
    'Totale globale immediato durante input valido',
  );
  await commit(`#chosen-${first}`, '180,00');
  assert(current().items[0]!.chosenPrice === '180.00', 'Prezzo scelto salvato');
  await click('Elimina Assistenza');
  assert(
    info().deleteRequests === 1 &&
      !document.querySelector('[role=alertdialog]'),
    'Una sola richiesta di conferma eliminazione',
  );

  await click('Inserisci dopo Acquisizione cliente');
  const insertion = document.querySelector(
    `[data-quote-quick-add="root:${first}"]`,
  )!;
  [...insertion.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Da template'))!
    .click();
  await settle();
  await fill('input[aria-label="Cerca template da inserire"]', 'NAS');
  assert(
    document
      .querySelector('[role=dialog]')!
      .textContent!.includes('Infrastruttura'),
    'Ricerca per sottovoce della variante',
  );
  assert(
    !document
      .querySelector('[role=dialog]')!
      .textContent!.includes('Rete completa'),
    'Il risultato precedente sparisce dal filtro',
  );
  assert(
    document.querySelector('[role=dialog]')!.textContent!.includes('Storage'),
    'Anteprima del risultato visibile senza selezione obsoleta',
  );
  await fill(
    'input[aria-label="Cerca template da inserire"]',
    'nessuna corrispondenza',
  );
  assert(
    document
      .querySelector('[role=dialog]')!
      .textContent!.includes('Nessun template trovato'),
    'Filtro vuoto coerente',
  );
  await fill('input[aria-label="Cerca template da inserire"]', 'NAS');
  await click('Inserisci 2 voci');
  assert(
    info().order.slice(0, 4).join('|') ===
      'Acquisizione cliente|Storage|Backup|Ricerca prodotti',
    'Tutte le voci template entrano nel punto corrente',
  );
  const storage = () =>
    current().items.find((item) => item.name === 'Storage')!;
  await click('Apri o chiudi Storage');
  assert(
    !document.querySelector('[role=dialog]') &&
      document.body.textContent!.includes('Configurazione'),
    'Varianti consultabili nella tabella',
  );
  const variantSelector = `#variant-${storage().id}-${storage().variantGroups[0]!.id}`;
  await choose(variantSelector, 'Avanzata');
  assert(
    storage().subItems[0]?.kind === 'time' &&
      storage().subItems[0].minutes === 120,
    'Variante applicata senza dialog non necessario',
  );
  await commit(
    `[data-quote-item="${storage().id}"] input[aria-label^="Durata Configurazione"]`,
    '150m',
  );
  assert(
    storage().subItems[0]?.manuallyModified,
    'Le modifiche in linea preservano la provenienza della variante',
  );
  await choose(variantSelector, 'Base');
  assert(
    document
      .querySelector('[role=alertdialog]')!
      .textContent!.includes('Sostituire le sottovoci modificate'),
    'Conferma distruttiva preservata',
  );
  await click('Annulla');
  assert(
    storage().subItems[0]?.kind === 'time' &&
      storage().subItems[0].minutes === 150,
    'Annullamento variante preserva modifiche manuali',
  );
  await choose(variantSelector, 'Base');
  await click('Conferma cambio');
  assert(
    storage().subItems[0]?.kind === 'time' &&
      storage().subItems[0].minutes === 60,
    'Sostituzione variante confermata',
  );

  document.querySelector<HTMLButtonElement>('#quote-site')!.click();
  await settle();
  assert(
    document.body.textContent!.includes('Sedi del Cliente selezionato') &&
      document.body.textContent!.includes('Altre sedi senza Cliente'),
    'Sede principale raggruppata',
  );
  assert(
    ![...document.querySelectorAll('[role=option]')].some((option) =>
      option.textContent?.includes('Via Altra'),
    ),
    'La sede principale non ammette clienti diversi',
  );
  await choose('#quote-site', 'Via Cliente 2');
  assert(
    current().mainSite?.address === 'Via Cliente 2',
    'Sede principale selezionata',
  );
  [...document.querySelectorAll<HTMLButtonElement>(`${quick} button`)]
    .find((button) => button.textContent?.trim() === 'Trasferta')!
    .click();
  await settle();
  for (const [name, destination] of [
    ['Ritiro dal fornitore', 'Via Altra 3'],
    ['Trasporto al cliente', 'Via Cliente 2'],
  ]) {
    await add(name!);
    assert(
      document.querySelector<HTMLInputElement>('#sub-description')!.value ===
        name,
      'Nome della trasferta già compilato',
    );
    document.querySelector<HTMLButtonElement>('#travel-destination')!.click();
    await settle();
    const labels = [...document.querySelectorAll('[role=option]')]
      .map((option) => option.textContent ?? '')
      .join('|');
    assert(
      labels.includes('Cliente corrente: Cliente demo') &&
        labels.includes('Cliente: Altro cliente') &&
        labels.includes('Senza Cliente'),
      'Sedi omonime distinguibili nelle trasferte',
    );
    await choose('#travel-destination', destination!);
    await fill('#travel-duration', '20m');
    document
      .querySelector<HTMLFormElement>('[role=dialog] form')!
      .requestSubmit();
    await settle();
    assert(
      !document.querySelector('[role=dialog]'),
      'Trasferta salvata con il dialog esistente',
    );
    assert(
      current().items.at(-1)!.subItems[0]?.kind === 'travel',
      'Ogni tratta è una sottovoce in una sola voce principale',
    );
  }
  assert(info().valid, 'Archivio valido dopo il flusso operativo');
  const beforeReadOnly = JSON.stringify(current());
  await setReadOnly(true);
  assert(
    [
      ...document.querySelectorAll<HTMLInputElement>('[data-quote-item] input'),
    ].every((input) => input.disabled),
    'Celle non modificabili in sola lettura',
  );
  assert(
    JSON.stringify(current()) === beforeReadOnly,
    'Riapertura conserva le righe',
  );
  await setReadOnly(false);
  assert(info().valid, 'Documento ancora valido alla riapertura');
  await state.save();
  return 'OPERATIONAL_UI_OK';
}
