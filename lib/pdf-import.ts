import { PDFDocument } from "pdf-lib"

export const ACCEPTED_IMPORT_TYPES = "application/pdf,image/png,image/jpeg,image/jpg,image/webp"

export function isSupportedImportFile(file: File): boolean {
  return file.type === "application/pdf" || file.type.startsWith("image/")
}

/** Rasterizes any image file (incl. webp) into PNG bytes via an offscreen canvas. */
async function imageFileToPngBytes(file: File): Promise<Uint8Array> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.crossOrigin = "anonymous"
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("No se pudo leer la imagen"))
      el.src = url
    })
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(img, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    if (!blob) throw new Error("No se pudo convertir la imagen")
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Adds a single image file as a full page sized to the image dimensions. */
async function addImagePage(doc: PDFDocument, file: File): Promise<void> {
  const type = file.type.toLowerCase()
  let image
  if (type.includes("png")) {
    image = await doc.embedPng(new Uint8Array(await file.arrayBuffer()))
  } else if (type.includes("jpeg") || type.includes("jpg")) {
    image = await doc.embedJpg(new Uint8Array(await file.arrayBuffer()))
  } else {
    // webp / other raster formats: transcode to PNG first
    image = await doc.embedPng(await imageFileToPngBytes(file))
  }
  const page = doc.addPage([image.width, image.height])
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
}

/** Copies every page of an incoming PDF file into the target document. */
async function appendPdfFile(doc: PDFDocument, file: File): Promise<void> {
  const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  const copied = await doc.copyPages(src, src.getPageIndices())
  copied.forEach((p) => doc.addPage(p))
}

async function addFilesToDoc(doc: PDFDocument, files: File[]): Promise<void> {
  for (const file of files) {
    if (file.type === "application/pdf") {
      await appendPdfFile(doc, file)
    } else if (file.type.startsWith("image/")) {
      await addImagePage(doc, file)
    }
  }
}

/**
 * Builds a fresh in-memory PDFDocument from a mix of images and PDFs, without
 * saving it to bytes yet. Exposed so callers that need to copy the resulting
 * pages into another document (e.g. inserting/replacing pages) can do so
 * directly, without a redundant save + reload round trip.
 */
export async function buildDocFromFiles(files: File[]): Promise<PDFDocument> {
  const doc = await PDFDocument.create()
  await addFilesToDoc(doc, files)
  if (doc.getPageCount() === 0) {
    throw new Error("No se encontraron páginas válidas para importar")
  }
  return doc
}

/** Builds a fresh PDF from a mix of images and PDFs (used for the initial import). */
export async function filesToPdfBytes(files: File[]): Promise<Uint8Array> {
  const doc = await buildDocFromFiles(files)
  return doc.save()
}

/** Appends images/PDFs to an existing document, preserving its original pages. */
export async function appendFilesToPdf(baseBytes: ArrayBuffer, files: File[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(baseBytes, { ignoreEncryption: true })
  await addFilesToDoc(doc, files)
  return doc.save()
}
