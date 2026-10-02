import { useMemo, useState } from 'react';
import {
  bankRuleMatches,
  normalizeBankRuleText,
} from '../../domain/bank-expenses';
import {
  meta,
  nowIso,
  type BankExpenseRule,
  type CashDocument,
} from '../../domain/model';
import type { AppState } from '../state';
import { BankCategoryCombobox } from './BankCategoryCombobox';
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
import { Input } from '@/components/ui/input';

// Mounted only while editing, so draft values reset for each new dialog.
export function BankRuleDialog({
  doc,
  appState,
  rule,
  description,
  onClose,
}: {
  doc: CashDocument;
  appState: AppState;
  rule?: BankExpenseRule;
  description?: string;
  onClose(): void;
}) {
  const [matchText, setMatchText] = useState(
    rule?.matchText ?? description ?? '',
  );
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '');
  const readOnly =
    appState.session?.readOnly || appState.status === 'Conflitto esterno';
  const validText = normalizeBankRuleText(matchText).length > 0;
  const count = useMemo(
    () =>
      doc.bankExpenses.filter((expense) =>
        bankRuleMatches(expense.description, matchText),
      ).length,
    [doc.bankExpenses, matchText],
  );
  const canSave =
    validText &&
    doc.bankExpenseCategories.some((category) => category.id === categoryId) &&
    !readOnly;
  const save = () => {
    if (!canSave) return;
    if (
      !appState.mutate((document) => {
        if (rule) {
          const existing = document.bankExpenseRules.find(
            (item) => item.id === rule.id,
          );
          if (existing) {
            existing.matchText = matchText.trim();
            existing.categoryId = categoryId;
            existing.updatedAt = nowIso();
          }
        } else
          document.bankExpenseRules.push({
            ...meta(),
            matchText: matchText.trim(),
            categoryId,
          });
      })
    )
      return;
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {rule ? 'Modifica regola' : 'Crea regola'}
            </DialogTitle>
            <DialogDescription>
              La categoria si applica alle spese di tutti gli anni, presenti e
              future. Spazi, punteggiatura e maiuscole non influiscono sul
              riconoscimento.
            </DialogDescription>
          </DialogHeader>
          {description !== undefined ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Descrizione originale</p>
              <p className="break-words rounded-md bg-muted p-3 text-sm">
                {description}
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="bank-rule-text" className="text-sm font-medium">
              Testo da riconoscere
            </label>
            <Input
              id="bank-rule-text"
              autoFocus
              required
              value={matchText}
              onChange={(event) => setMatchText(event.target.value)}
              aria-describedby="bank-rule-preview"
            />
            {!validText ? (
              <p className="text-sm text-muted-foreground">
                Inserisci almeno una lettera o un numero.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label htmlFor="bank-rule-category" className="text-sm font-medium">
              Categoria da applicare
            </label>
            <BankCategoryCombobox
              id="bank-rule-category"
              categories={doc.bankExpenseCategories}
              value={categoryId}
              disabled={readOnly}
              onChange={setCategoryId}
            />
            {!doc.bankExpenseCategories.length ? (
              <p className="text-sm text-muted-foreground">
                Crea una categoria qui sotto per applicarla con la regola.
              </p>
            ) : null}
          </div>
          <BankQuickCategory
            categories={doc.bankExpenseCategories}
            appState={appState}
            onCreated={setCategoryId}
          />
          <p id="bank-rule-preview" role="status" className="text-sm">
            Questa regola corrisponde a {count} spese presenti.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={!canSave}>
              {rule ? 'Conferma modifiche' : 'Conferma e crea regola'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
