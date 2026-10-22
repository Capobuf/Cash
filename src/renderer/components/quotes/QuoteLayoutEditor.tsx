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
import type { Quote, QuoteLayoutEntry } from '../../../domain/model';
import { quoteLayout } from '../../../domain/quote-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  renderItem: (id: string, handle: ReactNode) => ReactNode;
  onSave: (layout: QuoteLayoutEntry[]) => boolean;
  onAddContainer: () => boolean;
  onRenameContainer: (id: string, name: string) => boolean;
  onDeleteContainer: (id: string) => boolean;
  onAddItem: (containerId: string) => void;
  onInsertTemplate: (containerId: string) => void;
}

export function QuoteLayoutEditor(props: Props) {
  const { quote, disabled, onSave } = props;
  const [draft, setDraft] = useState<QuoteLayoutEntry[]>();
  const pending = useRef<QuoteLayoutEntry[] | undefined>(undefined);
  // Keep the controller's original context guard for the entire gesture.
  const commit = useRef(onSave);
  const layout = draft ?? quoteLayout(quote);
  return (
    <div className="min-w-0 space-y-3">
      <Button
        variant="outline"
        disabled={disabled}
        onClick={props.onAddContainer}
      >
        <FolderPlus />
        Nuovo contenitore
      </Button>
      <p id="quote-drag-help" className="text-xs text-muted-foreground">
        Trascina dalla maniglia. Da tastiera: Spazio per iniziare, frecce per
        spostare, Spazio per confermare, Esc per annullare.
      </p>
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
            setDraft(next);
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
        <div className="space-y-3" data-quote-layout>
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
        </div>
      </DragDropProvider>
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
}: {
  id: string;
  name: string;
  index: number;
  containerId?: string;
  disabled: boolean;
  renderItem: Props['renderItem'];
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
      className={`min-w-0 rounded-xl ${isDragSource ? 'opacity-50' : ''} ${isDropTarget ? 'ring-2 ring-primary' : ''}`}
    >
      {renderItem(
        id,
        <Handle
          handleRef={handleRef}
          label={`Sposta voce ${name.trim() || 'senza nome'}`}
          disabled={disabled}
        />,
      )}
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
      className={`flex min-h-12 items-center justify-center rounded-lg border border-dashed px-3 py-2 text-center text-xs ${isDropTarget ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary' : 'border-border text-muted-foreground'}`}
    >
      {label}
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
  return (
    <Card
      ref={sourceRef}
      data-quote-container={container.id}
      className={`min-w-0 gap-3 border-dashed py-3 ${isDragSource ? 'opacity-50' : ''}`}
    >
      <div
        ref={targetRef}
        className={`flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 ${isDropTarget ? 'ring-2 ring-primary' : ''}`}
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
            render={<Button variant="outline" size="sm" disabled={disabled} />}
          >
            <Plus />
            Aggiungi
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => props.onAddItem(container.id)}>
              <Plus />
              Sezione vuota
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
      <CardContent className="min-w-0 space-y-3 px-3">
        {container.itemIds.map((id, itemIndex) => (
          <SortableItem
            key={id}
            id={id}
            name={props.quote.items.find((item) => item.id === id)!.name}
            index={itemIndex}
            containerId={container.id}
            disabled={disabled}
            renderItem={props.renderItem}
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
      </CardContent>
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
    </Card>
  );
}
