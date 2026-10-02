import { z } from 'zod';
import { isYearMonth } from './calendar';
import { err, meta, ok, type CashError, type Result, type SubItemDefinition, type Template } from './model';

const nonEmptyString = z.string().refine((value) => value.trim().length > 0, 'stringa non vuota richiesta');
const nonNegativeDecimal = (maxDecimals: number) => z.string().regex(
  new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${maxDecimals}})?$`),
  `decimale non negativo con massimo ${maxDecimals} decimali richiesto`,
);
const period = z.string().refine(isYearMonth, 'periodo YYYY-MM non valido');

const timeDefinitionSchema = z.object({
  kind: z.literal('time'),
  description: z.string().min(1),
  minutes: z.number().int().positive(),
}).strict();

const expenseDefinitionSchema = z.object({
  kind: z.literal('expense'),
  description: z.string().min(1),
  amount: nonNegativeDecimal(2),
}).strict();

const travelDefinitionSchema = z.object({
  kind: z.literal('travel'),
  description: z.string().min(1),
  roundTrip: z.boolean(),
  occurrences: z.number().int().positive(),
  distanceKmPerOccurrence: nonNegativeDecimal(1).optional(),
  travelMinutesPerOccurrence: z.number().int().positive().optional(),
}).strict();

const definitionSchema = z.discriminatedUnion('kind', [
  timeDefinitionSchema,
  expenseDefinitionSchema,
  travelDefinitionSchema,
]);

const optionSchema = z.object({
  name: nonEmptyString,
  subItems: z.array(definitionSchema),
}).strict();

const normalizedName = (name: string): string => name.trim().toLocaleLowerCase('it');

const groupSchema = z.object({
  name: nonEmptyString,
  defaultOption: z.string().optional(),
  options: z.array(optionSchema).min(1),
}).strict().superRefine((group, ctx) => {
  const names = new Set<string>();
  for (const [index, option] of group.options.entries()) {
    const key = normalizedName(option.name);
    if (names.has(key)) ctx.addIssue({ code: 'custom', path: ['options', index, 'name'], message: 'nome opzione duplicato nel gruppo' });
    names.add(key);
  }
  if (group.defaultOption !== undefined && !group.options.some((option) => option.name === group.defaultOption)) {
    ctx.addIssue({ code: 'custom', path: ['defaultOption'], message: 'opzione predefinita inesistente' });
  }
});

const itemSchema = z.object({
  name: nonEmptyString,
  referencePrice: z.object({ amount: nonNegativeDecimal(2), period }).strict().optional(),
  subItems: z.array(definitionSchema),
  variantGroups: z.array(groupSchema),
}).strict().superRefine((item, ctx) => {
  const groupNames = new Set<string>();
  for (const [index, group] of item.variantGroups.entries()) {
    const key = normalizedName(group.name);
    if (groupNames.has(key)) ctx.addIssue({ code: 'custom', path: ['variantGroups', index, 'name'], message: 'nome gruppo variante duplicato' });
    groupNames.add(key);
  }
  const hasWork = item.subItems.some((subItem) => subItem.kind === 'time' || subItem.kind === 'travel')
    || item.variantGroups.some((group) => group.options.some((option) => option.subItems.some((subItem) => subItem.kind === 'time' || subItem.kind === 'travel')));
  if (!hasWork) ctx.addIssue({ code: 'custom', path: ['subItems'], message: 'la voce richiede almeno un elemento time o travel, sempre incluso o in una variante' });
});

const packedTemplateSchema = z.object({
  name: nonEmptyString,
  items: z.array(itemSchema).min(1),
}).strict();

export const templatePackSchema = z.object({
  format: z.literal('cash-template-pack'),
  formatVersion: z.literal(1),
  templates: z.array(packedTemplateSchema).min(1),
}).strict().superRefine((pack, ctx) => {
  const names = new Set<string>();
  for (const [index, template] of pack.templates.entries()) {
    const key = normalizedName(template.name);
    if (names.has(key)) ctx.addIssue({ code: 'custom', path: ['templates', index, 'name'], message: 'nome template duplicato nel pack' });
    names.add(key);
  }
});

export type TemplatePack = z.infer<typeof templatePackSchema>;

const issuePath = (path: PropertyKey[]): string => path.reduce<string>((result, part) => (
  typeof part === 'number' ? `${result}[${part}]` : `${result}${result ? '.' : ''}${String(part)}`
), '');

function validationError(error: z.ZodError): CashError {
  const details = error.issues.slice(0, 8).map((issue) => {
    const path = issuePath(issue.path);
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return {
    code: 'VALIDATION',
    field: issuePath(error.issues[0]?.path ?? []),
    message: 'Il file non rispetta il formato cash-template-pack v1.',
    action: 'Correggi il file JSON e selezionalo nuovamente. Nessun template è stato importato.',
    details,
  };
}

export function parseTemplatePack(input: unknown): Result<TemplatePack> {
  const parsed = templatePackSchema.safeParse(input);
  return parsed.success ? ok(parsed.data) : err(validationError(parsed.error));
}

export interface TemplatePackConflict {
  templateIndex: number;
  name: string;
  existingTemplateIds: string[];
}

export function findTemplatePackConflicts(pack: TemplatePack, existing: readonly Template[]): TemplatePackConflict[] {
  return pack.templates.flatMap((template, templateIndex) => {
    const key = normalizedName(template.name);
    const matches = existing.filter((candidate) => normalizedName(candidate.name) === key);
    return matches.length ? [{ templateIndex, name: template.name, existingTemplateIds: matches.map((candidate) => candidate.id) }] : [];
  });
}

const materializeDefinition = (definition: z.infer<typeof definitionSchema>): SubItemDefinition => structuredClone(definition);

export function materializeTemplatePack(pack: TemplatePack, templateIndexes = pack.templates.map((_, index) => index)): Template[] {
  return templateIndexes.map((templateIndex) => {
    const packed = pack.templates[templateIndex]!;
    return {
      ...meta(),
      name: packed.name,
      items: packed.items.map((item) => ({
        ...meta(),
        name: item.name,
        ...(item.referencePrice ? { referencePrice: structuredClone(item.referencePrice) } : {}),
        subItems: item.subItems.map((subItem) => ({ ...meta(), ...materializeDefinition(subItem) })),
        variantGroups: item.variantGroups.map((group) => {
          const options = group.options.map((option) => ({
            ...meta(),
            name: option.name,
            subItems: option.subItems.map(materializeDefinition),
          }));
          const defaultIndex = group.defaultOption === undefined
            ? -1
            : group.options.findIndex((option) => option.name === group.defaultOption);
          return {
            ...meta(),
            name: group.name,
            options,
            ...(defaultIndex >= 0 ? { defaultOptionId: options[defaultIndex]!.id } : {}),
          };
        }),
      })),
    };
  });
}
