"use client"

import { useEffect, useRef } from "react"
import type { PdfjsDocument, PdfjsPage } from "@/lib/pdfjs"
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

  useEffect(() => {
    let cancelled = false
    // Same guard as PageCanvas: cancel any in-flight render before starting a
    // new one so overlapping render() calls (e.g. React Strict Mode's dev-only
    // double-invoke) can't race over the page's image cache and leave a
    // scanned page's thumbnail blank.
    let renderTask: ReturnType<PdfjsPage["render"]> | null = null

    async function render() {
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
      renderTask = page.render({ canvasContext: ctx, canvas, viewport })
      await renderTask.promise
    }
    render().catch((e) => {
      if (e?.name !== "RenderingCancelledException") console.error("[v0] thumbnail render failed", e)
    })
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [doc, pageState.originalIndex, pageState.rotation, targetWidth])

  return <canvas ref={canvasRef} className="block w-full rounded-sm" />
}
