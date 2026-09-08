import { meta, nowIso, type CashDocument, type QuoteItem, type ReusableSubItem, type SubItemDefinition, type Template,
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
  if (document.settings.ficConsultingProductId === entityId) refs.push('Impostazione prodotto Consulenza');
  return refs;
}

export function touch<T extends { updatedAt: string }>(entity: T): T {
  return { ...entity, updatedAt: nowIso() };
}
