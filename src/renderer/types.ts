export type View =
  | 'dashboard'
  | 'quotes'
  | 'clients'
  | 'catalog'
  | 'financial-analysis'
  | 'bank-summary'
  | 'bank-movements'
  | 'bank-categories'
  | 'settings';

export interface DeleteTarget {
  kind:
    | 'cost'
    | 'vehicle'
    | 'site'
    | 'catalog'
    | 'template'
    | 'profile'
    | 'quote'
    | 'item'
    | 'sub';
  id: string;
  label?: string;
}
