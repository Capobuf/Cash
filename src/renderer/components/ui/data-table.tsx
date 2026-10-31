import { SelectField } from '@/components/ui/selection-field';
import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { TableColumns } from '@/components/ui/table-columns';
import {
  nextTableSort,
  normalizeTablePreferences,
  readTablePreferences,
  saveTablePreferences,
  type TablePreferences,
} from '@/lib/table-preferences';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
  sortable?: boolean;
  configurable?: boolean;
  headerContent?: ReactNode;
}

interface DataTableProps<T> {
  preferencesKey: string;
  data: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T, index: number) => string;
  getSubRows?: (row: T) => T[];
  getRowClassName?: (row: T) => string | undefined;
  emptyMessage: ReactNode;
  loading?: boolean;
  onRowDoubleClick?: (row: T) => void;
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

export function DataTable<T>(props: DataTableProps<T>) {
  return <DataTableContent key={props.preferencesKey} {...props} />;
}

function DataTableContent<T>({
  preferencesKey,
  loading,
  onRowDoubleClick,
  data,
  columns,
  getRowKey,
  getSubRows,
  getRowClassName,
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
  const configurableIds = columns
    .filter((column) => column.configurable !== false)
    .map((column) => column.id);
  const [savedPreferences, setPreferences] = useState(() =>
    readTablePreferences(preferencesKey, configurableIds),
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const preferences = normalizeTablePreferences(
    savedPreferences,
    configurableIds,
  );
  const orderedColumns = preferences.order.map((id) =>
    columns.find((column) => column.id === id)!,
  );
  const visibleConfigurable = orderedColumns.filter(
    (column) => !preferences.hidden.includes(column.id),
  );
  let visibleIndex = 0;
  // Fixed selection/action columns retain their original position.
  const visibleColumns = columns.flatMap((column) =>
    column.configurable === false
      ? [column]
      : visibleIndex < visibleConfigurable.length
        ? [visibleConfigurable[visibleIndex++]!]
        : [],
  );
  const updatePreferences = (next: TablePreferences) => {
    const normalized = normalizeTablePreferences(next, configurableIds);
    setPreferences(normalized);
    setSaveFailed(!saveTablePreferences(preferencesKey, normalized));
  };
  const isLong = data.length > longTableThreshold;

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('it');
    if (!needle) return data;
    const searchable =
      filterColumn === 'all'
        ? columns
        : columns.filter((column) => column.id === filterColumn);
    const matches = (row: T): boolean =>
      searchable.some((column) =>
        String(column.value(row) ?? '')
          .toLocaleLowerCase('it')
          .includes(needle),
      ) || Boolean(getSubRows?.(row).some(matches));
    return data.filter(matches);
  }, [columns, data, filterColumn, query, getSubRows]);

  const sorted = useMemo(() => {
    const column = columns.find((candidate) => candidate.id === sort?.id);
    const orderedRows = (items: T[]): T[] => {
      const ordered =
        column && sort && column.sortable !== false
          ? [...items].sort((left, right) => {
              const result = compareValues(
                column.value(left),
                column.value(right),
              );
              return sort.direction === 'asc' ? result : -result;
            })
          : items;
      // Sort within each group so children always follow their parent.
      return getSubRows
        ? ordered.flatMap((row) => [row, ...orderedRows(getSubRows(row))])
        : ordered;
    };
    return orderedRows(filtered);
  }, [columns, filtered, sort, getSubRows]);

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
    setSort((current) => nextTableSort(current, id));
  };

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
            <SelectField
              value={filterColumn}
              onValueChange={(value) => {
                setFilterColumn(value);
                setPage(0);
              }}
              aria-label="Filtra la ricerca per colonna"
              className="w-auto min-w-44"
              options={[
                { value: 'all', label: 'Tutte le colonne' },
                ...columns.map((column) => ({
                  value: column.id,
                  label: column.header,
                })),
              ]}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {getSubRows ? sorted.length : data.length}{' '}
            {(getSubRows ? sorted.length : data.length) === 1
              ? 'riga'
              : 'righe'}
          </p>
        )}
      </div>

      {saveFailed ? (
        <p role="status" className="text-xs text-destructive">
          Impossibile salvare le preferenze delle colonne su questa postazione.
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Caricamento…
        </p>
      ) : null}
      <Table aria-busy={loading}>
        <TableHeader>
          <TableRow>
            {visibleColumns.map((column, columnIndex) => {
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
                  <div className="flex items-center gap-2 [[data-slot=table-head].text-right_&]:justify-end">
                    {column.sortable === false ? (
                      (column.headerContent ?? column.header)
                    ) : (
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
                    )}
                    {columnIndex === visibleColumns.length - 1 ? (
                      <span className="ml-auto inline-flex shrink-0">
                        <TableColumns
                          columns={orderedColumns}
                          preferences={preferences}
                          onChange={updatePreferences}
                        />
                      </span>
                    ) : null}
                  </div>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && !rows.length
            ? Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index} aria-hidden="true">
                  {visibleColumns.map((column) => (
                    <TableCell key={column.id}>
                      <Skeleton className="h-5 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : null}
          {rows.map((row, index) => {
            const clickable = Boolean(onRowClick || onRowDoubleClick);
            return (
              <TableRow
                key={getRowKey(row, safePage * selectedPageSize + index)}
                className={cn(
                  clickable && 'cursor-pointer',
                  getRowClassName?.(row),
                )}
                aria-selected={isRowSelected?.(row)}
                data-state={isRowSelected?.(row) ? 'selected' : undefined}
                onDoubleClick={
                  onRowDoubleClick ? () => onRowDoubleClick(row) : undefined
                }
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? getRowAriaLabel?.(row) : undefined}
                onClick={clickable ? () => onRowClick?.(row) : undefined}
                onKeyDown={
                  clickable
                    ? (event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          (onRowClick ?? onRowDoubleClick)?.(row);
                        }
                      }
                    : undefined
                }
              >
                {visibleColumns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={column.className}
                    onClick={
                      column.sortable === false
                        ? (event) => event.stopPropagation()
                        : undefined
                    }
                    onDoubleClick={
                      column.sortable === false
                        ? (event) => event.stopPropagation()
                        : undefined
                    }
                  >
                    {column.cell
                      ? column.cell(row)
                      : String(column.value(row) ?? '—')}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          {!loading && !rows.length ? (
            <TableRow>
              <TableCell colSpan={visibleColumns.length}>
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
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      {isLong ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>
            {filtered.length} risultati · pagina {safePage + 1} di {totalPages}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={pageSizeId}>Righe per pagina</label>
            <SelectField
              id={pageSizeId}
              size="sm"
              value={String(selectedPageSize)}
              onValueChange={(value) => {
                setSelectedPageSize(Number(value));
                setPage(0);
              }}
              className="w-20"
              options={[
                ...[20, 50, 100].map((size) => ({
                  value: String(String(size)),
                  label: size,
                })),
              ]}
            />
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
