import {
  DragDropProvider,
  useDroppable,
  PointerSensor,
  KeyboardSensor,
} from '@dnd-kit/react';
import { PointerActivationConstraints } from '@dnd-kit/dom';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';
import { FolderPlus, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { meta, type Quote, type QuoteLayoutEntry } from '../../../domain/model';
import { quoteLayout } from '../../../domain/quote-layout';
import type { QuoteInsertionPoint } from '@/lib/quote-insertion';
import { QuoteTableHeader, type QuoteRowDragProps } from './QuoteItemRow';
import { commitActiveQuoteInput, InlineQuoteInput } from './InlineQuoteInput';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

const ROOT = 'quote-root';
const groupId = (id?: string) => (id ? `container-${id}` : ROOT);
type Container = Extract<QuoteLayoutEntry, { kind: 'container' }>;

interface Props {
  quote: Quote;
  disabled: boolean;
  hasTemplates: boolean;
  renderItem: (
    id: string,
    dragProps: QuoteRowDragProps,
    insertAfter: () => void,
    insertTemplateAfter: () => void,
  ) => ReactNode;
  renderInsertion: (
    point: QuoteInsertionPoint,
    onClose?: () => void,
    slot?: string,
  ) => ReactNode;
  onSave: (layout: QuoteLayoutEntry[]) => boolean;
  onAddContainer: (name: string) => boolean;
  onRenameContainer: (id: string, name: string) => boolean;
  onDeleteContainer: (id: string) => boolean;
  onInsertTemplate: (point: QuoteInsertionPoint, slot?: string) => void;
  onInsertRow: (point: QuoteInsertionPoint, slot: string) => void;
}

export function QuoteLayoutEditor(props: Props) {
  const { quote, disabled, onSave } = props;
  const [draft, setDraft] = useState<QuoteLayoutEntry[]>();
  const editorRef = useRef<HTMLDivElement>(null);
  const pending = useRef<QuoteLayoutEntry[] | undefined>(undefined);
  // Keep the controller's original context guard for the entire gesture.
  const commit = useRef(onSave);
  const layout = draft ?? quoteLayout(quote);
  // Keep consecutive ungrouped runs in place: grouping all root items would
  // silently change the visible order of legacy mixed layouts.
  const sections: { container?: Container; start: number; ids: string[] }[] =
    [];
  layout.forEach((entry, index) => {
    if (entry.kind === 'container')
      sections.push({ container: entry, start: index, ids: entry.itemIds });
    else {
      const last = sections.at(-1);
      if (last && !last.container) last.ids.push(entry.itemId);
      else sections.push({ start: index, ids: [entry.itemId] });
    }
  });
  if (!sections.length || sections.at(-1)?.container)
    sections.push({ start: layout.length, ids: [] });
  return (
    <div ref={editorRef} className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Lavoro da eseguire</h3>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            if (!props.onAddContainer('Nuovo contenitore')) return;
            requestAnimationFrame(() => {
              const inputs =
                editorRef.current?.querySelectorAll<HTMLInputElement>(
                  '[data-quote-container] input[aria-label^="Titolo contenitore"]',
                );
              const input = inputs?.[inputs.length - 1];
              input?.focus();
              input?.select();
            });
          }}
        >
          <FolderPlus />
          Nuovo contenitore
        </Button>
      </div>
      <p id="quote-drag-help" className="sr-only">
        Trascina dagli spazi liberi della riga. Da tastiera: seleziona la riga
        con Tab, Spazio per iniziare, frecce per spostare, Spazio per
        confermare, Esc per annullare.
      </p>
      <div aria-label="Editor operativo del preventivo">
        <DragDropProvider
          sensors={rowSensors}
          onDragStart={() => {
            pending.current = quoteLayout(quote);
            commit.current = onSave;
          }}
          onDragOver={(event) => {
            if (disabled || !pending.current) return;
            const current = pending.current;
            const groups: Record<string, string[]> = {
              [ROOT]: current.map((entry) =>
                entry.kind === 'item' ? entry.itemId : entry.id,
              ),
            };
            for (const entry of current)
              if (entry.kind === 'container')
                groups[groupId(entry.id)] = entry.itemIds;
            const { source, target } = event.operation;
            const appendGroup = target?.data.appendGroup;
            const moved =
              source && typeof appendGroup === 'string' && groups[appendGroup]
                ? Object.fromEntries(
                    Object.entries(groups).map(([group, ids]) => [
                      group,
                      [
                        ...ids.filter((id) => id !== source.id),
                        ...(group === appendGroup ? [String(source.id)] : []),
                      ],
                    ]),
                  )
                : move(groups, event);
            // React renders the preview; do not also reorder DOM nodes optimistically.
            event.preventDefault();
            if (moved === groups) return;
            const containers = new Map(
              current
                .filter((entry) => entry.kind === 'container')
                .map((entry) => [entry.id, entry]),
            );
            const next = moved[ROOT]!.map((id): QuoteLayoutEntry => {
              const container = containers.get(id);
              return container
                ? { ...container, itemIds: moved[groupId(id)]! }
                : { kind: 'item', itemId: id };
            });
            if (JSON.stringify(next) !== JSON.stringify(current)) {
              pending.current = next;
              // Commit the preview before dnd-kit measures the next target;
              // a deferred render can leave collision detection on an old row.
              flushSync(() => setDraft(next));
            }
          }}
          onDragEnd={(event) => {
            const next = pending.current;
            pending.current = undefined;
            setDraft(undefined);
            if (!disabled && !event.canceled && event.operation.target && next)
              commit.current(next);
          }}
        >
          <div data-quote-layout className="space-y-4">
            {sections.map(({ container, start, ids }) => {
              if (container)
                return (
                  <ContainerCard
                    key={container.id}
                    container={container}
                    index={start}
                    {...props}
                  />
                );
              const insertion = props.renderInsertion(
                {
                  afterItemId:
                    start + ids.length === layout.length
                      ? undefined
                      : ids.at(-1),
                },
                undefined,
                `root-${start}`,
              );
              return (
                <section key={`root-${start}`} className="min-w-0">
                  {ids.length > 0 || layout.length === 0 ? (
                    <div className="py-1 font-semibold">
                      <InlineQuoteInput
                        label="Titolo del contenitore iniziale"
                        value=""
                        placeholder="Titolo contenitore"
                        disabled={disabled}
                        onCommit={(name) => {
                          if (!name.trim()) return true;
                          const next = [...layout];
                          next.splice(start, ids.length, {
                            kind: 'container',
                            id: meta().id,
                            name: name.trim(),
                            itemIds: ids,
                          });
                          return onSave(next);
                        }}
                      />
                    </div>
                  ) : null}
                  <QuoteTable
                    label="Voci non raggruppate"
                    compact={!ids.length && layout.length > 0}
                  >
                    {ids.map((id, index) => (
                      <SortableItem
                        key={id}
                        id={id}
                        name={quote.items.find((item) => item.id === id)!.name}
                        index={start + index}
                        disabled={disabled}
                        renderItem={props.renderItem}
                        onInsertRow={props.onInsertRow}
                        onInsertTemplate={props.onInsertTemplate}
                        renderInsertion={props.renderInsertion}
                      />
                    ))}
                    {start + ids.length === layout.length ? (
                      <DropZone
                        disabled={disabled}
                        label="Voci fuori dai contenitori"
                      >
                        {insertion}
                      </DropZone>
                    ) : (
                      insertion
                    )}
                  </QuoteTable>
                </section>
              );
            })}
          </div>
        </DragDropProvider>
      </div>
    </div>
  );
}

function QuoteTable({
  label,
  children,
  compact = false,
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact ? 'overflow-x-auto' : 'overflow-x-auto rounded-md border'
      }
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <div role="table" aria-label={label} className="min-w-[920px]">
        {compact ? null : <QuoteTableHeader />}
        <div role="rowgroup">{children}</div>
      </div>
    </div>
  );
}

const rowDragClassName =
  'touch-none cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 [&_input]:cursor-text [&_button]:cursor-pointer';
const dropTargetClassName =
  'relative before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-0.5 before:bg-primary';

const interactiveSelector =
  'input, textarea, select, button, a, label, [role="button"], [role="checkbox"], [role="combobox"], [role="switch"], [contenteditable]:not([contenteditable="false"])';
const isInteractive = (
  target: EventTarget | null,
  row: Element | null | undefined,
) => {
  const control =
    target instanceof Element ? target.closest(interactiveSelector) : null;
  return Boolean(control && control !== row);
};
const rowSensors = [
  PointerSensor.configure({
    activationConstraints: () => [
      new PointerActivationConstraints.Distance({ value: 6 }),
    ],
    preventActivation: (event, source) =>
      isInteractive(event.target, source.handle),
  }),
  KeyboardSensor.configure({
    preventActivation: (event, source) => event.target !== source.handle,
  }),
];

function rowDragProps(
  handleRef: (element: Element | null) => void,
  label: string,
  disabled: boolean,
): QuoteRowDragProps {
  return {
    ref: handleRef,
    tabIndex: disabled ? -1 : 0,
    'aria-disabled': disabled,
    'aria-label': label,
    'aria-describedby': 'quote-drag-help',
    'data-quote-drag-row': true,
    className: disabled ? undefined : rowDragClassName,
    onPointerDownCapture: (event) => {
      if (
        disabled ||
        !event.isPrimary ||
        event.button !== 0 ||
        isInteractive(event.target, event.currentTarget)
      )
        return;
      // Commit before the sensor captures the layout transaction or reparents a row.
      let saved = false;
      flushSync(() => {
        saved = commitActiveQuoteInput();
      });
      if (!saved) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        event.currentTarget.focus({ preventScroll: true });
      }
    },
  };
}

function SortableItem({
  id,
  name,
  index,
  containerId,
  disabled,
  renderItem,
  onInsertRow,
  onInsertTemplate,
  renderInsertion,
}: {
  id: string;
  name: string;
  index: number;
  containerId?: string;
  disabled: boolean;
  renderItem: Props['renderItem'];
  onInsertRow: Props['onInsertRow'];
  onInsertTemplate: Props['onInsertTemplate'];
  renderInsertion: Props['renderInsertion'];
}) {
  const { ref, handleRef, isDragSource, isDropTarget } = useSortable({
    id,
    index,
    group: groupId(containerId),
    type: 'item',
    accept: containerId ? 'item' : ['item', 'container'],
    disabled,
    transition: null,
  });
  return (
    <div
      ref={ref}
      data-quote-item={id}
      className={`min-w-0 ${isDragSource ? 'opacity-50' : ''} ${isDropTarget ? dropTargetClassName : ''}`}
    >
      {renderItem(
        id,
        rowDragProps(
          handleRef,
          `Sposta voce ${name.trim() || 'senza nome'}`,
          disabled,
        ),
        () => {
          onInsertRow({ containerId, afterItemId: id }, `after-${id}`);
        },
        () => onInsertTemplate({ containerId, afterItemId: id }, `after-${id}`),
      )}
      {renderInsertion(
        { containerId, afterItemId: id },
        undefined,
        `after-${id}`,
      )}
    </div>
  );
}

function DropZone({
  containerId,
  disabled,
  label,
  children,
}: {
  containerId?: string;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: groupId(containerId),
    data: { appendGroup: groupId(containerId) },
    accept: containerId ? 'item' : ['item', 'container'],
    disabled,
  });
  return (
    <div
      ref={ref}
      data-quote-drop={containerId ?? ROOT}
      aria-label={label}
      className={
        isDropTarget
          ? 'ring-2 ring-inset ring-primary bg-primary/10'
          : undefined
      }
    >
      {children}
    </div>
  );
}

function ContainerCard({
  container,
  index,
  ...props
}: Props & { container: Container; index: number }) {
  const { disabled } = props;
  const { sourceRef, targetRef, handleRef, isDragSource, isDropTarget } =
    useSortable({
      id: container.id,
      index,
      group: ROOT,
      type: 'container',
      accept: ['item', 'container'],
      disabled,
      transition: null,
    });
  const [deleting, setDeleting] = useState(false);
  return (
    <div
      ref={sourceRef}
      data-quote-container={container.id}
      className={`min-w-0 ${isDragSource ? 'opacity-50' : ''}`}
    >
      <div
        ref={targetRef}
        className={isDropTarget ? dropTargetClassName : undefined}
      >
        <div
          {...rowDragProps(
            handleRef,
            `Sposta contenitore ${container.name}`,
            disabled,
          )}
          className={`flex min-w-0 items-center gap-2 py-1 ${disabled ? '' : rowDragClassName}`}
        >
          <div className="min-w-0 flex-1 font-semibold">
            <InlineQuoteInput
              label={`Titolo contenitore ${container.name}`}
              value={container.name}
              disabled={disabled}
              onCommit={(name) => props.onRenameContainer(container.id, name)}
            />
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Elimina contenitore ${container.name}`}
            disabled={disabled}
            onClick={() => setDeleting(true)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <QuoteTable label={container.name}>
        {container.itemIds.map((id, itemIndex) => (
          <SortableItem
            key={id}
            id={id}
            name={props.quote.items.find((item) => item.id === id)!.name}
            index={itemIndex}
            containerId={container.id}
            disabled={disabled}
            renderItem={props.renderItem}
            onInsertRow={props.onInsertRow}
            onInsertTemplate={props.onInsertTemplate}
            renderInsertion={props.renderInsertion}
          />
        ))}
        <DropZone
          containerId={container.id}
          disabled={disabled}
          label={`Voci di ${container.name}`}
        >
          {props.renderInsertion(
            { containerId: container.id },
            undefined,
            `container-${container.id}`,
          )}
        </DropZone>
      </QuoteTable>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il contenitore?</AlertDialogTitle>
            <AlertDialogDescription>
              Le voci di “{container.name}” resteranno nel preventivo, fuori dai
              contenitori, nella stessa posizione e nello stesso ordine.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={disabled}
              onClick={() => {
                if (props.onDeleteContainer(container.id)) setDeleting(false);
              }}
            >
              Elimina contenitore
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
