import type { PdfjsPage } from "./pdfjs"

/** A rectangle in PDF user space (bottom-left origin), independent of zoom/rotation. */
export interface SearchRect {
  x: number
  y: number
  width: number
  height: number
}

export interface SearchOptions {
  caseSensitive: boolean
  ignoreAccents: boolean
  wholeWord: boolean
}

export interface RawMatch {
  /** One rect per text run the match spans (usually one). */
  rects: SearchRect[]
  /** Short surrounding text, useful for result lists / debugging. */
  snippet: string
}

interface ItemGeom {
  /** Global start index of this run inside the page text. */
  start: number
  length: number
  x: number
  /** Baseline y in PDF user space. */
  baseline: number
  width: number
  height: number
}

export interface PageText {
  text: string
  items: ItemGeom[]
}

const WORD_CHAR = /[\p{L}\p{N}_]/u

/**
 * Fold a string to a same-length representation for tolerant matching.
 * Preserves a 1:1 character mapping so match indices map back to the source.
 */
function fold(str: string, caseSensitive: boolean, ignoreAccents: boolean): string {
  let out = ""
  for (let i = 0; i < str.length; i++) {
    let c = str[i]
    if (ignoreAccents) {
      const decomposed = c.normalize("NFD")
      if (decomposed.length > 0) c = decomposed[0]
    }
    if (!caseSensitive) c = c.toLowerCase()
    // Guard against rare length-changing folds to keep the 1:1 index mapping.
    if (c.length !== 1) c = str[i]
    out += c
  }
  return out
}

/** Extract text and per-run geometry from a page, in PDF user space. */
export async function extractPageText(page: PdfjsPage): Promise<PageText> {
  const content = await page.getTextContent()
  let text = ""
  const items: ItemGeom[] = []
  let prev: ItemGeom | null = null

  for (const raw of content.items) {
    // Skip marked-content markers (no str/transform).
    if (!("str" in raw) || !("transform" in raw)) continue
    const item = raw as {
      str: string
      transform: number[]
      width: number
      height: number
    }
    const str = item.str
    if (str.length === 0) continue

    const x = item.transform[4]
    const baseline = item.transform[5]
    const height = Math.hypot(item.transform[2], item.transform[3]) || item.height || 10
    const width = item.width

    if (prev) {
      const sameLine = Math.abs(baseline - prev.baseline) < prev.height * 0.5
      const gap = x - (prev.x + prev.width)
      const endsWithSpace = /\s$/.test(text)
      const startsWithSpace = /^\s/.test(str)
      if (!sameLine) {
        if (!endsWithSpace && !startsWithSpace) text += " "
      } else if (gap > prev.height * 0.2) {
        if (!endsWithSpace && !startsWithSpace) text += " "
      }
    }

    const start = text.length
    text += str
    const geom: ItemGeom = { start, length: str.length, x, baseline, width, height }
    items.push(geom)
    prev = geom
  }

  return { text, items }
}

/** Build PDF-space rects for a match spanning [globalStart, globalEnd). */
function rectsForRange(page: PageText, globalStart: number, globalEnd: number): SearchRect[] {
  const rects: SearchRect[] = []
  for (const item of page.items) {
    const itemEnd = item.start + item.length
    const overlapStart = Math.max(globalStart, item.start)
    const overlapEnd = Math.min(globalEnd, itemEnd)
    if (overlapEnd <= overlapStart) continue

    const fracStart = (overlapStart - item.start) / item.length
    const fracEnd = (overlapEnd - item.start) / item.length
    const rectX = item.x + fracStart * item.width
    const rectW = (fracEnd - fracStart) * item.width
    // Cover glyph body plus a bit of the descender for a snug box.
    const pad = item.height * 0.15
    rects.push({
      x: rectX,
      y: item.baseline - pad,
      width: rectW,
      height: item.height + pad,
    })
  }
  return rects
}

/** Find all matches of a query within a single page's text. */
export function findMatchesInPage(page: PageText, query: string, options: SearchOptions): RawMatch[] {
  const normalizedQuery = query.replace(/\s+/g, " ").trim()
  if (normalizedQuery.length === 0) return []

  const haystack = fold(page.text, options.caseSensitive, options.ignoreAccents)
  const needle = fold(normalizedQuery, options.caseSensitive, options.ignoreAccents)
  const matches: RawMatch[] = []

  let from = 0
  while (from <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, from)
    if (idx === -1) break
    const end = idx + needle.length

    if (options.wholeWord) {
      const before = idx > 0 ? page.text[idx - 1] : ""
      const after = end < page.text.length ? page.text[end] : ""
      const boundaryBefore = before === "" || !WORD_CHAR.test(before)
      const boundaryAfter = after === "" || !WORD_CHAR.test(after)
      if (!boundaryBefore || !boundaryAfter) {
        from = idx + 1
        continue
      }
    }

    const rects = rectsForRange(page, idx, end)
    if (rects.length > 0) {
      const snippetStart = Math.max(0, idx - 20)
      const snippetEnd = Math.min(page.text.length, end + 20)
      matches.push({ rects, snippet: page.text.slice(snippetStart, snippetEnd).trim() })
    }
    from = end
  }

  return matches
}
