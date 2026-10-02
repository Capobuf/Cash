import { useState } from 'react';
import { automaticCategoryIds } from '../../domain/bank-expenses';
import {
  nowIso,
  type BankExpense,
  type CashDocument,
} from '../../domain/model';
import type { AppState } from '../state';
import { BankCategoryChecklist } from './BankCategoryChecklist';
import { BankQuickCategory } from './BankQuickCategory';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function BankManualCategoriesDialog({
  expense,
  doc,
  appState,
  onClose,
}: {
  expense: BankExpense;
  doc: CashDocument;
  appState: AppState;
  onClose(): void;
}) {
  const [selected, setSelected] = useState(expense.categoryIds);
  const auto = automaticCategoryIds(expense, doc.bankExpenseRules);
  const readOnly =
    appState.session?.readOnly || appState.status === 'Conflitto esterno';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Categorie manuali</DialogTitle>
          <DialogDescription>
            {expense.description}. Seleziona una o più categorie. Le categorie
            automatiche dipendono dalle regole e restano applicate anche senza
            selezione manuale.
          </DialogDescription>
        </DialogHeader>
        <BankCategoryChecklist
          categories={doc.bankExpenseCategories}
          selected={selected}
          automatic={auto}
          disabled={readOnly}
          onChange={setSelected}
        />
        <BankQuickCategory
          categories={doc.bankExpenseCategories}
          appState={appState}
          onCreated={(id) => setSelected((current) => [...current, id])}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            disabled={readOnly}
            onClick={() => {
              if (readOnly) return;
              const saved = appState.mutate((document) => {
                const row = document.bankExpenses.find(
                  (item) => item.id === expense.id,
                );
                if (row) {
                  row.categoryIds = selected;
                  row.updatedAt = nowIso();
                }
              });
              if (saved) onClose();
            }}
          >
            Salva categorie
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
