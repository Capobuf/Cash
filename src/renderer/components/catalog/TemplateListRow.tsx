import { ChevronRight, MoreHorizontal, Pencil } from 'lucide-react';
import { useState } from 'react';
import {
  type ReusableSubItem,
  type SubItemDefinition,
  type Template,
} from '../../../domain/model';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { eur, hours } from '@/lib/format';
import { kindLabel } from './ReusableDialog';

export function TemplateListRow({
  template,
  onEdit,
  onDelete,
}: {
  template: Template;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const includedCount = template.items.reduce(
    (sum, item) => sum + item.subItems.length,
    0,
  );
  const variantCount = template.items.reduce(
    (sum, item) => sum + item.variantGroups.length,
    0,
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-stretch transition-colors hover:bg-muted/30">
        <CollapsibleTrigger
          className="grid min-w-0 flex-1 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:grid-cols-[auto_minmax(12rem,1fr)_6rem_8rem_7rem]"
          aria-label={`${open ? 'Chiudi' : 'Espandi'} anteprima di ${template.name}`}
        >
          <ChevronRight
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate font-medium">{template.name}</span>
          <span className="col-start-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground lg:hidden">
            <span>
              {template.items.length}{' '}
              {template.items.length === 1 ? 'voce' : 'voci'}
            </span>
            <span>
              {includedCount} {includedCount === 1 ? 'incluso' : 'inclusi'}
            </span>
            <span>
              {variantCount} {variantCount === 1 ? 'variante' : 'varianti'}
            </span>
          </span>
          <span className="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground lg:block">
            {template.items.length}{' '}
            {template.items.length === 1 ? 'voce' : 'voci'}
          </span>
          <span className="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground lg:block">
            {includedCount} {includedCount === 1 ? 'incluso' : 'inclusi'}
          </span>
          <span className="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground lg:block">
            {variantCount} {variantCount === 1 ? 'variante' : 'varianti'}
          </span>
        </CollapsibleTrigger>
        <div className="flex items-center gap-1 px-2">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Apri e modifica ${template.name}`}
            title="Apri e modifica"
            onClick={onEdit}
          >
            <Pencil />
          </Button>
          <RowMenu label={template.name} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      <CollapsibleContent>
        <div className="border-t bg-muted/20 px-4 py-4 sm:px-10">
          <div className="space-y-5">
            {template.items.map((item) => (
              <section
                key={item.id}
                className="space-y-3 border-border/70 [&+section]:border-t [&+section]:pt-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="font-medium">{item.name}</h3>
                  {item.referencePrice ? (
                    <p className="text-xs text-muted-foreground">
                      Prezzo di riferimento:{' '}
                      <span className="font-medium text-foreground">
                        {eur(item.referencePrice.amount)}
                      </span>{' '}
                      · {formatReferencePeriod(item.referencePrice.period)}
                    </p>
                  ) : null}
                </div>

                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Sempre inclusi
                  </h4>
                  {item.subItems.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {item.subItems.map((subItem) => (
                        <PreviewSubItem key={subItem.id} item={subItem} />
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Nessun elemento sempre incluso.
                    </p>
                  )}
                </div>

                {item.variantGroups.length ? (
                  <div>
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Varianti
                    </h4>
                    <div className="mt-2 space-y-3">
                      {item.variantGroups.map((group) => (
                        <div
                          key={group.id}
                          className="border-l-2 border-border pl-3"
                        >
                          <p className="text-sm font-medium">{group.name}</p>
                          <div className="mt-1.5 space-y-2">
                            {group.options.map((option) => (
                              <div key={option.id}>
                                <p className="text-sm">
                                  {option.name}
                                  {group.defaultOptionId === option.id ? (
                                    <Badge variant="outline" className="ml-2">
                                      Predefinita
                                    </Badge>
                                  ) : null}
                                </p>
                                {option.subItems.length ? (
                                  <ul className="mt-1 space-y-1 pl-4">
                                    {option.subItems.map((subItem, index) => (
                                      <PreviewSubItem
                                        key={`${option.id}-${index}`}
                                        item={subItem}
                                      />
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-0.5 pl-4 text-xs text-muted-foreground">
                                    Nessun contenuto aggiuntivo.
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
          <Button className="mt-5" size="sm" variant="outline" onClick={onEdit}>
            Apri e modifica
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PreviewSubItem({
  item,
}: {
  item: ReusableSubItem | SubItemDefinition;
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <Badge variant="outline">{kindLabel(item.kind)}</Badge>
      <span>{item.description}</span>
      <span className="text-xs text-muted-foreground">
        · {previewSubItemDetail(item)}
      </span>
    </li>
  );
}

function formatReferencePeriod(period: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${period}-01T00:00:00`));
}

function previewSubItemDetail(
  item: ReusableSubItem | SubItemDefinition,
): string {
  if (item.kind === 'time') return hours(item.minutes);
  if (item.kind === 'expense') return eur(item.amount);
  const details = [
    item.roundTrip ? 'A/R' : 'Solo andata',
    `${item.occurrences} ${item.occurrences === 1 ? 'occorrenza' : 'occorrenze'}`,
  ];
  if (item.distanceKmPerOccurrence !== undefined)
    details.push(`${item.distanceKmPerOccurrence} km/occorrenza`);
  if (item.travelMinutesPerOccurrence !== undefined)
    details.push(`${hours(item.travelMinutesPerOccurrence)}/occorrenza`);
  return details.join(' · ');
}

export function RowMenu({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Azioni per ${label}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>Apri e modifica</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          Elimina
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
