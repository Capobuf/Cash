import { err, meta, ok, type QuoteItem, type QuoteSubItem, type Result, type SubItemDefinition, type VariantGroup } from './model';

export function validateVariantGroups(groups: VariantGroup[]): Result<void> {
  const groupNames = new Set<string>();
  for (const group of groups) {
    const name = group.name.trim().toLocaleLowerCase('it');
    if (!name) return err({ code: 'VALIDATION', field: 'variantGroup.name', message: 'Il nome del gruppo variante è obbligatorio.' });
    if (groupNames.has(name)) return err({ code: 'VALIDATION', field: 'variantGroup.name', message: `Gruppo duplicato: ${group.name}.` });
    groupNames.add(name);
    if (group.options.length === 0) return err({ code: 'VALIDATION', field: 'variantGroup.options', message: `Il gruppo ${group.name} richiede almeno un’opzione.` });
    const optionNames = new Set<string>();
    for (const option of group.options) {
      const optionName = option.name.trim().toLocaleLowerCase('it');
      if (!optionName || optionNames.has(optionName)) return err({ code: 'VALIDATION', field: 'variantOption.name', message: `Nomi opzione vuoti o duplicati in ${group.name}.` });
      optionNames.add(optionName);
    }
    if (group.defaultOptionId && !group.options.some(option => option.id === group.defaultOptionId))
      return err({ code: 'VALIDATION', field: 'variantGroup.defaultOptionId', message: `Il default di ${group.name} non appartiene al gruppo.` });
  }
  return ok(undefined);
}

export interface VariantContext {
  materializeTravel: (definition: Extract<SubItemDefinition, { kind: 'travel' }>) => Result<QuoteSubItem>;
}

function materialize(definition: SubItemDefinition, groupId: string, optionId: string, definitionIndex: number, context: VariantContext): Result<QuoteSubItem> {
  const owner = { groupId, optionId, definitionIndex };
  if (definition.kind === 'time') return ok({ ...meta(), ...structuredClone(definition), variantOwner: owner });
  if (definition.kind === 'expense') return ok({ ...meta(), ...structuredClone(definition), variantOwner: owner });
  const travel = context.materializeTravel(definition);
  return travel.ok ? ok({ ...travel.value, variantOwner: owner }) : travel;
}

export function applyVariantSelections(item: QuoteItem, choices: Record<string, string>, context: VariantContext): Result<QuoteItem> {
  const validation = validateVariantGroups(item.variantGroups);
  if (!validation.ok) return validation;
  const next = structuredClone(item);
  const generated: QuoteSubItem[] = [];
  const selections = [];
  for (const group of next.variantGroups) {
    const optionId = choices[group.id] ?? group.defaultOptionId;
    if (!optionId) return err({ code: 'MISSING_DATA', field: `variant.${group.id}`, message: `Scegliere un’opzione per ${group.name}.` });
    const option = group.options.find(candidate => candidate.id === optionId);
    if (!option) return err({ code: 'VALIDATION', field: `variant.${group.id}`, message: `Opzione non valida per ${group.name}.` });
    selections.push({ groupId: group.id, optionId: option.id });
    for (const [definitionIndex, definition] of option.subItems.entries()) {
      const sub = materialize(definition, group.id, option.id, definitionIndex, context);
      if (!sub.ok) return sub;
      generated.push(sub.value);
    }
  }
  next.subItems = [...next.subItems.filter(sub => !sub.variantOwner), ...generated];
  next.variantSelections = selections;
  return ok(next);
}

export function variantChangeWarnings(item: QuoteItem, groupId: string): string[] {
  return item.subItems.filter(sub => sub.variantOwner?.groupId === groupId && sub.manuallyModified)
    .map(sub => `La modifica manuale a “${sub.description}” verrà persa.`);
}

export function changeVariant(item: QuoteItem, groupId: string, optionId: string, confirmed: boolean,
  context: VariantContext): Result<QuoteItem> {
  const group = item.variantGroups.find(candidate => candidate.id === groupId);
  const option = group?.options.find(candidate => candidate.id === optionId);
  if (!group || !option) return err({ code: 'VALIDATION', field: 'variant', message: 'Gruppo o opzione non validi.' });
  const warnings = variantChangeWarnings(item, groupId);
  if (warnings.length && !confirmed) return err({ code: 'CANCELLED', message: 'Conferma necessaria prima di perdere modifiche manuali.', details: warnings });
  const created: QuoteSubItem[] = [];
  for (const [definitionIndex, definition] of option.subItems.entries()) {
    const sub = materialize(definition, groupId, optionId, definitionIndex, context);
    if (!sub.ok) return sub;
    created.push(sub.value);
  }
  const next = structuredClone(item);
  next.subItems = [...next.subItems.filter(sub => sub.variantOwner?.groupId !== groupId), ...created];
  next.variantSelections = [...next.variantSelections.filter(value => value.groupId !== groupId), { groupId, optionId }];
  return ok(next);
}
