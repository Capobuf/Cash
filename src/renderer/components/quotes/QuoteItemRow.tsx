import { SearchableSelect } from '@/components/ui/selection-field';
import {
  BriefcaseBusiness,
  ChevronDown,
  Clock3,
  MapPin,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Trash2,
  Layers3,
  Minus,
  AlertCircle,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { calculateItem } from '../../../domain/calculations';
import { parseDecimalInput } from '../../../domain/decimal';
import { parseDuration } from '../../../domain/duration';
import type {
  CashDocument,
  QuoteItem,
  QuoteSubItem,
  VariantGroup,
} from '../../../domain/model';
import type { SimpleSubInput } from '@/hooks/use-quote-controller';
import { WorkItemRow } from '@/components/WorkItemRow';
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
import { Separator } from '@/components/ui/separator';
import { decimalInputValue, eur, hours, moneyInputValue } from '@/lib/format';
import type { DeleteTarget } from '../../types';
import { InlineQuoteInput } from './InlineQuoteInput';

export const quoteColumns =
  'grid grid-cols-[76px_minmax(180px,1fr)_90px_110px_120px_120px_72px] items-center gap-1 px-2';

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
  hourly,
  doc,
  actions,
  missingTargets = [],
  dragHandle,
  disabled = false,
  onInsertAfter,
}: {
  item: QuoteItem;
  hourly?: string;
  doc: CashDocument;
  actions: QuoteItemActions;
  missingTargets?: MissingAnalysisTarget[];
  dragHandle?: ReactNode;
  disabled?: boolean;
  onInsertAfter?: () => void;
}) {
  const analysis = calculateItem(item, hourly);
  const displayName = item.name.trim() || 'Voce senza nome';
  const [expanded, setExpanded] = useState(false);
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
  const Icon =
    sub?.kind === 'time'
      ? Clock3
      : sub?.kind === 'expense'
        ? ReceiptText
        : sub?.kind === 'travel'
          ? MapPin
          : item.subItems.length || item.variantGroups.length
            ? Layers3
            : Minus;
  const typeLabel =
    sub?.kind === 'time'
      ? 'Attività'
      : sub?.kind === 'expense'
        ? 'Spesa'
        : sub?.kind === 'travel'
          ? 'Trasferta'
          : item.subItems.length || item.variantGroups.length
            ? 'Voce complessa'
            : 'Voce da configurare';
  const saveDuration = (value: string) => {
    const parsed = parseDuration(value);
    return (
      parsed.ok &&
      actions.saveSimpleSub(
        item.id,
        {
          kind: 'time',
          description: sub?.description || item.name || 'Attività',
          minutes: parsed.value,
        },
        sub?.id,
      )
    );
  };
  return (
    <Collapsible
      open={expanded || revealTechnical}
      onOpenChange={(open) => {
        setExpanded(open);
        if (!open) actions.clearMissing?.();
      }}
    >
      <div
        role="row"
        className={`${quoteColumns} min-h-12 border-b hover:bg-muted/30`}
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
        <div role="cell" className="flex min-w-0 items-center">
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
              label={`Durata di ${displayName}`}
              value={sub?.kind === 'time' ? hours(sub.minutes) : ''}
              placeholder="—"
              disabled={disabled}
              onCommit={saveDuration}
            />
          ) : (
            hours(analysis.minutes)
          )}
        </div>
        <div role="cell" className="text-right text-sm tabular-nums">
          {simple && (!sub || sub.kind === 'expense') ? (
            <InlineQuoteInput
              label={`Spese di ${displayName}`}
              value={sub?.kind === 'expense' ? moneyInputValue(sub.amount) : ''}
              placeholder="—"
              decimal
              disabled={disabled}
              onCommit={(amount) =>
                actions.saveSimpleSub(
                  item.id,
                  {
                    kind: 'expense',
                    description: sub?.description || item.name || 'Spesa',
                    amount,
                  },
                  sub?.id,
                )
              }
            />
          ) : (
            eur(analysis.expenses)
          )}
        </div>
        <div
          role="cell"
          aria-label="Valore teorico"
          className="text-right text-sm tabular-nums"
        >
          {eur(analysis.theoreticalValue)}
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
            placeholder="—"
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
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={`Inserisci dopo ${displayName}`}
            onClick={onInsertAfter}
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={`Elimina ${displayName}`}
            onClick={() =>
              actions.requestDelete({
                kind: 'item',
                id: item.id,
                label: displayName,
              })
            }
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <CollapsibleContent role="row">
        <div role="cell" aria-colspan={7}>
          <Separator />
          <div className="space-y-4 bg-muted/20 px-4 py-3">
            {item.variantGroups.length ? (
              <section aria-label="Varianti" className="space-y-3">
                <h4 className="text-sm font-medium">Varianti</h4>
                <div className="grid grid-cols-1 items-start gap-3 @xl:grid-cols-2 @5xl:grid-cols-3">
                  {item.variantGroups.map((group) => {
                    const selected =
                      item.variantSelections.find(
                        (entry) => entry.groupId === group.id,
                      )?.optionId ?? '';
                    return (
                      <div
                        key={group.id}
                        className="min-w-0 space-y-2 rounded-lg bg-muted/40 p-3"
                      >
                        <label
                          htmlFor={`variant-${item.id}-${group.id}`}
                          className="block break-words text-xs leading-relaxed font-medium"
                        >
                          {group.name}
                        </label>
                        <SearchableSelect
                          disabled={disabled}
                          id={`variant-${item.id}-${group.id}`}
                          className="w-full min-w-0"
                          value={selected}
                          onValueChange={(value) =>
                            actions.changeVariant(item.id, group, value)
                          }
                          options={[
                            { value: '', label: 'Scegli', disabled: true },
                            ...group.options.map((option) => ({
                              value: option.id,
                              label: option.name,
                            })),
                          ]}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
            <section
              id={`quote-technical-${item.id}`}
              tabIndex={-1}
              className={`space-y-3 rounded-lg outline-none ${missingTechnical ? 'ring-2 ring-primary ring-offset-2' : ''}`}
            >
              {missingTechnical ? (
                <p className="text-xs text-primary">
                  {missingTechnical.message}
                </p>
              ) : null}
              <h4 className="text-sm font-medium">Attività e costi</h4>

              {item.subItems.length ? (
                <div className="space-y-2">
                  {item.subItems.map((sub) => {
                    const missing = missingTargets.find(
                      (target) => target.id === `quote-sub-${sub.id}`,
                    );
                    return (
                      <div
                        key={sub.id}
                        id={`quote-sub-${sub.id}`}
                        tabIndex={-1}
                        className={
                          missing
                            ? 'rounded-lg ring-2 ring-primary ring-offset-2 outline-none'
                            : 'outline-none'
                        }
                      >
                        {missing ? (
                          <p className="px-3 py-2 text-xs text-primary">
                            {missing.message}
                          </p>
                        ) : null}
                        <QuoteSubRow
                          sub={sub}
                          disabled={disabled}
                          onSave={(input) =>
                            actions.saveSimpleSub(item.id, input, sub.id)
                          }
                          note={variantNote(item, sub)}
                          onClick={() => actions.editSub(item.id, sub.id)}
                          action={
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    disabled={disabled}
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Azioni per ${sub.description.trim() || 'Trasferta'}`}
                                  />
                                }
                              >
                                <MoreHorizontal />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    actions.editSub(item.id, sub.id)
                                  }
                                >
                                  Modifica
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    actions.saveSub(item.id, sub.id)
                                  }
                                >
                                  Salva nel catalogo
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() =>
                                    actions.requestDelete({
                                      kind: 'sub',
                                      id: `${item.id}:${sub.id}`,
                                      label:
                                        sub.description.trim() || 'Trasferta',
                                    })
                                  }
                                >
                                  Elimina
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button size="sm" disabled={disabled} />}
                >
                  <Plus />
                  Aggiungi <ChevronDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => actions.addSub(item.id, 'time')}
                  >
                    <Clock3 />
                    Attività
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => actions.addSub(item.id, 'expense')}
                  >
                    <ReceiptText />
                    Spesa
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => actions.addSub(item.id, 'travel')}
                  >
                    <MapPin />
                    Trasferta
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!doc.catalog.subItems.length}
                    onClick={() => actions.addCatalog(item.id)}
                  >
                    <BriefcaseBusiness />
                    Dal catalogo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </section>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function QuoteSubRow({
  sub,
  note,
  disabled,
  onSave,
  onClick,
  action,
}: {
  sub: QuoteSubItem;
  note?: string;
  disabled: boolean;
  onSave: (input: SimpleSubInput) => boolean;
  onClick: () => void;
  action: ReactNode;
}) {
  if (sub.kind === 'travel')
    return (
      <WorkItemRow
        kind={sub.kind}
        description={sub.description}
        detail={quoteSubDetail(sub)}
        note={note}
        onClick={disabled ? undefined : onClick}
        action={action}
      />
    );
  const Icon = sub.kind === 'time' ? Clock3 : ReceiptText;
  return (
    <div className="flex min-w-0 items-center gap-2 border-b py-1">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <InlineQuoteInput
          label={`Descrizione ${sub.description}`}
          value={sub.description}
          disabled={disabled}
          onCommit={(description) => onSave({ ...sub, description })}
        />
        {note ? (
          <p className="px-3 text-xs text-muted-foreground">{note}</p>
        ) : null}
      </div>
      <div className="w-32">
        <InlineQuoteInput
          label={`${sub.kind === 'time' ? 'Durata' : 'Importo'} ${sub.description}`}
          value={
            sub.kind === 'time'
              ? hours(sub.minutes)
              : moneyInputValue(sub.amount)
          }
          decimal={sub.kind === 'expense'}
          disabled={disabled}
          onCommit={(value) => {
            if (sub.kind === 'expense')
              return onSave({ ...sub, amount: value });
            const duration = parseDuration(value);
            return duration.ok && onSave({ ...sub, minutes: duration.value });
          }}
        />
      </div>
      {action}
    </div>
  );
}

function quoteSubDetail(sub: QuoteSubItem): string {
  if (sub.kind === 'time') return hours(sub.minutes);
  if (sub.kind === 'expense') return eur(sub.amount);
  return `${sub.totalDistanceKm ?? sub.distanceKmPerOccurrence ?? '—'} km · ${hours(sub.totalMinutes ?? sub.travelMinutesPerOccurrence)} · ${eur(sub.totalCost)}`;
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
