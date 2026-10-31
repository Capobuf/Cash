import { DataTable } from '@/components/ui/data-table';
import { siteOptions } from '@/lib/site-options';
import {
  QuoteEmptyRow,
  type QuickKind,
} from '@/components/quotes/QuoteQuickAdd';
import type { QuoteInsertionPoint } from '@/lib/quote-insertion';
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
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { calculateQuote } from '../../domain/calculations';
import { quoteTitle } from '../../domain/quotes';
import { defaultTravelName } from '../../domain/locations';
import { type CashDocument, type QuoteItem } from '../../domain/model';
import { Analysis } from '@/components/Analysis';
import { SiteDialog } from '@/components/EntityDialogs';
import {
  CatalogPickerEditor,
  CatalogRowEditor,
  InsertTemplateEditor,
  VariantChangeDialog,
} from '@/components/quotes/CatalogInsertDialogs';
import { CustomerDialog } from '@/components/quotes/CustomerDialog';
import { ExportDialog } from '@/components/quotes/ExportDialog';
import { QuoteTitleDialog } from '@/components/quotes/QuoteTitleDialog';
import { QuoteLayoutEditor } from '@/components/quotes/QuoteLayoutEditor';
import { SaveTemplateEditor } from '@/components/quotes/CatalogSaveDialogs';
import { SubItemDialog } from '@/components/quotes/SubItemDialog';
import {
  QuoteItemRow,
  quoteColumns,
  type QuoteItemActions,
} from '@/components/quotes/QuoteItemRow';
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
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  | { kind: 'site'; context: string; siteId?: string }
  | {
      kind: 'sub';
      itemId: string;
      subId?: string;
      initialKind?: 'time' | 'expense' | 'travel';
    }
  | { kind: 'catalog'; itemId: string; replaceItem?: boolean }
  | {
      kind: 'variant-change';
      itemId: string;
      groupId: string;
      optionId: string;
    }
  | ({
      kind: 'insert-template';
      slot?: string;
      singleRow?: boolean;
    } & QuoteInsertionPoint)
  | ({ kind: 'insert-catalog'; slot?: string } & QuoteInsertionPoint)
  | { kind: 'replace-template'; itemId: string; expected: QuoteItem }
  | { kind: 'make-generic'; expected: QuoteItem }
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
  const [rowKinds, setRowKinds] = useState<Record<string, QuickKind>>({});
  const [expandedItems, setExpandedItems] = useState<Set<string>>(
    () => new Set(),
  );
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

  const expandItem = (id: string, open = true) =>
    setExpandedItems((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  const startInsertion = (
    point: QuoteInsertionPoint,
    _slot?: string,
    kind: QuickKind = 'generic',
  ) => {
    if (readOnly) return;
    const name =
      kind === 'travel'
        ? defaultTravelName(
            doc.sites.find(
              (site) => site.id === doc.settings.defaultDepartureSiteId,
            ),
            doc.sites.find((site) => site.id === quote.mainSite?.sourceId),
          )
        : '';
    if (!controller.addItem(name, point.containerId, point.afterItemId)) return;
    const item = appState
      .document!.quotes.find((entry) => entry.id === quote.id)!
      .items.at(-1)!;
    setRowKinds((current) => ({ ...current, [item.id]: kind }));
    setOverlay(undefined);
    requestAnimationFrame(() =>
      document.getElementById(`quote-name-${item.id}`)?.focus(),
    );
  };
  const appendSub = async (
    itemId: string,
    kind: 'time' | 'expense' | 'travel',
  ) => {
    if (readOnly) return;
    const id = await controller.addSubItem(itemId, kind);
    if (!id) return;
    expandItem(itemId);
    const item = appState
      .document!.quotes.find((entry) => entry.id === quote.id)!
      .items.find((entry) => entry.id === itemId)!;
    const simple =
      item.subItems.length === 1 && item.variantGroups.length === 0;
    setOverlay(
      simple && kind === 'travel'
        ? { kind: 'sub', itemId, subId: id }
        : undefined,
    );
    requestAnimationFrame(() => {
      if (simple) {
        document
          .getElementById(
            kind === 'time'
              ? `quote-duration-${itemId}`
              : kind === 'expense'
                ? `quote-expense-${itemId}`
                : `quote-name-${itemId}`,
          )
          ?.focus();
        return;
      }
      const row = document.getElementById(`quote-sub-${id}`);
      (row?.querySelector<HTMLElement>('input,button') ?? row)?.focus();
    });
  };
  const itemActions: QuoteItemActions = {
    makeGeneric: (item) => {
      if (readOnly) return;
      if (item.subItems.length || item.variantGroups.length) {
        setOverlay({ kind: 'make-generic', expected: item });
      } else {
        setRowKinds((current) => ({ ...current, [item.id]: 'generic' }));
        setOverlay(undefined);
      }
    },
    replaceWithTemplate: (item) => {
      if (readOnly) return;
      expandItem(item.id);
      setOverlay({ kind: 'replace-template', itemId: item.id, expected: item });
    },
    changeType: async (itemId, kind, expectedSub, subId) => {
      if (readOnly) return false;
      const id = await controller.changeItemType(
        itemId,
        kind,
        expectedSub,
        subId,
      );
      if (!id) return false;
      setOverlay(
        kind === 'travel' ? { kind: 'sub', itemId, subId: id } : undefined,
      );
      if (kind === 'travel' || subId) expandItem(itemId);
      return true;
    },
    duplicate: (itemId) => {
      const id = controller.duplicateItem(itemId);
      if (!id) return;
      const kind = rowKinds[itemId];
      if (kind) setRowKinds((current) => ({ ...current, [id]: kind }));
      requestAnimationFrame(() =>
        document.getElementById(`quote-name-${id}`)?.focus(),
      );
    },
    showMissing,
    clearMissing: () => setAnalysisNavigation(undefined),
    rename: controller.renameItem,
    saveSimpleSub: controller.saveSimpleSub,
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
    editSub: (itemId, subId) => {
      expandItem(itemId);
      const sub = quote.items
        .find((entry) => entry.id === itemId)
        ?.subItems.find((entry) => entry.id === subId);
      if (!subId || sub?.kind === 'travel')
        setOverlay({ kind: 'sub', itemId, subId, initialKind: 'travel' });
      else
        requestAnimationFrame(() =>
          document.getElementById(`quote-sub-description-${subId}`)?.focus(),
        );
    },
    saveSub: (itemId, subId) => {
      controller.saveSubToCatalog(itemId, subId);
    },
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
    addSub: (itemId, initialKind) => {
      void appendSub(itemId, initialKind);
    },
    addCatalog: (itemId) => {
      expandItem(itemId);
      setOverlay({ kind: 'catalog', itemId });
    },
    changeKind: async (itemId, kind) => {
      if (readOnly) return;
      if (kind === 'catalog') {
        expandItem(itemId);
        setOverlay({ kind: 'catalog', itemId, replaceItem: true });
        return;
      }
      if (!(await controller.changeItemKind(itemId, kind))) return;
      setRowKinds((current) => ({ ...current, [itemId]: kind }));
      setOverlay(undefined);
      if (kind === 'travel') {
        const sub = appState.document?.quotes
          .find((entry) => entry.id === quote.id)
          ?.items.find((entry) => entry.id === itemId)?.subItems[0];
        if (sub) {
          expandItem(itemId);
          setOverlay({ kind: 'sub', itemId, subId: sub.id });
        }
      } else {
        expandItem(itemId, false);
        requestAnimationFrame(() =>
          document.getElementById(`quote-name-${itemId}`)?.focus(),
        );
      }
    },
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
            <Button
              disabled={readOnly}
              onClick={() => setOverlay({ kind: 'insert-template' })}
            >
              <BookOpen />
              Inserisci template
            </Button>
          ) : null}
          <Button
            variant={doc.catalog.templates.length ? 'outline' : 'default'}
            disabled={readOnly}
            onClick={() => startInsertion({})}
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
            <DropdownMenuContent align="end" className="w-auto min-w-0">
              <DropdownMenuItem
                className="size-8 justify-center p-0"
                aria-label="Salva come template"
                title="Salva come template"
                disabled={!quote.items.length}
                onClick={() => setOverlay({ kind: 'save-template' })}
              >
                <BookOpen />
              </DropdownMenuItem>
              <DropdownMenuItem
                className="size-8 justify-center p-0"
                aria-label="Aggiorna con valori correnti"
                title="Aggiorna con valori correnti"
                onClick={() => void controller.performRefresh()}
              >
                <RefreshCw />
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
                  disabled={readOnly}
                  onEditOption={(option) =>
                    setOverlay({
                      kind: 'site',
                      context: siteContext,
                      siteId: option.value,
                    })
                  }
                  value={quote.mainSite?.sourceId ?? ''}
                  onValueChange={(value) =>
                    setQuoteValue({ mainSiteId: value })
                  }
                  options={[
                    { value: '', label: 'Nessuna' },
                    ...siteOptions(doc.sites, quote.client),
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
          <div className="col-span-full">
            {overlay?.kind === 'site' &&
            overlay.context === siteContext &&
            (quote.client || overlay.siteId) ? (
              <SiteDialog
                inline={!overlay.siteId}
                open
                appState={appState}
                doc={doc}
                site={doc.sites.find((site) => site.id === overlay.siteId)}
                fixedClient={overlay.siteId ? undefined : quote.client}
                onOpenChange={(open) => {
                  if (!open) setOverlay(undefined);
                }}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>
      <div className="min-w-0 space-y-3">
        <QuoteLayoutEditor
          key={`${doc.documentId}:${appState.archiveContext}:${quote.id}`}
          quote={quote}
          disabled={readOnly}
          hasTemplates={doc.catalog.templates.length > 0}
          onInsertRow={startInsertion}
          onSave={controller.saveLayout}
          onAddContainer={controller.addContainer}
          onRenameContainer={controller.renameContainer}
          onDeleteContainer={controller.deleteContainer}
          onInsertTemplate={(point, slot) =>
            setOverlay({ kind: 'insert-template', ...point, slot })
          }
          renderInsertion={(point, onClose, slot) => {
            const insertion =
              (overlay?.kind === 'insert-template' ||
                overlay?.kind === 'insert-catalog') &&
              (overlay.slot
                ? overlay.slot === slot
                : overlay.containerId === point.containerId &&
                  overlay.afterItemId === point.afterItemId)
                ? overlay
                : undefined;
            const close = () => {
              setOverlay(undefined);
              onClose?.();
            };
            const focusNewItem = () => {
              const id = appState.document?.quotes
                .find((entry) => entry.id === quote.id)
                ?.items.at(-1)?.id;
              if (id)
                requestAnimationFrame(() =>
                  document.getElementById(`quote-name-${id}`)?.focus(),
                );
            };
            if (insertion?.kind === 'insert-template')
              return (
                <div role="row">
                  <div role="cell" aria-colspan={7}>
                    <InsertTemplateEditor
                      key={`${point.containerId ?? 'root'}:${point.afterItemId ?? 'end'}`}
                      doc={doc}
                      quote={quote}
                      disabled={readOnly}
                      singleRow={insertion.singleRow}
                      onClose={close}
                      onInsert={async (templateId, choices, context) => {
                        const saved = await controller.insertTemplate(
                          templateId,
                          choices,
                          context,
                          point.containerId,
                          point.afterItemId,
                          undefined,
                          insertion.singleRow,
                        );
                        if (saved) focusNewItem();
                        return saved;
                      }}
                    />
                  </div>
                </div>
              );
            if (insertion?.kind === 'insert-catalog')
              return (
                <CatalogPickerEditor
                  key={slot}
                  itemId={`new-${slot}`}
                  doc={doc}
                  quote={quote}
                  disabled={readOnly}
                  onClose={close}
                  onAdd={async (entry, context) => {
                    const saved = await controller.addReusable(
                      point,
                      entry,
                      context,
                    );
                    if (saved) focusNewItem();
                    return saved;
                  }}
                />
              );
            return slot?.startsWith('after-') ? null : (
              <QuoteEmptyRow
                className={quoteColumns}
                disabled={readOnly}
                hasTemplates={doc.catalog.templates.length > 0}
                hasCatalog={doc.catalog.subItems.length > 0}
                onSelect={(kind) => {
                  if (kind === 'template')
                    setOverlay({
                      kind: 'insert-template',
                      ...point,
                      slot,
                      singleRow: true,
                    });
                  else if (kind === 'catalog')
                    setOverlay({ kind: 'insert-catalog', ...point, slot });
                  else startInsertion(point, slot, kind);
                }}
              />
            );
          }}
          renderItem={(id, dragProps, onInsertAfter, onInsertTemplateAfter) => {
            const item = quote.items.find((entry) => entry.id === id)!;
            return (
              <QuoteItemRow
                key={item.id}
                item={item}
                emptyKind={rowKinds[id]}
                hourly={hourly}
                doc={doc}
                actions={itemActions}
                expanded={expandedItems.has(id)}
                onExpandedChange={(open) => expandItem(id, open)}
                editor={
                  overlay?.kind === 'sub' && overlay.itemId === id ? (
                    <SubItemDialog
                      inline
                      disabled={readOnly}
                      key={`${overlay.itemId}-${overlay.subId ?? overlay.initialKind}-${overlaySub?.kind}`}
                      sub={overlaySub}
                      initialKind={overlay.initialKind}
                      doc={doc}
                      appState={appState}
                      defaultDestinationSiteId={quote.mainSite?.sourceId}
                      client={quote.client}
                      initialDescription={item.name}
                      onClose={() => setOverlay(undefined)}
                      onSaveSimple={(input) =>
                        controller.saveSimpleSub(
                          overlay.itemId,
                          input,
                          overlay.subId,
                        )
                      }
                      onSaveTravel={(input) =>
                        controller.saveTravel(
                          overlay.itemId,
                          input,
                          overlay.subId,
                        )
                      }
                    />
                  ) : overlay?.kind === 'replace-template' &&
                    overlay.itemId === id ? (
                    <InsertTemplateEditor
                      key={`replace-${item.id}`}
                      replaceItem
                      disabled={readOnly}
                      doc={doc}
                      quote={quote}
                      onClose={() => setOverlay(undefined)}
                      onInsert={async (templateId, choices, context) => {
                        const saved = await controller.insertTemplate(
                          templateId,
                          choices,
                          context,
                          undefined,
                          undefined,
                          overlay.expected,
                        );
                        if (saved)
                          setRowKinds((current) => {
                            const next = { ...current };
                            delete next[item.id];
                            return next;
                          });
                        return saved;
                      }}
                    />
                  ) : overlay?.kind === 'catalog' && overlay.itemId === id ? (
                    overlay.replaceItem ? (
                      <CatalogRowEditor
                        disabled={readOnly}
                        itemId={overlay.itemId}
                        doc={doc}
                        quote={quote}
                        onClose={() => setOverlay(undefined)}
                        onAdd={async (entry, context) => {
                          const replaced = await controller.addReusable(
                            overlay.itemId,
                            entry,
                            context,
                            true,
                          );
                          if (replaced) expandItem(overlay.itemId, false);
                          return replaced;
                        }}
                        onTemplate={async (templateId, choices, context) => {
                          const replaced = await controller.applyTemplateToItem(
                            overlay.itemId,
                            templateId,
                            choices,
                            context,
                          );
                          if (replaced) expandItem(overlay.itemId, false);
                          return replaced;
                        }}
                      />
                    ) : (
                      <CatalogPickerEditor
                        disabled={readOnly}
                        itemId={overlay.itemId}
                        doc={doc}
                        quote={quote}
                        onClose={() => setOverlay(undefined)}
                        onAdd={(entry, context) =>
                          controller.addReusable(overlay.itemId, entry, context)
                        }
                      />
                    )
                  ) : undefined
                }
                dragProps={dragProps}
                disabled={readOnly}
                onInsertAfter={onInsertAfter}
                onInsertTemplateAfter={onInsertTemplateAfter}
                missingTargets={missingTargets.filter(
                  (target) => target.itemId === item.id,
                )}
              />
            );
          }}
        />
        {overlay?.kind === 'save-template' ? (
          <SaveTemplateEditor
            disabled={readOnly}
            quote={quote}
            onClose={() => setOverlay(undefined)}
            onSave={controller.saveTemplate}
          />
        ) : null}
        <Analysis totals value={total} onShowMissing={showMissing} />
        {!hourly ? (
          <p className="px-4 text-xs text-muted-foreground">
            Obiettivo orario non disponibile. Associa un profilo confermato e
            calcolabile.
          </p>
        ) : null}
      </div>

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
        open={overlay?.kind === 'make-generic'}
        onOpenChange={(open) => {
          if (!open) setOverlay(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convertire in riga generica?</AlertDialogTitle>
            <AlertDialogDescription>
              Tutte le sottorighe, con le loro descrizioni e i dati di attività,
              spese e trasferte, e tutte le varianti verranno rimosse. Il nome
              della riga, la posizione e il prezzo scelto resteranno invariati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={readOnly}
              onClick={() => {
                if (
                  overlay?.kind === 'make-generic' &&
                  controller.makeItemGeneric(overlay.expected)
                ) {
                  setRowKinds((current) => ({
                    ...current,
                    [overlay.expected.id]: 'generic',
                  }));
                  setOverlay(undefined);
                }
              }}
            >
              Converti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
          <DataTable
            preferencesKey="quotes"
            data={[...doc.quotes].reverse()}
            getRowKey={(quote) => quote.id}
            emptyMessage="Nessun risultato."
            onRowClick={(quote) => onOpen(quote.id)}
            getRowAriaLabel={(quote) => `Apri ${quoteTitle(quote)}`}
            columns={[
              {
                id: 'title',
                header: 'Preventivo',
                value: (quote) => quoteTitle(quote),
                className: 'font-medium',
                cell: (quote) => quoteTitle(quote),
              },
              {
                id: 'date',
                header: 'Data',
                value: (quote) => quote.date,
                cell: (quote) => dateIt(quote.date),
              },
              {
                id: 'client',
                header: 'Cliente',
                value: (quote) => quote.client?.displayName ?? 'Nessun cliente',
                cell: (quote) => quote.client?.displayName ?? 'Nessun cliente',
              },
              {
                id: 'items',
                header: 'Voci',
                value: (quote) => quote.items.length,
                headClassName: 'text-right',
                className: 'text-right',
                cell: (quote) => quote.items.length,
              },
              {
                id: 'actions',
                header: 'Azioni',
                value: () => undefined,
                sortable: false,
                configurable: false,
                cell: (quote) => (
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
                        <Trash2 />
                        Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ),
              },
            ]}
          />
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
