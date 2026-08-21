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

  const search = useCallback(
    async (query: string, options: SearchOptions, pageOrder: number[]): Promise<DocumentMatch[]> => {
      if (!doc || query.trim().length === 0) return []
      const cache = cacheRef.current
      const results: DocumentMatch[] = []

      for (const pageIndex of pageOrder) {
        let pageText = cache.get(pageIndex)
        if (!pageText) {
          try {
            const page = await doc.getPage(pageIndex + 1)
            pageText = await extractPageText(page)
            cache.set(pageIndex, pageText)
          } catch (e) {
            console.error("[v0] search extract failed", e)
            continue
          }
        }
        const matches = findMatchesInPage(pageText, query, options)
        for (const m of matches) {
          results.push({ pageIndex, rects: m.rects, snippet: m.snippet })
        }
      }

      return results
    },
    [doc],
  )

  return { search }
}
