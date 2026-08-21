import { PDFDocument, StandardFonts } from "pdf-lib"
import { getPdfjs, type PdfjsDocument } from "./pdfjs"
import type { PageState } from "./pdf-types"

export const OCR_LANGS = "spa+eng"

/** A recognized word with geometry in PDF user-space points (bottom-left origin). */
export interface OcrWord {
  text: string
  x: number
  y: number
  width: number
  height: number
}

export interface OcrPageResult {
  originalIndex: number
  pageNumber: number
  text: string
  confidence: number
  words: OcrWord[]
  /** Unrotated page size in PDF points. */
  pageWidth: number
  pageHeight: number
}

export interface OcrProgress {
  pageNumber: number
  totalPages: number
  status: string
  progress: number
}

// Render scale for OCR — higher improves accuracy at the cost of speed/memory.
const OCR_RENDER_SCALE = 2

async function renderPageToCanvas(doc: PdfjsDocument, originalIndex: number) {
  const page = await doc.getPage(originalIndex + 1)
  const baseViewport = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE })
  const canvas = document.createElement("canvas")
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, canvas, viewport }).promise
  return { canvas, pageWidth: baseViewport.width, pageHeight: baseViewport.height }
}

/** Returns true when a page has almost no extractable text (likely a scan/image). */
export async function pageNeedsOcr(doc: PdfjsDocument, originalIndex: number): Promise<boolean> {
  const page = await doc.getPage(originalIndex + 1)
  const content = await page.getTextContent()
  const text = content.items.map((i: any) => i.str ?? "").join("").trim()
  return text.length < 12
}

export async function documentNeedsOcr(doc: PdfjsDocument): Promise<boolean> {
  const sample = Math.min(doc.numPages, 3)
  let scanned = 0
  for (let i = 0; i < sample; i++) {
    if (await pageNeedsOcr(doc, i)) scanned++
  }
  return scanned === sample
}

/**
 * Runs OCR over the selected pages, returning recognized text and word geometry
 * converted from image pixels to PDF points with a flipped (bottom-left) origin.
 */
export async function runOcr(
  doc: PdfjsDocument,
  pages: PageState[],
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrPageResult[]> {
  const { createWorker } = await import("tesseract.js")
  const activePages = pages.filter((p) => !p.deleted)
  const results: OcrPageResult[] = []
  let currentPageNumber = 0

  const worker = await createWorker(OCR_LANGS, 1, {
    logger: (m: { status: string; progress: number }) => {
      if (onProgress && currentPageNumber > 0) {
        onProgress({
          pageNumber: currentPageNumber,
          totalPages: activePages.length,
          status: m.status,
          progress: m.progress,
        })
      }
    },
  })

  try {
    for (let i = 0; i < activePages.length; i++) {
      currentPageNumber = i + 1
      const pageState = activePages[i]
      const { canvas, pageWidth, pageHeight } = await renderPageToCanvas(doc, pageState.originalIndex)

      const { data } = await worker.recognize(canvas, {}, { blocks: true })

      const words: OcrWord[] = []
      const blocks = data.blocks ?? []
      for (const block of blocks) {
        for (const para of block.paragraphs ?? []) {
          for (const line of para.lines ?? []) {
            for (const w of line.words ?? []) {
              if (!w.text.trim()) continue
              const bx0 = w.bbox.x0 / OCR_RENDER_SCALE
              const bx1 = w.bbox.x1 / OCR_RENDER_SCALE
              const by0 = w.bbox.y0 / OCR_RENDER_SCALE
              const by1 = w.bbox.y1 / OCR_RENDER_SCALE
              words.push({
                text: w.text,
                x: bx0,
                y: pageHeight - by1, // flip top-left image origin to bottom-left PDF origin
                width: Math.max(1, bx1 - bx0),
                height: Math.max(1, by1 - by0),
              })
            }
          }
        }
      }

      // Free the canvas early
      canvas.width = 0
      canvas.height = 0

      results.push({
        originalIndex: pageState.originalIndex,
        pageNumber: i + 1,
        text: (data.text ?? "").trim(),
        confidence: data.confidence ?? 0,
        words,
        pageWidth,
        pageHeight,
      })
    }
  } finally {
    await worker.terminate()
  }

  return results
}

/**
 * Embeds an invisible OCR text layer onto the matching pages of the document so
 * the resulting PDF becomes searchable and its text selectable/extractable.
 */
export async function buildSearchablePdf(
  originalBytes: ArrayBuffer,
  ocrPages: OcrPageResult[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(originalBytes, { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pdfPages = doc.getPages()

  for (const ocr of ocrPages) {
    const page = pdfPages[ocr.originalIndex]
    if (!page) continue
    for (const w of ocr.words) {
      const size = Math.max(4, Math.min(72, w.height))
      let fontWidth = font.widthOfTextAtSize(w.text, size)
      if (fontWidth <= 0) fontWidth = w.width
      // Horizontal scale so the invisible glyphs roughly overlap the source word.
      const scaleX = Math.min(2, Math.max(0.2, w.width / fontWidth))
      try {
        page.drawText(w.text, {
          x: w.x,
          y: w.y,
          size: size * scaleX,
          font,
          opacity: 0,
        })
      } catch {
        // Skip words with glyphs unsupported by the standard font
      }
    }
  }

  return doc.save()
}
