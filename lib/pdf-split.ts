import JSZip from "jszip"
import { PDFDocument } from "pdf-lib"

/**
 * Splits an already-baked PDF (post `buildExportedPdf`, so page i on disk
 * matches visible page i) into contiguous parts. `splitAtDisplayIndices`
 * lists the display indices where a new part must *start* — every index in
 * range [0, totalPages) is valid, 0 is implicit, and duplicates/out-of-range
 * values are ignored.
 */
export async function splitBakedPdf(bakedBytes: ArrayBuffer, splitAtDisplayIndices: number[]): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bakedBytes, { ignoreEncryption: true })
  const total = src.getPageCount()

  const boundaries = Array.from(new Set([0, ...splitAtDisplayIndices.filter((i) => i > 0 && i < total)])).sort(
    (a, b) => a - b,
  )

  const parts: Uint8Array[] = []
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i]
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : total
    const out = await PDFDocument.create()
    const copied = await out.copyPages(
      src,
      Array.from({ length: end - start }, (_, k) => start + k),
    )
    copied.forEach((p) => out.addPage(p))
    parts.push(await out.save())
  }
  return parts
}

/** Packages multiple PDF parts into a single downloadable .zip blob. */
export async function zipPdfParts(parts: Uint8Array[], baseName: string): Promise<Blob> {
  const zip = new JSZip()
  const safeName = baseName.replace(/\.pdf$/i, "").trim() || "documento"
  for (let i = 0; i < parts.length; i++) {
    zip.file(`${safeName}-parte-${String(i + 1).padStart(2, "0")}.pdf`, parts[i])
  }
  return zip.generateAsync({ type: "blob" })
}
