import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FiscalCorrectionForm } from './FiscalCorrectionForm';

export function FiscalCorrectionDialog({
  year,
  total,
  disabled,
  onSave,
}: {
  year: number;
  total?: string;
  disabled?: boolean;
  onSave: (total: string | undefined) => boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="sm" />}
      >
        {total === undefined ? 'Imposta' : 'Modifica'}
      </DialogTrigger>
      <DialogContent className="max-h-[min(88vh,52rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Totale annuale del commercialista · {year}</DialogTitle>
          <DialogDescription>
            Il totale comprende quanto già versato nell’anno e permette di
            determinare il residuo ancora da versare.
          </DialogDescription>
        </DialogHeader>
        <FiscalCorrectionForm
          key={`${year}:${total ?? 'unset'}`}
          year={year}
          total={total}
          disabled={disabled}
          onSave={onSave}
          onSaved={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
