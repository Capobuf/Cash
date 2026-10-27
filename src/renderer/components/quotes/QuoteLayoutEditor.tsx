import { DragDropProvider, useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';
import {
  BookOpen,
  FolderPlus,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Quote, QuoteLayoutEntry } from '../../../domain/model';
import { quoteLayout } from '../../../domain/quote-layout';
import type { QuoteInsertionPoint } from '@/lib/quote-insertion';
import { quoteColumns } from './QuoteItemRow';
import { commitActiveQuoteInput } from './InlineQuoteInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

const ROOT = 'quote-root';
const groupId = (id?: string) => (id ? `container-${id}` : ROOT);
type Container = Extract<QuoteLayoutEntry, { kind: 'container' }>;

interface Props {
  quote: Quote;
  disabled: boolean;
  hasTemplates: boolean;
  renderItem: (
    id: string,
    handle: ReactNode,
    insertAfter: () => void,
  ) => ReactNode;
  renderInsertion: (
    point: QuoteInsertionPoint,
    onClose?: () => void,
  ) => ReactNode;
  onSave: (layout: QuoteLayoutEntry[]) => boolean;
  onAddContainer: (name: string) => boolean;
  onRenameContainer: (id: string, name: string) => boolean;
  onDeleteContainer: (id: string) => boolean;
  onInsertTemplate: (containerId: string) => void;
}

export function QuoteLayoutEditor(props: Props) {
  const { quote, disabled, onSave } = props;
  const [draft, setDraft] = useState<QuoteLayoutEntry[]>();
  const [creating, setCreating] = useState(false);
  const [containerName, setContainerName] = useState('');
  const pending = useRef<QuoteLayoutEntry[] | undefined>(undefined);
  // Keep the controller's original context guard for the entire gesture.
  const commit = useRef(onSave);
  const layout = draft ?? quoteLayout(quote);
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Lavoro da eseguire</h3>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setContainerName('');
            setCreating(true);
          }}
        >
          <FolderPlus />
          Nuovo contenitore
        </Button>
      </div>
      <p id="quote-drag-help" className="sr-only">
        Trascina dalla maniglia. Da tastiera: Spazio per iniziare, frecce per
        spostare, Spazio per confermare, Esc per annullare.
      </p>
      <div
        className="overflow-x-auto rounded-lg border"
        role="region"
        aria-label="Editor operativo del preventivo"
        tabIndex={0}
      >
        <div
          role="table"
          aria-label="Voci del preventivo"
          className="min-w-[840px]"
        >
          <div
            role="row"
            className={`${quoteColumns} min-h-10 border-b bg-muted/50 text-xs font-medium text-muted-foreground`}
          >
            <div role="columnheader">
              <span className="sr-only">Ordine e tipo</span>
            </div>
            <div role="columnheader">Lavoro</div>
            <div role="columnheader" className="text-right">
              Tempo
            </div>
            <div role="columnheader" className="text-right">
              Spese (€)
            </div>
            <div role="columnheader" className="text-right">
              Valore teorico
            </div>
            <div role="columnheader" className="text-right">
              Prezzo scelto (€)
            </div>
            <div role="columnheader">
              <span className="sr-only">Azioni</span>
            </div>
          </div>
          <DragDropProvider
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
              if (
                !disabled &&
                !event.canceled &&
                event.operation.target &&
                next
              )
                commit.current(next);
            }}
          >
            <div data-quote-layout role="rowgroup">
              {layout.map((entry, index) =>
                entry.kind === 'item' ? (
                  <SortableItem
                    key={entry.itemId}
                    id={entry.itemId}
                    name={
                      quote.items.find((item) => item.id === entry.itemId)!.name
                    }
                    index={index}
                    disabled={disabled}
                    renderItem={props.renderItem}
                    renderInsertion={props.renderInsertion}
                  />
                ) : (
                  <ContainerCard
                    key={entry.id}
                    container={entry}
                    index={index}
                    {...props}
                  />
                ),
              )}
              <DropZone
                disabled={disabled}
                label="Sposta fuori dai contenitori, in fondo al preventivo"
              />
              <div role="row">
                <div role="cell" aria-colspan={7}>
                  {props.renderInsertion({})}
                </div>
              </div>
            </div>
          </DragDropProvider>
        </div>
      </div>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              if (!disabled && props.onAddContainer(containerName))
                setCreating(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>Nuovo contenitore</DialogTitle>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="new-container-name">
                Nome contenitore
              </FieldLabel>
              <Input
                id="new-container-name"
                autoFocus
                required
                value={containerName}
                onChange={(event) => setContainerName(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreating(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={disabled || !containerName.trim()}
              >
                Crea contenitore
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Handle({
  handleRef,
  label,
  disabled,
}: {
  handleRef: (element: Element | null) => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <Button
      ref={handleRef}
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      className="shrink-0 touch-none cursor-grab active:cursor-grabbing"
      aria-label={label}
      aria-describedby="quote-drag-help"
      data-quote-drag-handle
      onPointerDownCapture={(event) => {
        // The drag sensor prevents the browser's normal focus change. Commit
        // an active cell before capturing the guarded layout transaction.
        let saved = false;
        flushSync(() => {
          saved = commitActiveQuoteInput();
        });
        if (!saved) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <GripVertical />
    </Button>
  );
}

function SortableItem({
  id,
  name,
  index,
  containerId,
  disabled,
  renderItem,
  renderInsertion,
}: {
  id: string;
  name: string;
  index: number;
  containerId?: string;
  disabled: boolean;
  renderItem: Props['renderItem'];
  renderInsertion: Props['renderInsertion'];
}) {
  const [inserting, setInserting] = useState(false);
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
      className={`min-w-0 ${isDragSource ? 'opacity-50' : ''} ${isDropTarget ? 'ring-2 ring-inset ring-primary' : ''}`}
    >
      {renderItem(
        id,
        <Handle
          handleRef={handleRef}
          label={`Sposta voce ${name.trim() || 'senza nome'}`}
          disabled={disabled}
        />,
        () => setInserting((open) => !open),
      )}
      {inserting ? (
        <div role="row">
          <div role="cell" aria-colspan={7}>
            {renderInsertion({ containerId, afterItemId: id }, () =>
              setInserting(false),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DropZone({
  containerId,
  disabled,
  label,
}: {
  containerId?: string;
  disabled: boolean;
  label: string;
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
      role="row"
      className={`flex min-h-12 items-center justify-center border-b border-dashed px-3 py-1 text-center text-xs ${isDropTarget ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary' : 'border-border text-muted-foreground'}`}
    >
      <span role="cell" aria-colspan={7}>
        {label}
      </span>
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
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(container.name);
  const [inserting, setInserting] = useState(false);
  return (
    <div
      ref={sourceRef}
      data-quote-container={container.id}
      className={`min-w-0 border-l-2 border-primary/30 ${isDragSource ? 'opacity-50' : ''}`}
    >
      <div
        ref={targetRef}
        role="row"
        className={isDropTarget ? 'ring-2 ring-inset ring-primary' : undefined}
      >
        <div
          role="cell"
          aria-colspan={7}
          className="flex min-w-0 items-center gap-2 bg-muted/50 px-2 py-1"
        >
          <Handle
            handleRef={handleRef}
            label={`Sposta contenitore ${container.name}`}
            disabled={disabled}
          />
          <h3 className="min-w-0 flex-1 break-words font-semibold">
            {container.name}
          </h3>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Rinomina contenitore ${container.name}`}
            disabled={disabled}
            onClick={() => {
              setName(container.name);
              setRenaming(true);
            }}
          >
            <Pencil />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" disabled={disabled} />
              }
            >
              <Plus />
              Aggiungi
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setInserting(true)}>
                <Plus />
                Aggiungi riga
              </DropdownMenuItem>
              {props.hasTemplates ? (
                <DropdownMenuItem
                  onClick={() => props.onInsertTemplate(container.id)}
                >
                  <BookOpen />
                  Da template
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
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
      <div className="min-w-0">
        {container.itemIds.map((id, itemIndex) => (
          <SortableItem
            key={id}
            id={id}
            name={props.quote.items.find((item) => item.id === id)!.name}
            index={itemIndex}
            containerId={container.id}
            disabled={disabled}
            renderItem={props.renderItem}
            renderInsertion={props.renderInsertion}
          />
        ))}
        <DropZone
          containerId={container.id}
          disabled={disabled}
          label={
            container.itemIds.length
              ? `Aggiungi in fondo a ${container.name}`
              : `Trascina una voce in ${container.name}`
          }
        />
        {inserting ? (
          <div role="row">
            <div role="cell" aria-colspan={7}>
              {props.renderInsertion({ containerId: container.id }, () =>
                setInserting(false),
              )}
            </div>
          </div>
        ) : null}
      </div>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              if (!disabled && props.onRenameContainer(container.id, name))
                setRenaming(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>Rinomina contenitore</DialogTitle>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor={`container-name-${container.id}`}>
                Nome contenitore
              </FieldLabel>
              <Input
                id={`container-name-${container.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                required
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenaming(false)}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={disabled || !name.trim()}>
                Conferma
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
