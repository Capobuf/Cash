import { useState } from 'react';
import { Input } from '@/components/ui/input';

// A pointer sensor can suppress blur and reparent (unmount) the active row.
// Register mounted cells so a draggable row can commit before that gesture starts.
const pendingInputs = new WeakMap<Element, () => boolean>();
export function commitActiveQuoteInput() {
  const active = document.activeElement;
  return active ? (pendingInputs.get(active)?.() ?? true) : true;
}

export function InlineQuoteInput({
  value,
  label,
  onCommit,
  onPreview,
  disabled,
  id,
  describedBy,
  placeholder,
  decimal = false,
  alignRight = false,
}: {
  value: string;
  label: string;
  onCommit: (value: string) => boolean;
  onPreview?: (value: string) => void;
  disabled?: boolean;
  id?: string;
  describedBy?: string;
  placeholder?: string;
  decimal?: boolean;
  alignRight?: boolean;
}) {
  const [draft, setDraft] = useState<string>();
  const [invalid, setInvalid] = useState(false);
  const commit = (next: string) => {
    if (disabled) return false;
    if (draft === undefined && next === value) return true;
    const saved = onCommit(next);
    if (saved) setDraft(undefined);
    setInvalid(!saved);
    return saved;
  };
  return (
    <Input
      ref={(input) => {
        if (!input) return;
        pendingInputs.set(input, () => commit(input.value));
        return () => {
          pendingInputs.delete(input);
        };
      }}
      id={id}
      aria-label={label}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      title={
        invalid
          ? 'Valore non valido. Correggi oppure premi Esc per ripristinare.'
          : label
      }
      disabled={disabled}
      className={`h-9 min-w-0 rounded-md border-transparent bg-transparent px-3 text-foreground shadow-none hover:border-border hover:bg-muted/30 focus-visible:border-foreground/25 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-foreground/10 disabled:bg-transparent dark:bg-transparent dark:focus-visible:ring-foreground/15 dark:disabled:bg-transparent ${decimal || alignRight ? 'text-right tabular-nums' : ''}`}
      inputMode={decimal ? 'decimal' : undefined}
      placeholder={placeholder}
      value={draft ?? value}
      onChange={(event) => {
        setDraft(event.target.value);
        setInvalid(false);
        onPreview?.(event.target.value);
      }}
      onBlur={(event) => {
        commit(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          event.currentTarget.value = value;
          setDraft(undefined);
          setInvalid(false);
          onPreview?.(value);
          event.currentTarget.blur();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
