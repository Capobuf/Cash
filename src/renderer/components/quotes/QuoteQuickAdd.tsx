import {
  BookOpen,
  ListChecks,
  Route,
  Text,
  Plus,
  ReceiptEuro,
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
export const quoteKinds = [
  { kind: 'time', label: 'Attività', Icon: ListChecks },
  { kind: 'travel', label: 'Trasferta', Icon: Route },
  { kind: 'expense', label: 'Spesa', Icon: ReceiptEuro },
  { kind: 'generic', label: 'Riga generica', Icon: Text },
] as const;

export function QuoteEmptyRow({
  className,
  disabled,
  hasTemplates,
  hasCatalog,
  onSelect,
}: {
  className: string;
  disabled: boolean;
  hasTemplates: boolean;
  hasCatalog: boolean;
  onSelect: (kind: QuickKind | 'template' | 'catalog') => void;
}) {
  return (
    <div
      role="row"
      data-quote-empty-row
      className={`${className} min-h-12 border-b text-muted-foreground`}
    >
      <div role="cell" className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                aria-label="Scegli tipo per la nuova riga"
                title="Scegli tipo per la nuova riga"
              />
            }
          >
            <Plus />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {quoteKinds.map(({ kind, label, Icon }) => (
              <DropdownMenuItem key={kind} onClick={() => onSelect(kind)}>
                <Icon />
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!hasTemplates}
              onClick={() => onSelect('template')}
            >
              <BookOpen />
              Da template
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!hasCatalog}
              onClick={() => onSelect('catalog')}
            >
              <BookOpen />
              Da catalogo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} role="cell" />
      ))}
    </div>
  );
}
