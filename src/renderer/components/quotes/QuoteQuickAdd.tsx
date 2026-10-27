import { useRef, useState } from 'react';
import {
  BookOpen,
  Clock3,
  MapPin,
  Minus,
  Plus,
  ReceiptText,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseDuration } from '../../../domain/duration';
import { parseDecimalInput } from '../../../domain/decimal';
import { decimalInputValue } from '@/lib/format';
import type { SimpleSubInput } from '@/hooks/use-quote-controller';
import type { QuoteInsertionPoint } from '@/lib/quote-insertion';

type QuickKind = 'generic' | 'time' | 'expense' | 'travel';
const kinds = [
  { kind: 'time', label: 'Attività', Icon: Clock3 },
  { kind: 'travel', label: 'Trasferta', Icon: MapPin },
  { kind: 'expense', label: 'Spesa', Icon: ReceiptText },
  { kind: 'generic', label: 'Riga generica', Icon: Minus },
] as const;

export function QuoteQuickAdd({
  point,
  disabled,
  hasTemplates,
  onAdd,
  onTemplate,
  onClose,
  autoFocus = false,
}: {
  point: QuoteInsertionPoint;
  disabled: boolean;
  hasTemplates: boolean;
  onAdd: (
    name: string,
    point: QuoteInsertionPoint,
    input?: SimpleSubInput,
    travel?: boolean,
  ) => string | false;
  onTemplate: (point: QuoteInsertionPoint) => void;
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const [kind, setKind] = useState<QuickKind>('time');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [afterItemId, setAfterItemId] = useState(point.afterItemId);
  const nameRef = useRef<HTMLInputElement>(null);
  const insertion = { ...point, afterItemId };
  return (
    <form
      data-quote-quick-add={`${point.containerId ?? 'root'}:${point.afterItemId ?? 'end'}`}
      className="space-y-2 border-b bg-muted/20 p-3"
      aria-label="Inserimento rapido"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || !name.trim()) return;
        let input: SimpleSubInput | undefined;
        if (value.trim() && kind === 'time') {
          const duration = parseDuration(value);
          if (!duration.ok) {
            setError(duration.error.message);
            return;
          }
          input = { kind, description: name, minutes: duration.value };
        } else if (value.trim() && kind === 'expense') {
          const amount = parseDecimalInput(decimalInputValue(value), 2);
          if (!amount.ok) {
            setError(amount.error.message);
            return;
          }
          input = { kind, description: name, amount: amount.value };
        }
        const id = onAdd(name, insertion, input, kind === 'travel');
        if (!id) return;
        // Continue typing in sequence, including when insertion started between rows.
        if (afterItemId) setAfterItemId(id);
        setName('');
        setValue('');
        setError('');
        nameRef.current?.focus();
      }}
    >
      <div className="flex flex-wrap items-center gap-1">
        {kinds.map(({ kind: next, label, Icon }) => (
          <Button
            key={next}
            type="button"
            size="sm"
            variant={kind === next ? 'secondary' : 'ghost'}
            aria-pressed={kind === next}
            disabled={disabled}
            onClick={() => {
              setKind(next);
              setValue('');
              setError('');
              nameRef.current?.focus();
            }}
          >
            <Icon />
            {label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || !hasTemplates}
          onClick={() => {
            onTemplate(insertion);
            onClose?.();
          }}
        >
          <BookOpen />
          Da template
        </Button>
        {onClose ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="ml-auto"
            aria-label="Chiudi inserimento"
            onClick={onClose}
          >
            <X />
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Input
          ref={nameRef}
          autoFocus={autoFocus}
          aria-label="Nome del lavoro da aggiungere"
          placeholder="Descrivi il prossimo lavoro…"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1"
          required
        />
        {kind === 'time' || kind === 'expense' ? (
          <Input
            aria-label={
              kind === 'time' ? 'Durata facoltativa' : 'Spesa facoltativa'
            }
            placeholder={kind === 'time' ? 'Durata (es. 30m)' : 'Spesa (€)'}
            inputMode={kind === 'expense' ? 'decimal' : undefined}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError('');
            }}
            disabled={disabled}
            className="w-40"
            aria-invalid={Boolean(error)}
          />
        ) : null}
        <Button type="submit" size="sm" disabled={disabled || !name.trim()}>
          <Plus />
          {kind === 'travel' ? 'Configura trasferta' : 'Aggiungi riga'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
