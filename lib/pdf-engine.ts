import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib"
import type { Annotation, FormFieldValue, PageState } from "./pdf-types"

function hexToRgb01(hex: string) {
  const clean = hex.replace("#", "")
  const bigint = Number.parseInt(clean.length === 3 ? clean.repeat(2).slice(0, 6) : clean, 16)
  const r = ((bigint >> 16) & 255) / 255
  const g = ((bigint >> 8) & 255) / 255
  const b = (bigint & 255) / 255
  return rgb(r, g, b)
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? ""
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

interface BuildOptions {
  originalBytes: ArrayBuffer
  pages: PageState[]
  annotationsByPage: Map<number, Annotation[]>
  formValues?: FormFieldValue[]
  flattenForm?: boolean
}

/**
 * Rebuilds the PDF applying page order/rotation/deletion, drawing all
 * annotations in PDF user-space, and optionally filling + flattening form fields.
 */
export async function buildExportedPdf(options: BuildOptions): Promise<Uint8Array> {
  const { originalBytes, pages, annotationsByPage, formValues, flattenForm } = options

  const srcDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true })

  // Fill form fields on the source doc first (so widget appearances regenerate correctly)
  if (formValues && formValues.length > 0) {
    try {
      const form = srcDoc.getForm()
      for (const fv of formValues) {
        try {
          const field = form.getField(fv.name)
          const ctorName = field.constructor.name
          if (ctorName === "PDFTextField" && typeof fv.value === "string") {
            ;(field as any).setText(fv.value)
          } else if (ctorName === "PDFCheckBox") {
            if (fv.value === true) (field as any).check()
            else (field as any).uncheck()
          } else if (ctorName === "PDFRadioGroup" && typeof fv.value === "string") {
            ;(field as any).select(fv.value)
          } else if (ctorName === "PDFDropdown" && typeof fv.value === "string") {
            ;(field as any).select(fv.value)
          } else if (ctorName === "PDFOptionList" && Array.isArray(fv.value)) {
            ;(field as any).select(fv.value)
          }
        } catch {
          // ignore individual field failures
        }
      }
      if (flattenForm) form.flatten()
    } catch {
      // no form present
    }
  }

  const activePages = pages.filter((p) => !p.deleted)
  const outDoc = await PDFDocument.create()
  const font = await outDoc.embedFont(StandardFonts.Helvetica)

  const allAnnotations = Array.from(annotationsByPage.values()).flat()
  const signatureImages = await embedSignatureImages(outDoc, allAnnotations)

  const srcIndices = activePages.map((p) => p.originalIndex)
  const copiedPages = await outDoc.copyPages(srcDoc, srcIndices)

  for (let i = 0; i < activePages.length; i++) {
    const pageState = activePages[i]
    const page = copiedPages[i]
    outDoc.addPage(page)

    const baseRotation = page.getRotation().angle
    page.setRotation(degrees((baseRotation + pageState.rotation) % 360))

    const annotations = annotationsByPage.get(pageState.originalIndex) ?? []
    for (const ann of annotations) {
      drawAnnotation(page, ann, font, signatureImages)
    }
  }

  return outDoc.save()
}

function drawAnnotation(
  page: import("pdf-lib").PDFPage,
  ann: Annotation,
  font: import("pdf-lib").PDFFont,
  signatureImages: Map<string, import("pdf-lib").PDFImage>,
) {
  const color = hexToRgb01(ann.color)

  switch (ann.type) {
    case "highlight": {
      for (const r of ann.rects) {
        // Match the on-screen marker: inset ~18% top/bottom to hug the glyphs.
        const inset = r.height * 0.18
        page.drawRectangle({
          x: r.x,
          y: r.y + inset,
          width: r.width,
          height: Math.max(1, r.height - inset * 2),
          color,
          opacity: ann.opacity,
        })
      }
      break
    }
    case "underline": {
      for (const r of ann.rects) {
        page.drawLine({
          start: { x: r.x, y: r.y },
          end: { x: r.x + r.width, y: r.y },
          thickness: Math.max(1, r.height * 0.12),
          color,
          opacity: ann.opacity,
        })
      }
      break
    }
    case "strikethrough": {
      for (const r of ann.rects) {
        const midY = r.y + r.height / 2
        page.drawLine({
          start: { x: r.x, y: midY },
          end: { x: r.x + r.width, y: midY },
          thickness: Math.max(1, r.height * 0.12),
          color,
          opacity: ann.opacity,
        })
      }
      break
    }
    case "ink": {
      for (const stroke of ann.strokes) {
        for (let i = 1; i < stroke.length; i++) {
          page.drawLine({
            start: stroke[i - 1],
            end: stroke[i],
            thickness: ann.strokeWidth,
            color,
            opacity: 1,
          })
        }
      }
      break
    }
    case "rectangle": {
      page.drawRectangle({
        x: ann.x,
        y: ann.y,
        width: ann.width,
        height: ann.height,
        borderColor: color,
        borderWidth: ann.strokeWidth,
        color: ann.fill ? color : undefined,
        opacity: ann.fill ? 0.25 : 1,
        borderOpacity: 1,
      })
      break
    }
    case "ellipse": {
      page.drawEllipse({
        x: ann.x + ann.width / 2,
        y: ann.y + ann.height / 2,
        xScale: ann.width / 2,
        yScale: ann.height / 2,
        borderColor: color,
        borderWidth: ann.strokeWidth,
        color: ann.fill ? color : undefined,
        opacity: ann.fill ? 0.25 : 1,
        borderOpacity: 1,
      })
      break
    }
    case "line": {
      page.drawLine({
        start: { x: ann.x, y: ann.y },
        end: { x: ann.x + ann.width, y: ann.y + ann.height },
        thickness: ann.strokeWidth,
        color,
      })
      break
    }
    case "arrow": {
      const start = { x: ann.x, y: ann.y }
      const end = { x: ann.x + ann.width, y: ann.y + ann.height }
      page.drawLine({ start, end, thickness: ann.strokeWidth, color })
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      const headLen = Math.max(8, ann.strokeWidth * 4)
      const leftAngle = angle + Math.PI - Math.PI / 7
      const rightAngle = angle + Math.PI + Math.PI / 7
      page.drawLine({
        start: end,
        end: { x: end.x + headLen * Math.cos(leftAngle), y: end.y + headLen * Math.sin(leftAngle) },
        thickness: ann.strokeWidth,
        color,
      })
      page.drawLine({
        start: end,
        end: { x: end.x + headLen * Math.cos(rightAngle), y: end.y + headLen * Math.sin(rightAngle) },
        thickness: ann.strokeWidth,
        color,
      })
      break
    }
    case "text": {
      page.drawText(ann.text, {
        x: ann.x,
        y: ann.y + ann.height - ann.fontSize,
        size: ann.fontSize,
        font,
        color,
        maxWidth: ann.width,
        lineHeight: ann.fontSize * 1.25,
      })
      break
    }
    case "sign": {
      const image = signatureImages.get(ann.id)
      if (image) {
        page.drawImage(image, {
          x: ann.x,
          y: ann.y,
          width: ann.width,
          height: ann.height,
        })
      }
      break
    }
    default:
      break
  }
}

/** Signature annotations need async image embedding, handled as a pre-pass. */
export async function embedSignatureImages(
  doc: PDFDocument,
  annotations: Annotation[],
): Promise<Map<string, import("pdf-lib").PDFImage>> {
  const map = new Map<string, import("pdf-lib").PDFImage>()
  for (const ann of annotations) {
    if (ann.type !== "sign") continue
    const bytes = dataUrlToBytes(ann.dataUrl)
    const isPng = ann.dataUrl.includes("image/png")
    const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    map.set(ann.id, image)
  }
  return map
}
