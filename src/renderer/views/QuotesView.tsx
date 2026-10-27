import { SelectField, SearchableSelect } from '@/components/ui/selection-field';
import {
  ArrowLeft,
  BookOpen,
  CloudUpload,
  FilePlus2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { calculateQuote } from '../../domain/calculations';
import { quoteTitle } from '../../domain/quotes';
import { type CashDocument, type QuoteItem } from '../../domain/model';
import { siteMatchesClient } from '../../domain/locations';
import { Analysis } from '@/components/Analysis';
import { SiteDialog } from '@/components/EntityDialogs';
import {
  CatalogPickerDialog,
  InsertTemplateDialog,
  VariantChangeDialog,
} from '@/components/quotes/CatalogInsertDialogs';
import { CustomerDialog } from '@/components/quotes/CustomerDialog';
import { ExportDialog } from '@/components/quotes/ExportDialog';
import { ItemNameDialog } from '@/components/quotes/ItemNameDialog';
import { QuoteTitleDialog } from '@/components/quotes/QuoteTitleDialog';
import { QuoteLayoutEditor } from '@/components/quotes/QuoteLayoutEditor';
import {
  SaveSubDialog,
  SaveTemplateDialog,
} from '@/components/quotes/CatalogSaveDialogs';
import { SubItemDialog } from '@/components/quotes/SubItemDialog';
import {
  QuoteItemCard,
  type QuoteItemActions,
} from '@/components/QuoteItemCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useQuoteController } from '@/hooks/use-quote-controller';
import { dateIt, decimalInputValue, moneyInputValue } from '@/lib/format';
import {
  missingAnalysisTargets,
  type PartialMetric,
} from '@/lib/quote-analysis-navigation';
import type { AppState } from '../state';
import type { DeleteTarget } from '../types';

type Overlay =
  | { kind: 'title' }
  | { kind: 'customer' }
  | { kind: 'site'; context: string }
  | { kind: 'item'; item?: QuoteItem; containerId?: string }
  | {
      kind: 'sub';
      itemId: string;
      subId?: string;
      initialKind?: 'time' | 'expense' | 'travel';
    }
  | { kind: 'catalog'; itemId: string }
  | { kind: 'save-sub'; itemId: string; subId: string }
  | {
      kind: 'variant-change';
      itemId: string;
      groupId: string;
      optionId: string;
    }
  | { kind: 'insert-template'; containerId?: string }
  | { kind: 'save-template' }
  | { kind: 'export' };

interface PendingQuoteUpdate {
  date?: string;
  profileId?: string;
  mainSiteId?: string;
  commission?: string;
}

export function QuotesView({
  doc,
  hasToken,
  appState,
  activeQuoteId,
  setActiveQuoteId,
  requestDelete,
}: {
  doc: CashDocument;
  hasToken: boolean;
  appState: AppState;
  activeQuoteId?: string;
  setActiveQuoteId: (id?: string) => void;
  requestDelete: (target: DeleteTarget) => void;
}) {
  const controller = useQuoteController({
    doc,
    hasToken,
    appState,
    activeQuoteId,
    setActiveQuoteId,
    requestDelete,
  });
  const { quote } = controller;
  const [overlay, setOverlay] = useState<Overlay>();
  const [pendingUpdate, setPendingUpdate] = useState<PendingQuoteUpdate>();
  const [pricePreview, setPricePreview] = useState<
    Record<string, string | undefined>
  >({});
  const [analysisNavigation, setAnalysisNavigation] = useState<{
    quoteId: string;
    metric: PartialMetric;
    itemId?: string;
  }>();
  const ficReady =
    doc.settings.fic.enabled && hasToken && Boolean(doc.settings.fic.company);
  const readOnly = Boolean(
    appState.session?.readOnly ||
    appState.status === 'Conflitto esterno' ||
    appState.archiveOperationPending,
  );

  if (!quote)
    return (
      <QuotesList
        doc={doc}
        onNew={controller.newQuote}
        onOpen={setActiveQuoteId}
        requestDelete={requestDelete}
      />
    );

  const hourly = quote.profileSnapshot?.hourlyTarget;
  const siteContext = `${appState.archiveContext}:${quote.id}:${quote.client?.companyId}:${quote.client?.clientId}`;
  const canAddSite = Boolean(
    quote.client &&
    appState.document &&
    !appState.session?.readOnly &&
    appState.status !== 'Conflitto esterno',
  );
  const previewItems = quote.items.map((item) =>
    Object.hasOwn(pricePreview, item.id)
      ? { ...item, chosenPrice: pricePreview[item.id] }
      : item,
  );
  const total = calculateQuote(previewItems, hourly);
  const missingTargets =
    analysisNavigation?.quoteId === quote.id
      ? missingAnalysisTargets(
          analysisNavigation.itemId
            ? previewItems.filter(
                (item) => item.id === analysisNavigation.itemId,
              )
            : previewItems,
          hourly,
          analysisNavigation.metric,
        )
      : [];
  const showMissing = (metric: PartialMetric, itemId?: string) => {
    const targets = missingAnalysisTargets(
      itemId ? previewItems.filter((item) => item.id === itemId) : previewItems,
      hourly,
      metric,
    );
    setAnalysisNavigation({ quoteId: quote.id, metric, itemId });
    requestAnimationFrame(() => {
      const target = document.getElementById(targets[0]?.id ?? '');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };
  const missingProfile = missingTargets.find(
    (target) => target.id === 'quote-profile',
  );
  const setQuoteValue = (updates: PendingQuoteUpdate) => {
    const result = controller.updateQuote(updates);
    if (result === 'year-mismatch') setPendingUpdate(updates);
  };
  const selectCustomer = (
    selection: string | import('../../domain/model').FicClientSnapshot,
  ) => {
    return typeof selection === 'string' && selection
      ? false
      : controller.updateClient(
          typeof selection === 'string' ? undefined : selection,
        );
  };

  const itemActions: QuoteItemActions = {
    showMissing,
    clearMissing: () => setAnalysisNavigation(undefined),
    rename: (item) => setOverlay({ kind: 'item', item }),
    previewChosenPrice: (itemId, value) =>
      setPricePreview((previous) => ({ ...previous, [itemId]: value })),
    updateChosenPrice: (itemId, value) => {
      const saved = controller.updateChosenPrice(itemId, value);
      setPricePreview((previous) => {
        const next = { ...previous };
        delete next[itemId];
        return next;
      });
      return saved;
    },
    editSub: (itemId, subId) => setOverlay({ kind: 'sub', itemId, subId }),
    saveSub: (itemId, subId) => setOverlay({ kind: 'save-sub', itemId, subId }),
    changeVariant: (itemId, group, optionId) => {
      const item = quote.items.find((entry) => entry.id === itemId);
      if (
        !item ||
        item.variantSelections.find((entry) => entry.groupId === group.id)
          ?.optionId === optionId
      )
        return;
      const hasTravel = group.options
        .find((entry) => entry.id === optionId)
        ?.subItems.some((entry) => entry.kind === 'travel');
      const hasManualChanges = item.subItems.some(
        (entry) =>
          entry.variantOwner?.groupId === group.id && entry.manuallyModified,
      );
      if (hasTravel || hasManualChanges)
        setOverlay({
          kind: 'variant-change',
          itemId,
          groupId: group.id,
          optionId,
        });
      else void controller.switchVariant(itemId, group.id, optionId, {}, true);
    },
    addSub: (itemId, initialKind) =>
      setOverlay({ kind: 'sub', itemId, initialKind }),
    addCatalog: (itemId) => setOverlay({ kind: 'catalog', itemId }),
    requestDelete,
  };

  const overlayItem =
    'itemId' in (overlay ?? {})
      ? quote.items.find(
          (item) => item.id === (overlay as { itemId: string }).itemId,
        )
      : undefined;
  const overlaySub =
    overlay?.kind === 'sub'
      ? overlayItem?.subItems.find((sub) => sub.id === overlay.subId)
      : undefined;
  const overlayGroup =
    overlay?.kind === 'variant-change'
      ? overlayItem?.variantGroups.find((group) => group.id === overlay.groupId)
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveQuoteId(undefined)}
          >
            <ArrowLeft />
            Preventivi
          </Button>
          <div className="h-5 w-px bg-border" />
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h2 className="min-w-0 font-semibold [overflow-wrap:anywhere]">
                {quoteTitle(quote)}
              </h2>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Rinomina preventivo"
                title="Rinomina preventivo"
                disabled={readOnly}
                onClick={() => setOverlay({ kind: 'title' })}
              >
                <Pencil />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {dateIt(quote.date)} · {quote.items.length}{' '}
              {quote.items.length === 1 ? 'voce' : 'voci'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {doc.catalog.templates.length ? (
            <Button onClick={() => setOverlay({ kind: 'insert-template' })}>
              <BookOpen />
              Inserisci template
            </Button>
          ) : null}
          <Button
            variant={doc.catalog.templates.length ? 'outline' : 'default'}
            onClick={() => setOverlay({ kind: 'item' })}
          >
            <Plus />
            Aggiungi voce
          </Button>
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button
                onClick={() => setOverlay({ kind: 'export' })}
                disabled={!ficReady}
              >
                <CloudUpload />
                Esporta FIC
              </Button>
            </TooltipTrigger>
            {!ficReady ? (
              <TooltipContent>
                {doc.settings.fic.enabled && !hasToken
                  ? 'Richiede configurazione locale: collega questa postazione nelle Impostazioni.'
                  : 'Attiva Fatture in Cloud nelle Impostazioni.'}
              </TooltipContent>
            ) : null}
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Altre azioni preventivo"
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!quote.items.length}
                onClick={() => setOverlay({ kind: 'save-template' })}
              >
                Salva come template
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void controller.performRefresh()}
              >
                <RefreshCw />
                Aggiorna con valori correnti
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 py-4 md:grid-cols-2 xl:grid-cols-[150px_170px_minmax(180px,1fr)_minmax(180px,1fr)_180px]">
          <Field>
            <FieldLabel htmlFor="quote-date">Data</FieldLabel>
            <Input
              id="quote-date"
              type="date"
              value={quote.date}
              onChange={(event) => setQuoteValue({ date: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="quote-profile">Profilo</FieldLabel>
            <SelectField
              id="quote-profile"
              className={
                missingProfile ? 'ring-2 ring-primary ring-offset-2' : undefined
              }
              aria-describedby={
                missingProfile ? 'quote-profile-missing' : undefined
              }
              value={quote.profileId ?? ''}
              onValueChange={(value) => setQuoteValue({ profileId: value })}
              options={[
                { value: '', label: 'Incompleto' },
                ...doc.profiles.map((profile) => ({
                  value: profile.id,
                  label: profile.year,
                })),
              ]}
            />
            {missingProfile ? (
              <p id="quote-profile-missing" className="text-xs text-primary">
                {missingProfile.message}
              </p>
            ) : null}
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor="quote-client">Cliente</FieldLabel>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    id="quote-client"
                    className="min-w-0 w-full justify-start"
                    variant="outline"
                    onClick={() => {
                      setOverlay({ kind: 'customer' });
                      if (ficReady) void controller.searchRemoteClients('');
                    }}
                  />
                }
              >
                <UserRound />
                <span className="min-w-0 flex-1 truncate text-left">
                  {quote.client?.displayName ?? 'Scegli cliente'}
                </span>
                {quote.client ? (
                  <Badge className="ml-auto" variant="secondary">
                    FIC
                  </Badge>
                ) : null}
              </TooltipTrigger>
              {quote.client ? (
                <TooltipContent className="wrap-anywhere">
                  {quote.client.displayName}
                </TooltipContent>
              ) : null}
            </Tooltip>
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor="quote-site">Sede principale</FieldLabel>
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                <SearchableSelect
                  id="quote-site"
                  value={quote.mainSite?.sourceId ?? ''}
                  onValueChange={(value) =>
                    setQuoteValue({ mainSiteId: value })
                  }
                  options={[
                    { value: '', label: 'Nessuna' },
                    ...doc.sites
                      .filter((site) => siteMatchesClient(site, quote.client))
                      .map((site) => ({ value: site.id, label: site.name })),
                  ]}
                />
              </div>
              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Aggiungi sede"
                    disabled={!canAddSite}
                    onClick={() =>
                      setOverlay({ kind: 'site', context: siteContext })
                    }
                  >
                    <Plus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {quote.client
                    ? 'Aggiungi sede'
                    : 'Scegli prima un cliente per aggiungere una sede.'}
                </TooltipContent>
              </Tooltip>
            </div>
            {!quote.client ? (
              <p className="text-xs text-muted-foreground">
                Scegli prima un cliente per aggiungere una sede.
              </p>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="quote-commission">
              Provvigione esterna
            </FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>€</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="quote-commission"
                defaultValue={moneyInputValue(quote.commission ?? '')}
                inputMode="decimal"
                onBlur={(event) =>
                  setQuoteValue({
                    commission: decimalInputValue(event.target.value),
                  })
                }
              />
            </InputGroup>
          </Field>
        </CardContent>
      </Card>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <QuoteLayoutEditor
            key={`${doc.documentId}:${appState.archiveContext}:${quote.id}`}
            quote={quote}
            disabled={readOnly}
            hasTemplates={doc.catalog.templates.length > 0}
            onSave={controller.saveLayout}
            onAddContainer={controller.addContainer}
            onRenameContainer={controller.renameContainer}
            onDeleteContainer={controller.deleteContainer}
            onAddItem={(containerId) => {
              controller.addItem('', containerId);
            }}
            onInsertTemplate={(containerId) =>
              setOverlay({ kind: 'insert-template', containerId })
            }
            renderItem={(id, dragHandle) => {
              const item = quote.items.find((entry) => entry.id === id)!;
              return (
                <QuoteItemCard
                  key={item.id}
                  item={item}
                  hourly={hourly}
                  doc={doc}
                  actions={itemActions}
                  dragHandle={dragHandle}
                  missingTargets={missingTargets.filter(
                    (target) => target.itemId === item.id,
                  )}
                />
              );
            }}
          />
          {!quote.items.length && !quote.layout?.length ? (
            <Card>
              <CardContent className="grid min-h-64 place-items-center text-center">
                <div>
                  {doc.catalog.templates.length ? (
                    <BookOpen className="mx-auto size-9 text-muted-foreground" />
                  ) : (
                    <Wrench className="mx-auto size-9 text-muted-foreground" />
                  )}
                  <p className="mt-3 font-medium">
                    {doc.catalog.templates.length
                      ? 'Inizia da un template'
                      : 'Aggiungi la prima voce'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {doc.catalog.templates.length
                      ? 'Scegli una base pronta e personalizzala liberamente.'
                      : 'Puoi costruire il preventivo interamente a mano; i Template potranno velocizzare i lavori ricorrenti.'}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {doc.catalog.templates.length ? (
                      <Button
                        onClick={() => setOverlay({ kind: 'insert-template' })}
                      >
                        <BookOpen />
                        Inserisci template
                      </Button>
                    ) : null}
                    <Button
                      variant={
                        doc.catalog.templates.length ? 'outline' : 'default'
                      }
                      onClick={() => setOverlay({ kind: 'item' })}
                    >
                      <Plus />
                      Aggiungi voce
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {quote.items.length || quote.layout?.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={readOnly}
                  />
                }
              >
                <Plus />
                Aggiungi sezione
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {doc.catalog.templates.length ? (
                  <DropdownMenuItem
                    onClick={() => setOverlay({ kind: 'insert-template' })}
                  >
                    <BookOpen />
                    Da template
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => setOverlay({ kind: 'item' })}>
                  <Plus />
                  Sezione vuota
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        <aside className="space-y-3 xl:sticky xl:top-24">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Analisi economica</CardTitle>
                <CardDescription>
                  Riepilogo complessivo del preventivo. La provvigione resta
                  esclusa.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Analysis value={total} onShowMissing={showMissing} />
              {!hourly ? (
                <Alert>
                  <AlertTitle>Obiettivo orario non disponibile</AlertTitle>
                  <AlertDescription>
                    Associa un profilo confermato e calcolabile.
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>

      {overlay?.kind === 'site' &&
      overlay.context === siteContext &&
      quote.client ? (
        <SiteDialog
          open
          appState={appState}
          doc={doc}
          fixedClient={quote.client}
          onOpenChange={(open) => {
            if (!open) setOverlay(undefined);
          }}
        />
      ) : null}
      {overlay?.kind === 'title' ? (
        <QuoteTitleDialog
          quote={quote}
          readOnly={readOnly}
          onClose={() => setOverlay(undefined)}
          onSave={controller.renameQuote}
        />
      ) : null}
      {overlay?.kind === 'customer' ? (
        <CustomerDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              controller.cancelClientSearch();
              setOverlay(undefined);
            }
          }}
          quote={quote}
          doc={doc}
          hasToken={hasToken}
          results={controller.clientResults}
          searching={controller.searchingClients}
          searchError={controller.clientSearchError}
          hasMore={Boolean(controller.nextClientPage)}
          onLoadMore={controller.loadMoreClients}
          onSearch={controller.searchRemoteClients}
          onSelect={selectCustomer}
        />
      ) : null}
      {overlay?.kind === 'item' ? (
        <ItemNameDialog
          open
          initial={overlay.item?.name}
          title={overlay.item ? 'Rinomina voce' : 'Nuova voce commerciale'}
          onOpenChange={(open) => {
            if (!open) setOverlay(undefined);
          }}
          onSave={(name) => {
            const saved = overlay.item
              ? controller.renameItem(overlay.item.id, name)
              : controller.addItem(name, overlay.containerId);
            if (saved) setOverlay(undefined);
          }}
        />
      ) : null}
      {overlay?.kind === 'sub' && overlayItem ? (
        <SubItemDialog
          key={`${overlay.itemId}-${overlay.subId ?? overlay.initialKind}`}
          sub={overlaySub}
          initialKind={overlay.initialKind}
          doc={doc}
          appState={appState}
          defaultDestinationSiteId={quote.mainSite?.sourceId}
          onClose={() => setOverlay(undefined)}
          onSaveSimple={(input) =>
            controller.saveSimpleSub(overlay.itemId, input, overlay.subId)
          }
          onSaveTravel={(input) =>
            controller.saveTravel(overlay.itemId, input, overlay.subId)
          }
        />
      ) : null}
      {overlay?.kind === 'catalog' ? (
        <CatalogPickerDialog
          itemId={overlay.itemId}
          doc={doc}
          quote={quote}
          onClose={() => setOverlay(undefined)}
          onAdd={(item, context) =>
            controller.addReusable(overlay.itemId, item, context)
          }
        />
      ) : null}
      {overlay?.kind === 'save-sub' && overlaySub ? (
        <SaveSubDialog
          description={overlaySub.description}
          onClose={() => setOverlay(undefined)}
          onConfirm={() => {
            if (controller.saveSubToCatalog(overlay.itemId, overlay.subId))
              setOverlay(undefined);
          }}
        />
      ) : null}
      {overlay?.kind === 'variant-change' && overlayItem && overlayGroup ? (
        <VariantChangeDialog
          group={overlayGroup}
          optionId={overlay.optionId}
          doc={doc}
          quote={quote}
          hasManualChanges={overlayItem.subItems.some(
            (sub) =>
              sub.variantOwner?.groupId === overlay.groupId &&
              sub.manuallyModified,
          )}
          onClose={() => setOverlay(undefined)}
          onChange={(context, force) =>
            controller.switchVariant(
              overlay.itemId,
              overlay.groupId,
              overlay.optionId,
              context,
              force,
            )
          }
        />
      ) : null}
      {overlay?.kind === 'insert-template' ? (
        <InsertTemplateDialog
          doc={doc}
          quote={quote}
          onClose={() => setOverlay(undefined)}
          onInsert={(templateId, choices, context) =>
            controller.insertTemplate(
              templateId,
              choices,
              context,
              overlay.containerId,
            )
          }
        />
      ) : null}
      {overlay?.kind === 'save-template' ? (
        <SaveTemplateDialog
          quote={quote}
          onClose={() => setOverlay(undefined)}
          onSave={controller.saveTemplate}
        />
      ) : null}
      {overlay?.kind === 'export' && ficReady ? (
        <ExportDialog
          quote={quote}
          doc={doc}
          results={controller.clientResults}
          hasMore={Boolean(controller.nextClientPage)}
          onLoadMore={controller.loadMoreClients}
          onSearch={controller.searchRemoteClients}
          onClose={() => setOverlay(undefined)}
          onExport={controller.performExport}
          error={appState.error}
        />
      ) : null}
      <AlertDialog
        open={Boolean(pendingUpdate)}
        onOpenChange={(open) => {
          if (!open) setPendingUpdate(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Data e profilo appartengono ad anni diversi
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cash non cambia automaticamente il profilo. Puoi mantenere
              esplicitamente questa associazione senza modificare voci o prezzi
              scelti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingUpdate) controller.updateQuote(pendingUpdate, true);
                setPendingUpdate(undefined);
              }}
            >
              Mantieni associazione
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QuotesList({
  doc,
  onNew,
  onOpen,
  requestDelete,
}: {
  doc: CashDocument;
  onNew: () => void;
  onOpen: (id: string) => void;
  requestDelete: (target: DeleteTarget) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Preventivi</CardTitle>
        </div>
        <CardAction>
          <Button onClick={onNew}>
            <FilePlus2 />
            Nuovo preventivo
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {doc.quotes.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Preventivo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Voci</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...doc.quotes].reverse().map((quote) => (
                <TableRow
                  key={quote.id}
                  className="cursor-pointer"
                  onDoubleClick={() => onOpen(quote.id)}
                >
                  <TableCell className="font-medium">
                    {quoteTitle(quote)}
                  </TableCell>
                  <TableCell>{dateIt(quote.date)}</TableCell>
                  <TableCell>
                    {quote.client?.displayName ?? 'Nessun cliente'}
                  </TableCell>
                  <TableCell className="text-right">
                    {quote.items.length}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Azioni ${quoteTitle(quote)}`}
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpen(quote.id)}>
                          Apri
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            requestDelete({
                              kind: 'quote',
                              id: quote.id,
                              label: quoteTitle(quote),
                            })
                          }
                        >
                          Elimina
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="grid min-h-72 place-items-center rounded-lg border border-dashed text-center">
            <div>
              <FilePlus2 className="mx-auto size-9 text-muted-foreground" />
              <p className="mt-3 font-medium">Nessun preventivo</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Crea un workspace vuoto e aggiungi ciò che serve man mano.
              </p>
              <Button className="mt-4" onClick={onNew}>
                Nuovo preventivo
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
