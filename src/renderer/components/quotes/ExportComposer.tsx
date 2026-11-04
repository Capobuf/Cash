import { useState, type ReactNode } from 'react';
import {
  DragDropProvider,
  useDraggable,
  useDroppable,
  PointerSensor,
} from '@dnd-kit/react';
import { PointerActivationConstraints } from '@dnd-kit/dom';
import Decimal from 'decimal.js';
import { GripVertical, Plus, Search, Trash2, X } from 'lucide-react';
import type { ExportGroup, Quote } from '../../../domain/model';
import { orderedQuoteItems } from '../../../domain/quote-layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { eur } from '@/lib/format';

type Product = NonNullable<ExportGroup['product']>;
export type ExportRow = ExportGroup & { id: string; product: Product };

const exportSensors = [
  PointerSensor.configure({
    activationConstraints: () => [
      new PointerActivationConstraints.Distance({ value: 6 }),
    ],
  }),
];

function DraggableCashItem({
  id,
  name,
  children,
}: {
  id: string;
  name: string;
  children: ReactNode;
}) {
  const { ref, handleRef, isDragging } = useDraggable({
    id: `export-item-${id}`,
    type: 'export-item',
    data: { itemId: id },
  });
  return (
    <div
      ref={ref}
      data-export-item={id}
      className={`flex items-start gap-2 rounded-lg border bg-background p-3 ${isDragging ? 'opacity-50' : ''}`}
    >
      <Button
        ref={handleRef}
        size="icon-sm"
        variant="ghost"
        className="shrink-0 touch-none cursor-grab active:cursor-grabbing"
        aria-label={`Trascina ${name}`}
      >
        <GripVertical className="size-4" />
      </Button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ExportDropRow({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: `export-row-${id}`,
    accept: 'export-item',
    data: { rowId: id },
  });
  return (
    <article
      ref={ref}
      data-export-drop={id}
      aria-label={label}
      className={`rounded-lg border bg-background p-3 ${isDropTarget ? 'ring-2 ring-primary bg-primary/10' : ''}`}
    >
      {children}
    </article>
  );
}

export function ExportComposer({
  quote,
  companyId,
  defaultProduct,
  rows,
  onChange,
}: {
  quote: Quote;
  companyId: string;
  defaultProduct?: Product;
  rows: ExportRow[];
  onChange: (rows: ExportRow[]) => void;
}) {
  const items = orderedQuoteItems(quote);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [products, setProducts] = useState<Product[]>(() =>
    defaultProduct ? [defaultProduct] : [],
  );
  const [nextPage, setNextPage] = useState<number>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const assigned = new Set(rows.flatMap((row) => row.itemIds));
  const availableSelection = selected.filter((id) => !assigned.has(id));
  const unassigned = items.filter((item) => !assigned.has(item.id));
  const total = rows.reduce(
    (sum, row) =>
      row.itemIds.reduce(
        (amount, id) =>
          amount.plus(items.find((item) => item.id === id)?.chosenPrice ?? 0),
        sum,
      ),
    new Decimal(0),
  );
  const search = async (page = 1) => {
    setLoading(true);
    setError('');
    const term = page === 1 ? query : searchedQuery;
    try {
      const result = await window.cash.fic.searchProducts({
        companyId,
        query: term,
        page,
      });
      if (!result.ok) {
        setError(
          [result.error.message, result.error.action].filter(Boolean).join(' '),
        );
        return;
      }
      setProducts((current) => [
        ...new Map(
          [...(page === 1 ? [] : current), ...result.value.products].map(
            (product) => [product.id, product],
          ),
        ).values(),
      ]);
      setSearchedQuery(term);
      setNextPage(result.value.nextPage);
    } catch {
      setError('Impossibile recuperare i prodotti. Ripeti la ricerca.');
    } finally {
      setLoading(false);
    }
  };
  const addRow = (product: Product) => {
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        product,
        itemIds: availableSelection,
        description: '',
      },
    ]);
    setSelected([]);
  };
  return (
    <DragDropProvider
      sensors={exportSensors}
      onDragEnd={(event) => {
        const itemId = event.operation.source?.data.itemId;
        const rowId = event.operation.target?.data.rowId;
        if (
          event.canceled ||
          typeof itemId !== 'string' ||
          typeof rowId !== 'string' ||
          assigned.has(itemId) ||
          !items.some((item) => item.id === itemId) ||
          !rows.some((row) => row.id === rowId)
        )
          return;
        const ids = availableSelection.includes(itemId)
          ? availableSelection
          : [itemId];
        onChange(
          rows.map((row) =>
            row.id === rowId
              ? { ...row, itemIds: [...row.itemIds, ...ids] }
              : row,
          ),
        );
        setSelected((current) => current.filter((id) => !ids.includes(id)));
      }}
    >
      <div className="grid min-h-0 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section
          aria-label="Voci Cash"
          className="min-w-0 rounded-xl border p-4"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">Voci Cash</h3>
              <p className="text-xs text-muted-foreground">
                {unassigned.length} da assegnare · {items.length} totali
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!unassigned.length}
              onClick={() => setSelected(unassigned.map((item) => item.id))}
            >
              Seleziona disponibili
            </Button>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Trascina le voci in una riga sulla destra, oppure selezionale e usa
            “Aggiungi qui”.
          </p>
          <div className="max-h-[48vh] space-y-2 overflow-y-auto">
            {unassigned.map((item) => {
              return (
                <DraggableCashItem
                  key={item.id}
                  id={item.id}
                  name={item.name.trim() || 'Voce senza nome'}
                >
                  <Field orientation="horizontal">
                    <Checkbox
                      id={`export-select-${item.id}`}
                      checked={availableSelection.includes(item.id)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked
                            ? [...current, item.id]
                            : current.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <FieldLabel
                      htmlFor={`export-select-${item.id}`}
                      className="min-w-0 break-words"
                    >
                      {item.name.trim() || 'Voce senza nome'} ·{' '}
                      {item.chosenPrice === undefined
                        ? 'Prezzo mancante'
                        : eur(item.chosenPrice)}
                    </FieldLabel>
                  </Field>
                </DraggableCashItem>
              );
            })}
            {!unassigned.length ? (
              <p className="text-muted-foreground">
                {items.length
                  ? 'Tutte le voci sono incluse nelle righe Fatture in Cloud.'
                  : 'Nessuna voce nel preventivo.'}
              </p>
            ) : null}
          </div>
        </section>
        <section
          aria-label="Composizione Fatture in Cloud"
          className="min-w-0 rounded-xl border bg-muted/20 p-4"
        >
          <h3 className="font-semibold">Fatture in Cloud</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Anteprima del preventivo · quantità 1 per riga. Le voci
            contribuiscono alla descrizione e all’importo, senza ore.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!loading) void search();
            }}
          >
            <Input
              aria-label="Cerca prodotti Fatture in Cloud"
              placeholder="Cerca un prodotto Fatture in Cloud"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button type="submit" variant="outline" disabled={loading}>
              <Search className="size-4" />
              {loading ? 'Ricerca…' : 'Cerca'}
            </Button>
          </form>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div
            aria-label="Prodotti disponibili"
            className="my-3 max-h-36 space-y-1 overflow-y-auto"
          >
            {products.map((product) => (
              <Button
                key={product.id}
                variant="outline"
                className="h-auto min-h-10 w-full justify-start gap-2 px-3 py-2 whitespace-normal text-left"
                onClick={() => addRow(product)}
              >
                <Plus className="size-4 shrink-0" />
                <span className="min-w-0 break-words">
                  Aggiungi riga · {product.name}
                </span>
              </Button>
            ))}
            {!products.length && !loading ? (
              <p className="text-sm text-muted-foreground">
                Nessun prodotto trovato. Cerca nel catalogo Fatture in Cloud.
              </p>
            ) : null}
            {nextPage ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={loading}
                onClick={() => void search(nextPage)}
              >
                Carica altri prodotti
              </Button>
            ) : null}
          </div>
          <div className="max-h-[46vh] space-y-3 overflow-y-auto">
            {!rows.length ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                Aggiungi un prodotto per creare la prima riga.
              </p>
            ) : null}
            {rows.map((row, index) => {
              const rowItems = row.itemIds
                .map((id) => items.find((item) => item.id === id))
                .filter((item) => item !== undefined);
              const missingPrice = rowItems.some(
                (item) => item.chosenPrice === undefined,
              );
              const amount = rowItems.reduce(
                (sum, item) => sum.plus(item.chosenPrice ?? 0),
                new Decimal(0),
              );
              return (
                <ExportDropRow
                  key={row.id}
                  id={row.id}
                  label={`Riga ${index + 1}: ${row.product.name}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="min-w-0 break-words font-semibold">
                      {index + 1}. {row.product.name}
                    </h4>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Elimina riga ${index + 1}`}
                      onClick={() =>
                        onChange(rows.filter((entry) => entry.id !== row.id))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <ul className="my-2 space-y-1">
                    {rowItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="min-w-0 break-words">
                          {item.name.trim() || 'Voce senza nome'}
                        </span>
                        <span className="ml-auto shrink-0 tabular-nums">
                          {eur(item.chosenPrice)}
                        </span>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Rimuovi ${item.name} dalla riga ${index + 1}`}
                          onClick={() =>
                            onChange(
                              rows.map((entry) =>
                                entry.id === row.id
                                  ? {
                                      ...entry,
                                      itemIds: entry.itemIds.filter(
                                        (id) => id !== item.id,
                                      ),
                                    }
                                  : entry,
                              ),
                            )
                          }
                        >
                          <X className="size-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-auto whitespace-normal text-left"
                    disabled={!availableSelection.length}
                    onClick={() => {
                      onChange(
                        rows.map((entry) =>
                          entry.id === row.id
                            ? {
                                ...entry,
                                itemIds: [
                                  ...entry.itemIds,
                                  ...availableSelection,
                                ],
                              }
                            : entry,
                        ),
                      );
                      setSelected([]);
                    }}
                  >
                    <Plus className="size-4" />
                    Aggiungi qui le voci selezionate (
                    {availableSelection.length})
                  </Button>
                  <Field className="mt-3">
                    <FieldLabel htmlFor={`description-${row.id}`}>
                      Descrizione aggiuntiva
                    </FieldLabel>
                    <Textarea
                      id={`description-${row.id}`}
                      value={row.description}
                      placeholder="Testo facoltativo, prima delle voci Cash"
                      onChange={(event) =>
                        onChange(
                          rows.map((entry) =>
                            entry.id === row.id
                              ? { ...entry, description: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </Field>
                  <div className="mt-3 border-t pt-2 text-sm">
                    <p className="whitespace-pre-line break-words text-muted-foreground">
                      {[
                        row.description.trim(),
                        ...rowItems.map(
                          (item) => item.name.trim() || 'Voce senza nome',
                        ),
                      ]
                        .filter(Boolean)
                        .join('\n')}
                    </p>
                    <p className="mt-2 text-right font-medium">
                      Quantità 1 ·{' '}
                      {missingPrice
                        ? 'Prezzo mancante'
                        : eur(amount.toFixed(2))}
                    </p>
                    {!row.itemIds.length ? (
                      <p className="text-destructive">
                        Trascina qui le voci Cash da includere in questa riga.
                      </p>
                    ) : null}
                  </div>
                </ExportDropRow>
              );
            })}
          </div>
          <p className="mt-3 text-right font-semibold">
            Totale netto: {eur(total.toFixed(2))}
          </p>
          {unassigned.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Le {unassigned.length} voci non assegnate non saranno esportate.
            </p>
          ) : null}
        </section>
      </div>
    </DragDropProvider>
  );
}
