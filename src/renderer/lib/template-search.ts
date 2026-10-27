import type { Template } from '../../domain/model';

export function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase('it');
}

export function templateSearchText(template: Template): string {
  const values = [template.name];
  for (const item of template.items) {
    values.push(
      item.name,
      ...item.subItems.map((subItem) => subItem.description),
    );
    for (const group of item.variantGroups) {
      values.push(group.name);
      for (const option of group.options) {
        values.push(
          option.name,
          ...option.subItems.map((subItem) => subItem.description),
        );
      }
    }
  }
  return normalizeSearch(values.join(' '));
}
