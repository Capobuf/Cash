import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Search,
} from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type DataTableValue = string | number | null | undefined;

export interface DataTableColumn<T> {
  id: string;
  header: string;
  value: (row: T) => DataTableValue;
  cell?: (row: T) => ReactNode;
  className?: string;
  headClassName?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T, index: number) => string;
  emptyMessage: string;
  searchPlaceholder?: string;
  longTableThreshold?: number;
  pageSize?: number;
  initialSort?: { id: string; direction: 'asc' | 'desc' };
  onRowClick?: (row: T) => void;
  getRowAriaLabel?: (row: T) => string;
  isRowSelected?: (row: T) => boolean;
}

const collator = new Intl.Collator('it', {
  numeric: true,
  sensitivity: 'base',
});

function compareValues(left: DataTableValue, right: DataTableValue) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === 'number' && typeof right === 'number')
    return left - right;
  return collator.compare(String(left), String(right));
}

export function DataTable<T>({
  data,
  columns,
  getRowKey,
  emptyMessage,
  searchPlaceholder = 'Cerca nella tabella…',
  longTableThreshold = 20,
  pageSize = 20,
  initialSort,
  onRowClick,
  getRowAriaLabel,
  isRowSelected,
}: DataTableProps<T>) {
  const pageSizeId = useId();
  const [sort, setSort] = useState(initialSort);
  const [query, setQuery] = useState('');
  const [filterColumn, setFilterColumn] = useState('all');
  const [page, setPage] = useState(0);
  const [selectedPageSize, setSelectedPageSize] = useState(pageSize);
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(columns.map((column) => [column.id, true])),
  );
  const isLong = data.length > longTableThreshold;
  const visibleColumns = columns.filter((column) => visible[column.id]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('it');
    if (!needle) return data;
    const searchable =
      filterColumn === 'all'
        ? columns
        : columns.filter((column) => column.id === filterColumn);
    return data.filter((row) =>
      searchable.some((column) =>
        String(column.value(row) ?? '')
          .toLocaleLowerCase('it')
          .includes(needle),
      ),
    );
  }, [columns, data, filterColumn, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((candidate) => candidate.id === sort.id);
    if (!column) return filtered;
    return [...filtered].sort((left, right) => {
      const result = compareValues(column.value(left), column.value(right));
      return sort.direction === 'asc' ? result : -result;
    });
  }, [columns, filtered, sort]);

  const totalPages = isLong
    ? Math.max(1, Math.ceil(sorted.length / selectedPageSize))
    : 1;
  const safePage = Math.min(page, totalPages - 1);
  const rows = isLong
    ? sorted.slice(
        safePage * selectedPageSize,
        (safePage + 1) * selectedPageSize,
      )
    : sorted;

  const toggleSort = (id: string) => {
    setPage(0);
    setSort((current) =>
      current?.id === id
        ? { id, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { id, direction: 'asc' },
    );
  };
  const visibleCount = visibleColumns.length;

  return (
    <div data-slot="data-table" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isLong ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-8"
              />
            </div>
            <NativeSelect
              value={filterColumn}
              onChange={(event) => {
                setFilterColumn(event.target.value);
                setPage(0);
              }}
              aria-label="Filtra la ricerca per colonna"
              className="w-auto min-w-44"
            >
              <NativeSelectOption value="all">
                Tutte le colonne
              </NativeSelectOption>
              {columns.map((column) => (
                <NativeSelectOption key={column.id} value={column.id}>
                  {column.header}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {data.length} {data.length === 1 ? 'riga' : 'righe'}
          </p>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <Columns3 />
            Colonne
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
            {columns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={visible[column.id]}
                disabled={visible[column.id] && visibleCount === 1}
                onCheckedChange={(checked) =>
                  setVisible((current) => ({
                    ...current,
                    [column.id]: checked,
                  }))
                }
              >
                {column.header}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.map((column) => {
                const direction =
                  sort?.id === column.id ? sort.direction : undefined;
                const SortIcon =
                  direction === 'asc'
                    ? ArrowUp
                    : direction === 'desc'
                      ? ArrowDown
                      : ArrowUpDown;
                return (
                  <TableHead
                    key={column.id}
                    className={column.headClassName}
                    aria-sort={
                      direction === 'asc'
                        ? 'ascending'
                        : direction === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 max-w-full justify-start px-2 font-medium"
                      onClick={() => toggleSort(column.id)}
                      aria-label={`Ordina per ${column.header}`}
                    >
                      <span className="truncate">{column.header}</span>
                      <SortIcon className="text-muted-foreground" />
                    </Button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const clickable = Boolean(onRowClick);
              return (
                <TableRow
                  key={getRowKey(row, safePage * selectedPageSize + index)}
                  className={cn(clickable && 'cursor-pointer')}
                  aria-selected={isRowSelected?.(row)}
                  tabIndex={clickable ? 0 : undefined}
                  aria-label={clickable ? getRowAriaLabel?.(row) : undefined}
                  onClick={clickable ? () => onRowClick?.(row) : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick?.(row);
                          }
                        }
                      : undefined
                  }
                >
                  {visibleColumns.map((column) => (
                    <TableCell key={column.id} className={column.className}>
                      {column.cell
                        ? column.cell(row)
                        : String(column.value(row) ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <Empty className="min-h-40 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>Nessun risultato</EmptyTitle>
            <EmptyDescription>
              {query
                ? 'Modifica la ricerca o il filtro selezionato.'
                : emptyMessage}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {isLong ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>
            {filtered.length} risultati · pagina {safePage + 1} di {totalPages}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={pageSizeId}>Righe per pagina</label>
            <NativeSelect
              id={pageSizeId}
              size="sm"
              value={String(selectedPageSize)}
              onChange={(event) => {
                setSelectedPageSize(Number(event.target.value));
                setPage(0);
              }}
              className="w-20"
            >
              {[20, 50, 100].map((size) => (
                <NativeSelectOption key={size} value={String(size)}>
                  {size}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Pagina precedente"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Pagina successiva"
              disabled={safePage >= totalPages - 1}
              onClick={() =>
                setPage((current) => Math.min(totalPages - 1, current + 1))
              }
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
