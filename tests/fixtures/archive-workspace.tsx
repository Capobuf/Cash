import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../../src/renderer/App';
import { state } from '../../src/renderer/state';
import {
  createEmptyDocument,
  createBlankProfile,
  meta,
  ok,
  type CashDocument,
} from '../../src/domain/model';

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
  archive.quotes.push({
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
    openLast: 0,
    credentials: 0,
    setupInfo: 0,
    external: 0,
    reloaded: 0,
    close: 0,
  };
  const clientQueries: string[] = [];
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
      fingerprint: 'hash',
    },
  });
  Object.assign(window, {
    cash: {
      archive: {
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
        setupInfo: async () => {
          counts.setupInfo++;
          return { ...setupInfo, ...ok(setupInfo) };
        },
        searchClients: async ({ query }: { query: string }) => {
          clientQueries.push(query);
          return ok([
            {
              source: 'fatture_in_cloud',
              companyId: '1',
              clientId: '3',
              displayName: state.document!.catalog.templates[0]!.name.replace(
                'Template',
                'Cliente',
              ),
            },
          ]);
        },
        getClientDetails: async () => ok({ fields: [] }),
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
      root.render(<App />);
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
    await fill(
      '[aria-label="Cerca clienti Fatture in Cloud"]',
      'Previous search',
    );
    await click('Cerca');
    await clickSelector('[aria-label="Apri dettagli di Cliente B"]');
    check(
      document.querySelector('[role="dialog"]'),
      'Client details did not open',
    );
    await replace('C');
    check(
      !document.querySelector('[role="dialog"]'),
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

    await click('Preventivi');
    const row = [...document.querySelectorAll('tr')].find((row) =>
      row.textContent?.includes('Preventivo C'),
    );
    check(row, 'Quote list row missing');
    await act(async () => {
      row!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    await click('Aggiungi voce');
    await fill('#item-name', 'Old quote draft');
    await replace('D');
    check(
      !document.querySelector('#item-name'),
      'Quote editor dialog survived archive change',
    );
    check(
      !document.querySelector('[role="dialog"]'),
      'Quote dialog survived archive change',
    );
    check(
      document.body.innerText.includes('Nuovo preventivo'),
      'Old active quote survived archive change',
    );
    check(
      document.body.innerText.includes('Preventivo D'),
      'New quote list is missing',
    );
    results.push('quotes');

    await click('Impostazioni');
    await click('Integrazioni');
    check(
      document.body.innerText.includes('Attiva'),
      'Device credential status was reset',
    );
    check(
      (document.querySelector('#fic-client-id') as HTMLInputElement)?.value ===
        setupInfo.clientId,
      'Device setup info was reset',
    );
    await replace('E');
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
      Object.values(counts).every((count) => count === 1),
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
