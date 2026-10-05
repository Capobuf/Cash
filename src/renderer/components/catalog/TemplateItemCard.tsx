import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Layers3,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import {
  meta,
  touch,
  type SubItemDefinition,
  type TemplateItem,
  type VariantGroup,
  type VariantOption,
} from '../../../domain/model';
import { WorkItemRow } from '@/components/WorkItemRow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { eur, hours } from '@/lib/format';
import { kindLabel, type Kind, reusableDetail } from './ReusableDialog';

export function TemplateItemCard({
  item,
  itemIndex,
  focusName = false,
  canDelete,
  hasReusableItems,
  onRename,
  onDelete,
  onReferenceChange,
  onEditSub,
  onAddSub,
  onAddReusable,
  onVariantsChange,
  onDefinition,
}: {
  item: TemplateItem;
  itemIndex: number;
  focusName?: boolean;
  canDelete: boolean;
  hasReusableItems: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onReferenceChange: (referencePrice?: {
    amount: string;
    period: string;
  }) => void;
  onEditSub: (index: number) => void;
  onAddSub: (kind: Kind) => void;
  onAddReusable: () => void;
  onVariantsChange: (groups: VariantGroup[]) => void;
  onDefinition: (
    groupIndex: number,
    optionIndex: number,
    definitionIndex?: number,
    initialKind?: SubItemDefinition['kind'],
  ) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="min-w-0 space-y-3 pr-10">
          <p className="text-sm font-semibold">Voce {itemIndex + 1}</p>
          <Field className="max-w-xl">
            <FieldLabel htmlFor={`template-item-${item.id}`}>
              Nome nel preventivo
            </FieldLabel>
            <Input
              id={`template-item-${item.id}`}
              value={item.name}
              onChange={(event) => onRename(event.target.value)}
              placeholder="es. Configurazione server"
              className="h-9 font-medium"
              autoFocus={focusName}
            />
          </Field>
        </div>
        <CardAction>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={!canDelete}
            aria-label={`Elimina voce ${itemIndex + 1}`}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Attività e costi</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Elementi inseriti ogni volta che usi questo template.
              </p>
            </div>
            <TemplateContentActions
              hasCatalog={hasReusableItems}
              onAdd={onAddSub}
              onAddCatalog={onAddReusable}
            />
          </div>

          {item.subItems.length ? (
            <div className="space-y-2">
              {item.subItems.map((sub, index) => (
                <WorkItemRow
                  key={sub.id}
                  kind={sub.kind}
                  description={sub.description}
                  detail={reusableDetail(sub)}
                  onClick={() => onEditSub(index)}
                  action={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Modifica ${sub.description.trim() || kindLabel(sub.kind)}`}
                      title="Modifica elemento"
                      onClick={() => onEditSub(index)}
                    >
                      <Pencil />
                    </Button>
                  }
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-4 text-sm">
              <p className="font-medium">Nessuna attività o costo.</p>
              <p className="mt-1 text-muted-foreground">
                Aggiungi un’attività, una spesa o una trasferta che fa sempre
                parte di questa voce.
              </p>
            </div>
          )}
        </section>

        <TemplateVariants
          item={item}
          onChange={onVariantsChange}
          onDefinition={onDefinition}
        />

        <Collapsible defaultOpen={Boolean(item.referencePrice)}>
          <CollapsibleTrigger
            render={<Button size="sm" variant="ghost" className="group" />}
          >
            <ChevronDown className="transition-transform group-data-panel-open:rotate-180" />
            Prezzo storico di riferimento
            {item.referencePrice?.amount ? (
              <Badge variant="outline">{eur(item.referencePrice.amount)}</Badge>
            ) : null}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-lg border p-3">
              <Field>
                <FieldLabel htmlFor={`template-reference-${item.id}`}>
                  Importo
                </FieldLabel>
                <Input
                  id={`template-reference-${item.id}`}
                  value={item.referencePrice?.amount.replace('.', ',') ?? ''}
                  inputMode="decimal"
                  placeholder="0,00"
                  onChange={(event) =>
                    onReferenceChange({
                      amount: event.target.value.replace(',', '.'),
                      period: item.referencePrice?.period ?? '',
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`template-period-${item.id}`}>
                  Mese di riferimento
                </FieldLabel>
                <Input
                  id={`template-period-${item.id}`}
                  type="month"
                  value={item.referencePrice?.period ?? ''}
                  onChange={(event) =>
                    onReferenceChange({
                      amount: item.referencePrice?.amount ?? '',
                      period: event.target.value,
                    })
                  }
                />
              </Field>
              <Button
                variant="ghost"
                disabled={!item.referencePrice}
                onClick={() => onReferenceChange(undefined)}
              >
                Rimuovi
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function TemplateContentActions({
  onAdd,
  onAddCatalog,
  hasCatalog = false,
}: {
  onAdd: (kind: Kind) => void;
  onAddCatalog?: () => void;
  hasCatalog?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => onAdd('time')}>
        <Plus />
        Aggiungi attività
      </Button>
      <AddContentMenu
        label="Aggiungi altro"
        includeTime={false}
        hasCatalog={hasCatalog}
        onAdd={onAdd}
        onAddCatalog={onAddCatalog}
      />
    </div>
  );
}

function TemplateVariants({
  item,
  onChange,
  onDefinition,
}: {
  item: TemplateItem;
  onChange: (groups: VariantGroup[]) => void;
  onDefinition: (
    groupIndex: number,
    optionIndex: number,
    definitionIndex?: number,
    initialKind?: SubItemDefinition['kind'],
  ) => void;
}) {
  const [expandedOptionId, setExpandedOptionId] = useState<string>();
  const [focusGroupId, setFocusGroupId] = useState<string>();
  const update = (mutate: (groups: VariantGroup[]) => void) => {
    const groups = structuredClone(item.variantGroups);
    mutate(groups);
    onChange(groups);
  };
  const addGroup = () =>
    update((groups) => {
      const option: VariantOption = { ...meta(), name: '', subItems: [] };
      const group: VariantGroup = {
        ...meta(),
        name: '',
        options: [option],
        defaultOptionId: option.id,
      };
      groups.push(group);
      setExpandedOptionId(undefined);
      setFocusGroupId(group.id);
    });

  if (!item.variantGroups.length) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <div>
          <h3 className="text-sm font-medium">Varianti</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Usala quando una parte del lavoro può cambiare.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={addGroup}>
          <Plus />
          Aggiungi variante
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-3 border-t pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Varianti</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Parti della voce che cambiano in base a una scelta.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={addGroup}>
          <Plus />
          Aggiungi variante
        </Button>
      </div>

      {item.variantGroups.map((group, groupIndex) => (
        <div
          key={group.id}
          className="rounded-lg border-l-2 border-primary/30 bg-muted/20 px-4 py-3"
        >
          <div className="flex items-end gap-2">
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor={`variant-name-${group.id}`}>
                Nome variante
              </FieldLabel>
              <Input
                id={`variant-name-${group.id}`}
                value={group.name}
                onChange={(event) =>
                  update((groups) => {
                    touch(groups[groupIndex]!).name = event.target.value;
                  })
                }
                placeholder="es. Gestione cliente"
                className="max-w-lg font-medium"
                autoFocus={focusGroupId === group.id}
                onFocus={() => setFocusGroupId(undefined)}
              />
            </Field>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Azioni per la variante ${group.name || groupIndex + 1}`}
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    update((groups) => groups.splice(groupIndex, 1))
                  }
                >
                  Elimina variante
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Field className="mt-3 max-w-sm">
            <FieldLabel htmlFor={`variant-default-${group.id}`}>
              Opzione predefinita
            </FieldLabel>
            <NativeSelect
              id={`variant-default-${group.id}`}
              value={group.defaultOptionId ?? ''}
              onChange={(event) =>
                update((groups) => {
                  const current = touch(groups[groupIndex]!);
                  current.defaultOptionId = event.target.value || undefined;
                })
              }
            >
              <NativeSelectOption value="">
                Nessuna predefinita
              </NativeSelectOption>
              {group.options.map((option, optionIndex) => (
                <NativeSelectOption key={option.id} value={option.id}>
                  {option.name.trim() || `Opzione ${optionIndex + 1}`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <div className="mt-4 divide-y rounded-lg border bg-card">
            {group.options.map((option, optionIndex) => {
              const expanded = expandedOptionId === option.id;
              return (
                <div key={option.id}>
                  <div className="flex min-h-12 items-center gap-2 px-2 py-1.5">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${expanded ? 'Chiudi' : 'Modifica'} ${option.name || `opzione ${optionIndex + 1}`}`}
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedOptionId(expanded ? undefined : option.id)
                      }
                    >
                      <ChevronRight
                        className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
                      />
                    </Button>
                    {expanded ? (
                      <Input
                        value={option.name}
                        onChange={(event) =>
                          update((groups) => {
                            touch(
                              touch(groups[groupIndex]!).options[optionIndex]!,
                            ).name = event.target.value;
                          })
                        }
                        aria-label={`Nome opzione ${optionIndex + 1}`}
                        placeholder="es. Nessuna, Minima, Media"
                        className="h-8 min-w-0 flex-1 font-medium"
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                        onClick={() => setExpandedOptionId(option.id)}
                      >
                        {option.name.trim() || `Opzione ${optionIndex + 1}`}
                      </button>
                    )}
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {optionEffect(option)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Azioni per ${option.name || `opzione ${optionIndex + 1}`}`}
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={group.options.length === 1}
                          onClick={() =>
                            update((groups) => {
                              const current = touch(groups[groupIndex]!);
                              current.options.splice(optionIndex, 1);
                              if (current.defaultOptionId === option.id)
                                current.defaultOptionId = undefined;
                            })
                          }
                        >
                          Elimina opzione
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {expanded ? (
                    <div className="space-y-3 border-t bg-muted/10 px-3 py-3 sm:pl-12">
                      <p className="text-sm font-medium">
                        Cosa aggiunge questa opzione
                      </p>
                      {option.subItems.length ? (
                        <div className="space-y-2">
                          {option.subItems.map(
                            (definition, definitionIndex) => (
                              <WorkItemRow
                                key={`${definition.kind}-${definitionIndex}`}
                                kind={definition.kind}
                                description={definition.description}
                                detail={definitionDetail(definition)}
                                onClick={() =>
                                  onDefinition(
                                    groupIndex,
                                    optionIndex,
                                    definitionIndex,
                                  )
                                }
                                action={
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`Modifica ${definition.description.trim() || kindLabel(definition.kind)}`}
                                    title="Modifica elemento"
                                    onClick={() =>
                                      onDefinition(
                                        groupIndex,
                                        optionIndex,
                                        definitionIndex,
                                      )
                                    }
                                  >
                                    <Pencil />
                                  </Button>
                                }
                              />
                            ),
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Questa opzione non aggiunge attività, spese o
                          trasferte.
                        </p>
                      )}

                      <TemplateContentActions
                        onAdd={(kind) =>
                          onDefinition(groupIndex, optionIndex, undefined, kind)
                        }
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => {
              const option: VariantOption = {
                ...meta(),
                name: '',
                subItems: [],
              };
              update((groups) => {
                touch(groups[groupIndex]!).options.push(option);
              });
              setExpandedOptionId(option.id);
            }}
          >
            <Plus />
            Aggiungi opzione
          </Button>
        </div>
      ))}
    </section>
  );
}

function AddContentMenu({
  onAdd,
  onAddCatalog,
  hasCatalog = false,
  includeTime = true,
  label = 'Aggiungi',
}: {
  onAdd: (kind: Kind) => void;
  onAddCatalog?: () => void;
  hasCatalog?: boolean;
  includeTime?: boolean;
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" />}>
        <Plus />
        {label} <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {includeTime ? (
          <DropdownMenuItem onClick={() => onAdd('time')}>
            <Clock3 />
            Attività
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => onAdd('expense')}>
          <ReceiptText />
          Spesa
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd('travel')}>
          <MapPin />
          Trasferta
        </DropdownMenuItem>
        {onAddCatalog ? <DropdownMenuSeparator /> : null}
        {onAddCatalog ? (
          <DropdownMenuItem disabled={!hasCatalog} onClick={onAddCatalog}>
            <Layers3 />
            Dal catalogo
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function optionEffect(option: VariantOption): string {
  if (!option.subItems.length) return '—';
  if (option.subItems.every((item) => item.kind === 'time')) {
    return hours(
      option.subItems.reduce(
        (sum, item) => sum + (item.kind === 'time' ? item.minutes : 0),
        0,
      ),
    );
  }
  if (option.subItems.length === 1 && option.subItems[0]!.kind === 'expense')
    return eur(option.subItems[0]!.amount);
  if (option.subItems.length === 1 && option.subItems[0]!.kind === 'travel')
    return 'Trasferta';
  return `${option.subItems.length} elementi`;
}

function definitionDetail(item: SubItemDefinition): string {
  if (item.kind === 'time') return hours(item.minutes);
  if (item.kind === 'expense') return eur(item.amount);
  return `${item.occurrences} ${item.occurrences === 1 ? 'occorrenza' : 'occorrenze'}`;
}
