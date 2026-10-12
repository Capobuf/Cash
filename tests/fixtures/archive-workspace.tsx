import { act } from 'react';
import { CSPProvider } from '@base-ui/react/csp-provider';
import { createRoot } from 'react-dom/client';
import { App } from '../../src/renderer/App';
import { toast } from '../../src/renderer/components/ui/toast';
import { state } from '../../src/renderer/state';
import type { CashUpdateStatus } from '../../src/shared/ipc';
import {
  createEmptyDocument,
  createBlankProfile,
  createFiscalPreset2026,
  meta,
  ok,
  err,
  type CashDocument,
} from '../../src/domain/model';
import type { FicQuotaObservation, FicClientPage } from '../../src/shared/fic';
import type { Result } from '../../src/domain/model';
import { snapshotProfile } from '../../src/domain/refresh';
import { eur } from '../../src/renderer/lib/format';

export async function runWorkspaceChecks() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const archive = createEmptyDocument();
  archive.settings.fic = {
    enabled: true,
    company: { id: '1', name: 'Studio' },
    product: { id: '2', name: 'Servizio' },
  };
  archive.profiles.push(
    createBlankProfile(2025),
    createBlankProfile(new Date().getFullYear()),
  );
  archive.catalog.templates.push({
    ...meta(),
    name: 'Template A',
    items: [{ ...meta(), name: 'Lavoro A', subItems: [], variantGroups: [] }],
  });
  archive.nextQuoteNumber = 2;
  archive.quotes.push({
    number: 1,
    ...meta(),
    date: '2026-10-02',
    snapshotRevision: 0,
    exportAttempts: [],
    items: [
      {
        ...meta(),
        name: 'Preventivo A',
        subItems: [],
        variantGroups: [],
        variantSelections: [],
      },
    ],
  });
  const counts = {
    saves: 0,
    openLast: 0,
    credentials: 0,
    setupInfo: 0,
    external: 0,
    reloaded: 0,
    close: 0,
  };
  const clientQueries: string[] = [];
  const clientPages: number[] = [];
  let paginateClients = false;
  let failNextPage = false;
  let delayedClients: ((result: Result<FicClientPage>) => void) | undefined;
  const quotaListeners = new Set<(observation: FicQuotaObservation) => void>();
  const updateListeners = new Set<(status: CashUpdateStatus) => void>();
  let resolveInitialUpdate: ((status: CashUpdateStatus) => void) | undefined;
  let initialUpdateRequested = false;
  let latestUpdate: CashUpdateStatus = {
    phase: 'idle',
    currentVersion: '0.1.0',
  };
  let closeRequested!: () => void;
  let closeChoice: string | undefined;
  const setupInfo = {
    clientId: 'device-client',
    requiredScopes: ['entity.clients:r'],
  };
  const session = (document: CashDocument) => ({
    path: 'Cash.json',
    document,
    readOnly: false,
    token: {
      documentId: document.documentId,
      revision: document.revision,
    },
  });
  Object.assign(window, {
    cash: {
      archive: {
        save: async (
          _path: string,
          document: CashDocument,
          token: { revision: number },
        ) => {
          counts.saves++;
          return ok(session({ ...document, revision: token.revision + 1 }));
        },
        openLast: async () => {
          counts.openLast++;
          return ok(session(archive));
        },
      },
      ors: { hasApiKey: async () => ok(false) },
      credentials: {
        hasFicToken: async () => {
          counts.credentials++;
          return ok(true);
        },
      },
      fic: {
        getQuota: async () => ok(null),
        onQuota: (listener: (observation: FicQuotaObservation) => void) => {
          quotaListeners.add(listener);
          return () => {
            quotaListeners.delete(listener);
          };
        },
        setupInfo: async () => {
          counts.setupInfo++;
          return ok(setupInfo);
        },
        searchClients: async ({
          query,
          page = 1,
        }: {
          query: string;
          page?: number;
        }) => {
          clientQueries.push(query);
          clientPages.push(page);
          if (query === 'Lenta')
            return new Promise<Result<FicClientPage>>((resolve) => {
              delayedClients = resolve;
            });
          if (paginateClients && page === 2 && failNextPage)
            return err({
              code: 'SOURCE_UNAVAILABLE',
              source: 'FattureInCloud',
              message: 'Pagina non disponibile',
            });
          const clients = [
            {
              source: 'fatture_in_cloud' as const,
              companyId: '1',
              clientId: '3',
              displayName: state.document!.catalog.templates[0]!.name.replace(
                'Template',
                'Cliente',
              ),
            },
            {
              source: 'fatture_in_cloud' as const,
              companyId: '1',
              clientId: '4',
              displayName: 'Altro cliente',
            },
          ];
          return ok({
            clients: (paginateClients && page === 1
              ? clients.slice(0, 1)
              : clients
            ).filter((client) =>
              client.displayName.toLowerCase().includes(query.toLowerCase()),
            ),
            page,
            ...(paginateClients && page === 1 ? { nextPage: 2 } : {}),
          });
        },
        getClientDetails: async () => ok({ fields: [] }),
      },
      updates: {
        getStatus: () => {
          if (!initialUpdateRequested) {
            initialUpdateRequested = true;
            return new Promise<CashUpdateStatus>((resolve) => {
              resolveInitialUpdate = resolve;
            });
          }
          return Promise.resolve(latestUpdate);
        },
        onStatus: (listener: (status: CashUpdateStatus) => void) => {
          updateListeners.add(listener);
          return () => updateListeners.delete(listener);
        },
      },
      setDirty: () => {},
      onExternalChange: () => {
        counts.external++;
        return () => {};
      },
      onArchiveReloaded: () => {
        counts.reloaded++;
        return () => {};
      },
      onCloseRequested: (handler: () => void) => {
        counts.close++;
        closeRequested = handler;
        return () => {};
      },
      resolveClose: (choice: string) => {
        closeChoice = choice;
      },
    },
  });
  const root = createRoot(document.getElementById('root')!);
  const check = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message + '\n' + document.body.innerText);
  };
  const find = (selector: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    check(element, 'Missing element: ' + selector);
    return element!;
  };
  const click = async (text: string) => {
    const button = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === text,
    );
    check(button, 'Missing button: ' + text);
    await act(async () => {
      button!.click();
    });
  };
  const clickSelector = async (selector: string) => {
    await act(async () => {
      find(selector).click();
    });
  };
  const fill = async (selector: string, value: string) => {
    const input = find(selector) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const selectYear = async (year: number) => {
    await act(async () => {
      (find('#app-year') as HTMLSelectElement).value = String(year);
      find('#app-year').dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  const clickMenu = async (text: string) => {
    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent?.trim() === text);
    check(item, 'Missing menu item: ' + text);
    await act(async () => {
      item!.click();
    });
  };
  const replace = async (label: string, newIdentity = true) => {
    const next = structuredClone(state.document!);
    if (newIdentity) next.documentId = meta().id;
    next.catalog.templates[0]!.name = 'Template ' + label;
    next.quotes[0]!.items[0]!.name = 'Preventivo ' + label;
    await act(async () => {
      state.acceptNativeSession(session(next));
    });
  };
  const results: string[] = [];
  try {
    await act(async () => {
      root.render(
        <CSPProvider disableStyleElements>
          <App />
        </CSPProvider>,
      );
    });
    await click('Catalogo');
    await selectYear(2025);
    await fill('[aria-label="Cerca template"]', 'Template A');
    await clickSelector('[aria-label="Apri e modifica Template A"]');
    check(
      document.querySelector('input[placeholder="es. Configurazione server"]'),
      'Catalog template editor did not open',
    );
    await fill(
      'input[placeholder="es. Configurazione server"]',
      'Draft from archive A',
    );
    await replace('B');
    check(
      !document.querySelector('input[placeholder="es. Configurazione server"]'),
      'Catalog editor survived archive change',
    );
    check(
      (find('[aria-label="Cerca template"]') as HTMLInputElement).value === '',
      'Catalog filter survived archive change',
    );
    check(
      document.body.innerText.includes('Template B'),
      'New archive catalog is missing',
    );
    check(
      !document.body.innerText.includes('Draft from archive A'),
      'Old catalog draft remains',
    );
    check(
      (find('#app-year') as HTMLSelectElement).value ===
        String(new Date().getFullYear()),
      'Archive year selection survived replacement',
    );
    results.push('catalog');

    await selectYear(2025);
    await fill('[aria-label="Cerca template"]', 'Template B');
    await replace('B', false);
    check(
      (find('[aria-label="Cerca template"]') as HTMLInputElement).value ===
        'Template B',
      'Ordinary update remounted workspace',
    );
    check(
      (find('#app-year') as HTMLSelectElement).value === '2025',
      'Ordinary update reset year selection',
    );
    results.push('same-document');

    await clickSelector('[aria-label="Azioni per Template B"]');
    await clickMenu('Elimina');
    check(
      document.querySelector('[role="alertdialog"]'),
      'Delete confirmation did not open',
    );
    await replace('B');
    check(
      !document.querySelector('[role="alertdialog"]'),
      'Old deletion target survived archive change',
    );
    check(
      state.document!.catalog.templates.length === 1,
      'Replacement template was deleted',
    );
    results.push('delete-target');

    await click('Clienti');
    await fill('[aria-label="Cerca clienti Fatture in Cloud"]', 'Cliente B');
    await click('Cerca');
    await clickSelector('[aria-label="Apri dettagli di Cliente B"]');
    check(
      document.querySelector('[data-slot="dialog-content"]'),
      'Client details did not open',
    );
    await replace('C');
    check(
      !document.querySelector('[data-slot="dialog-content"]'),
      'Client details survived archive change',
    );
    check(
      (
        find(
          '[aria-label="Cerca clienti Fatture in Cloud"]',
        ) as HTMLInputElement
      ).value === '',
      'Client query survived archive change',
    );
    check(
      !document.body.innerText.includes('Cliente B'),
      'Old live client result remains',
    );
    check(
      document.body.innerText.includes('Cliente C'),
      'New archive client was not loaded',
    );
    check(
      clientQueries.at(-1) === '',
      'Clients did not reload using the default search',
    );
    results.push('clients');

    paginateClients = true;
    await fill('[aria-label="Cerca clienti Fatture in Cloud"]', '');
    const beforeFirstPage = clientPages.length;
    await click('Cerca');
    check(
      clientPages.length === beforeFirstPage + 1 && clientPages.at(-1) === 1,
      'First page prefetched later pages',
    );
    check(
      !document.querySelector('[aria-label="Apri dettagli di Altro cliente"]'),
      'Second page appeared before request',
    );
    failNextPage = true;
    await click('Carica altri');
    check(
      document.querySelector('[aria-label="Apri dettagli di Cliente C"]'),
      'Page failure discarded previous clients',
    );
    await act(async () => {
      toast.close();
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    failNextPage = false;
    await click('Carica altri');
    check(
      document.querySelectorAll('[aria-label="Apri dettagli di Cliente C"]')
        .length === 1,
      'Duplicate client IDs were appended',
    );
    check(
      document.querySelector('[aria-label="Apri dettagli di Altro cliente"]'),
      'Second page was not appended',
    );
    await fill('[aria-label="Cerca clienti Fatture in Cloud"]', 'Cliente C');
    await click('Cerca');
    check(
      clientPages.at(-1) === 1 &&
        !document.querySelector(
          '[aria-label="Apri dettagli di Altro cliente"]',
        ),
      'New search did not reset pagination',
    );
    await fill('[aria-label="Cerca clienti Fatture in Cloud"]', 'Lenta');
    await click('Cerca');
    await replace('C');
    await act(async () => {
      delayedClients!(
        ok({
          clients: [
            {
              source: 'fatture_in_cloud',
              companyId: '1',
              clientId: '99',
              displayName: 'Risposta obsoleta',
            },
          ],
          page: 1,
        }),
      );
    });
    check(
      !document.body.innerText.includes('Risposta obsoleta'),
      'Stale archive response was applied',
    );
    paginateClients = false;
    results.push('fic-pagination');

    await click('Preventivi');
    const row = [...document.querySelectorAll('tr')].find((row) =>
      row.textContent?.includes('Preventivo #1'),
    );
    check(row, 'Quote list row missing');
    await act(async () => {
      row!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    const savedBeforeCustomerSearch = counts.saves;
    await click('Inserisci template');
    const templateQuery = '[aria-label="Cerca template da inserire"]';
    check(
      find('[data-slot="dialog-content"]').innerText.includes('Template C'),
      'Template picker did not show the initial list',
    );
    await fill(templateQuery, 'Nessun risultato');
    check(
      find('[data-slot="dialog-content"]').innerText.includes(
        'Nessun template trovato.',
      ) &&
        !find('[data-slot="dialog-content"]').innerText.includes('Template C'),
      'Template search did not filter the list and preview',
    );
    const insertButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Inserisci 0 voci',
    );
    check(
      insertButton?.disabled,
      'Filtered-out template can still be inserted',
    );
    await fill(templateQuery, '  TEMPLATE C  ');
    check(
      find('[data-slot="dialog-content"]').innerText.includes('Template C'),
      'Template search did not ignore case and surrounding spaces',
    );
    await fill(templateQuery, '');
    check(
      find('[data-slot="dialog-content"]').innerText.includes('Template C'),
      'Clearing the template search did not restore the list',
    );
    check(
      counts.saves === savedBeforeCustomerSearch,
      'Template search persisted the quote',
    );
    await click('Annulla');
    await click('Inserisci template');
    check(
      (find(templateQuery) as HTMLInputElement).value === '',
      'Template search survived closing the picker',
    );
    await click('Annulla');
    await click('Scegli cliente');
    check(
      clientQueries.at(-1) === '',
      'Customer picker did not load all clients',
    );
    check(
      find('[data-slot="dialog-content"]').innerText.includes('Cliente C') &&
        find('[data-slot="dialog-content"]').innerText.includes(
          'Altro cliente',
        ),
      'Customer picker is empty on opening',
    );
    paginateClients = true;
    await click('Cerca');
    check(
      !find('[data-slot="dialog-content"]').innerText.includes('Altro cliente'),
      'Customer picker prefetched next page',
    );
    await click('Carica altri');
    check(
      find('[data-slot="dialog-content"]').innerText.includes('Altro cliente'),
      'Customer picker did not append next page',
    );
    paginateClients = false;
    const customerQuery = '[aria-label="Cerca cliente in Fatture in Cloud"]';
    await fill(customerQuery, 'Cliente C');
    await click('Cerca');
    check(
      clientQueries.at(-1) === 'Cliente C' &&
        find('[data-slot="dialog-content"]').innerText.includes('Cliente C') &&
        !find('[data-slot="dialog-content"]').innerText.includes(
          'Altro cliente',
        ),
      'Customer search did not filter the list',
    );
    await fill(customerQuery, 'Nessun risultato');
    await click('Cerca');
    check(
      find('[data-slot="dialog-content"]').innerText.includes(
        'Nessun cliente trovato.',
      ),
      'Empty customer search has no feedback',
    );
    await fill(customerQuery, '');
    await click('Cerca');
    check(
      find('[data-slot="dialog-content"]').innerText.includes('Altro cliente'),
      'Clearing the search did not restore the list',
    );
    check(
      counts.saves === savedBeforeCustomerSearch,
      'Loading or searching customers persisted the quote',
    );
    await clickSelector('[role="dialog"] [data-slot="scroll-area"] button');
    check(
      !document.querySelector('[data-slot="dialog-content"]') &&
        state.document!.quotes[0]!.client?.displayName === 'Cliente C',
      'Selecting a listed customer did not update the quote',
    );
    await act(async () => {
      const customerButton = [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.startsWith('Cliente C'),
      );
      check(customerButton, 'Selected customer button missing');
      customerButton!.click();
    });
    check(
      (find(customerQuery) as HTMLInputElement).value === '' &&
        clientQueries.at(-1) === '' &&
        find('[data-slot="dialog-content"]').innerText.includes(
          'Altro cliente',
        ),
      'Reopening the customer picker did not reset the list and search',
    );
    await click('Chiudi');
    await act(async () => {
      state.mutate((document) => {
        document.quotes[0]!.client = {
          source: 'fatture_in_cloud',
          companyId: '1',
          clientId: '2',
          displayName: 'MCH Italia',
        };
      });
    });
    check(
      document.querySelector('h2')?.textContent ===
        'MCH Italia - Preventivo #1',
      'Client change did not update quote title',
    );
    await act(async () => {
      state.mutate((document) => {
        delete document.quotes[0]!.client;
      });
    });
    check(
      document.querySelector('h2')?.textContent === 'Preventivo #1',
      'Removing client changed the quote number or kept its name',
    );
    const chosenSelector = `#chosen-${state.document!.quotes[0]!.items[0]!.id}`;
    const chosen = find(chosenSelector) as HTMLInputElement;
    const savedBeforeTyping = counts.saves;
    await act(async () => {
      chosen.focus();
    });
    await fill(chosenSelector, '400');
    check(
      find('aside').innerText.includes(eur('400.00')),
      'Chosen total did not update before blur without profile',
    );
    check(
      counts.saves === savedBeforeTyping,
      'Typing persisted an intermediate value',
    );
    check(
      state.document!.quotes[0]!.items[0]!.chosenPrice === undefined,
      'Typing changed persisted state',
    );
    check(
      !document.body.innerText.includes('Da completare'),
      'Commercial item requires technical data',
    );
    await fill(chosenSelector, '400,');
    check(chosen.value === '400,', 'Decimal separator was overwritten');
    await fill(chosenSelector, '400,25');
    check(
      find('aside').innerText.includes(eur('400.25')),
      'Decimal price did not update the total',
    );
    check(document.activeElement === chosen, 'Price input lost focus');
    await act(async () => {
      chosen.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    check(
      state.document!.quotes[0]!.items[0]!.chosenPrice === '400.25',
      'Final price did not persist',
    );
    check(
      counts.saves === savedBeforeTyping + 1,
      'Final price was not saved exactly once',
    );
    await act(async () => {
      chosen.focus();
    });
    await fill(chosenSelector, '400,259');
    await act(async () => {
      chosen.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    check(
      state.document!.quotes[0]!.items[0]!.chosenPrice === '400.25',
      'Invalid precision was persisted',
    );
    check(
      counts.saves === savedBeforeTyping + 1,
      'Invalid precision caused a save',
    );
    await fill(chosenSelector, '0');
    check(
      find('aside').innerText.includes(eur('0.00')),
      'Explicit zero did not appear in the total',
    );
    await act(async () => {
      chosen.focus();
      chosen.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await fill(chosenSelector, '');
    check(
      find('aside').innerText.includes('Non inserito'),
      'Empty price is not distinct from zero',
    );
    await act(async () => {
      chosen.focus();
      chosen.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await act(async () => {
      const profile = createFiscalPreset2026();
      profile.confirmed = true;
      profile.revenueTarget = '50000.00';
      const snapshot = snapshotProfile(profile, []);
      check(snapshot.ok, 'Test profile is not usable');
      if (!snapshot.ok) return;
      state.mutate((document) => {
        document.quotes[0]!.profileSnapshot = snapshot.value;
        document.quotes[0]!.items[0]!.subItems.push({
          ...meta(),
          kind: 'time',
          description: 'Lavoro',
          minutes: 60,
        });
        document.quotes[0]!.items.push({
          ...meta(),
          name: 'Voce senza dati',
          subItems: [],
          variantGroups: [],
          variantSelections: [],
        });
      });
    });
    check(
      find('aside').innerText.includes('Parziale'),
      'Partial theoretical total is not labelled',
    );
    const missingItem = state.document!.quotes[0]!.items[1]!;
    const afterNavigation = async () => {
      await act(async () => {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      });
    };
    const savesBeforeNavigation = counts.saves;
    await clickSelector('[aria-label="Mostra cosa manca per Valore teorico"]');
    await afterNavigation();
    const technical = find(`#quote-technical-${missingItem.id}`);
    check(
      counts.saves === savesBeforeNavigation,
      'Partial navigation caused an archive save',
    );
    check(
      document.activeElement === technical,
      'Partial theoretical total did not focus the missing technical data',
    );
    check(
      technical.classList.contains('ring-2'),
      'Missing technical data was not highlighted',
    );
    check(
      technical.innerText.includes('Aggiungi attività o costi'),
      'Missing technical data has no explanation',
    );
    await act(async () => {
      state.mutate((document) => {
        document.quotes[0]!.items[0]!.chosenPrice = '400.00';
      });
    });
    await clickSelector('[aria-label="Mostra cosa manca per Prezzo scelto"]');
    await afterNavigation();
    const missingChosen = find(`#chosen-${missingItem.id}`) as HTMLInputElement;
    check(
      document.activeElement === missingChosen,
      'Partial chosen total did not focus the missing price',
    );
    check(
      missingChosen
        .closest('[data-slot="input-group"]')
        ?.classList.contains('ring-2'),
      'Missing price was not highlighted',
    );
    await fill(`#chosen-${missingItem.id}`, '0');
    check(
      !missingChosen
        .closest('[data-slot="input-group"]')
        ?.classList.contains('ring-2'),
      'Completed price stayed highlighted',
    );
    await act(async () => {
      missingChosen.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true }),
      );
    });
    const profileSnapshot = structuredClone(
      state.document!.quotes[0]!.profileSnapshot!,
    );
    await act(async () => {
      state.mutate((document) => {
        delete document.quotes[0]!.profileSnapshot;
        document.quotes[0]!.items[0]!.subItems.push({
          ...meta(),
          kind: 'expense',
          description: 'Spesa nota',
          amount: '15.00',
        });
      });
    });
    await clickSelector('[aria-label="Mostra cosa manca per Valore teorico"]');
    await afterNavigation();
    check(
      document.activeElement === find('#quote-profile'),
      'Missing hourly target did not focus the profile',
    );
    check(
      find('#quote-profile')
        .closest('[data-slot="native-select-wrapper"]')
        ?.classList.contains('ring-2'),
      'Missing profile was not highlighted',
    );
    await act(async () => {
      state.mutate((document) => {
        document.quotes[0]!.profileSnapshot = profileSnapshot;
        document.quotes[0]!.items[0]!.subItems.pop();
      });
    });
    check(
      !find('#quote-profile')
        .closest('[data-slot="native-select-wrapper"]')
        ?.classList.contains('ring-2'),
      'Completed profile stayed highlighted',
    );
    const incompleteTravel = {
      ...meta(),
      kind: 'travel' as const,
      description: 'Visita incompleta',
      roundTrip: false,
      occurrences: 1,
      travelMinutesPerOccurrence: 30,
      totalMinutes: 30,
    };
    await act(async () => {
      state.mutate((document) => {
        document.quotes[0]!.items[0]!.subItems.push(incompleteTravel);
        document.quotes[0]!.items[0]!.subItems.push({
          ...meta(),
          kind: 'expense',
          description: 'Spesa nota',
          amount: '15.00',
        });
      });
    });
    const firstItem = state.document!.quotes[0]!.items[0]!;
    const expandSelector = `[aria-label="Apri o chiudi ${firstItem.name}"]`;
    await clickSelector(expandSelector);
    check(
      find(expandSelector).getAttribute('aria-expanded') === 'false',
      'Test item did not collapse',
    );
    await clickSelector('[aria-label="Mostra cosa manca per Valore teorico"]');
    await afterNavigation();
    check(
      find(expandSelector).getAttribute('aria-expanded') === 'true',
      'Partial navigation did not expand the item',
    );
    const travelTarget = find(`#quote-sub-${incompleteTravel.id}`);
    check(
      document.activeElement === travelTarget,
      'Partial navigation did not focus the incomplete travel',
    );
    check(
      travelTarget.classList.contains('ring-2'),
      'Incomplete travel was not highlighted',
    );
    check(
      travelTarget.innerText.includes('costo'),
      'Incomplete travel did not explain its missing data',
    );
    await clickSelector('[aria-label="Mostra cosa manca per Spese"]');
    await afterNavigation();
    check(
      document.activeElement === travelTarget,
      'Partial expenses did not focus the missing travel cost',
    );
    check(
      travelTarget.innerText.includes('Dati trasferta mancanti: costo.'),
      'Partial expenses did not identify the cost specifically',
    );
    await clickSelector('[aria-label="Mostra cosa manca per Tempo"]');
    await afterNavigation();
    check(
      document.activeElement === technical,
      'Partial time did not focus the item without technical data',
    );
    await clickSelector(
      `[aria-label="Mostra cosa manca per Valore teorico di ${firstItem.name}"]`,
    );
    await afterNavigation();
    check(
      document.activeElement === find(`#quote-sub-${incompleteTravel.id}`),
      'Item partial badge did not focus its own missing data',
    );
    await act(async () => {
      state.mutate((document) => {
        document.quotes[0]!.items[0]!.subItems.pop();
        document.quotes[0]!.items[0]!.subItems.pop();
      });
    });
    const theoreticalBefore = find('aside').innerText;
    await act(async () => {
      state.mutate((document) => {
        document.quotes[0]!.items[0]!.subItems.push({
          ...meta(),
          kind: 'expense',
          description: 'Materiale',
          amount: '25.00',
        });
      });
    });
    check(
      find('aside').innerText !== theoreticalBefore,
      'Added expense did not update analysis',
    );
    await act(async () => {
      state.mutate((document) => {
        document.quotes[0]!.items[0]!.subItems = [];
      });
    });
    check(
      find('aside').innerText.includes('Non calcolabile'),
      'Removing technical data did not update analysis',
    );
    results.push('quote-price-preview');
    await click('Aggiungi voce');
    await fill('#item-name', 'Old quote draft');
    await replace('D');
    check(
      !document.querySelector('#item-name'),
      'Quote editor dialog survived archive change',
    );
    check(
      !document.querySelector('[data-slot="dialog-content"]'),
      'Quote dialog survived archive change',
    );
    check(
      document.body.innerText.includes('Nuovo preventivo'),
      'Old active quote survived archive change',
    );
    check(
      document.body.innerText.includes('Preventivo #1'),
      'New quote list is missing',
    );
    await clickSelector('[aria-label="Azioni Preventivo #1"]');
    await clickMenu('Elimina');
    check(
      find('[role="alertdialog"]').innerText.includes('Preventivo #1'),
      'Quote deletion did not use the automatic title',
    );
    await click('Annulla');
    results.push('quotes');

    check(resolveInitialUpdate, 'Initial update read was not requested');
    await act(async () => {
      latestUpdate = {
        phase: 'available',
        currentVersion: '0.1.0',
        availableVersion: '0.1.1',
      };
      for (const listener of updateListeners) listener(latestUpdate);
      // Complete the original read after the newer event.
      resolveInitialUpdate!({ phase: 'idle', currentVersion: '0.1.0' });
    });
    check(
      document.body.innerText.includes('Cash 0.1.1 è disponibile'),
      'A stale initial response hid the available update',
    );
    await click('Apri impostazioni');
    const activeTab = document.querySelector(
      '[role="tab"][aria-selected="true"]',
    );
    check(
      activeTab?.textContent?.trim() === 'Applicazione',
      'Update notice did not open the application settings tab',
    );
    results.push('update-navigation-and-race');

    await click('Impostazioni');
    await click('Integrazioni');
    const requestsBeforeQuota = clientQueries.length;
    const toastsBefore = document.querySelectorAll(
      '[data-slot="toast"]',
    ).length;
    check(
      document.body.innerText.includes('Ultimo rilevamento: Non disponibile'),
      'Unknown quotas were invented',
    );
    const observation: FicQuotaObservation = {
      companyId: '1',
      hourlyRemaining: 840,
      hourlyLimit: 1000,
      monthlyRemaining: 38420,
      monthlyLimit: 40000,
      observedAt: '2026-10-12T05:15:00Z',
    };
    await act(async () => {
      for (const listener of quotaListeners) listener(observation);
    });
    check(
      document.body.innerText.includes('840 / '),
      'Quota event did not update settings',
    );
    check(
      document
        .querySelector('[aria-label="Quota oraria disponibile"]')
        ?.getAttribute('aria-valuenow') === '84',
      'Progress did not show available quota',
    );
    await act(async () => {
      for (const listener of quotaListeners)
        listener({
          ...observation,
          companyId: 'different',
          hourlyRemaining: 7,
        });
    });
    check(
      document.body.innerText.includes('840 / '),
      'Wrong-company quota contaminated settings',
    );
    check(
      clientQueries.length === requestsBeforeQuota,
      'Reading quotas sent a remote request',
    );
    const failure = {
      code: 'RATE_LIMIT' as const,
      source: 'FattureInCloud' as const,
      message: 'Attendi 30 secondi.',
    };
    await act(async () => {
      state.setError(failure);
    });
    check(
      document.querySelectorAll('[data-slot="toast"]').length ===
        toastsBefore + 1,
      'Expected one toast for one failed operation',
    );
    await selectYear(2025);
    check(
      document.querySelectorAll('[data-slot="toast"]').length ===
        toastsBefore + 1,
      'Rerender duplicated notification',
    );
    await act(async () => {
      [
        ...document.querySelectorAll<HTMLElement>(
          '[aria-label="Chiudi notifica"]',
        ),
      ]
        .at(-1)!
        .click();
    });
    check(state.error === failure, 'Toast closure cleared operation state');
    await act(async () => {
      state.setError({
        code: 'EXPORT_UNCERTAIN',
        source: 'FattureInCloud',
        message: 'Controlla il documento remoto prima di ripetere.',
      });
    });
    check(
      document.body.innerText.includes(
        'Controlla il documento remoto prima di ripetere.',
      ),
      'Critical persistent export message disappeared',
    );
    await act(async () => {
      state.clearError();
    });
    results.push('fic-quota-toast-csp');
    check(
      document.body.innerText.includes('Attiva'),
      'Device credential status was reset',
    );
    check(
      (document.querySelector('#fic-client-id') as HTMLInputElement)?.value ===
        setupInfo.clientId,
      'Device setup info was reset',
    );
    const previousQuotaListeners = [...quotaListeners];
    await replace('E');
    check(
      previousQuotaListeners.every((listener) => !quotaListeners.has(listener)),
      'Quota listener leaked on unmount',
    );
    check(
      !document.querySelector('#fic-client-id'),
      'Settings tab survived archive change',
    );
    results.push('settings-and-device');

    await clickSelector('[aria-label="Azioni profilo 2025"]');
    await clickMenu('Copia per nuovo anno');
    check(
      document.querySelector('#copy-profile-year'),
      'Copy profile dialog did not open',
    );
    await replace('E');
    check(
      !document.querySelector('#copy-profile-year'),
      'Copy profile source survived archive change',
    );
    await clickSelector('[aria-label="Azioni profilo 2025"]');
    await clickMenu('Apri editor');
    check(
      document.body.innerText.includes('Tutti i profili'),
      'Profile editor did not open',
    );
    await replace('E');
    check(
      !document.body.innerText.includes('Tutti i profili'),
      'Active profile survived archive change',
    );
    results.push('profile-selections');

    await act(async () => {
      closeRequested();
    });
    check(
      document.body.innerText.includes('Ci sono modifiche non ancora salvate'),
      'Archive decision dialog did not open',
    );
    await replace('F');
    check(
      document.body.innerText.includes('Ci sono modifiche non ancora salvate'),
      'Archive decision was reset by workspace change',
    );
    await click('Annulla');
    check(closeChoice === 'cancel', 'Pending close decision was lost');
    check(
      Object.entries(counts).every(
        ([name, count]) => name === 'saves' || count === 1,
      ),
      'Global initialization or subscription repeated: ' +
        JSON.stringify(counts),
    );
    results.push('global-decisions-and-subscriptions');
    return results;
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
}
