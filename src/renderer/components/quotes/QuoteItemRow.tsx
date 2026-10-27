import { SelectField } from '@/components/ui/selection-field';
import {
  BookOpen,
  Pencil,
  ChevronDown,
  ListChecks,
  Route,
  MoreHorizontal,
  Plus,
  ReceiptEuro,
  Trash2,
  ListTree,
  GitBranch,
  Text,
  AlertCircle,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { calculateItem } from '../../../domain/calculations';
import { canReuseQuoteSubItem } from '../../../domain/catalog';
import { parseDecimalInput } from '../../../domain/decimal';
import { parseDuration } from '../../../domain/duration';
import type {
  CashDocument,
  QuoteItem,
  QuoteSubItem,
  VariantGroup,
} from '../../../domain/model';
import type { SimpleSubInput } from '@/hooks/use-quote-controller';
import { PartialBadge } from '@/components/PartialBadge';
import type {
  MissingAnalysisTarget,
  PartialMetric,
} from '@/lib/quote-analysis-navigation';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { decimalInputValue, eur, hours, moneyInputValue } from '@/lib/format';
import type { DeleteTarget } from '../../types';
import { InlineQuoteInput } from './InlineQuoteInput';
import type { QuickKind } from './QuoteQuickAdd';

export const quoteColumns =
  'grid grid-cols-[88px_minmax(260px,1fr)_90px_100px_120px_120px_72px] items-center gap-1 px-2';

export function QuoteTableHeader() {
  return (
    <div
      role="row"
      className={`${quoteColumns} min-h-10 border-b bg-muted/50 text-xs font-medium text-muted-foreground`}
    >
      {[
        'Controlli e tipo',
        'Descrizione',
        'Tempo',
        'Spese (€)',
        'Valore teorico',
        'Prezzo scelto (€)',
        'Azioni',
      ].map((label, index) => (
        <div
          key={label}
          role="columnheader"
          className={index > 1 && index < 6 ? 'text-right' : undefined}
        >
          <span className={index === 0 || index === 6 ? 'sr-only' : undefined}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

interface VariantControlProps {
  group: VariantGroup;
  id: string;
  value: string;
  disabled: boolean;
  onValueChange: (value: string) => void;
}

export function QuoteVariantSelect({
  group,
  id,
  value,
  disabled,
  onValueChange,
}: VariantControlProps) {
  return (
    <div
      className="w-[45%] max-w-48 min-w-0 shrink-0"
      title={`Variante · ${group.name}`}
    >
      <label id={`${id}-label`} htmlFor={id} className="sr-only">
        Variante · {group.name}
      </label>
      <SelectField
        id={id}
        className="h-8 w-full min-w-0"
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
        options={[
          { value: '', label: 'Scegli variante', disabled: true },
          ...group.options.map((option) => ({
            value: option.id,
            label: option.name,
          })),
        ]}
      />
    </div>
  );
}

// An empty option still has a selectable row; generated values never live here.
export function QuoteVariantRow(props: VariantControlProps) {
  return (
    <div
      role="row"
      data-quote-variant-selector={props.group.id}
      className={`${quoteColumns} min-h-10 border-b bg-primary/5 py-1`}
    >
      <div
        role="cell"
        className="flex h-full items-center justify-end border-r-2 border-primary/40 pr-3"
      >
        <GitBranch className="size-3.5 text-muted-foreground" />
      </div>
      <div role="cell" className="flex min-w-0 items-center gap-2 pl-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {props.value ? 'Nessuna sottoriga' : 'Scegli una variante'}
        </span>
        <QuoteVariantSelect {...props} />
      </div>
      <div role="cell" className="text-right text-sm text-muted-foreground" />
      <div role="cell" className="text-right text-sm text-muted-foreground" />
      <div role="cell" className="text-right text-sm text-muted-foreground" />
      <div role="cell" className="text-right text-sm text-muted-foreground" />
      <div role="cell" />
    </div>
  );
}

export interface QuoteItemActions {
  showMissing?: (metric: PartialMetric, itemId?: string) => void;
  clearMissing?: () => void;
  rename: (itemId: string, name: string) => boolean;
  updateChosenPrice: (itemId: string, value: string) => boolean;
  previewChosenPrice?: (itemId: string, value: string | undefined) => void;
  saveSimpleSub: (
    itemId: string,
    input: SimpleSubInput,
    subId?: string,
  ) => boolean;
  editSub: (itemId: string, subId: string) => void;
  saveSub: (itemId: string, subId: string) => void;
  changeVariant: (
    itemId: string,
    group: VariantGroup,
    optionId: string,
  ) => void;
  addSub: (itemId: string, kind: 'time' | 'expense' | 'travel') => void;
  addCatalog: (itemId: string) => void;
  requestDelete: (target: DeleteTarget) => void;
}

export function QuoteItemRow({
  item,
  emptyKind,
  hourly,
  doc,
  actions,
  missingTargets = [],
  dragHandle,
  disabled = false,
  onInsertAfter,
  onInsertTemplateAfter,
  editor,
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  item: QuoteItem;
  emptyKind?: QuickKind;
  hourly?: string;
  doc: CashDocument;
  actions: QuoteItemActions;
  missingTargets?: MissingAnalysisTarget[];
  dragHandle?: ReactNode;
  disabled?: boolean;
  onInsertAfter?: () => void;
  onInsertTemplateAfter?: () => void;
  editor?: ReactNode;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
}) {
  const analysis = calculateItem(item, hourly);
  const displayName = item.name.trim() || 'Voce senza nome';
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const setExpanded = (open: boolean) => {
    setLocalExpanded(open);
    onExpandedChange?.(open);
  };
  const missingPrice = missingTargets.find(
    (target) => target.id === `chosen-${item.id}`,
  );
  const missingTechnical = missingTargets.find(
    (target) => target.id === `quote-technical-${item.id}`,
  );
  const revealTechnical = missingTargets.some(
    (target) => target.id !== `chosen-${item.id}`,
  );
  const simple = item.variantGroups.length === 0 && item.subItems.length <= 1;
  const sub = simple ? item.subItems[0] : undefined;
  const kind =
    sub?.kind ??
    (!item.subItems.length && !item.variantGroups.length
      ? emptyKind
      : undefined);
  const Icon =
    kind === 'time'
      ? ListChecks
      : kind === 'expense'
        ? ReceiptEuro
        : kind === 'travel'
          ? Route
          : item.subItems.length || item.variantGroups.length
            ? ListTree
            : Text;
  const typeLabel =
    kind === 'time'
      ? 'Attività'
      : kind === 'expense'
        ? 'Spesa'
        : kind === 'travel'
          ? 'Trasferta'
          : item.subItems.length || item.variantGroups.length
            ? 'Voce complessa'
            : 'Riga generica';
  const saveDuration = (value: string) => {
    const parsed = value.trim() ? parseDuration(value) : undefined;
    return (
      (!parsed || parsed.ok) &&
      actions.saveSimpleSub(
        item.id,
        {
          kind: 'time',
          description: sub?.description || item.name,
          minutes: parsed?.ok ? parsed.value : undefined,
        },
        sub?.id,
      )
    );
  };
  const hasChildren = item.subItems.length > 0 || item.variantGroups.length > 0;
  const emptyGroups = item.variantGroups.filter(
    (group) =>
      !item.subItems.some((entry) => entry.variantOwner?.groupId === group.id),
  );
  return (
    <Collapsible
      open={expanded || revealTechnical || Boolean(editor)}
      onOpenChange={(open) => {
        setExpanded(open);
        if (!open) actions.clearMissing?.();
      }}
    >
      <div
        role="row"
        data-quote-parent={hasChildren || undefined}
        className={`${quoteColumns} min-h-12 border-b ${hasChildren ? 'bg-primary/8 ring-1 ring-inset ring-primary/20 hover:bg-primary/12' : 'hover:bg-muted/30'}`}
      >
        <div role="cell" className="flex items-center gap-1">
          {dragHandle}
          <span title={typeLabel} aria-label={typeLabel}>
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Apri o chiudi ${displayName}`}
                className="group"
              />
            }
          >
            <ChevronDown className="size-3 transition-transform group-data-panel-open:rotate-180" />
          </CollapsibleTrigger>
        </div>
        <div
          role="cell"
          className={`flex min-w-0 items-center ${hasChildren ? '[&_input]:font-medium' : ''}`}
        >
          <InlineQuoteInput
            id={`quote-name-${item.id}`}
            label={`Nome voce ${displayName}`}
            value={item.name}
            placeholder="Nome del lavoro"
            disabled={disabled}
            onCommit={(name) => actions.rename(item.id, name)}
          />
          {analysis.blockers.length ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground"
              aria-label={`Mostra dati mancanti di ${displayName}`}
              title={analysis.blockers.join(' ')}
              onClick={() => actions.showMissing?.('theoretical', item.id)}
            >
              <AlertCircle />
            </Button>
          ) : null}
        </div>
        <div role="cell" className="text-right text-sm tabular-nums">
          {simple && (!sub || sub.kind === 'time') ? (
            <InlineQuoteInput
              alignRight
              label={`Durata di ${displayName}`}
              value={
                sub?.kind === 'time' && sub.minutes !== undefined
                  ? hours(sub.minutes)
                  : ''
              }
              disabled={disabled}
              onCommit={saveDuration}
            />
          ) : analysis.minutes === undefined ? (
            ''
          ) : (
            hours(analysis.minutes)
          )}
        </div>
        <div role="cell" className="text-right text-sm tabular-nums">
          {simple && (!sub || sub.kind === 'expense') ? (
            <InlineQuoteInput
              label={`Spese di ${displayName}`}
              value={sub?.kind === 'expense' ? moneyInputValue(sub.amount) : ''}
              decimal
              disabled={disabled}
              onCommit={(amount) =>
                actions.saveSimpleSub(
                  item.id,
                  {
                    kind: 'expense',
                    description: sub?.description || item.name,
                    amount,
                  },
                  sub?.id,
                )
              }
            />
          ) : analysis.expenses === undefined ? (
            ''
          ) : (
            eur(analysis.expenses)
          )}
        </div>
        <div
          role="cell"
          aria-label="Valore teorico"
          className="flex flex-wrap items-center justify-end gap-x-1 text-right text-sm tabular-nums"
        >
          {analysis.theoreticalValue === undefined
            ? ''
            : eur(analysis.theoreticalValue)}
          {analysis.theoreticalPartial ? (
            <PartialBadge
              label={`Valore teorico di ${displayName}`}
              onClick={() => actions.showMissing?.('theoretical', item.id)}
            />
          ) : null}
        </div>
        <div
          role="cell"
          className={missingPrice ? 'rounded ring-2 ring-primary' : undefined}
        >
          <InlineQuoteInput
            id={`chosen-${item.id}`}
            label={`Prezzo scelto di ${displayName}`}
            value={moneyInputValue(item.chosenPrice ?? '')}
            decimal
            disabled={disabled}
            describedBy={missingPrice ? `chosen-missing-${item.id}` : undefined}
            onPreview={(value) => {
              const input = decimalInputValue(value);
              const parsed = input.trim()
                ? parseDecimalInput(input, 2)
                : undefined;
              if (!parsed || parsed.ok)
                actions.previewChosenPrice?.(item.id, parsed?.value);
            }}
            onCommit={(value) =>
              actions.updateChosenPrice(item.id, decimalInputValue(value))
            }
          />
          {missingPrice ? (
            <p id={`chosen-missing-${item.id}`} className="sr-only">
              {missingPrice.message}
            </p>
          ) : null}
        </div>
        <div role="cell" className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={`Aggiungi sottoriga a ${displayName}`}
                  title="Aggiungi sottoriga"
                />
              }
            >
              <Plus />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(
                [
                  ['time', 'Attività', ListChecks],
                  ['expense', 'Spesa', ReceiptEuro],
                  ['travel', 'Trasferta', Route],
                ] as const
              ).map(([kind, label, SubIcon]) => (
                <DropdownMenuItem
                  key={kind}
                  onClick={() => {
                    setExpanded(true);
                    actions.addSub(item.id, kind);
                  }}
                >
                  <SubIcon />
                  {label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!doc.catalog.subItems.length}
                onClick={() => {
                  setExpanded(true);
                  actions.addCatalog(item.id);
                }}
              >
                <BookOpen />
                Dal catalogo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={`Azioni voce ${displayName}`}
                  title="Azioni della riga"
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-0">
              <DropdownMenuItem
                className="size-8 justify-center p-0"
                aria-label={`Inserisci dopo ${displayName}`}
                title="Inserisci nuova riga"
                onClick={onInsertAfter}
              >
                <Plus />
              </DropdownMenuItem>
              {onInsertTemplateAfter ? (
                <DropdownMenuItem
                  className="size-8 justify-center p-0"
                  aria-label={`Inserisci template dopo ${displayName}`}
                  title="Inserisci template dopo"
                  disabled={!doc.catalog.templates.length}
                  onClick={onInsertTemplateAfter}
                >
                  <BookOpen />
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="size-8 justify-center p-0"
                aria-label={`Elimina ${displayName}`}
                title="Elimina riga"
                onClick={() =>
                  actions.requestDelete({
                    kind: 'item',
                    id: item.id,
                    label: displayName,
                  })
                }
              >
                <Trash2 />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <CollapsibleContent
        role="rowgroup"
        id={`quote-technical-${item.id}`}
        tabIndex={-1}
        className={
          missingTechnical
            ? 'outline-none ring-2 ring-inset ring-primary'
            : 'outline-none'
        }
      >
        {missingTechnical ? (
          <div role="row">
            <div
              role="cell"
              aria-colspan={7}
              className="px-3 py-2 text-xs text-primary"
            >
              {missingTechnical.message}
            </div>
          </div>
        ) : null}
        {emptyGroups.map((group) => (
          <QuoteVariantRow
            key={group.id}
            group={group}
            id={`variant-${item.id}-${group.id}`}
            disabled={disabled}
            value={
              item.variantSelections.find((entry) => entry.groupId === group.id)
                ?.optionId ?? ''
            }
            onValueChange={(value) =>
              actions.changeVariant(item.id, group, value)
            }
          />
        ))}
        {item.subItems.map((sub) => {
          const subName =
            sub.description.trim() ||
            (sub.kind === 'time'
              ? 'Attività senza descrizione'
              : sub.kind === 'expense'
                ? 'Spesa senza descrizione'
                : 'Trasferta');
          const group = item.variantGroups.find(
            (entry) => entry.id === sub.variantOwner?.groupId,
          );
          const firstFromGroup =
            group &&
            item.subItems.find(
              (entry) => entry.variantOwner?.groupId === group.id,
            )?.id === sub.id;
          const missing = missingTargets.find(
            (target) => target.id === `quote-sub-${sub.id}`,
          );
          return (
            <QuoteSubRow
              key={sub.id}
              item={item}
              sub={sub}
              hourly={hourly}
              disabled={disabled}
              missing={missing?.message}
              note={variantNote(item, sub)}
              variantControl={
                group && firstFromGroup ? (
                  <QuoteVariantSelect
                    group={group}
                    id={`variant-${item.id}-${group.id}`}
                    disabled={disabled}
                    value={
                      item.variantSelections.find(
                        (entry) => entry.groupId === group.id,
                      )?.optionId ?? ''
                    }
                    onValueChange={(value) =>
                      actions.changeVariant(item.id, group, value)
                    }
                  />
                ) : undefined
              }
              onSave={(input) => actions.saveSimpleSub(item.id, input, sub.id)}
              onClick={() => actions.editSub(item.id, sub.id)}
              action={
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        disabled={disabled}
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Azioni per ${subName}`}
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-auto min-w-0">
                    <DropdownMenuItem
                      className="size-8 justify-center p-0"
                      aria-label={`Modifica ${subName}`}
                      title="Modifica sottoriga"
                      onClick={() => actions.editSub(item.id, sub.id)}
                    >
                      <Pencil />
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="size-8 justify-center p-0"
                      aria-label={`Salva nel catalogo ${subName}`}
                      title="Salva nel catalogo"
                      disabled={!canReuseQuoteSubItem(sub)}
                      onClick={() => actions.saveSub(item.id, sub.id)}
                    >
                      <BookOpen />
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      className="size-8 justify-center p-0"
                      aria-label={`Elimina sottoriga ${subName}`}
                      title="Elimina sottoriga"
                      onClick={() =>
                        actions.requestDelete({
                          kind: 'sub',
                          id: `${item.id}:${sub.id}`,
                          label: subName,
                        })
                      }
                    >
                      <Trash2 />
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          );
        })}
        {editor}
        {!item.subItems.length && !editor ? (
          <div role="row">
            <div
              role="cell"
              aria-colspan={7}
              className="px-6 py-2 text-xs text-muted-foreground"
            >
              Nessuna sottoriga. Usa + per aggiungere attività e costi.
            </div>
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function QuoteSubRow({
  item,
  sub,
  hourly,
  note,
  missing,
  disabled,
  onSave,
  onClick,
  action,
  variantControl,
}: {
  item: QuoteItem;
  sub: QuoteSubItem;
  hourly?: string;
  note?: string;
  missing?: string;
  disabled: boolean;
  onSave: (input: SimpleSubInput) => boolean;
  onClick: () => void;
  action: ReactNode;
  variantControl?: ReactNode;
}) {
  const analysis = calculateItem(
    { ...item, subItems: [sub], chosenPrice: undefined },
    hourly,
  );
  const Icon =
    sub.kind === 'time'
      ? ListChecks
      : sub.kind === 'expense'
        ? ReceiptEuro
        : Route;
  return (
    <div
      role="row"
      id={`quote-sub-${sub.id}`}
      tabIndex={-1}
      data-quote-sub={sub.id}
      data-quote-variant={sub.variantOwner?.groupId}
      data-quote-variant-selector={
        variantControl ? sub.variantOwner?.groupId : undefined
      }
      aria-describedby={
        sub.variantOwner
          ? `variant-${item.id}-${sub.variantOwner.groupId}-label`
          : undefined
      }
      className={`${quoteColumns} min-h-10 border-b bg-muted/15 outline-none hover:bg-muted/30 ${missing ? 'ring-2 ring-inset ring-primary' : ''}`}
    >
      <div
        role="cell"
        className={`flex h-full items-center justify-end pr-3 ${sub.variantOwner ? 'border-r-2 border-primary/40' : 'border-r border-border/60'}`}
      >
        {sub.variantOwner ? (
          <GitBranch className="mr-2 size-3.5 text-muted-foreground" />
        ) : null}
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <div role="cell" className="min-w-0 pl-2" title={note}>
        <div className="flex min-w-0 items-center gap-2">
          {sub.kind === 'travel' ? (
            <Button
              disabled={disabled}
              variant="ghost"
              size="sm"
              className="h-auto w-full justify-start whitespace-normal text-left"
              onClick={onClick}
            >
              {sub.description || 'Configura trasferta'}
            </Button>
          ) : (
            <InlineQuoteInput
              id={`quote-sub-description-${sub.id}`}
              label={`Descrizione ${sub.description}`}
              placeholder="Descrizione sottoriga"
              value={sub.description}
              disabled={disabled}
              onCommit={(description) => onSave({ ...sub, description })}
            />
          )}
          {variantControl}
          {sub.manuallyModified ? (
            <span className="sr-only">Modificata manualmente</span>
          ) : null}
        </div>
        {missing ? (
          <p className="px-3 pb-1 text-xs text-primary">{missing}</p>
        ) : null}
      </div>
      <div role="cell" className="text-right text-sm tabular-nums">
        {sub.kind === 'time' ? (
          <InlineQuoteInput
            label={`Durata ${sub.description}`}
            value={sub.minutes === undefined ? '' : hours(sub.minutes)}
            alignRight
            disabled={disabled}
            onCommit={(value) => {
              const duration = value.trim() ? parseDuration(value) : undefined;
              return (
                (!duration || duration.ok) &&
                onSave({
                  ...sub,
                  minutes: duration?.ok ? duration.value : undefined,
                })
              );
            }}
          />
        ) : analysis.minutes === undefined ? (
          ''
        ) : (
          hours(analysis.minutes)
        )}
      </div>
      <div role="cell" className="text-right text-sm tabular-nums">
        {sub.kind === 'expense' ? (
          <InlineQuoteInput
            label={`Importo ${sub.description}`}
            value={moneyInputValue(sub.amount)}
            decimal
            disabled={disabled}
            onCommit={(amount) => onSave({ ...sub, amount })}
          />
        ) : analysis.expenses === undefined ? (
          ''
        ) : (
          eur(analysis.expenses)
        )}
      </div>
      <div
        role="cell"
        className="flex flex-wrap items-center justify-end gap-x-1 text-right text-sm tabular-nums"
      >
        {analysis.theoreticalValue === undefined
          ? ''
          : eur(analysis.theoreticalValue)}
        {analysis.theoreticalPartial ? (
          <span
            className="ml-1 text-xs text-muted-foreground"
            title={analysis.blockers.join(' ')}
          >
            parziale
          </span>
        ) : null}
      </div>
      <div role="cell" className="text-right text-sm text-muted-foreground" />
      <div role="cell" className="flex justify-end">
        {action}
      </div>
    </div>
  );
}

function variantNote(item: QuoteItem, sub: QuoteSubItem): string | undefined {
  if (!sub.variantOwner) return undefined;
  const group = item.variantGroups.find(
    (entry) => entry.id === sub.variantOwner?.groupId,
  );
  const option = group?.options.find(
    (entry) => entry.id === sub.variantOwner?.optionId,
  );
  const source = [group?.name, option?.name].filter(Boolean).join(' · ');
  return `${source || 'Prodotta da variante'}${sub.manuallyModified ? ' · modificata manualmente' : ''}`;
}
