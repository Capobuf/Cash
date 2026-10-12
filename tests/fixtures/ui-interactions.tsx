import { act, useState, type ReactNode } from 'react';
import { CSPProvider } from '@base-ui/react/csp-provider';
import { createRoot } from 'react-dom/client';
import { App } from '../../src/renderer/App';
import { state, AppState } from '../../src/renderer/state';
import { AppShell } from '../../src/renderer/components/Layout';
import { BankCategoryCombobox } from '../../src/renderer/components/BankCategoryCombobox';
import { ProfileEditor } from '../../src/renderer/components/ProfileEditor';
import { ClientsView } from '../../src/renderer/views/ClientsView';
import { FinancialAnalysisView } from '../../src/renderer/views/FinancialAnalysisView';
import { BankMovementsView } from '../../src/renderer/views/BankMovementsView';
import { BankRulesTable } from '../../src/renderer/components/BankRulesTable';
import { CustomerDialog } from '../../src/renderer/components/quotes/CustomerDialog';
import {
  SelectField,
  SearchableSelect,
} from '../../src/renderer/components/ui/selection-field';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '../../src/renderer/components/ui/dialog';
import { DataTable } from '../../src/renderer/components/ui/data-table';
import { Skeleton } from '../../src/renderer/components/ui/skeleton';
import { Spinner } from '../../src/renderer/components/ui/spinner';
import { Card, CardContent } from '../../src/renderer/components/ui/card';
import {
  createEmptyDocument,
  createFiscalPreset2026,
  meta,
  ok,
  err,
  type FicClientSnapshot,
  type FicClientDetails,
  type Result,
} from '../../src/domain/model';
import type { ArchiveSession } from '../../src/shared/archive';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

export async function runUiChecks() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById('root')!);
  const check = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message + '\n' + document.body.innerText);
  };
  const find = (selector: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    check(element, 'Missing: ' + selector);
    return element!;
  };
  const render = async (node: ReactNode) => {
    await act(async () => {
      root.render(<CSPProvider disableStyleElements>{node}</CSPProvider>);
    });
  };
  const click = async (element: HTMLElement) => {
    await act(async () => {
      element.click();
    });
  };
  const key = async (element: HTMLElement, value: string) => {
    await act(async () => {
      element.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: value,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  };
  const fill = async (selector: string, value: string) => {
    await act(async () => {
      const input = find(selector);
      input.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, value);
      input.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText' }),
      );
    });
  };
  const button = (text: string) => {
    const element = [...document.querySelectorAll('button')].find(
      (entry) => entry.textContent?.trim() === text,
    );
    check(element, 'Missing button: ' + text);
    return element!;
  };
  const choose = async (selector: string, label: string) => {
    await click(find(selector));
    const option = [
      ...document.querySelectorAll<HTMLElement>('[role=option]'),
    ].find((entry) => entry.textContent?.trim() === label);
    check(option, 'Missing option: ' + label);
    await click(option!);
  };
  const results: string[] = [];
  const doc = createEmptyDocument();
  const session = (document = doc): ArchiveSession => ({
    path: 'test.sqlite',
    document,
    readOnly: false,
    token: { documentId: document.documentId, revision: document.revision },
  });
  let opening = deferred<Result<ArchiveSession | null>>();
  let created = 0;
  let opened = 0;
  let clients = deferred<Result<FicClientSnapshot[]>>();
  const details = deferred<Result<FicClientDetails>>();
  const client: FicClientSnapshot = {
    source: 'fatture_in_cloud',
    companyId: 'company',
    clientId: 'client',
    displayName: 'Cliente di prova',
  };
  Object.assign(window, {
    cash: {
      archive: {
        openLast: () => opening.promise,
        create: async () => {
          created++;
          return ok(session());
        },
        open: async () => {
          opened++;
          return ok(session());
        },
        save: async (_path: string, document: typeof doc) =>
          ok(session(document)),
      },
      credentials: { hasFicToken: async () => ok(false) },
      fic: {
        setupInfo: async () => ok({ clientId: '', requiredScopes: [] }),
        searchClients: () => clients.promise,
        getClientDetails: () => details.promise,
      },
      updates: {
        getStatus: async () => ({ phase: 'idle', currentVersion: '0.1.2' }),
        onStatus: () => () => {},
      },
      onExternalChange: () => () => {},
      onArchiveReloaded: () => () => {},
      onCloseRequested: () => () => {},
      setDirty: () => {},
    },
  });
  try {
    for (const outcome of ['found', 'absent', 'error'] as const) {
      state.session = null;
      state.error = null;
      opening = deferred();
      await render(<App />);
      check(
        document.body.innerText.includes('Caricamento archivio'),
        'Missing startup loading',
      );
      check(
        !document.body.innerText.includes('Crea archivio'),
        'Onboarding flashed before initialization',
      );
      await act(async () => {
        opening.resolve(
          outcome === 'found'
            ? ok(session())
            : outcome === 'absent'
              ? ok(null)
              : err({ code: 'IO', message: 'Archivio non leggibile' }),
        );
      });
      check(
        !document.querySelector('[data-slot=skeleton]'),
        'Startup skeleton did not finish',
      );
      if (outcome === 'found')
        check(document.querySelector('#app-year'), 'Archive not shown');
      else {
        check(
          button('Crea archivio'),
          'Onboarding missing after initialization',
        );
        if (outcome === 'error') {
          check(
            document.body.innerText.includes('Archivio non leggibile'),
            'Archive error hidden',
          );
          await click(button('Apri archivio'));
          check(opened === 1, 'Open action unavailable after failure');
        } else {
          await click(button('Crea archivio'));
          check(created === 1, 'Create action unavailable without archive');
        }
      }
      await render(null);
    }
    results.push('startup');

    doc.settings.fic = {
      enabled: true,
      company: { id: 'company', name: 'Azienda di prova' },
      product: { id: 'product', name: 'Consulenza' },
    };
    const appState = new AppState();
    appState.acceptNativeSession(session());
    await render(
      <ClientsView
        doc={doc}
        hasToken
        appState={appState}
        requestDelete={() => {}}
      />,
    );
    check(
      document.querySelectorAll('[data-slot=skeleton]').length === 25,
      'Client table loading shape missing',
    );
    check(
      document.body.innerText.includes('Partita IVA'),
      'Client headings hidden while loading',
    );
    check(
      document.querySelector('[aria-label="Cerca clienti Fatture in Cloud"]'),
      'Search hidden while loading',
    );
    await act(async () => {
      clients.resolve(ok([client]));
    });
    await click(find('[aria-label="Apri dettagli di Cliente di prova"]'));
    check(
      document.querySelectorAll('[data-slot=skeleton]').length === 12,
      'Client detail skeleton missing',
    );
    await click(button('Chiudi'));
    await act(async () => {
      details.resolve(
        ok({
          ...client,
          fields: [{ key: 'name', value: 'Risposta obsoleta' }],
        }),
      );
    });
    check(
      !document.body.innerText.includes('Risposta obsoleta'),
      'Closed client request was not invalidated',
    );
    clients = deferred();
    await click(button('Aggiorna'));
    await act(async () => {
      clients.resolve(ok([]));
    });
    check(
      document.body.innerText.includes('Nessun cliente trovato'),
      'Successful empty client results missing',
    );
    clients = deferred();
    await click(button('Aggiorna'));
    await act(async () => {
      clients.resolve(err({ code: 'IO', message: 'FIC non disponibile' }));
    });
    check(
      document.body.innerText.includes('Recupero clienti non riuscito'),
      'Client error missing',
    );
    check(
      !document.body.innerText.includes('Nessun cliente trovato'),
      'Client failure presented as empty results',
    );
    await render(null);
    results.push('clients');

    const quote = {
      ...meta(),
      number: 1,
      date: '2026-01-01',
      items: [],
      snapshotRevision: 0,
      exportAttempts: [],
    };
    await render(
      <CustomerDialog
        open
        onOpenChange={() => {}}
        quote={quote}
        doc={doc}
        hasToken
        results={[client]}
        searching
        onSearch={async () => {}}
        onSelect={() => true}
      />,
    );
    check(
      document.querySelectorAll('[data-slot=skeleton]').length === 8,
      'Quote client search skeleton missing',
    );
    check(
      !document.body.innerText.includes(client.displayName),
      'Stale client results selectable during search',
    );
    await render(
      <CustomerDialog
        open
        onOpenChange={() => {}}
        quote={quote}
        doc={doc}
        hasToken
        results={[]}
        searchError
        onSearch={async () => {}}
        onSelect={() => true}
      />,
    );
    check(
      document.body.innerText.includes('Ricerca clienti non riuscita'),
      'Quote client search error missing',
    );
    await render(null);
    results.push('customer-search');

    const parent = { ...meta(), name: 'Attività' };
    const child = { ...meta(), name: 'Caffè', parentId: parent.id };
    let categoryId = '';
    function CategoryPicker() {
      const [value, setValue] = useState('');
      return (
        <BankCategoryCombobox
          id="category"
          categories={[parent, child]}
          value={value}
          onChange={(next) => {
            categoryId = next;
            setValue(next);
          }}
        />
      );
    }
    await render(<CategoryPicker />);
    await fill('#category', 'CAFFE ATTIVITA');
    check(
      document.querySelectorAll('[role=option]').length === 1,
      'Category accent, word and hierarchy filtering failed',
    );
    await key(find('#category'), 'ArrowDown');
    await key(find('#category'), 'Enter');
    check(
      categoryId === child.id,
      'Keyboard category selection did not preserve ID',
    );
    await render(null);

    let entityId = '';
    function EntityPicker() {
      const [value, setValue] = useState('');
      return (
        <Dialog open>
          <DialogContent>
            <DialogTitle>Selezione di prova</DialogTitle>
            <SearchableSelect
              id="entity"
              name="entity"
              value={value}
              options={[
                { value: '', label: 'Nessuna' },
                { value: 'site-id', label: 'Sede Roma' },
              ]}
              onValueChange={(next) => {
                entityId = next;
                setValue(next);
              }}
            />
          </DialogContent>
        </Dialog>
      );
    }
    await render(<EntityPicker />);
    await key(find('#entity'), 'ArrowDown');
    check(
      document.querySelector('[aria-label="Cerca opzioni"]'),
      'Popup combobox did not open with keyboard in dialog',
    );
    await fill('[aria-label="Cerca opzioni"]', 'roma');
    await key(find('[aria-label="Cerca opzioni"]'), 'ArrowDown');
    await key(find('[aria-label="Cerca opzioni"]'), 'Enter');
    check(
      entityId === 'site-id',
      'Popup combobox selection did not preserve ID',
    );
    await click(find('#entity'));
    await key(find('[aria-label="Cerca opzioni"]'), 'Escape');
    await act(async () => {
      await new Promise(requestAnimationFrame);
    });
    check(
      document.activeElement === find('#entity'),
      'Combobox did not restore focus inside dialog',
    );
    await render(null);
    await render(
      <form>
        <SelectField
          id="required"
          name="required"
          required
          defaultValue=""
          options={[
            { value: '', label: 'Scegli' },
            { value: 'id', label: 'Opzione' },
          ]}
        />
        <SelectField
          id="disabled"
          name="disabled"
          disabled
          defaultValue="id"
          options={[{ value: 'id', label: 'Opzione' }]}
        />
      </form>,
    );
    check(
      !document.querySelector('form')!.checkValidity(),
      'Required empty select passed validation',
    );
    await choose('#required', 'Opzione');
    check(
      document.querySelector('form')!.checkValidity(),
      'Selected required select failed validation',
    );
    const formData = new FormData(document.querySelector('form')!);
    check(
      formData.get('required') === 'id' && !formData.has('disabled'),
      'Select form submission lost IDs or included disabled field',
    );
    await click(find('#disabled'));
    check(
      find('#disabled').getAttribute('aria-expanded') === 'false',
      'Disabled select opened',
    );
    await render(null);
    results.push('controls');

    const profile = createFiscalPreset2026();
    profile.revenueTarget = '50000.00';
    profile.fiscal.reducedEligibilityConfirmed = true;
    doc.profiles.push(profile);
    await render(
      <ProfileEditor
        profile={profile}
        doc={doc}
        appState={appState}
        onCopy={() => {}}
      />,
    );
    check(
      new FormData(document.querySelector('form')!).get('activityPhase') ===
        profile.fiscal.activityPhase,
      'Initial fiscal field missing from FormData',
    );
    await click(button('Fiscalità'));
    await choose('#activityPhase', 'Primi 5 periodi · agevolazione spettante');
    check(
      new FormData(document.querySelector('form')!).get('activityPhase') ===
        'reduced_eligible',
      'Changed fiscal field missing from FormData',
    );
    await click(button('Anteprima'));
    const reducedPreview = document.body.innerText;
    await click(button('Fiscalità'));
    await choose('#activityPhase', 'Oltre i primi 5 periodi / non spettante');
    await click(button('Anteprima'));
    check(
      document.body.innerText !== reducedPreview,
      'Fiscal selection did not update the preview immediately',
    );
    await click(button('Fiscalità'));
    await choose('#activityPhase', 'Primi 5 periodi · agevolazione spettante');
    await click(button('Salva come Da verificare'));
    check(
      appState.document!.profiles[0]!.fiscal.activityPhase ===
        'reduced_eligible',
      'Fiscal select did not save: ' + JSON.stringify(appState.error),
    );
    await render(null);
    results.push('fiscal-form');

    const shell = (view: 'catalog' | 'dashboard') => (
      <AppShell
        appState={appState}
        view={view}
        onView={() => {}}
        onOpenUpdates={() => {}}
        years={[2026, 2025]}
        selectedYear={2026}
        onYearChange={() => {}}
      >
        <input id="editing" defaultValue="Bozza" />
      </AppShell>
    );
    await render(shell('catalog'));
    const content = find('#editing').parentElement!;
    const input = find('#editing');
    input.focus();
    let animationChanges = 0;
    const observer = new MutationObserver(() => {
      animationChanges++;
    });
    observer.observe(content, { attributes: true, attributeFilter: ['class'] });
    await fill('#editing', 'Bozza modificata');
    await render(shell('catalog'));
    check(
      find('#editing') === input &&
        document.activeElement === input &&
        !animationChanges,
      'Ordinary render restarted navigation or lost focus',
    );
    await render(shell('dashboard'));
    check(
      !content.classList.contains('section-enter'),
      'Dashboard received duplicate entry animation',
    );
    observer.disconnect();
    await render(null);
    results.push('navigation');

    const rows = Array.from({ length: 55 }, (_, index) => ({
      id: String(index),
      name: 'Riga ' + String(index).padStart(2, '0'),
    }));
    await render(
      <DataTable
        data={rows}
        columns={[{ id: 'name', header: 'Nome', value: (row) => row.name }]}
        getRowKey={(row) => row.id}
        emptyMessage="Vuoto"
        searchPlaceholder="Cerca righe"
      />,
    );
    check(
      document.querySelectorAll('tbody tr').length === 20,
      'Initial pagination wrong',
    );
    await choose('[aria-label="Filtra la ricerca per colonna"]', 'Nome');
    await fill('[aria-label="Cerca righe"]', 'Riga 0');
    check(
      document.querySelectorAll('tbody tr').length === 10,
      'Column search filter wrong',
    );
    await fill('[aria-label="Cerca righe"]', '');
    await choose('[data-slot=select-trigger]:not([aria-label])', '50');
    check(
      document.querySelectorAll('tbody tr').length === 50,
      'Page size change failed',
    );
    await click(find('[aria-label="Pagina successiva"]'));
    check(
      document.querySelectorAll('tbody tr').length === 5,
      'Next page failed',
    );
    results.push('table');
    await choose('[data-slot=select-trigger]:not([aria-label])', '100');
    check(
      document.querySelectorAll('tbody tr').length === 55,
      'Page size 100 failed',
    );
    await render(null);

    doc.bankExpenseCategories.push(parent, child);
    doc.bankExpenseRules.push(
      { ...meta(), matchText: 'Adobe', categoryId: child.id },
      { ...meta(), matchText: 'Taxi', categoryId: parent.id },
    );
    doc.bankExpenses.push({
      ...meta(),
      date: '2026-01-01',
      description: 'Adobe',
      amount: '10.00',
      categoryIds: [],
    });
    await render(
      <BankRulesTable
        doc={doc}
        readOnly={false}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    await choose('#bank-rule-matches-filter', 'Con corrispondenze');
    check(
      document.querySelector('tbody')!.innerText.includes('Adobe') &&
        !document.querySelector('tbody')!.innerText.includes('Taxi'),
      'Matched rule filter failed',
    );
    await choose('#bank-rule-matches-filter', 'Senza corrispondenze');
    check(
      !document.querySelector('tbody')!.innerText.includes('Adobe') &&
        document.querySelector('tbody')!.innerText.includes('Taxi'),
      'Unmatched rule filter failed',
    );
    await render(null);
    results.push('bank-filters');

    appState.financialSyncing = true;
    await render(
      <FinancialAnalysisView
        doc={doc}
        appState={appState}
        hasToken
        year={2026}
      />,
    );
    check(
      document.querySelector('[data-slot=skeleton]') &&
        document.querySelector('[aria-label="Indicatori principali"]'),
      'First sync hid local financial indicators',
    );
    const snapshot = {
      source: 'fatture_in_cloud' as const,
      company: { id: 'company', name: 'Snapshot precedente' },
      acquiredAt: '2026-01-01T12:00:00Z',
      issuedDocuments: [],
      receivedDocuments: [],
    };
    doc.financialSnapshot = snapshot;
    await render(
      <FinancialAnalysisView
        doc={doc}
        appState={appState}
        hasToken
        year={2026}
      />,
    );
    check(
      !document.querySelector('[data-slot=skeleton]') &&
        document.body.innerText.includes('Snapshot precedente') &&
        doc.financialSnapshot === snapshot,
      'Refresh replaced or hid the previous financial snapshot',
    );
    appState.financialSyncError = {
      code: 'IO',
      message: 'Sincronizzazione non riuscita',
    };
    await render(
      <FinancialAnalysisView
        doc={doc}
        appState={appState}
        hasToken
        year={2026}
      />,
    );
    check(
      document.body.innerText.includes('Ultimo aggiornamento non riuscito'),
      'Financial sync error hidden',
    );
    await render(null);
    results.push('financial-loading');

    appState.bankExpenseImporting = true;
    appState.bankExpenseImportSummary = {
      imported: 1,
      duplicates: 2,
      ignoredIncome: 3,
    };
    await render(
      <BankMovementsView doc={doc} appState={appState} year={2026} />,
    );
    check(
      document.querySelector('[data-slot=spinner]') &&
        document.body.innerText.includes('Importazione in corso') &&
        document.body.innerText.includes('1 movimenti importati') &&
        document.body.innerText.includes('Adobe'),
      'Import feedback hid bank rows or original summary',
    );
    results.push('bank-import');
    return results;
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
}

export async function renderMotionPreview(reduced: boolean) {
  window.cash.fic.searchClients = () => new Promise<never>(() => {});
  const root = createRoot(document.getElementById('root')!);
  const doc = createEmptyDocument();
  doc.settings.fic = {
    enabled: true,
    company: { id: 'company', name: 'Azienda di prova' },
    product: { id: 'product', name: 'Consulenza' },
  };
  const appState = new AppState();
  await act(async () => {
    root.render(
      <CSPProvider disableStyleElements>
        <AppShell
          appState={appState}
          view="clients"
          onView={() => {}}
          onOpenUpdates={() => {}}
          years={[2026, 2025]}
          selectedYear={2026}
          onYearChange={() => {}}
        >
          <ClientsView
            doc={doc}
            hasToken
            appState={appState}
            requestDelete={() => {}}
          />
          <Card>
            <CardContent className="flex items-center gap-4">
              <label htmlFor="preview-site">Sede principale</label>
              <SearchableSelect
                id="preview-site"
                value=""
                options={[
                  { value: '', label: 'Nessuna' },
                  { value: 'site', label: 'Sede Roma' },
                ]}
              />
              <Spinner aria-label="Operazione in corso" />
              <Skeleton className="h-6 w-40" />
            </CardContent>
          </Card>
        </AppShell>
      </CSPProvider>,
    );
  });
  await document.fonts.ready;
  const content = document.querySelector<HTMLElement>('.section-enter')!;
  const skeleton = document.querySelector<HTMLElement>('[data-slot=skeleton]')!;
  const spinner = document.querySelector<HTMLElement>('[data-slot=spinner]')!;
  if (!content || !skeleton || !spinner)
    throw new Error('Motion preview missing');
  if (reduced) {
    for (const element of [content, skeleton, spinner]) {
      if (getComputedStyle(element).animationName !== 'none')
        throw new Error('Reduced motion did not disable animation');
    }
  } else if (getComputedStyle(content).animationName !== 'section-enter')
    throw new Error('Section transition CSS missing');
  if (!document.querySelector('[role=status]'))
    throw new Error('Loading state lost without motion');
  return true;
}
