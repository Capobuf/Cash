import {
  BookOpen,
  ListChecks,
  Route,
  Text,
  Plus,
  ReceiptEuro,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
export type QuickKind = 'generic' | 'time' | 'expense' | 'travel';
const kinds = [
  { kind: 'time', label: 'Attività', Icon: ListChecks },
  { kind: 'travel', label: 'Trasferta', Icon: Route },
  { kind: 'expense', label: 'Spesa', Icon: ReceiptEuro },
  { kind: 'generic', label: 'Riga generica', Icon: Text },
] as const;

export function QuoteAddMenu({
  disabled,
  hasTemplates,
  onSelect,
}: {
  disabled: boolean;
  hasTemplates: boolean;
  onSelect: (kind: QuickKind | 'template') => void;
}) {
  return (
    <div role="row" data-quote-add-menu>
      <div
        role="cell"
        aria-colspan={7}
        className="flex min-h-20 items-center justify-center py-4"
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                aria-label="Aggiungi riga"
              />
            }
          >
            <Plus />
            Aggiungi
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {kinds.map(({ kind, label, Icon }) => (
              <DropdownMenuItem key={kind} onClick={() => onSelect(kind)}>
                <Icon />
                {label}
              </DropdownMenuItem>
            ))}
            {hasTemplates ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onSelect('template')}>
                  <BookOpen />
                  Da template
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
