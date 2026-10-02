import type { BankExpenseCategory } from '../../domain/model';
import { bankCategoryTree } from '../../domain/bank-expenses';
import {
  NativeSelectOption,
  NativeSelectOptGroup,
} from '@/components/ui/native-select';

export function BankCategoryOptions({
  categories,
}: {
  categories: BankExpenseCategory[];
}) {
  return bankCategoryTree(categories).map((category) => (
    <NativeSelectOptGroup key={category.id} label={category.name}>
      <NativeSelectOption value={category.id}>
        {category.name}
      </NativeSelectOption>
      {category.children.map((child) => (
        <NativeSelectOption
          key={child.id}
          value={child.id}
        >{`${category.name} → ${child.name}`}</NativeSelectOption>
      ))}
    </NativeSelectOptGroup>
  ));
}
