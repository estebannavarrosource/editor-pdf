import { PDFDocument } from "pdf-lib"
import { makeId } from "./id"
import { buildDocFromFiles } from "./pdf-import"
import type { Annotation, PageState } from "./pdf-types"

const LETTER: [number, number] = [612, 792]

/**
 * Translates a full-array index (which includes soft-deleted pages) to its
 * position among only the non-deleted pages, or -1 if that page is itself
 * deleted. Centralizes a calculation that used to live inline wherever the
 * baked/exported document (which only contains visible pages) needed to be
 * addressed by an index from the full `pages` array.
 */
export function toDisplayIndex(pages: PageState[], index: number): number {
  if (pages[index]?.deleted) return -1
  let display = 0
  for (let i = 0; i < index; i++) {
    if (!pages[i].deleted) display++
  }
  return display
}

/** Batch version of {@link toDisplayIndex}; drops any deleted pages from the result. */
export function toDisplayIndices(pages: PageState[], indices: number[]): number[] {
  return indices.map((i) => toDisplayIndex(pages, i)).filter((i) => i >= 0)
}

/** Standard page sizes in PDF points (1pt = 1/72in), portrait orientation. */
export const PAGE_SIZES = {
  a4: { label: "A4", dims: [595.28, 841.89] as [number, number] },
  letter: { label: "Carta", dims: [612, 792] as [number, number] },
  legal: { label: "Oficio", dims: [612, 1008] as [number, number] },
  a3: { label: "A3", dims: [841.89, 1190.55] as [number, number] },
} as const

export type PageSizeId = keyof typeof PAGE_SIZES
export type PageOrientation = "portrait" | "landscape"

export interface NewPdfOptions {
  size: PageSizeId
  orientation: PageOrientation
  pageCount: number
}

/**
 * Creates a brand-new PDF from scratch with the requested number of blank
 * pages, sizing and orienting each one per the chosen preset.
 */
export async function createBlankPdf(options: NewPdfOptions): Promise<Uint8Array> {
  const { size, orientation, pageCount } = options
  const [w, h] = PAGE_SIZES[size].dims
  const dims: [number, number] = orientation === "landscape" ? [h, w] : [w, h]

  const doc = await PDFDocument.create()
  const count = Math.max(1, Math.min(50, Math.floor(pageCount) || 1))
  for (let i = 0; i < count; i++) doc.addPage(dims)
  return doc.save()
}

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
  const bytes = await doc.save()

  // Some source pages inherit their MediaBox from an ancestor Pages node
  // instead of setting it directly, which makes `copied.getSize()` throw
  // after copyPages. We already know the dimensions from the existing
  // PageState, so reuse those instead of re-deriving them from the copy.
  const newPage: PageState = {
    originalIndex: newIndex,
    rotation: source.rotation,
    deleted: false,
    width: source.width,
    height: source.height,
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

/**
 * Duplicates every page in `indices` right after its own original position,
 * as a single byte-level operation. Indices are processed from highest to
 * lowest so that inserting a duplicate never shifts the position of an
 * index still pending in the loop.
 */
export async function duplicatePages(
  baseBytes: ArrayBuffer,
  pages: PageState[],
  annotations: Record<number, Annotation[]>,
  indices: number[],
): Promise<{ bytes: Uint8Array; pages: PageState[]; annotations: Record<number, Annotation[]> }> {
  const doc = await PDFDocument.load(baseBytes, { ignoreEncryption: true })
  let nextPages = [...pages]
  let nextAnnotations = { ...annotations }

  const sorted = [...indices].sort((a, b) => b - a)
  for (const fullIndex of sorted) {
    const source = nextPages[fullIndex]
    if (!source) continue

    const newIndex = doc.getPageCount()
    const [copied] = await doc.copyPages(doc, [source.originalIndex])
    doc.addPage(copied)

    const newPage: PageState = {
      originalIndex: newIndex,
      rotation: source.rotation,
      deleted: false,
      width: source.width,
      height: source.height,
    }
    nextPages = [...nextPages.slice(0, fullIndex + 1), newPage, ...nextPages.slice(fullIndex + 1)]

    const sourceAnns = annotations[source.originalIndex] ?? []
    if (sourceAnns.length > 0) {
      nextAnnotations = {
        ...nextAnnotations,
        [newIndex]: sourceAnns.map((ann) => ({
          ...(JSON.parse(JSON.stringify(ann)) as Annotation),
          id: makeId("ann"),
          pageIndex: newIndex,
        })),
      }
    }
  }

  const bytes = await doc.save()
  return { bytes, pages: nextPages, annotations: nextAnnotations }
}

/**
 * Imports a mix of PDF/image files, appends their pages to the end of the
 * byte stream, and splices matching PageState entries into the array right
 * after `afterIndex` (or at the end when null).
 */
export async function insertFilesAtPosition(
  baseBytes: ArrayBuffer,
  pages: PageState[],
  files: File[],
  afterIndex: number | null,
): Promise<{ bytes: Uint8Array; pages: PageState[] }> {
  const doc = await PDFDocument.load(baseBytes, { ignoreEncryption: true })
  const incoming = await buildDocFromFiles(files)

  const startIndex = doc.getPageCount()
  const copied = await doc.copyPages(incoming, incoming.getPageIndices())
  const newPages: PageState[] = copied.map((page, i) => {
    doc.addPage(page)
    const { width, height } = page.getSize()
    return { originalIndex: startIndex + i, rotation: 0, deleted: false, width, height }
  })
  const bytes = await doc.save()

  const nextPages = [...pages]
  if (afterIndex === null) {
    nextPages.push(...newPages)
  } else {
    nextPages.splice(afterIndex + 1, 0, ...newPages)
  }

  return { bytes, pages: nextPages }
}

/**
 * Replaces the page at `index` with the contents of one or more files: the
 * new pages are appended to the byte stream, and the old PageState entry is
 * swapped out for the new one(s) at the same position. The replaced page's
 * annotations are dropped since they belonged to different content.
 */
export async function replacePageWithFile(
  baseBytes: ArrayBuffer,
  pages: PageState[],
  annotations: Record<number, Annotation[]>,
  index: number,
  files: File[],
): Promise<{ bytes: Uint8Array; pages: PageState[]; annotations: Record<number, Annotation[]> }> {
  const doc = await PDFDocument.load(baseBytes, { ignoreEncryption: true })
  const incoming = await buildDocFromFiles(files)

  const startIndex = doc.getPageCount()
  const copied = await doc.copyPages(incoming, incoming.getPageIndices())
  const newPages: PageState[] = copied.map((page, i) => {
    doc.addPage(page)
    const { width, height } = page.getSize()
    return { originalIndex: startIndex + i, rotation: 0, deleted: false, width, height }
  })
  const bytes = await doc.save()

  const removed = pages[index]
  const nextPages = [...pages.slice(0, index), ...newPages, ...pages.slice(index + 1)]

  const nextAnnotations = { ...annotations }
  if (removed) delete nextAnnotations[removed.originalIndex]

  return { bytes, pages: nextPages, annotations: nextAnnotations }
}
