import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from 'lucide-react';
import type { BankExpenseRule, CashDocument } from '../../domain/model';
import {
  bankRuleList,
  type BankRuleMatchFilter,
  type BankRuleSort,
  type BankRuleSortColumn,
} from '../lib/bank-rule-list';
import { BankCategoryOptions } from './BankCategoryOptions';
import { Button } from '@/components/ui/button';
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

const columns: { column: BankRuleSortColumn; label: string }[] = [
  { column: 'text', label: 'Testo riconosciuto' },
  { column: 'category', label: 'Categoria' },
  { column: 'matches', label: 'Corrispondenze' },
];
const defaultSort: BankRuleSort = { column: 'text', direction: 'ascending' };

export function BankRulesTable({
  doc,
  readOnly,
  onEdit,
  onDelete,
}: {
  doc: CashDocument;
  readOnly: boolean;
  onEdit(rule: BankExpenseRule): void;
  onDelete(rule: BankExpenseRule): void;
}) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [matches, setMatches] = useState<BankRuleMatchFilter>('all');
  const [sort, setSort] = useState<BankRuleSort>(defaultSort);
  const rows = useMemo(
    () => bankRuleList(doc, query, categoryId, matches, sort),
    [doc, query, categoryId, matches, sort],
  );
  const reset = () => {
    setQuery('');
    setCategoryId('all');
    setMatches('all');
    setSort(defaultSort);
  };
  const changeSort = (column: BankRuleSortColumn) =>
    setSort((current) => ({
      column,
      direction:
        current.column === column
          ? current.direction === 'ascending'
            ? 'descending'
            : 'ascending'
          : column === 'matches'
            ? 'descending'
            : 'ascending',
    }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1 space-y-2">
          <label htmlFor="bank-rule-search" className="text-sm font-medium">
            Cerca regole
          </label>
          <Input
            id="bank-rule-search"
            type="search"
            placeholder="Cerca testo o categoria..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="bank-rule-category-filter"
            className="text-sm font-medium"
          >
            Categoria delle regole
          </label>
          <NativeSelect
            id="bank-rule-category-filter"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <NativeSelectOption value="all">
              Tutte le categorie
            </NativeSelectOption>
            <BankCategoryOptions categories={doc.bankExpenseCategories} />
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="bank-rule-matches-filter"
            className="text-sm font-medium"
          >
            Corrispondenze delle regole
          </label>
          <NativeSelect
            id="bank-rule-matches-filter"
            value={matches}
            onChange={(event) =>
              setMatches(event.target.value as BankRuleMatchFilter)
            }
          >
            <NativeSelectOption value="all">Tutte le regole</NativeSelectOption>
            <NativeSelectOption value="matched">
              Con corrispondenze
            </NativeSelectOption>
            <NativeSelectOption value="unmatched">
              Senza corrispondenze
            </NativeSelectOption>
          </NativeSelect>
        </div>
        <Button type="button" variant="outline" onClick={reset}>
          Reimposta filtri
        </Button>
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        {rows.length} di {doc.bankExpenseRules.length} regole · Corrispondenze
        su tutti gli anni, incluse le spese escluse dai conteggi.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(({ column, label }) => {
              const active = sort.column === column;
              const Icon = !active
                ? ArrowUpDown
                : sort.direction === 'ascending'
                  ? ArrowUp
                  : ArrowDown;
              return (
                <TableHead
                  key={column}
                  aria-sort={active ? sort.direction : 'none'}
                  className={column === 'matches' ? 'text-right' : undefined}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => changeSort(column)}
                    aria-label={`Ordina per ${label.toLocaleLowerCase('it')}`}
                  >
                    {label}
                    <Icon />
                  </Button>
                </TableHead>
              );
            })}
            <TableHead>Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ rule, categoryLabel, count }) => (
            <TableRow key={rule.id}>
              <TableCell className="whitespace-normal break-words">
                {rule.matchText}
              </TableCell>
              <TableCell className="whitespace-normal">
                {categoryLabel}
              </TableCell>
              <TableCell className="text-right">{count}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={readOnly}
                    aria-label={`Modifica regola ${rule.matchText}`}
                    onClick={() => onEdit(rule)}
                  >
                    <Pencil />
                    Modifica
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={readOnly}
                    aria-label={`Elimina regola ${rule.matchText}`}
                    onClick={() => onDelete(rule)}
                  >
                    <Trash2 />
                    Elimina
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!rows.length ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-8 text-center text-muted-foreground"
              >
                {doc.bankExpenseRules.length ? (
                  <div className="space-y-3">
                    <p>
                      Nessuna regola corrisponde alla ricerca e ai filtri
                      selezionati.
                    </p>
                    <Button type="button" variant="outline" onClick={reset}>
                      Azzera ricerca e filtri
                    </Button>
                  </div>
                ) : (
                  'Nessuna regola automatica. Puoi crearne una anche dalla lista Movimenti.'
                )}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
