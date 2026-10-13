"use client"

import { useEffect, useRef, useState } from "react"
import type { PdfjsDocument } from "@/lib/pdfjs"
import { getTotalRotation } from "@/lib/pdf-coords"
import type { PageState } from "@/lib/pdf-types"

interface PageThumbnailProps {
  doc: PdfjsDocument
  pageState: PageState
  /** Rendered pixel width to scale the page to. Defaults to the size used by the tools sidebar list. */
  targetWidth?: number
}

/** How far outside the scroll viewport a thumbnail starts rendering, so it is ready before it scrolls in. */
const VISIBILITY_MARGIN = "600px 0px"

function estimateAspectRatio(pageState: PageState): number {
  const swapped = Math.abs(pageState.rotation % 180) === 90
  const width = swapped ? pageState.height : pageState.width
  const height = swapped ? pageState.width : pageState.height
  return width > 0 && height > 0 ? width / height : 1 / 1.414
}

export function PageThumbnail({ doc, pageState, targetWidth = 132 }: PageThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isNearViewport, setIsNearViewport] = useState(false)
  const [measuredRatio, setMeasuredRatio] = useState<number | null>(null)
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

  // In a 400-page document, mounting every thumbnail and rendering it at once
  // freezes the grid. Only pages near the scroll viewport get rendered.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsNearViewport(entry.isIntersecting),
      { rootMargin: VISIBILITY_MARGIN },
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isNearViewport) {
      // Release the bitmap of pages that scrolled far away to keep memory bounded.
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
      return
    }

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
      setMeasuredRatio(viewport.width / viewport.height)
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
  }, [doc, isNearViewport, pageState.originalIndex, pageState.rotation, targetWidth])

  // A stable aspect-ratio box gives every card its final height before its
  // canvas renders, so the grid keeps its layout and the observer only fires
  // for cards that are genuinely on screen.
  const aspectRatio = measuredRatio ?? estimateAspectRatio(pageState)

  return (
    <div ref={containerRef} className="relative w-full" style={{ aspectRatio }}>
      <canvas ref={canvasRef} className="absolute inset-0 block size-full rounded-sm" />
    </div>
  )
}
