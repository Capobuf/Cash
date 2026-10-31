import { templateSearchText } from '@/lib/template-search';
import { siteOptions } from '@/lib/site-options';
import { Spinner } from '@/components/ui/spinner';
import { SearchableSelect } from '@/components/ui/selection-field';
import {
  ListTree,
  GitBranch,
  ListChecks,
  ReceiptEuro,
  Route,
  BookOpen,
  Check,
  X,
} from 'lucide-react';
import { calculateItem, calculateTravel } from '../../../domain/calculations';
import {
  quoteColumns,
  QuoteTableHeader,
  QuoteVariantRow,
  QuoteVariantSelect,
} from './QuoteItemRow';
import { Fragment, useState, type ComponentProps } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { templateRequiresTravel } from '../../../domain/catalog';
import {
  type CashDocument,
  type Quote,
  type ReusableSubItem,
  type VariantGroup,
  type TemplateItem,
  type SubItemDefinition,
  type QuoteSubItem,
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
import { Field, FieldLabel } from '@/components/ui/field';
import { eur, hours } from '@/lib/format';

export function CatalogPickerEditor({
  itemId,
  replaceItem = false,
  doc,
  quote,
  disabled,
  onClose,
  onAdd,
}: {
  itemId: string;
  replaceItem?: boolean;
  doc: CashDocument;
  quote: Quote;
  disabled: boolean;
  onClose: () => void;
  onAdd: (
    item: ReusableSubItem,
    context: { siteId?: string; vehicleId?: string },
  ) => Promise<boolean>;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [siteId, setSiteId] = useState(quote.mainSite?.sourceId ?? '');
  const [vehicleId, setVehicleId] = useState(
    doc.settings.defaultVehicleId ?? '',
  );
  const [busy, setBusy] = useState(false);
  const selected = doc.catalog.subItems.find(
    (entry) => entry.id === selectedId,
  );
  const complete =
    selected && (selected.kind !== 'travel' || Boolean(siteId && vehicleId));
  return (
    <form
      role="rowgroup"
      data-quote-catalog-editor
      aria-label={
        replaceItem ? 'Sostituisci dal catalogo' : 'Aggiungi dal catalogo'
      }
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled || busy || !selected || !complete) return;
        setBusy(true);
        try {
          if (await onAdd(selected, { siteId, vehicleId })) onClose();
        } finally {
          setBusy(false);
        }
      }}
    >
      <div
        role="row"
        className={`${quoteColumns} min-h-12 border-b bg-muted/20 py-1`}
      >
        <div role="cell" className="flex justify-end border-r pr-3">
          <BookOpen className="size-3.5 text-muted-foreground" />
        </div>
        <div role="cell" className="min-w-0 pl-2">
          <SearchableSelect
            id={`catalog-entry-${itemId}`}
            aria-label="Sottoriga dal catalogo"
            className="w-full"
            disabled={disabled || busy}
            value={selectedId}
            onValueChange={setSelectedId}
            options={[
              { value: '', label: 'Scegli dal catalogo', disabled: true },
              ...doc.catalog.subItems.map((item) => ({
                value: item.id,
                label: item.description,
              })),
            ]}
          />
        </div>
        <div role="cell" className="text-right text-sm tabular-nums">
          {selected?.kind === 'time' ? hours(selected.minutes) : ''}
        </div>
        <div role="cell" className="text-right text-sm tabular-nums">
          {selected?.kind === 'expense' ? eur(selected.amount) : ''}
        </div>
        <div role="cell" className="text-right text-sm text-muted-foreground" />
        <div role="cell" className="text-right text-sm text-muted-foreground" />
        <div role="cell" className="flex justify-end">
          <Button
            type="submit"
            size="icon-sm"
            disabled={disabled || busy || !complete}
            aria-label={
              replaceItem ? 'Sostituisci dal catalogo' : 'Aggiungi dal catalogo'
            }
            title={
              replaceItem ? 'Sostituisci dal catalogo' : 'Aggiungi dal catalogo'
            }
          >
            {busy ? <Spinner /> : <Check />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            aria-label="Annulla inserimento dal catalogo"
            title="Annulla"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
      {selected?.kind === 'travel' ? (
        <div role="row">
          <div
            role="cell"
            aria-colspan={7}
            className="grid grid-cols-2 gap-3 border-b bg-muted/15 px-6 py-3"
          >
            <Field>
              <FieldLabel htmlFor={`catalog-site-${itemId}`}>Sede</FieldLabel>
              <SearchableSelect
                id={`catalog-site-${itemId}`}
                value={siteId}
                disabled={disabled || busy}
                onValueChange={setSiteId}
                options={[
                  { value: '', label: 'Scegli sede' },
                  ...siteOptions(doc.sites, quote.client),
                ]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`catalog-vehicle-${itemId}`}>
                Veicolo
              </FieldLabel>
              <SearchableSelect
                id={`catalog-vehicle-${itemId}`}
                value={vehicleId}
                disabled={disabled || busy}
                onValueChange={setVehicleId}
                options={[
                  { value: '', label: 'Scegli veicolo' },
                  ...doc.vehicles.map((vehicle) => ({
                    value: vehicle.id,
                    label: vehicle.name,
                  })),
                ]}
              />
            </Field>
          </div>
        </div>
      ) : null}
    </form>
  );
}

// Only main rows use this selector. Subrow insertion keeps CatalogPickerEditor.
export function CatalogRowEditor({
  onTemplate,
  ...props
}: Omit<ComponentProps<typeof CatalogPickerEditor>, 'replaceItem'> & {
  onTemplate: ComponentProps<typeof InsertTemplateEditor>['onInsert'];
}) {
  return (
    <div role="row">
      <div role="cell" aria-colspan={7}>
        <Tabs
          defaultValue={
            props.doc.catalog.subItems.length ? 'subitems' : 'templates'
          }
          className="space-y-2 border-b py-2"
        >
          <TabsList className="mx-3" aria-label="Contenuto dal catalogo">
            <TabsTrigger
              value="subitems"
              disabled={!props.doc.catalog.subItems.length}
            >
              Voci riutilizzabili
            </TabsTrigger>
            <TabsTrigger
              value="templates"
              disabled={!props.doc.catalog.templates.length}
            >
              Template
            </TabsTrigger>
          </TabsList>
          <TabsContent value="subitems">
            <CatalogPickerEditor {...props} replaceItem />
          </TabsContent>
          <TabsContent value="templates">
            <InsertTemplateEditor
              doc={props.doc}
              quote={props.quote}
              disabled={props.disabled}
              onClose={props.onClose}
              onInsert={onTemplate}
              replaceItem
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export function InsertTemplateEditor({
  replaceItem = false,
  singleRow = false,
  doc,
  quote,
  disabled,
  onClose,
  onInsert,
}: {
  replaceItem?: boolean;
  singleRow?: boolean;
  doc: CashDocument;
  quote: Quote;
  disabled: boolean;
  onClose: () => void;
  onInsert: (
    templateId: string,
    choices: Record<string, string>,
    context: { siteId?: string; vehicleId?: string },
  ) => Promise<boolean>;
}) {
  const [templateId, setTemplateId] = useState('');
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
      const id = choices[group.id] ?? group.defaultOptionId;
      return Boolean(id && group.options.some((option) => option.id === id));
    }) &&
    (!hasTravel || Boolean(siteId && vehicleId));
  return (
    <section
      data-quote-template-editor
      aria-label={
        replaceItem ? 'Applica template alla riga' : 'Inserisci template'
      }
      aria-busy={busy}
      className="space-y-3 border-b bg-muted/10 py-3"
    >
      <div className="flex items-center gap-3 px-3">
        <h4 className="shrink-0 text-sm font-medium">
          {replaceItem ? 'Applica template alla riga' : 'Inserisci template'}
        </h4>
        {template ? (
          <span className="text-xs text-muted-foreground">
            Anteprima · da confermare
          </span>
        ) : null}
      </div>
      {replaceItem ? (
        <p className="px-3 text-sm text-muted-foreground">
          Tutti i dati tecnici e le varianti del template saranno riuniti in
          questa riga principale, che prenderà il nome del template. Prezzo
          scelto e posizione resteranno invariati.
        </p>
      ) : null}
      {singleRow ? (
        <p className="px-3 text-sm text-muted-foreground">
          Le voci del template saranno riunite in una sola riga principale, con
          tutte le relative varianti.
        </p>
      ) : null}
      <div className="px-3">
        <SearchableSelect
          className="max-w-md"
          id="quote-template-picker"
          aria-label="Template da inserire"
          value={templateId}
          disabled={disabled || busy}
          onValueChange={(id) => {
            setTemplateId(id);
            setChoices({});
          }}
          options={[
            { value: '', label: 'Scegli template', disabled: true },
            ...doc.catalog.templates.map((entry) => ({
              value: entry.id,
              label: entry.name,
              searchText: templateSearchText(entry),
            })),
          ]}
        />
      </div>
      {template ? (
        <>
          <div role="table" aria-label={`Anteprima ${template.name}`}>
            <QuoteTableHeader />
            <div role="rowgroup">
              {template.items.map((item) => (
                <TemplatePreviewItem
                  key={item.id}
                  item={item}
                  hourly={quote.profileSnapshot?.hourlyTarget}
                  choices={choices}
                  disabled={disabled || busy}
                  onChoice={(groupId, optionId) =>
                    setChoices((current) => ({
                      ...current,
                      [groupId]: optionId,
                    }))
                  }
                />
              ))}
            </div>
          </div>
          {hasTravel ? (
            <div className="grid gap-3 px-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="template-site">
                  Sede per le trasferte
                </FieldLabel>
                <SearchableSelect
                  id="template-site"
                  disabled={disabled || busy}
                  value={siteId}
                  onValueChange={(value) => setSiteId(value)}
                  options={[
                    { value: '', label: 'Scegli sede' },
                    ...siteOptions(doc.sites, quote.client),
                  ]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="template-vehicle">Veicolo</FieldLabel>
                <SearchableSelect
                  id="template-vehicle"
                  disabled={disabled || busy}
                  value={vehicleId}
                  onValueChange={(value) => setVehicleId(value)}
                  options={[
                    { value: '', label: 'Scegli veicolo' },
                    ...doc.vehicles.map((vehicle) => ({
                      value: vehicle.id,
                      label: vehicle.name,
                    })),
                  ]}
                />
              </Field>
            </div>
          ) : null}
        </>
      ) : null}
      <div className="flex justify-end gap-2 px-3">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Annulla
        </Button>
        <Button
          disabled={disabled || !template?.items.length || !complete || busy}
          onClick={async () => {
            if (!template?.items.length || !complete || disabled || busy)
              return;
            setBusy(true);
            try {
              if (await onInsert(template.id, choices, { siteId, vehicleId }))
                onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner aria-hidden="true" /> : null}
          {busy
            ? replaceItem
              ? 'Applicazione…'
              : 'Inserimento…'
            : replaceItem
              ? 'Applica template alla riga'
              : singleRow
                ? 'Inserisci riga da template'
                : template
                  ? `Inserisci ${template.items.length} ${template.items.length === 1 ? 'voce' : 'voci'}`
                  : 'Inserisci template'}
        </Button>
      </div>
    </section>
  );
}

function TemplatePreviewItem({
  item,
  hourly,
  choices,
  disabled,
  onChoice,
}: {
  item: TemplateItem;
  hourly?: string;
  choices: Record<string, string>;
  disabled: boolean;
  onChoice: (groupId: string, optionId: string) => void;
}) {
  const sections: { group?: VariantGroup; subItems: SubItemDefinition[] }[] = [
    { subItems: item.subItems },
    ...item.variantGroups.map((group) => ({
      group,
      subItems:
        group.options.find(
          (option) =>
            option.id === (choices[group.id] ?? group.defaultOptionId),
        )?.subItems ?? [],
    })),
  ];
  const projectSub = (sub: SubItemDefinition): QuoteSubItem => {
    if (sub.kind !== 'travel') return { ...item, ...sub };
    const totals = calculateTravel(sub);
    return { ...item, ...sub, ...(totals.ok ? totals.value : {}) };
  };
  // UI-only projections for the existing calculators. No identifiers or rows are saved.
  const subItems = sections
    .flatMap((section) => section.subItems)
    .map(projectSub);
  const preview = { ...item, variantSelections: [], subItems };
  const analysis = calculateItem(preview, hourly);
  return (
    <>
      <div
        role="row"
        className={`${quoteColumns} min-h-10 border-b text-sm ${subItems.length || item.variantGroups.length ? 'bg-primary/8 ring-1 ring-inset ring-primary/20' : 'bg-muted/30'}`}
      >
        <div role="cell" className="flex justify-center">
          <ListTree className="size-4 text-muted-foreground" />
        </div>
        <div role="cell" className="font-medium">
          {item.name}
        </div>
        <div role="cell" className="text-right tabular-nums">
          {analysis.minutes === undefined ? '' : hours(analysis.minutes)}
        </div>
        <div role="cell" className="text-right tabular-nums">
          {analysis.expenses === undefined ? '' : eur(analysis.expenses)}
        </div>
        <div role="cell" className="text-right tabular-nums">
          {analysis.theoreticalValue === undefined
            ? ''
            : eur(analysis.theoreticalValue)}
          {analysis.theoreticalPartial ? (
            <span className="ml-1 text-xs text-muted-foreground">parziale</span>
          ) : null}
        </div>
        <div role="cell" className="text-right text-muted-foreground" />
        <div role="cell" />
      </div>
      {sections.map(({ group, subItems: definitions }) => (
        <Fragment key={group?.id ?? 'manual'}>
          {group && !definitions.length ? (
            <QuoteVariantRow
              group={group}
              id={`template-choice-${group.id}`}
              disabled={disabled}
              value={choices[group.id] ?? group.defaultOptionId ?? ''}
              onValueChange={(id) => onChoice(group.id, id)}
            />
          ) : null}
          {definitions.map((definition, index) => {
            const sub = projectSub(definition);
            const subAnalysis = calculateItem(
              { ...preview, subItems: [sub] },
              hourly,
            );
            const Icon =
              sub.kind === 'time'
                ? ListChecks
                : sub.kind === 'expense'
                  ? ReceiptEuro
                  : Route;
            return (
              <div
                role="row"
                key={index}
                aria-describedby={
                  group ? `template-choice-${group.id}-label` : undefined
                }
                data-quote-variant-selector={
                  group && index === 0 ? group.id : undefined
                }
                className={`${quoteColumns} min-h-9 border-b text-sm`}
              >
                <div
                  role="cell"
                  className={`flex h-full items-center justify-end pr-3 ${group ? 'border-r-2 border-primary/40' : 'border-r'}`}
                >
                  {group ? (
                    <GitBranch className="mr-2 size-3.5 text-muted-foreground" />
                  ) : null}
                  <Icon className="size-3.5 text-muted-foreground" />
                </div>
                <div
                  role="cell"
                  className="flex min-w-0 items-center gap-2 pl-2"
                >
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={sub.description}
                  >
                    {sub.description}
                  </span>
                  {group && index === 0 ? (
                    <QuoteVariantSelect
                      group={group}
                      id={`template-choice-${group.id}`}
                      disabled={disabled}
                      value={choices[group.id] ?? group.defaultOptionId ?? ''}
                      onValueChange={(id) => onChoice(group.id, id)}
                    />
                  ) : null}
                </div>
                <div role="cell" className="text-right tabular-nums">
                  {subAnalysis.minutes === undefined
                    ? ''
                    : hours(subAnalysis.minutes)}
                </div>
                <div role="cell" className="text-right tabular-nums">
                  {subAnalysis.expenses === undefined
                    ? ''
                    : eur(subAnalysis.expenses)}
                </div>
                <div role="cell" className="text-right tabular-nums">
                  {subAnalysis.theoreticalValue === undefined
                    ? ''
                    : eur(subAnalysis.theoreticalValue)}
                  {subAnalysis.theoreticalPartial ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      parziale
                    </span>
                  ) : null}
                </div>
                <div role="cell" className="text-right text-muted-foreground" />
                <div role="cell" />
              </div>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}

export function VariantChangeDialog({
  group,
  optionId,
  doc,
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
              <SearchableSelect
                id="change-site"
                value={siteId}
                onValueChange={(value) => setSiteId(value)}
                options={[
                  { value: '', label: 'Scegli sede' },
                  ...siteOptions(doc.sites, quote.client),
                ]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="change-vehicle">Veicolo</FieldLabel>
              <SearchableSelect
                id="change-vehicle"
                value={vehicleId}
                onValueChange={(value) => setVehicleId(value)}
                options={[
                  { value: '', label: 'Scegli veicolo' },
                  ...doc.vehicles.map((vehicle) => ({
                    value: vehicle.id,
                    label: vehicle.name,
                  })),
                ]}
              />
            </Field>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || (needsTravel && (!siteId || !vehicleId))}
            onClick={apply}
          >
            {busy ? <Spinner aria-hidden="true" /> : null}
            {busy ? 'Applicazione…' : 'Conferma cambio'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
