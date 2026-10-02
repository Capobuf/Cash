import { type TemplatePack } from '../../../domain/template-pack';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';

export type TemplateImportPreview = {
  fileName: string;
  pack: TemplatePack;
  conflicts: Set<number>;
  importAnyway: Record<number, boolean>;
};

export function TemplateImportDialog({
  preview,
  onChange,
  onClose,
  onImport,
}: {
  preview: TemplateImportPreview;
  onChange: (templateIndex: number, importAnyway: boolean) => void;
  onClose: () => void;
  onImport: () => void;
}) {
  const selectedCount = preview.pack.templates.filter(
    (_, index) => !preview.conflicts.has(index) || preview.importAnyway[index],
  ).length;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importa Template</DialogTitle>
          <DialogDescription>
            {preview.fileName} · {preview.pack.templates.length} template
            {preview.conflicts.size
              ? ` · ${preview.conflicts.size} ${preview.conflicts.size === 1 ? 'conflitto' : 'conflitti'}`
              : ' · nessun conflitto'}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {preview.pack.templates.map((template, templateIndex) => {
            const conflict = preview.conflicts.has(templateIndex);
            return (
              <div
                key={`${template.name}-${templateIndex}`}
                className="flex items-center gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {template.items.length}{' '}
                    {template.items.length === 1 ? 'voce' : 'voci'}
                  </p>
                </div>
                {conflict ? (
                  <Badge variant="outline">Conflitto</Badge>
                ) : (
                  <Badge variant="secondary">Nuovo</Badge>
                )}
                {conflict ? (
                  <NativeSelect
                    size="sm"
                    aria-label={`Scelta per il conflitto ${template.name}`}
                    value={
                      preview.importAnyway[templateIndex] ? 'import' : 'skip'
                    }
                    onChange={(event) =>
                      onChange(templateIndex, event.target.value === 'import')
                    }
                  >
                    <NativeSelectOption value="skip">Salta</NativeSelectOption>
                    <NativeSelectOption value="import">
                      Importa comunque
                    </NativeSelectOption>
                  </NativeSelect>
                ) : null}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={onImport}>
            {selectedCount
              ? `Importa ${selectedCount}`
              : 'Chiudi senza importare'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
