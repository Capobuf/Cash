import type { ComponentProps, ReactNode } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { moneyInputValue } from "@/lib/format"

type FieldProps = Omit<ComponentProps<typeof Input>, "name" | "defaultValue"> & {
  label: string
  name: string
  value?: unknown
  hint?: string
}

export function Field({ label, name, value = "", hint, ...props }: FieldProps) {
  return (
    <Label className="field">
      <span className="field-label">{label}</span>
      <Input name={name} defaultValue={String(value ?? "")} {...props} />
      {hint ? <small className="field-hint">{hint}</small> : null}
    </Label>
  )
}

export function MoneyField({ label, name, value = "", ...props }: FieldProps) {
  return (
    <Label className="field">
      <span className="field-label">{label}</span>
      <span className="input-affix">
        <span aria-hidden="true">€</span>
        <Input name={name} defaultValue={moneyInputValue(value)} type="text" inputMode="decimal" {...props} />
      </span>
    </Label>
  )
}

type SuffixFieldProps = FieldProps & { suffix: string }

export function SuffixField({ label, name, value = "", suffix, type = "number", ...props }: SuffixFieldProps) {
  return (
    <Label className="field">
      <span className="field-label">{label}</span>
      <span className="input-affix suffix">
        <Input name={name} defaultValue={String(value ?? "")} type={type} {...props} />
        <span aria-hidden="true">{suffix}</span>
      </span>
    </Label>
  )
}

type SelectFieldProps = Omit<ComponentProps<typeof NativeSelect>, "name" | "defaultValue"> & {
  label: string
  name: string
  value?: string
  children: ReactNode
}

export function SelectField({ label, name, value, children, ...props }: SelectFieldProps) {
  return (
    <Label className="field">
      <span className="field-label">{label}</span>
      <NativeSelect className="field-control" name={name} defaultValue={value} {...props}>
        {children}
      </NativeSelect>
    </Label>
  )
}

export { NativeSelectOption as Option }

export function CheckboxField({ name, checked, children, className = "" }: {
  name: string
  checked: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <Label className={`checkbox-field ${className}`.trim()}>
      <Checkbox name={name} defaultChecked={checked} />
      <span>{children}</span>
    </Label>
  )
}
