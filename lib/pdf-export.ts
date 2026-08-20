import JSZip from "jszip"
import { Document, Packer, Paragraph } from "docx"
import type { PdfjsDocument } from "./pdfjs"
import { getTotalRotation } from "./pdf-coords"
import type { PageState } from "./pdf-types"

export async function exportPagesAsImages(
  doc: PdfjsDocument,
  pages: PageState[],
  format: "png" | "jpeg",
  scale = 2,
): Promise<Blob> {
  const activePages = pages.filter((p) => !p.deleted)

  if (activePages.length === 1) {
    const blob = await renderPageToBlob(doc, activePages[0], format, scale)
    return blob
  }

  const zip = new JSZip()
  for (let i = 0; i < activePages.length; i++) {
    const blob = await renderPageToBlob(doc, activePages[i], format, scale)
    const buffer = await blob.arrayBuffer()
    zip.file(`pagina-${String(i + 1).padStart(2, "0")}.${format === "jpeg" ? "jpg" : "png"}`, buffer)
  }
  return zip.generateAsync({ type: "blob" })
}

async function renderPageToBlob(
  doc: PdfjsDocument,
  pageState: PageState,
  format: "png" | "jpeg",
  scale: number,
): Promise<Blob> {
  const page = await doc.getPage(pageState.originalIndex + 1)
  const rotation = getTotalRotation(page, pageState.rotation)
  const viewport = page.getViewport({ scale, rotation })
  const canvas = document.createElement("canvas")
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext("2d")!
  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  await page.render({ canvasContext: ctx, canvas, viewport }).promise
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? new Blob()),
      format === "jpeg" ? "image/jpeg" : "image/png",
      0.92,
    )
  })
}

export async function exportTextContent(doc: PdfjsDocument, pages: PageState[]): Promise<string> {
  const activePages = pages.filter((p) => !p.deleted)
  const chunks: string[] = []
  for (const pageState of activePages) {
    const page = await doc.getPage(pageState.originalIndex + 1)
    const textContent = await page.getTextContent()
    const text = textContent.items.map((item: any) => item.str ?? "").join(" ")
    chunks.push(text.trim())
  }
  return chunks.join("\n\n")
}

export async function exportAsDocx(doc: PdfjsDocument, pages: PageState[]): Promise<Blob> {
  const activePages = pages.filter((p) => !p.deleted)
  const paragraphs: Paragraph[] = []

  for (let i = 0; i < activePages.length; i++) {
    const pageState = activePages[i]
    const page = await doc.getPage(pageState.originalIndex + 1)
    const textContent = await page.getTextContent()

    let currentLine = ""
    let lastY: number | null = null
    for (const item of textContent.items as any[]) {
      const y = item.transform?.[5] ?? 0
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (currentLine.trim()) paragraphs.push(new Paragraph(currentLine.trim()))
        currentLine = ""
      }
      currentLine += (item.str ?? "") + " "
      lastY = y
    }
    if (currentLine.trim()) paragraphs.push(new Paragraph(currentLine.trim()))

    if (i < activePages.length - 1) {
      paragraphs.push(new Paragraph({ text: "", pageBreakBefore: true }))
    }
  }

  const docx = new Document({
    sections: [{ children: paragraphs.length > 0 ? paragraphs : [new Paragraph("")] }],
  })

  return Packer.toBlob(docx)
}
