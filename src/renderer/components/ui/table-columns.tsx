import { Popover } from '@base-ui/react/popover';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';
import { Columns3, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { TablePreferences } from '@/lib/table-preferences';

export function TableColumns({
  columns,
  preferences,
  onChange,
}: {
  columns: { id: string; header: string }[];
  preferences: TablePreferences;
  onChange: (preferences: TablePreferences) => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        render={<Button variant="ghost" size="icon-sm" />}
        aria-label="Configura colonne"
        title="Configura colonne"
      >
        <Columns3 />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={6} className="z-50">
          <Popover.Popup className="w-72 rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <Popover.Title className="text-sm font-medium">
              Colonne
            </Popover.Title>
            <Popover.Description className="mt-1 text-xs text-muted-foreground">
              Seleziona le colonne e trascina le maniglie per riordinarle.
            </Popover.Description>
            <DragDropProvider
              onDragEnd={(event) => {
                if (event.canceled) return;
                onChange({
                  ...preferences,
                  order: move(preferences.order, event),
                });
              }}
            >
              <div className="my-2 max-h-72 overflow-y-auto">
                {columns.map((column, index) => (
                  <ColumnOption
                    key={column.id}
                    column={column}
                    index={index}
                    checked={!preferences.hidden.includes(column.id)}
                    disabled={
                      preferences.hidden.length === columns.length - 1 &&
                      !preferences.hidden.includes(column.id)
                    }
                    onCheckedChange={(checked) =>
                      onChange({
                        ...preferences,
                        hidden: checked
                          ? preferences.hidden.filter((id) => id !== column.id)
                          : [...preferences.hidden, column.id],
                      })
                    }
                  />
                ))}
              </div>
            </DragDropProvider>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ order: [], hidden: [] })}
            >
              Ripristina colonne
            </Button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ColumnOption({
  column,
  index,
  checked,
  disabled,
  onCheckedChange,
}: {
  column: { id: string; header: string };
  index: number;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: column.id,
    index,
  });
  return (
    <div
      ref={ref}
      className={`flex items-center gap-2 rounded-md py-1 ${isDragSource ? 'bg-muted opacity-60' : ''}`}
    >
      <Button
        ref={handleRef}
        variant="ghost"
        size="icon-sm"
        className="touch-none cursor-grab"
        aria-label={`Sposta colonna ${column.header}`}
      >
        <GripVertical />
      </Button>
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
        />
        <span className="truncate">{column.header}</span>
      </label>
    </div>
  );
}
