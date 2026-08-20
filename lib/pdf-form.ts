import { PDFDocument } from "pdf-lib"
import type { FormFieldValue } from "./pdf-types"

export type FormFieldDescriptor =
  | { kind: "text"; name: string; label: string; value: string; multiline: boolean }
  | { kind: "checkbox"; name: string; label: string; checked: boolean }
  | { kind: "radio"; name: string; label: string; options: string[]; selected: string | undefined }
  | { kind: "dropdown"; name: string; label: string; options: string[]; selected: string | undefined }
  | { kind: "optionlist"; name: string; label: string; options: string[]; selected: string[] }

export async function readFormFields(bytes: ArrayBuffer): Promise<FormFieldDescriptor[]> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const form = doc.getForm()
    const fields = form.getFields()
    const descriptors: FormFieldDescriptor[] = []

    for (const field of fields) {
      const name = field.getName()
      const ctorName = field.constructor.name
      try {
        if (ctorName === "PDFTextField") {
          const tf = field as any
          descriptors.push({
            kind: "text",
            name,
            label: name,
            value: tf.getText() ?? "",
            multiline: tf.isMultiline?.() ?? false,
          })
        } else if (ctorName === "PDFCheckBox") {
          const cb = field as any
          descriptors.push({ kind: "checkbox", name, label: name, checked: cb.isChecked?.() ?? false })
        } else if (ctorName === "PDFRadioGroup") {
          const rg = field as any
          descriptors.push({
            kind: "radio",
            name,
            label: name,
            options: rg.getOptions?.() ?? [],
            selected: rg.getSelected?.(),
          })
        } else if (ctorName === "PDFDropdown") {
          const dd = field as any
          descriptors.push({
            kind: "dropdown",
            name,
            label: name,
            options: dd.getOptions?.() ?? [],
            selected: dd.getSelected?.()?.[0],
          })
        } else if (ctorName === "PDFOptionList") {
          const ol = field as any
          descriptors.push({
            kind: "optionlist",
            name,
            label: name,
            options: ol.getOptions?.() ?? [],
            selected: ol.getSelected?.() ?? [],
          })
        }
      } catch {
        // skip unreadable field
      }
    }

    return descriptors
  } catch {
    return []
  }
}

export function toFormFieldValues(descriptors: FormFieldDescriptor[]): FormFieldValue[] {
  return descriptors.map((d) => {
    if (d.kind === "text") return { name: d.name, value: d.value }
    if (d.kind === "checkbox") return { name: d.name, value: d.checked }
    if (d.kind === "radio" || d.kind === "dropdown") return { name: d.name, value: d.selected ?? "" }
    return { name: d.name, value: d.selected }
  })
}
