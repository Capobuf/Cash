import { useState } from 'react';
import { templateRequiresTravel } from '../../../domain/catalog';
import {
  type CashDocument,
  type Quote,
  type ReusableSubItem,
  type VariantGroup,
} from '../../../domain/model';
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
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { eur, hours } from '@/lib/format';
import { ChoiceButton } from './ChoiceButton';

function withQuoteClientSites(
  document: CashDocument,
  quote: Quote,
): CashDocument {
  const client = quote.client;
  if (!client) return { ...document, sites: [] };
  return {
    ...document,
    sites: document.sites.filter(
      (site) =>
        site.client?.companyId === client.companyId &&
        site.client.clientId === client.clientId,
    ),
  };
}

export function CatalogPickerDialog({
  itemId,
  doc: sourceDocument,
  quote,
  onClose,
  onAdd,
}: {
  itemId: string;
  doc: CashDocument;
  quote: Quote;
  onClose: () => void;
  onAdd: (
    item: ReusableSubItem,
    context: { siteId?: string; vehicleId?: string },
  ) => Promise<boolean>;
}) {
  const doc = withQuoteClientSites(sourceDocument, quote);
  const [selectedId, setSelectedId] = useState('');
  const [siteId, setSiteId] = useState(quote.mainSite?.sourceId ?? '');
  const [vehicleId, setVehicleId] = useState(
    doc.settings.defaultVehicleId ?? '',
  );
  const [busy, setBusy] = useState(false);
  const selected = doc.catalog.subItems.find(
    (entry) => entry.id === selectedId,
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Aggiungi dal catalogo</DialogTitle>
          <DialogDescription>
            Verrà inserita una copia indipendente nella voce corrente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
          <ScrollArea className="h-80 rounded-lg border">
            <div className="p-2">
              {doc.catalog.subItems.map((item) => (
                <ChoiceButton
                  key={item.id}
                  selected={selectedId === item.id}
                  title={item.description}
                  detail={
                    item.kind === 'time'
                      ? `Tempo · ${hours(item.minutes)}`
                      : item.kind === 'expense'
                        ? `Spesa · ${eur(item.amount)}`
                        : `Trasferta · ${item.occurrences} occorrenze`
                  }
                  onClick={() => setSelectedId(item.id)}
                />
              ))}
            </div>
          </ScrollArea>
          <div className="space-y-3">
            {selected?.kind === 'travel' ? (
              <>
                <Field>
                  <FieldLabel htmlFor={`catalog-site-${itemId}`}>
                    Sede
                  </FieldLabel>
                  <NativeSelect
                    id={`catalog-site-${itemId}`}
                    value={siteId}
                    onChange={(event) => setSiteId(event.target.value)}
                  >
                    <NativeSelectOption value="">Scegli</NativeSelectOption>
                    {doc.sites.map((site) => (
                      <NativeSelectOption key={site.id} value={site.id}>
                        {site.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`catalog-vehicle-${itemId}`}>
                    Veicolo
                  </FieldLabel>
                  <NativeSelect
                    id={`catalog-vehicle-${itemId}`}
                    value={vehicleId}
                    onChange={(event) => setVehicleId(event.target.value)}
                  >
                    <NativeSelectOption value="">Scegli</NativeSelectOption>
                    {doc.vehicles.map((vehicle) => (
                      <NativeSelectOption key={vehicle.id} value={vehicle.id}>
                        {vehicle.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Seleziona una sottovoce per vedere i dettagli.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            disabled={
              !selected ||
              busy ||
              (selected.kind === 'travel' && (!siteId || !vehicleId))
            }
            onClick={() => {
              if (!selected) return;
              setBusy(true);
              void onAdd(selected, { siteId, vehicleId }).then((ok) => {
                setBusy(false);
                if (ok) onClose();
              });
            }}
          >
            {busy ? 'Inserimento…' : 'Aggiungi copia'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InsertTemplateDialog({
  doc: sourceDocument,
  quote,
  onClose,
  onInsert,
}: {
  doc: CashDocument;
  quote: Quote;
  onClose: () => void;
  onInsert: (
    templateId: string,
    choices: Record<string, string>,
    context: { siteId?: string; vehicleId?: string },
  ) => Promise<boolean>;
}) {
  const doc = withQuoteClientSites(sourceDocument, quote);
  const [templateId, setTemplateId] = useState(
    doc.catalog.templates[0]?.id ?? '',
  );
  const template = doc.catalog.templates.find(
    (entry) => entry.id === templateId,
  );
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [siteId, setSiteId] = useState(quote.mainSite?.sourceId ?? '');
  const [vehicleId, setVehicleId] = useState(
    doc.settings.defaultVehicleId ?? '',
  );
  const [busy, setBusy] = useState(false);
  const groups = template?.items.flatMap((item) => item.variantGroups) ?? [];
  const hasTravel = template
    ? templateRequiresTravel(template, choices)
    : false;
  const complete =
    groups.every((group) => {
      const optionId = choices[group.id] ?? group.defaultOptionId;
      return Boolean(
        optionId && group.options.some((option) => option.id === optionId),
      );
    }) &&
    (!hasTravel || Boolean(siteId && vehicleId));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Inserisci template</DialogTitle>
          <DialogDescription>
            Le voci inserite saranno copie indipendenti e resteranno
            completamente modificabili.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
          <ScrollArea className="h-[420px] rounded-lg border">
            <div className="p-2">
              {doc.catalog.templates.map((entry) => (
                <ChoiceButton
                  key={entry.id}
                  selected={entry.id === templateId}
                  title={entry.name}
                  detail={`${entry.items.length} ${entry.items.length === 1 ? 'voce' : 'voci'}`}
                  onClick={() => {
                    setTemplateId(entry.id);
                    setChoices({});
                  }}
                />
              ))}
            </div>
          </ScrollArea>
          <ScrollArea className="h-[420px]">
            <div className="space-y-4 pr-3">
              {template ? (
                <>
                  <div className="rounded-lg border">
                    <div className="border-b px-4 py-3">
                      <h3 className="font-medium">{template.name}</h3>
                    </div>
                    <div className="divide-y">
                      {template.items.map((item) => (
                        <div key={item.id} className="space-y-3 px-4 py-3">
                          <p className="font-medium">{item.name}</p>
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted-foreground">
                              Sempre incluso
                            </span>
                            <span>
                              {item.subItems.length}{' '}
                              {item.subItems.length === 1
                                ? 'elemento'
                                : 'elementi'}
                            </span>
                          </div>
                          {item.variantGroups.length ? (
                            <div className="space-y-2">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Varianti
                              </p>
                              {item.variantGroups.map((group) => {
                                const optionId =
                                  choices[group.id] ??
                                  group.defaultOptionId ??
                                  '';
                                const option = group.options.find(
                                  (candidate) => candidate.id === optionId,
                                );
                                return group.defaultOptionId ? (
                                  <div
                                    key={group.id}
                                    className="flex items-center justify-between gap-3 text-sm"
                                  >
                                    <span>{group.name}</span>
                                    <span className="font-medium">
                                      {option?.name}
                                    </span>
                                  </div>
                                ) : (
                                  <Field key={group.id}>
                                    <FieldLabel
                                      htmlFor={`template-choice-${group.id}`}
                                    >
                                      {group.name}
                                    </FieldLabel>
                                    <NativeSelect
                                      id={`template-choice-${group.id}`}
                                      value={choices[group.id] ?? ''}
                                      onChange={(event) =>
                                        setChoices((current) => ({
                                          ...current,
                                          [group.id]: event.target.value,
                                        }))
                                      }
                                    >
                                      <NativeSelectOption value="">
                                        Scegli opzione
                                      </NativeSelectOption>
                                      {group.options.map((candidate) => (
                                        <NativeSelectOption
                                          key={candidate.id}
                                          value={candidate.id}
                                        >
                                          {candidate.name}
                                        </NativeSelectOption>
                                      ))}
                                    </NativeSelect>
                                  </Field>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  {hasTravel ? (
                    <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="template-site">
                          Sede per le trasferte
                        </FieldLabel>
                        <NativeSelect
                          id="template-site"
                          value={siteId}
                          onChange={(event) => setSiteId(event.target.value)}
                        >
                          <NativeSelectOption value="">
                            Scegli sede
                          </NativeSelectOption>
                          {doc.sites.map((site) => (
                            <NativeSelectOption key={site.id} value={site.id}>
                              {site.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="template-vehicle">
                          Veicolo
                        </FieldLabel>
                        <NativeSelect
                          id="template-vehicle"
                          value={vehicleId}
                          onChange={(event) => setVehicleId(event.target.value)}
                        >
                          <NativeSelectOption value="">
                            Scegli veicolo
                          </NativeSelectOption>
                          {doc.vehicles.map((vehicle) => (
                            <NativeSelectOption
                              key={vehicle.id}
                              value={vehicle.id}
                            >
                              {vehicle.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Seleziona un template.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            disabled={!template || !complete || busy}
            onClick={() => {
              if (!template) return;
              setBusy(true);
              void onInsert(template.id, choices, { siteId, vehicleId }).then(
                (ok) => {
                  setBusy(false);
                  if (ok) onClose();
                },
              );
            }}
          >
            {busy
              ? 'Inserimento…'
              : `Inserisci ${template?.items.length ?? 0} ${template?.items.length === 1 ? 'voce' : 'voci'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VariantChangeDialog({
  group,
  optionId,
  doc: sourceDocument,
  quote,
  hasManualChanges,
  onClose,
  onChange,
}: {
  group: VariantGroup;
  optionId: string;
  doc: CashDocument;
  quote: Quote;
  hasManualChanges: boolean;
  onClose: () => void;
  onChange: (
    context: { siteId?: string; vehicleId?: string },
    force: boolean,
  ) => Promise<boolean>;
}) {
  const doc = withQuoteClientSites(sourceDocument, quote);
  const option = group.options.find((entry) => entry.id === optionId);
  const needsTravel =
    option?.subItems.some((entry) => entry.kind === 'travel') ?? false;
  const [siteId, setSiteId] = useState(quote.mainSite?.sourceId ?? '');
  const [vehicleId, setVehicleId] = useState(
    doc.settings.defaultVehicleId ?? '',
  );
  const [busy, setBusy] = useState(false);
  const apply = () => {
    setBusy(true);
    void onChange({ siteId, vehicleId }, hasManualChanges).then((ok) => {
      setBusy(false);
      if (ok) onClose();
    });
  };
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasManualChanges
              ? 'Sostituire le sottovoci modificate?'
              : `Usare “${option?.name}”?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasManualChanges
              ? 'Le modifiche manuali alle sottovoci prodotte da questa variante verranno perse. Le altre sottovoci resteranno invariate.'
              : 'La selezione sostituirà soltanto le sottovoci prodotte da questa variante.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {needsTravel ? (
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="change-site">Sede</FieldLabel>
              <NativeSelect
                id="change-site"
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
              >
                <NativeSelectOption value="">Scegli sede</NativeSelectOption>
                {doc.sites.map((site) => (
                  <NativeSelectOption key={site.id} value={site.id}>
                    {site.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="change-vehicle">Veicolo</FieldLabel>
              <NativeSelect
                id="change-vehicle"
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
              >
                <NativeSelectOption value="">Scegli veicolo</NativeSelectOption>
                {doc.vehicles.map((vehicle) => (
                  <NativeSelectOption key={vehicle.id} value={vehicle.id}>
                    {vehicle.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || (needsTravel && (!siteId || !vehicleId))}
            onClick={apply}
          >
            {busy ? 'Applicazione…' : 'Conferma cambio'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
