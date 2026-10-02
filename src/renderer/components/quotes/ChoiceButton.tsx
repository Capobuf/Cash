import { Check, ChevronRight } from 'lucide-react';

export function ChoiceButton({
  selected,
  title,
  detail,
  onClick,
}: {
  selected: boolean;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted'}`}
      onClick={onClick}
    >
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
      {selected ? (
        <Check className="size-4" />
      ) : (
        <ChevronRight className="size-4 text-muted-foreground" />
      )}
    </button>
  );
}
