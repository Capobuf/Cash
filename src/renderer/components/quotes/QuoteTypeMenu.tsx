import { useState, type ReactNode } from 'react';
import { BookOpen, ListChecks, ReceiptEuro, Route, Text } from 'lucide-react';
import type { QuoteSubItem } from '../../../domain/model';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const types = [
  ['time', 'Attività', ListChecks],
  ['expense', 'Spesa', ReceiptEuro],
  ['travel', 'Trasferta', Route],
] as const;

export function QuoteTypeMenu({
  label,
  typeLabel,
  sub,
  complex = false,
  disabled,
  children,
  onChange,
  onGeneric,
  onTemplate,
  onCatalog,
  onComplexChange,
  generic = false,
  hasTemplates = false,
  hasCatalog = false,
}: {
  label: string;
  typeLabel: string;
  sub?: QuoteSubItem;
  complex?: boolean;
  disabled: boolean;
  children: ReactNode;
  onGeneric?: () => void;
  onTemplate?: () => void;
  onCatalog?: () => void;
  onComplexChange?: (kind: QuoteSubItem['kind']) => void;
  generic?: boolean;
  hasTemplates?: boolean;
  hasCatalog?: boolean;
  onChange: (
    kind: QuoteSubItem['kind'],
    expected?: QuoteSubItem,
  ) => Promise<boolean>;
}) {
  const [pending, setPending] = useState<{
    kind: QuoteSubItem['kind'];
    sub: QuoteSubItem;
  }>();
  const [busy, setBusy] = useState(false);
  const convert = async (
    kind: QuoteSubItem['kind'],
    expected?: QuoteSubItem,
  ) => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      if (await onChange(kind, expected)) setPending(undefined);
    } finally {
      setBusy(false);
    }
  };
  const select = (kind: QuoteSubItem['kind']) => {
    if (complex && onComplexChange) {
      onComplexChange(kind);
      return;
    }
    if (
      sub &&
      (sub.kind === 'travel' ||
        (sub.kind === 'time'
          ? sub.minutes !== undefined
          : sub.amount !== undefined))
    ) {
      setPending({ kind, sub });
    } else void convert(kind, sub);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={disabled || busy}
              aria-label={`Cambia tipo ${label}`}
              title={`${typeLabel} · Cambia tipo`}
            />
          }
        >
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {complex && !onComplexChange ? (
            <p className="max-w-64 px-2 py-1.5 text-xs text-muted-foreground">
              Questa voce contiene più sottorighe o varianti. Cambia il tipo
              delle singole sottorighe.
            </p>
          ) : null}
          {types.map(([kind, name, Icon]) => (
            <DropdownMenuItem
              key={kind}
              disabled={(complex && !onComplexChange) || sub?.kind === kind}
              onClick={() => select(kind)}
            >
              <Icon />
              {name}
            </DropdownMenuItem>
          ))}
          {onGeneric || onTemplate || onCatalog ? (
            <DropdownMenuSeparator />
          ) : null}
          {onGeneric ? (
            <DropdownMenuItem disabled={generic} onClick={onGeneric}>
              <Text />
              Riga generica
            </DropdownMenuItem>
          ) : null}
          {onTemplate ? (
            <DropdownMenuItem disabled={!hasTemplates} onClick={onTemplate}>
              <BookOpen />
              Da template
            </DropdownMenuItem>
          ) : null}
          {onCatalog ? (
            <DropdownMenuItem disabled={!hasCatalog} onClick={onCatalog}>
              <BookOpen />
              Da catalogo
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Convertire in{' '}
              {types
                .find(([kind]) => kind === pending?.kind)?.[1]
                .toLowerCase()}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.sub.kind === 'time'
                ? 'La durata verrà rimossa. '
                : pending?.sub.kind === 'expense'
                  ? 'L’importo della spesa verrà rimosso. '
                  : 'Percorso, veicolo, tempi e costi della trasferta verranno rimossi. '}
              Descrizione e prezzo scelto resteranno invariati. I dati del nuovo
              tipo saranno da compilare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={disabled || busy}
              onClick={() => {
                if (pending) void convert(pending.kind, pending.sub);
              }}
            >
              Converti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
