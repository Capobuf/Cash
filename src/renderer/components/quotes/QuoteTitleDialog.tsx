import type { Quote } from '../../../domain/model';
import { quoteTitle } from '../../../domain/quotes';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formReader } from '@/lib/format';

export function QuoteTitleDialog({
  quote,
  readOnly,
  onClose,
  onSave,
}: {
  quote: Quote;
  readOnly: boolean;
  onClose: () => void;
  onSave: (title: string) => boolean;
}) {
  const automaticTitle = quoteTitle({ ...quote, customTitle: undefined });
  const save = (title: string) => {
    if (!readOnly && onSave(title)) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            save(formReader(event.currentTarget).get('title'));
          }}
        >
          <DialogHeader>
            <DialogTitle>Rinomina preventivo</DialogTitle>
            <DialogDescription>
              Lascia il titolo vuoto per usare il nome automatico. Il numero del
              preventivo rimane invariato.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="quote-title">Titolo personalizzato</FieldLabel>
            <Input
              id="quote-title"
              name="title"
              defaultValue={quote.customTitle ?? ''}
              placeholder={automaticTitle}
              aria-describedby="quote-automatic-title"
              disabled={readOnly}
              autoFocus
            />
            <p
              id="quote-automatic-title"
              className="text-sm text-muted-foreground [overflow-wrap:anywhere]"
            >
              Titolo automatico: {automaticTitle}
            </p>
          </Field>
          <DialogFooter className="flex-wrap">
            {quote.customTitle ? (
              <Button
                type="button"
                variant="ghost"
                disabled={readOnly}
                onClick={() => save('')}
              >
                Ripristina titolo automatico
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={readOnly}>
              Salva
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
