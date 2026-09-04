"use client"

import { useCallback, useEffect, useRef } from "react"
import type { PdfjsDocument } from "@/lib/pdfjs"
import {
  extractPageText,
  findMatchesInPage,
  type PageText,
  type SearchOptions,
  type SearchRect,
} from "@/lib/pdf-search"

export interface DocumentMatch {
  /** Original page index the match belongs to. */
  pageIndex: number
  rects: SearchRect[]
  snippet: string
}

export function usePdfSearch(doc: PdfjsDocument | null) {
  const cacheRef = useRef<Map<number, PageText>>(new Map())

  // Reset cached page text whenever the document instance changes.
  useEffect(() => {
    cacheRef.current = new Map()
  }, [doc])

  /** Extract (and cache) the text layer for a single page. */
  const ensurePageText = useCallback(
    async (pageIndex: number): Promise<PageText | null> => {
      if (!doc) return null
      const cache = cacheRef.current
      const cached = cache.get(pageIndex)
      if (cached) return cached
      try {
        const page = await doc.getPage(pageIndex + 1)
        const pageText = await extractPageText(page)
        cache.set(pageIndex, pageText)
        return pageText
      } catch (e) {
        console.error("[v0] search extract failed", e)
        return null
      }
    },
    [doc],
  )

  /**
   * Pre-extracts and caches the text layer for every page so the first real
   * search returns instantly. Called after OCR embeds a fresh text layer.
   */
  const prewarm = useCallback(
    async (pageOrder: number[]): Promise<void> => {
      for (const pageIndex of pageOrder) {
        await ensurePageText(pageIndex)
      }
    },
    [ensurePageText],
  )

  const search = useCallback(
    async (query: string, options: SearchOptions, pageOrder: number[]): Promise<DocumentMatch[]> => {
      if (!doc || query.trim().length === 0) return []
      const results: DocumentMatch[] = []

      for (const pageIndex of pageOrder) {
        const pageText = await ensurePageText(pageIndex)
        if (!pageText) continue
        const matches = findMatchesInPage(pageText, query, options)
        for (const m of matches) {
          results.push({ pageIndex, rects: m.rects, snippet: m.snippet })
        }
      }

      return results
    },
    [doc, ensurePageText],
  )

  return { search, prewarm }
}
