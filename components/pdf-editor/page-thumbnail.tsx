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

  useEffect(() => {
    let cancelled = false
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
      await page.render({ canvasContext: ctx, canvas, viewport }).promise
    }
    render().catch((e) => console.error("[v0] thumbnail render failed", e))
    return () => {
      cancelled = true
    }
  }, [doc, pageState.originalIndex, pageState.rotation, targetWidth])

  return <canvas ref={canvasRef} className="block w-full rounded-sm" />
}
