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
            if (target.kind === 'item')
              state.mutate((doc) => removeQuoteItem(doc.quotes[0]!, target.id));
          }}
        />
      </TooltipProvider>
    </CSPProvider>
  );
}

export async function setup() {
  writes = 0;
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
  const button = [
    ...document.querySelectorAll<HTMLElement>('button, [role=menuitem]'),
  ].find(
    (element) =>
      element.textContent?.trim() === text ||
      element.getAttribute('aria-label') === text,
  );
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
