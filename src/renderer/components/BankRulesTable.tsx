import { SelectField } from '@/components/ui/selection-field';
import { useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { BankExpenseRule, CashDocument } from '../../domain/model';
import {
  bankRuleList,
  type BankRuleMatchFilter,
  type BankRuleSort,
} from '../lib/bank-rule-list';
import { BankCategoryCombobox } from '@/components/BankCategoryCombobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';

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
  const rows = useMemo(
    () => bankRuleList(doc, query, categoryId, matches, defaultSort),
    [doc, query, categoryId, matches],
  );
  const reset = () => {
    setQuery('');
    setCategoryId('all');
    setMatches('all');
  };
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
          <BankCategoryCombobox
            id="bank-rule-category-filter"
            categories={doc.bankExpenseCategories}
            specialOptions={[{ value: 'all', label: 'Tutte le categorie' }]}
            value={categoryId}
            onChange={setCategoryId}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="bank-rule-matches-filter"
            className="text-sm font-medium"
          >
            Corrispondenze delle regole
          </label>
          <SelectField
            id="bank-rule-matches-filter"
            value={matches}
            onValueChange={(value) => setMatches(value as BankRuleMatchFilter)}
            options={[
              { value: 'all', label: 'Tutte le regole' },
              { value: 'matched', label: 'Con corrispondenze' },
              { value: 'unmatched', label: 'Senza corrispondenze' },
            ]}
          />
        </div>
        <Button type="button" variant="outline" onClick={reset}>
          Reimposta filtri
        </Button>
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        {rows.length} di {doc.bankExpenseRules.length} regole · Corrispondenze
        su tutti gli anni, incluse le spese escluse dai conteggi.
      </p>
      <DataTable
        preferencesKey="bank-rules"
        initialSort={{ id: 'text', direction: 'asc' }}
        data={rows}
        longTableThreshold={Infinity}
        getRowKey={({ rule }) => rule.id}
        emptyMessage={
          doc.bankExpenseRules.length ? (
            <div className="space-y-3">
              <p>
                Nessuna regola corrisponde alla ricerca e ai filtri selezionati.
              </p>
              <Button variant="outline" onClick={reset}>
                Azzera ricerca e filtri
              </Button>
            </div>
          ) : (
            'Nessuna regola automatica. Puoi crearne una anche dalla lista Movimenti.'
          )
        }
        columns={[
          {
            id: 'text',
            header: 'Testo riconosciuto',
            value: ({ rule }) => rule.matchText,
            className: 'whitespace-normal break-words',
          },
          {
            id: 'category',
            header: 'Categoria',
            value: (row) => row.categoryLabel,
            className: 'whitespace-normal',
          },
          {
            id: 'matches',
            header: 'Corrispondenze',
            value: (row) => row.count,
            className: 'text-right',
            headClassName: 'text-right',
          },
          {
            id: 'actions',
            header: 'Azioni',
            value: () => undefined,
            sortable: false,
            configurable: false,
            cell: ({ rule }) => (
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
            ),
          },
        ]}
      />
    </div>
  );
}
