"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FormFieldDescriptor } from "@/lib/pdf-form"

interface FormFillSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fields: FormFieldDescriptor[]
  onChange: (name: string, value: FormFieldDescriptor) => void
  onApply: (flatten: boolean) => void
}

export function FormFillSheet({ open, onOpenChange, fields, onChange, onApply }: FormFillSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Rellenar formulario</SheetTitle>
          <SheetDescription>
            Se detectaron {fields.length} campo{fields.length === 1 ? "" : "s"} en este documento.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            {fields.map((field) => (
              <Field key={field.name}>
                <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
                {field.kind === "text" && (
                  <Input
                    id={field.name}
                    value={field.value}
                    onChange={(e) => onChange(field.name, { ...field, value: e.target.value })}
                  />
                )}
                {field.kind === "checkbox" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      id={field.name}
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={field.checked}
                      onChange={(e) => onChange(field.name, { ...field, checked: e.target.checked })}
                    />
                    Marcar
                  </label>
                )}
                {(field.kind === "radio" || field.kind === "dropdown") && (
                  <Select
                    value={field.selected ?? null}
                    onValueChange={(value) =>
                      onChange(field.name, { ...field, selected: (value as string) ?? undefined })
                    }
                  >
                    <SelectTrigger id={field.name} className="w-full">
                      <SelectValue placeholder="Selecciona una opción" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {field.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
                {field.kind === "optionlist" && (
                  <select
                    id={field.name}
                    multiple
                    className="rounded-md border border-input bg-background p-2 text-sm"
                    value={field.selected}
                    onChange={(e) =>
                      onChange(field.name, {
                        ...field,
                        selected: Array.from(e.target.selectedOptions).map((o) => o.value),
                      })
                    }
                  >
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ))}
          </FieldGroup>
        </div>

        <SheetFooter className="gap-2 sm:flex-col">
          <Button onClick={() => onApply(false)}>Aplicar valores</Button>
          <Button variant="outline" onClick={() => onApply(true)}>
            Aplicar y aplanar formulario
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
