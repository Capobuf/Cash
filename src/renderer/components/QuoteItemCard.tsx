import {
  BriefcaseBusiness,
  ChevronDown,
  Clock3,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { calculateItem } from '../../domain/calculations';
import { parseDecimalInput } from '../../domain/decimal';
import type {
  CashDocument,
  QuoteItem,
  QuoteSubItem,
  VariantGroup,
} from '../../domain/model';
import { WorkItemRow } from '@/components/WorkItemRow';
import { PartialBadge } from '@/components/PartialBadge';
import type {
  MissingAnalysisTarget,
  PartialMetric,
} from '@/lib/quote-analysis-navigation';
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
import { Card, CardContent } from '@/components/ui/card';
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
import { Field, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { decimalInputValue, eur, hours, moneyInputValue } from '@/lib/format';
import type { DeleteTarget } from '../types';

export interface QuoteItemActions {
  showMissing?: (metric: PartialMetric, itemId?: string) => void;
  clearMissing?: () => void;
  rename: (item: QuoteItem) => void;
  updateChosenPrice: (itemId: string, value: string) => boolean;
  previewChosenPrice?: (itemId: string, value: string | undefined) => void;
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

export function QuoteItemCard({
  item,
  hourly,
  doc,
  actions,
  missingTargets = [],
}: {
  item: QuoteItem;
  hourly?: string;
  doc: CashDocument;
  actions: QuoteItemActions;
  missingTargets?: MissingAnalysisTarget[];
}) {
  const analysis = calculateItem(item, hourly);
  const displayName = item.name.trim() || 'Voce senza nome';
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [expanded, setExpanded] = useState(
    item.subItems.length === 0 || Boolean(analysis.blockers.length),
  );
  const missingPrice = missingTargets.find(
    (target) => target.id === `chosen-${item.id}`,
  );
  const missingTechnical = missingTargets.find(
    (target) => target.id === `quote-technical-${item.id}`,
  );
  const revealTechnical = missingTargets.some(
    (target) => target.id !== `chosen-${item.id}`,
  );

  return (
    <Collapsible
      open={expanded || revealTechnical}
      onOpenChange={(open) => {
        setExpanded(open);
        if (!open) actions.clearMissing?.();
      }}
      render={<Card className="@container overflow-hidden" />}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-4 px-4 py-2 sm:px-5 @3xl:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Apri o chiudi ${displayName}`}
              className="group mt-0.5"
            />
          }
        >
          <ChevronDown className="transition-transform group-data-panel-open:rotate-180" />
        </CollapsibleTrigger>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 break-words font-semibold">{displayName}</h3>
            {analysis?.blockers.length ? (
              <Badge variant="destructive">Da completare</Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock3 className="size-3.5" />
              {hours(analysis?.minutes)}
            </span>
            <span>Spese {eur(analysis?.expenses)}</span>
          </div>
        </div>

        <div className="col-span-3 row-start-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-4 @3xl:col-span-1 @3xl:col-start-3 @3xl:row-start-1">
          <Field className="w-40 max-w-full">
            <FieldLabel htmlFor={`chosen-${item.id}`}>Prezzo scelto</FieldLabel>
            <InputGroup
              className={
                missingPrice ? 'ring-2 ring-primary ring-offset-2' : undefined
              }
            >
              <InputGroupAddon>
                <InputGroupText>€</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id={`chosen-${item.id}`}
                aria-describedby={
                  missingPrice ? `chosen-missing-${item.id}` : undefined
                }
                defaultValue={moneyInputValue(item.chosenPrice ?? '')}
                inputMode="decimal"
                placeholder="0,00"
                onChange={(event) => {
                  const input = decimalInputValue(event.currentTarget.value);
                  const parsed = input.trim()
                    ? parseDecimalInput(input, 2)
                    : undefined;
                  if (!parsed || parsed.ok)
                    actions.previewChosenPrice?.(item.id, parsed?.value);
                }}
                onBlur={(event) =>
                  actions.updateChosenPrice(
                    item.id,
                    decimalInputValue(event.currentTarget.value),
                  )
                }
              />
            </InputGroup>
            {missingPrice ? (
              <p
                id={`chosen-missing-${item.id}`}
                className="text-xs text-primary"
              >
                {missingPrice.message}
              </p>
            ) : null}
          </Field>
          <div className="min-w-28 pb-1 text-right">
            <p className="text-[11px] text-muted-foreground">Valore teorico</p>
            <p className="font-semibold tabular-nums">
              {eur(analysis?.theoreticalValue)}
            </p>
            {analysis.theoreticalPartial ? (
              <PartialBadge
                label={`Valore teorico di ${displayName}`}
                onClick={() => actions.showMissing?.('theoretical', item.id)}
              />
            ) : null}
          </div>
        </div>

        <div className="col-start-3 row-start-1 flex items-center gap-1 @3xl:col-start-4">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Rinomina ${displayName}`}
            title="Rinomina voce"
            onClick={() => actions.rename(item)}
          >
            <Pencil />
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            aria-label={`Elimina ${displayName}`}
            title="Elimina voce"
            onClick={() => setDeleteConfirmationOpen(true)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <CollapsibleContent>
        <Separator />
        <CardContent className="space-y-5 pt-5">
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
                      <NativeSelect
                        id={`variant-${item.id}-${group.id}`}
                        className="w-full min-w-0"
                        value={selected}
                        onChange={(event) =>
                          actions.changeVariant(
                            item.id,
                            group,
                            event.target.value,
                          )
                        }
                      >
                        <NativeSelectOption value="" disabled>
                          Scegli
                        </NativeSelectOption>
                        {group.options.map((option) => (
                          <NativeSelectOption key={option.id} value={option.id}>
                            {option.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
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
              <p className="text-xs text-primary">{missingTechnical.message}</p>
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
                      <WorkItemRow
                        kind={sub.kind}
                        description={sub.description}
                        detail={quoteSubDetail(sub)}
                        note={variantNote(item, sub)}
                        onClick={() => actions.editSub(item.id, sub.id)}
                        action={
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
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
                                onClick={() => actions.editSub(item.id, sub.id)}
                              >
                                Modifica
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => actions.saveSub(item.id, sub.id)}
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
              <DropdownMenuTrigger render={<Button size="sm" />}>
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
        </CardContent>
      </CollapsibleContent>

      <AlertDialog
        open={deleteConfirmationOpen}
        onOpenChange={setDeleteConfirmationOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa voce?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare “{displayName}” e tutte le sue attività, spese
              e trasferte. Nel passaggio successivo dovrai confermare di nuovo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDeleteConfirmationOpen(false);
                actions.requestDelete({
                  kind: 'item',
                  id: item.id,
                  label: displayName,
                });
              }}
            >
              Continua
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
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
