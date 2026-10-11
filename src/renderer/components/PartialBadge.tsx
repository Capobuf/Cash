import { Badge } from '@/components/ui/badge';

export function PartialBadge({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={`cursor-pointer hover:bg-muted ${className ?? ''}`}
      render={
        <button
          type="button"
          aria-label={`Mostra cosa manca per ${label}`}
          onClick={onClick}
        />
      }
    >
      Parziale
    </Badge>
  );
}
