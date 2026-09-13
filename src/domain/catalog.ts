import { err, meta, nowIso, ok, type CashDocument, type QuoteItem, type QuoteSubItem, type Result, type ReusableSubItem, type SubItemDefinition, type Template,
  type TemplateItem, type VariantGroup, type VariantOption } from './model';

const copyDefinition = (definition: SubItemDefinition): ReusableSubItem => ({ ...structuredClone(definition), ...meta() } as ReusableSubItem);
const copyOption = (option: VariantOption): VariantOption => ({ ...structuredClone(option), ...meta(), subItems: structuredClone(option.subItems) });
const copyGroup = (group: VariantGroup): VariantGroup => {
  const oldDefault = group.defaultOptionId;
  const options = group.options.map(copyOption);
  const oldIndex = group.options.findIndex(option => option.id === oldDefault);
  return { ...meta(), name: group.name, options, ...(oldIndex >= 0 ? { defaultOptionId: options[oldIndex]!.id } : {}) };
};

export function cloneReusableSubItem(item: ReusableSubItem): ReusableSubItem {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...definition } = item;
  return copyDefinition(definition);
}

export function cloneTemplate(source: Template, name = source.name): Template {
  return { ...meta(), name, items: source.items.map(item => cloneTemplateItem(item)) };
}

export function templateRequiresTravel(template: Template, choices: Record<string, string>): boolean {
  return template.items.some(item => {
    if (item.subItems.some(subItem => subItem.kind === 'travel')) return true;
    return item.variantGroups.some(group => {
      const optionId = choices[group.id] ?? group.defaultOptionId;
      return group.options.find(option => option.id === optionId)?.subItems.some(subItem => subItem.kind === 'travel') ?? false;
    });
  });
}

export function cloneTemplateItem(source: TemplateItem): TemplateItem {
  return { ...meta(), name: source.name, ...(source.referencePrice ? { referencePrice: structuredClone(source.referencePrice) } : {}),
    subItems: source.subItems.map(cloneReusableSubItem), variantGroups: source.variantGroups.map(copyGroup) };
}

export interface TemplatePreview {
  name: string;
  items: Array<{ name: string; subItems: string[]; variants: Array<{ group: string; options: string[]; default?: string }> }>;
}

export function previewTemplate(name: string, items: QuoteItem[]): TemplatePreview {
  return { name, items: items.map(item => ({ name: item.name,
    subItems: item.subItems.filter(sub => !sub.variantOwner).map(sub => `${sub.description} (${sub.kind})`),
    variants: item.variantGroups.map(group => ({ group: group.name, options: group.options.map(option => option.name),
      ...(group.defaultOptionId ? { default: group.options.find(option => option.id === group.defaultOptionId)?.name } : {}) })) })) };
}

export function reusableFromQuoteSubItem(source: QuoteSubItem): ReusableSubItem {
  if (source.kind === 'time') return { ...meta(), kind:'time', description:source.description, minutes:source.minutes };
  if (source.kind === 'expense') return { ...meta(), kind:'expense', description:source.description, amount:source.amount };
  return { ...meta(), kind:'travel', description:source.description, roundTrip:source.roundTrip, occurrences:source.occurrences,
    ...(source.distanceSource==='manual'&&source.distanceKmPerOccurrence!==undefined?{distanceKmPerOccurrence:source.distanceKmPerOccurrence}:{}),
    ...(source.durationSource==='manual'&&source.travelMinutesPerOccurrence!==undefined?{travelMinutesPerOccurrence:source.travelMinutesPerOccurrence}:{}) };
}

export function templateFromQuote(name: string, items: QuoteItem[]): Result<Template> {
  const cleanName=name.trim();if(!cleanName)return err({code:'VALIDATION',field:'template.name',message:'Il nome del template è obbligatorio.'});
  if(!items.length)return err({code:'VALIDATION',field:'template.items',message:'Selezionare almeno una voce.'});
  return ok({ ...meta(), name:cleanName, items:items.map(item=>{
    const groups=structuredClone(item.variantGroups);
    for(const sub of item.subItems.filter(candidate=>candidate.variantOwner&&candidate.manuallyModified)){
      const owner=sub.variantOwner!;const option=groups.find(group=>group.id===owner.groupId)?.options.find(candidate=>candidate.id===owner.optionId);
      if(option&&owner.definitionIndex!==undefined&&option.subItems[owner.definitionIndex]){
        const reusable=reusableFromQuoteSubItem(sub);const {id:_id,createdAt:_createdAt,updatedAt:_updatedAt,...definition}=reusable;option.subItems[owner.definitionIndex]=definition;
      }
    }
    return { ...meta(), name:item.name, ...(item.referencePrice?{referencePrice:{amount:item.referencePrice.amount,period:item.referencePrice.period}}:{}),
      subItems:item.subItems.filter(sub=>!sub.variantOwner).map(reusableFromQuoteSubItem), variantGroups:groups.map(copyGroup) };
  }) });
}

export function findLiveReferences(document: CashDocument, entityId: string): string[] {
  const refs: string[] = [];
  for (const template of document.catalog.templates) {
    for (const item of template.items) {
      for (const sub of item.subItems) if (sub.id === entityId) refs.push(`Template “${template.name}” / ${item.name}`);
      for (const group of item.variantGroups) {
        if (group.id === entityId) refs.push(`Template “${template.name}” / gruppo ${group.name}`);
        for (const option of group.options) if (option.id === entityId) refs.push(`Template “${template.name}” / ${group.name} / ${option.name}`);
      }
    }
  }
  if (document.settings.fic.product?.id === entityId) refs.push('Impostazione prodotto Consulenza');
  if (document.settings.defaultDepartureSiteId === entityId) refs.push('Sede di partenza predefinita');
  if (document.settings.defaultVehicleId === entityId) refs.push('Veicolo predefinito');
  return refs;
}

export function touch<T extends { updatedAt: string }>(entity: T): T {
  return { ...entity, updatedAt: nowIso() };
}
