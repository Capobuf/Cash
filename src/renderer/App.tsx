import { useEffect, useMemo, useState } from 'react';
import { financialYears } from '../domain/financial-analysis';
import { BankSummaryView } from './views/BankSummaryView';
import { BankMovementsView } from './views/BankMovementsView';
import { BankCategoriesView } from './views/BankCategoriesView';
import { touch, type CashDocument } from '../domain/model';
import { copyProfileToYear } from '../domain/profiles';
import { createQuote as buildQuote } from '../domain/quotes';
import { AppShell, DeleteDialog, Onboarding } from '@/components/Layout';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAppState } from '@/hooks/use-app-state';
import { state, type AppState, type ArchiveDecision } from './state';
import type { DeleteTarget, View } from './types';
import { CatalogView } from './views/CatalogView';
import { ClientsView } from './views/ClientsView';
import { FinancialAnalysisView } from './views/FinancialAnalysisView';
import { DashboardView } from './views/DashboardView';
import { QuotesView } from './views/QuotesView';
import { SettingsView, type FicUiState } from './views/SettingsView';

export function selectableYears(
  doc: CashDocument | undefined,
  currentYear: number,
) {
  if (!doc) return [];
  const available = new Set(
    financialYears(
      doc.financialSnapshot,
      doc.profiles,
      doc.bankExpenses,
      doc.fiscalPaymentOverrides,
    ),
  );
  for (const quote of doc.quotes) {
    const year = Number(quote.date.slice(0, 4));
    if (Number.isInteger(year)) available.add(year);
  }
  available.add(currentYear);
  return [...available].sort((a, b) => b - a);
}

export function App() {
  const appState = useAppState(state);
  const [view, setView] = useState<View>('dashboard');
  const [decisionResolver, setDecisionResolver] = useState<
    ((choice: ArchiveDecision) => void) | null
  >(null);
  const [archiveDecisionAllowsSave, setArchiveDecisionAllowsSave] =
    useState(true);
  const [hasFicToken, setHasFicToken] = useState(false);
  const [ficConnectionError, setFicConnectionError] = useState(false);
  const [ficSetupInfo, setFicSetupInfo] = useState<{
    clientId: string;
    requiredScopes: string[];
  }>({ clientId: '', requiredScopes: [] });

  const requestArchiveDecision = (allowSave = true) =>
    new Promise<ArchiveDecision>((resolve) => {
      setArchiveDecisionAllowsSave(allowSave);
      setDecisionResolver(() => resolve);
    });

  useEffect(() => {
    state.setArchiveDecisionHandler(requestArchiveDecision);
    void state.initialize();
    void window.cash.credentials.hasFicToken().then((result) => {
      setHasFicToken(result.ok && result.value);
      setFicConnectionError(!result.ok);
    });
    void window.cash.fic.setupInfo().then((result) => {
      if (result.ok) setFicSetupInfo(result.value);
      else state.setError(result.error);
    });
    return window.cash.onCloseRequested(() => {
      void requestArchiveDecision().then(async (choice) => {
        if (choice === 'save') {
          await state.save();
          window.cash.resolveClose(
            state.status === 'Salvato' ? 'discard' : 'cancel',
          );
        } else if (choice === 'recovery')
          window.cash.resolveClose(
            (await state.recovery()) ? 'discard' : 'cancel',
          );
        else
          window.cash.resolveClose(choice === 'discard' ? 'discard' : 'cancel');
      });
    });
  }, []);

  return (
    <>
      {appState.document ? (
        <ArchiveWorkspace
          key={appState.document.documentId}
          doc={appState.document}
          appState={appState}
          view={view}
          setView={setView}
          ficUi={{
            hasToken: hasFicToken,
            connectionError: ficConnectionError,
            setupInfo: ficSetupInfo,
            setSetupInfo: setFicSetupInfo,
            setHasToken: setHasFicToken,
            setConnectionError: setFicConnectionError,
          }}
        />
      ) : (
        <Onboarding appState={appState} />
      )}
      <AlertDialog
        open={Boolean(decisionResolver)}
        onOpenChange={(open) => {
          if (!open && decisionResolver) {
            decisionResolver('cancel');
            setDecisionResolver(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Ci sono modifiche non ancora salvate
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveDecisionAllowsSave ? (
                <>
                  Prima di aprire un altro archivio o chiudere Cash puoi
                  attendere il salvataggio, creare una copia di recupero oppure
                  scartare le modifiche locali.
                </>
              ) : (
                'Prima del ripristino puoi creare una copia di recupero oppure scartare le modifiche locali. Salvare nel file corrente sostituirebbe il backup da recuperare.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap">
            <Button
              variant="outline"
              onClick={() => {
                decisionResolver?.('cancel');
                setDecisionResolver(null);
              }}
            >
              Annulla
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                decisionResolver?.('recovery');
                setDecisionResolver(null);
              }}
            >
              Copia di recupero
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                decisionResolver?.('discard');
                setDecisionResolver(null);
              }}
            >
              Scarta modifiche
            </Button>
            {archiveDecisionAllowsSave ? (
              <Button
                onClick={() => {
                  decisionResolver?.('save');
                  setDecisionResolver(null);
                }}
              >
                Salva e continua
              </Button>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ArchiveWorkspace({
  doc,
  appState,
  view,
  setView,
  ficUi,
}: {
  doc: CashDocument;
  appState: AppState;
  view: View;
  setView: (view: View) => void;
  ficUi: FicUiState;
}) {
  const [selectedYear, setSelectedYear] = useState<number>();
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    return selectableYears(doc, currentYear);
  }, [doc, currentYear]);
  const financialYear =
    selectedYear !== undefined && years.includes(selectedYear)
      ? selectedYear
      : years.includes(currentYear)
        ? currentYear
        : (years[0] ?? currentYear);
  const [activeQuoteId, setActiveQuoteId] = useState<string>();
  const [activeProfileId, setActiveProfileId] = useState<string>();
  const [settingsTab, setSettingsTab] = useState('profiles');
  const [copyProfileId, setCopyProfileId] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const navigate = (next: View, tab = 'profiles') => {
    setView(next);
    if (next === 'settings') setSettingsTab(tab);
    setActiveQuoteId(undefined);
    if (next !== 'settings') setActiveProfileId(undefined);
  };

  const createQuote = () => {
    const doc = appState.document;
    if (!doc) return;
    const created = buildQuote(doc);
    if (!appState.mutate((document) => document.quotes.push(created))) return;
    setActiveQuoteId(created.id);
    setView('quotes');
  };

  const copyProfile = (year: number) => {
    const doc = appState.document;
    const source = doc?.profiles.find(
      (profile) => profile.id === copyProfileId,
    );
    if (!source || !doc) return;
    if (doc.profiles.some((profile) => profile.year === year)) {
      appState.setError({
        code: 'CONFLICT',
        field: 'profile.year',
        message: `Esiste già un profilo per il ${year}.`,
        action: 'Scegli un anno diverso.',
      });
      return;
    }
    const copied = copyProfileToYear(source, year);
    if (!copied.ok) {
      appState.setError(copied.error);
      return;
    }
    if (!appState.mutate((document) => document.profiles.unshift(copied.value)))
      return;
    setCopyProfileId(undefined);
    setActiveProfileId(copied.value.id);
    setView('settings');
  };

  const deleteEntity = (doc: CashDocument, target: DeleteTarget) => {
    if (
      target.kind === 'site' &&
      doc.settings.defaultDepartureSiteId === target.id
    ) {
      appState.setError({
        code: 'CONFLICT',
        message: 'La Sede è la partenza predefinita.',
        action: 'Scegli o rimuovi prima la partenza predefinita.',
      });
      return false;
    }
    if (
      target.kind === 'vehicle' &&
      doc.settings.defaultVehicleId === target.id
    ) {
      appState.setError({
        code: 'CONFLICT',
        message: 'Il Veicolo è quello predefinito.',
        action: 'Scegli o rimuovi prima il Veicolo predefinito.',
      });
      return false;
    }
    const deleted = appState.mutate((document) => {
      if (target.kind === 'cost')
        document.businessCosts = document.businessCosts.filter(
          (entry) => entry.id !== target.id,
        );
      else if (target.kind === 'vehicle')
        document.vehicles = document.vehicles.filter(
          (entry) => entry.id !== target.id,
        );
      else if (target.kind === 'site')
        document.sites = document.sites.filter(
          (entry) => entry.id !== target.id,
        );
      else if (target.kind === 'catalog')
        document.catalog.subItems = document.catalog.subItems.filter(
          (entry) => entry.id !== target.id,
        );
      else if (target.kind === 'template')
        document.catalog.templates = document.catalog.templates.filter(
          (entry) => entry.id !== target.id,
        );
      else if (target.kind === 'profile') {
        document.profiles = document.profiles.filter(
          (entry) => entry.id !== target.id,
        );
      } else if (target.kind === 'quote') {
        document.quotes = document.quotes.filter(
          (entry) => entry.id !== target.id,
        );
      } else if (target.kind === 'item') {
        const quote = document.quotes.find(
          (entry) => entry.id === activeQuoteId,
        );
        if (quote)
          touch(quote).items = quote.items.filter(
            (entry) => entry.id !== target.id,
          );
      } else if (target.kind === 'sub') {
        const [itemId, subId] = target.id.split(':');
        const quote = document.quotes.find(
          (entry) => entry.id === activeQuoteId,
        );
        const item = quote?.items.find((entry) => entry.id === itemId);
        if (item && quote) {
          touch(item).subItems = item.subItems.filter(
            (entry) => entry.id !== subId,
          );
          touch(quote);
        }
      } else {
        const unsupportedKind: never = target.kind;
        throw new Error(`Unsupported deletion target: ${unsupportedKind}`);
      }
    });
    if (!deleted) return false;
    if (target.kind === 'profile' && activeProfileId === target.id)
      setActiveProfileId(undefined);
    if (target.kind === 'quote' && activeQuoteId === target.id)
      setActiveQuoteId(undefined);
    return true;
  };

  const openProfile = (id?: string) => {
    setActiveProfileId(id);
    setView('settings');
  };
  const content =
    view === 'dashboard' ? (
      <DashboardView
        doc={doc}
        year={financialYear}
        appState={appState}
        onEditProfile={openProfile}
        onOpenQuote={(id) => {
          setActiveQuoteId(id);
          setView('quotes');
        }}
        onNewQuote={createQuote}
      />
    ) : view === 'quotes' ? (
      <QuotesView
        doc={doc}
        hasToken={ficUi.hasToken}
        appState={appState}
        activeQuoteId={activeQuoteId}
        setActiveQuoteId={setActiveQuoteId}
        requestDelete={setDeleteTarget}
      />
    ) : view === 'clients' ? (
      <ClientsView
        doc={doc}
        hasToken={ficUi.hasToken}
        appState={appState}
        requestDelete={setDeleteTarget}
      />
    ) : view === 'catalog' ? (
      <CatalogView
        doc={doc}
        appState={appState}
        requestDelete={setDeleteTarget}
      />
    ) : view === 'financial-analysis' ? (
      <FinancialAnalysisView
        doc={doc}
        appState={appState}
        hasToken={ficUi.hasToken}
        year={financialYear}
      />
    ) : view === 'bank-summary' ? (
      <BankSummaryView doc={doc} year={financialYear} />
    ) : view === 'bank-movements' ? (
      <BankMovementsView doc={doc} appState={appState} year={financialYear} />
    ) : view === 'bank-categories' ? (
      <BankCategoriesView doc={doc} appState={appState} />
    ) : (
      <SettingsView
        doc={doc}
        appState={appState}
        tab={settingsTab}
        onTabChange={setSettingsTab}
        activeProfileId={activeProfileId}
        ficUi={ficUi}
        onEditProfile={setActiveProfileId}
        onCopyProfile={setCopyProfileId}
        requestDelete={setDeleteTarget}
      />
    );

  const copySource = doc.profiles.find(
    (profile) => profile.id === copyProfileId,
  );
  return (
    <>
      <AppShell
        appState={appState}
        view={view}
        onView={navigate}
        onOpenUpdates={() => navigate('settings', 'application')}
        years={years}
        selectedYear={financialYear}
        onYearChange={setSelectedYear}
      >
        {content}
      </AppShell>
      <DeleteDialog
        target={deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget && deleteEntity(doc, deleteTarget))
            setDeleteTarget(null);
        }}
      />
      <Dialog
        open={Boolean(copySource)}
        onOpenChange={(open) => {
          if (!open) setCopyProfileId(undefined);
        }}
      >
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              copyProfile(
                Number(new FormData(event.currentTarget).get('year')),
              );
            }}
            className="contents"
          >
            <DialogHeader>
              <DialogTitle>Copia profilo {copySource?.year}</DialogTitle>
              <DialogDescription>
                La copia avrà una nuova identità e sarà Da verificare.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="copy-profile-year">Nuovo anno</FieldLabel>
              <Input
                id="copy-profile-year"
                name="year"
                type="number"
                defaultValue={(copySource?.year ?? 2025) + 1}
                min={2000}
                max={2200}
                autoFocus
                required
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCopyProfileId(undefined)}
              >
                Annulla
              </Button>
              <Button type="submit">Crea copia</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
