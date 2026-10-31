export interface TablePreferences {
  order: string[];
  hidden: string[];
}

export type TableSort = { id: string; direction: 'asc' | 'desc' };

export function nextTableSort(current: TableSort | undefined, id: string) {
  if (current?.id !== id) return { id, direction: 'asc' } as const;
  return current.direction === 'asc'
    ? ({ id, direction: 'desc' } as const)
    : undefined;
}

export function normalizeTablePreferences(
  saved: unknown,
  ids: string[],
): TablePreferences {
  const preferences = saved as Partial<TablePreferences> | null;
  const order = Array.isArray(preferences?.order)
    ? [...new Set(preferences.order.filter((id) => ids.includes(id)))]
    : [];
  order.push(...ids.filter((id) => !order.includes(id)));
  const hidden = Array.isArray(preferences?.hidden)
    ? [...new Set(preferences.hidden.filter((id) => ids.includes(id)))]
    : [];
  // Old preferences must never leave a table with no data columns.
  return { order, hidden: hidden.length === ids.length ? [] : hidden };
}

const storageKey = (key: string) => `cash:table-columns:v1:${key}`;

export function readTablePreferences(key: string, ids: string[]) {
  try {
    return normalizeTablePreferences(
      JSON.parse(localStorage.getItem(storageKey(key)) ?? 'null'),
      ids,
    );
  } catch {
    return normalizeTablePreferences(null, ids);
  }
}

export function saveTablePreferences(
  key: string,
  preferences: TablePreferences,
) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
