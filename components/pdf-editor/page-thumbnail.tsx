"use client"

import { useEffect, useRef } from "react"
import type { PdfjsDocument } from "@/lib/pdfjs"
import { getTotalRotation } from "@/lib/pdf-coords"
import type { PageState } from "@/lib/pdf-types"

interface PageThumbnailProps {
  doc: PdfjsDocument
  pageState: PageState
  /** Rendered pixel width to scale the page to. Defaults to the size used by the tools sidebar list. */
  targetWidth?: number
}

export function PageThumbnail({ doc, pageState, targetWidth = 132 }: PageThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Serializes successive page.render() calls for this thumbnail instance so
  // they never overlap. We never cancel a pdf.js RenderTask directly: if its
  // async image decode resolves after cancel() has torn down the page's
  // render intent, pdf.js silently drops the image instead of resolving it,
  // permanently poisoning that page's shared image cache (every future
  // render, including a brand new one, then renders blank for that image).
  // This is especially visible on scanned (image-only) pages, where a slow
  // decode reliably loses the race against a cancel from React Strict Mode's
  // dev-only double-invoke or a rapid resize.
  const renderChainRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let cancelled = false

    async function render() {
      if (cancelled) return
      const page = await doc.getPage(pageState.originalIndex + 1)
      if (cancelled) return
      const rotation = getTotalRotation(page, pageState.rotation)
      const baseViewport = page.getViewport({ scale: 1, rotation })
      const scale = targetWidth / baseViewport.width
      const viewport = page.getViewport({ scale, rotation })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      await page.render({ canvasContext: ctx, canvas, viewport }).promise
    }

    renderChainRef.current = renderChainRef.current.then(() => {
      if (cancelled) return
      return render().catch((e) => console.error("[v0] thumbnail render failed", e))
    })

    return () => {
      cancelled = true
    }
  }, [doc, pageState.originalIndex, pageState.rotation, targetWidth])

  return <canvas ref={canvasRef} className="block w-full rounded-sm" />
}
