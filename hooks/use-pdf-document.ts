"use client"

import { useEffect, useRef, useState } from "react"
import { getPdfjs, type PdfjsDocument } from "@/lib/pdfjs"
import type { PageState } from "@/lib/pdf-types"

interface UsePdfDocumentResult {
  doc: PdfjsDocument | null
  pages: PageState[]
  loading: boolean
  error: string | null
}

export function usePdfDocument(bytes: ArrayBuffer | null, version: number): UsePdfDocumentResult {
  const [doc, setDoc] = useState<PdfjsDocument | null>(null)
  const [pages, setPages] = useState<PageState[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const docRef = useRef<PdfjsDocument | null>(null)

  useEffect(() => {
    if (!bytes) {
      setDoc(null)
      setPages([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const pdfjs = getPdfjs()
        const copy = bytes!.slice(0)
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(copy) })
        const pdfDoc = await loadingTask.promise
        if (cancelled) return

        const pageStates: PageState[] = []
        for (let i = 0; i < pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i + 1)
          const viewport = page.getViewport({ scale: 1 })
          pageStates.push({
            originalIndex: i,
            rotation: 0,
            deleted: false,
            width: viewport.width,
            height: viewport.height,
          })
        }

        if (cancelled) return
        if (docRef.current) {
          docRef.current.destroy()
        }
        docRef.current = pdfDoc
        setDoc(pdfDoc)
        setPages(pageStates)
      } catch (e) {
        if (!cancelled) {
          console.error("[v0] Failed to load PDF", e)
          setError("No se pudo abrir el archivo PDF. Verifica que no esté dañado o protegido.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  useEffect(() => {
    return () => {
      docRef.current?.destroy()
    }
  }, [])

  return { doc, pages, loading, error }
}
