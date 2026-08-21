import { PDFDocument } from "pdf-lib"
import { makeId } from "./id"
import type { Annotation, PageState } from "./pdf-types"

const LETTER: [number, number] = [612, 792]

/**
 * Appends a blank page to the underlying bytes and inserts a matching PageState
 * right after the given full-array index (or at the end when null). Existing
 * pages and annotations keep their originalIndex, so nothing needs remapping.
 */
export async function insertBlankPage(
  baseBytes: ArrayBuffer,
  pages: PageState[],
  afterIndex: number | null,
): Promise<{ bytes: Uint8Array; pages: PageState[] }> {
  const doc = await PDFDocument.load(baseBytes, { ignoreEncryption: true })

  // Size the blank page to match its neighbor for a natural fit.
  let size: [number, number] = LETTER
  if (afterIndex !== null && pages[afterIndex]) {
    size = [pages[afterIndex].width, pages[afterIndex].height]
  }

  const newIndex = doc.getPageCount()
  doc.addPage(size)
  const bytes = await doc.save()

  const newPage: PageState = {
    originalIndex: newIndex,
    rotation: 0,
    deleted: false,
    width: size[0],
    height: size[1],
  }

  const nextPages = [...pages]
  if (afterIndex === null) {
    nextPages.push(newPage)
  } else {
    nextPages.splice(afterIndex + 1, 0, newPage)
  }

  return { bytes, pages: nextPages }
}

/**
 * Duplicates the page at the given display index: copies its source page to the
 * end of the byte stream and clones its annotations onto the new page.
 */
export async function duplicatePage(
  baseBytes: ArrayBuffer,
  pages: PageState[],
  annotations: Record<number, Annotation[]>,
  index: number,
): Promise<{ bytes: Uint8Array; pages: PageState[]; annotations: Record<number, Annotation[]> }> {
  const fullIndex = index
  const source = pages[fullIndex]

  const doc = await PDFDocument.load(baseBytes, { ignoreEncryption: true })
  const newIndex = doc.getPageCount()
  const [copied] = await doc.copyPages(doc, [source.originalIndex])
  doc.addPage(copied)
  const { width, height } = copied.getSize()
  const bytes = await doc.save()

  const newPage: PageState = {
    originalIndex: newIndex,
    rotation: source.rotation,
    deleted: false,
    width,
    height,
  }
  const nextPages = [...pages]
  nextPages.splice(fullIndex + 1, 0, newPage)

  // Clone annotations from the source page onto the duplicate.
  const nextAnnotations = { ...annotations }
  const sourceAnns = annotations[source.originalIndex] ?? []
  if (sourceAnns.length > 0) {
    nextAnnotations[newIndex] = sourceAnns.map((ann) => ({
      ...(JSON.parse(JSON.stringify(ann)) as Annotation),
      id: makeId("ann"),
      pageIndex: newIndex,
    }))
  }

  return { bytes, pages: nextPages, annotations: nextAnnotations }
}

/**
 * Builds a new PDF containing only the given display indices, taken from an
 * already-baked document (where page i corresponds to visible page i).
 */
export async function extractPagesPdf(bakedBytes: ArrayBuffer, displayIndices: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bakedBytes, { ignoreEncryption: true })
  const out = await PDFDocument.create()
  const valid = displayIndices.filter((i) => i >= 0 && i < src.getPageCount())
  const copied = await out.copyPages(src, valid)
  copied.forEach((p) => out.addPage(p))
  return out.save()
}
