"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { TextLayer } from "pdfjs-dist"
import type { PdfjsDocument } from "@/lib/pdfjs"
import type { Annotation, PageState, Point, ToolId } from "@/lib/pdf-types"
import {
  getTotalRotation,
  pdfRectToViewportRect,
  toPdfPoint,
  viewportRectToPdfRect,
  type PageViewportLike,
} from "@/lib/pdf-coords"
import { makeId } from "@/lib/id"
import type { SearchRect } from "@/lib/pdf-search"
import { AnnotationView } from "./annotation-view"
import { cn } from "@/lib/utils"

export interface PageSearchMatch {
  key: string
  rects: SearchRect[]
  active: boolean
}

export type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w"

const HIGHLIGHT_TOOLS: ToolId[] = ["highlight", "underline", "strikethrough"]
const SHAPE_TOOLS: ToolId[] = ["rectangle", "ellipse", "line", "arrow"]

interface PageCanvasProps {
  doc: PdfjsDocument
  pageState: PageState
  displayNumber: number
  scale: number
  tool: ToolId
  color: string
  strokeWidth: number
  fontSize: number
  fillShapes: boolean
  annotations: Annotation[]
  searchMatches: PageSearchMatch[]
  selectedId: string | null
  activeSignature: string | null
  onSelectAnnotation: (id: string | null) => void
  onAddAnnotation: (annotation: Annotation) => void
  onUpdateAnnotation: (id: string, patch: Partial<Annotation>) => void
  onRemoveAnnotation: (id: string) => void
  onRequestSignaturePlacement: () => void
  registerContainer: (originalIndex: number, el: HTMLDivElement | null) => void
}

export function PageCanvas({
  doc,
  pageState,
  displayNumber,
  scale,
  tool,
  color,
  strokeWidth,
  fontSize,
  fillShapes,
  annotations,
  searchMatches,
  selectedId,
  activeSignature,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
  onRequestSignaturePlacement,
  registerContainer,
}: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<PageViewportLike | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [draftShape, setDraftShape] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [draftStroke, setDraftStroke] = useState<Point[] | null>(null)
  const [interactingBox, setInteractingBox] = useState(false)

  const dragRef = useRef<{
    id: string
    startClientX: number
    startClientY: number
    originX: number
    originY: number
  } | null>(null)
  const resizeRef = useRef<{
    id: string
    handle: ResizeHandle
    startClientX: number
    startClientY: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)
  const drawRef = useRef<{ startX: number; startY: number } | null>(null)
  const strokeRef = useRef<Point[]>([])

  // Render page + text layer whenever scale/rotation changes.
  useEffect(() => {
    let cancelled = false
    let textLayerInstance: TextLayer | null = null

    async function render() {
      const page = await doc.getPage(pageState.originalIndex + 1)
      if (cancelled) return
      const totalRotation = getTotalRotation(page, pageState.rotation)
      const viewport = page.getViewport({ scale, rotation: totalRotation })
      viewportRef.current = viewport

      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const renderTask = page.render({ canvasContext: ctx, canvas, viewport })
      await renderTask.promise
      if (cancelled) return

      setSize({ width: viewport.width, height: viewport.height })

      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = ""
        const textContent = await page.getTextContent()
        if (cancelled) return
        textLayerInstance = new TextLayer({
          textContentSource: textContent as any,
          container: textLayerRef.current,
          viewport,
        })
        await textLayerInstance.render()
      }
    }

    render().catch((e) => console.error("[v0] page render failed", e))

    return () => {
      cancelled = true
      textLayerInstance?.cancel()
    }
  }, [doc, pageState.originalIndex, pageState.rotation, scale])

  const getLocalPoint = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const screenDeltaToPdf = useCallback((dx: number, dy: number) => {
    const viewport = viewportRef.current
    if (!viewport) return { dx: 0, dy: 0 }
    const p0 = toPdfPoint(viewport, 0, 0)
    const p1 = toPdfPoint(viewport, dx, dy)
    return { dx: p1.x - p0.x, dy: p1.y - p0.y }
  }, [])

  // ---- Text-selection based highlight / underline / strikethrough ----
  const handleTextLayerMouseUp = useCallback(() => {
    if (!HIGHLIGHT_TOOLS.includes(tool)) return
    const selection = typeof window !== "undefined" ? window.getSelection() : null
    const viewport = viewportRef.current
    const container = textLayerRef.current
    if (!selection || selection.isCollapsed || !viewport || !container) return
    if (!container.contains(selection.anchorNode)) return

    const containerRect = container.getBoundingClientRect()
    const rects: { pageIndex: number; x: number; y: number; width: number; height: number }[] = []
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i)
      const clientRects = range.getClientRects()
      for (const cr of Array.from(clientRects)) {
        if (cr.width < 0.5 || cr.height < 0.5) continue
        const local = {
          left: cr.left - containerRect.left,
          top: cr.top - containerRect.top,
          width: cr.width,
          height: cr.height,
        }
        const pdfRect = viewportRectToPdfRect(viewport, local)
        rects.push({ pageIndex: pageState.originalIndex, ...pdfRect })
      }
    }
    selection.removeAllRanges()
    if (rects.length === 0) return

    const annotation: Annotation = {
      id: makeId("ann"),
      pageIndex: pageState.originalIndex,
      color: tool === "highlight" ? color : color,
      createdAt: Date.now(),
      type: tool as "highlight" | "underline" | "strikethrough",
      rects,
      opacity: tool === "highlight" ? 0.4 : 1,
    }
    onAddAnnotation(annotation)
  }, [tool, color, pageState.originalIndex, onAddAnnotation])

  // ---- Drawing overlay interactions (ink, shapes, text, signature) ----
  const handleOverlayPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (tool === "select" || tool === "eraser" || HIGHLIGHT_TOOLS.includes(tool) || tool === "pan") return
      const pt = getLocalPoint(e)
      const viewport = viewportRef.current
      if (!viewport) return
      const pdfPt = toPdfPoint(viewport, pt.x, pt.y)

      if (tool === "ink") {
        strokeRef.current = [pdfPt]
        setDraftStroke([pdfPt])
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        return
      }

      if (SHAPE_TOOLS.includes(tool)) {
        drawRef.current = { startX: pdfPt.x, startY: pdfPt.y }
        setDraftShape({ x: pdfPt.x, y: pdfPt.y, width: 0, height: 0 })
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        return
      }

      if (tool === "text") {
        const id = makeId("ann")
        const width = 160
        const height = Math.max(28, fontSize * 1.6)
        onAddAnnotation({
          id,
          pageIndex: pageState.originalIndex,
          color,
          createdAt: Date.now(),
          type: "text",
          x: pdfPt.x,
          y: pdfPt.y - height,
          width,
          height,
          text: "",
          fontSize,
        })
        setEditingTextId(id)
        onSelectAnnotation(id)
        return
      }

      if (tool === "sign") {
        if (!activeSignature) {
          onRequestSignaturePlacement()
          return
        }
        const width = 160
        const height = 70
        onAddAnnotation({
          id: makeId("ann"),
          pageIndex: pageState.originalIndex,
          color,
          createdAt: Date.now(),
          type: "sign",
          x: pdfPt.x,
          y: pdfPt.y - height,
          width,
          height,
          dataUrl: activeSignature,
        })
      }
    },
    [tool, color, fontSize, pageState.originalIndex, activeSignature, getLocalPoint, onAddAnnotation, onSelectAnnotation, onRequestSignaturePlacement],
  )

  const handleOverlayPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const viewport = viewportRef.current
      if (!viewport) return

      if (tool === "ink" && strokeRef.current.length > 0) {
        const pt = getLocalPoint(e)
        const pdfPt = toPdfPoint(viewport, pt.x, pt.y)
        strokeRef.current = [...strokeRef.current, pdfPt]
        setDraftStroke(strokeRef.current)
        return
      }

      if (SHAPE_TOOLS.includes(tool) && drawRef.current) {
        const pt = getLocalPoint(e)
        const pdfPt = toPdfPoint(viewport, pt.x, pt.y)
        const { startX, startY } = drawRef.current
        setDraftShape({
          x: Math.min(startX, pdfPt.x),
          y: Math.min(startY, pdfPt.y),
          width: Math.abs(pdfPt.x - startX),
          height: Math.abs(pdfPt.y - startY),
        })
        return
      }

      // Dragging/resizing existing boxes is handled by the global listeners
      // in the interactingBox effect (handles capture the pointer).
    },
    [tool, getLocalPoint, screenDeltaToPdf, onUpdateAnnotation],
  )

  const handleOverlayPointerUp = useCallback(() => {
    if (tool === "ink" && strokeRef.current.length > 1) {
      onAddAnnotation({
        id: makeId("ann"),
        pageIndex: pageState.originalIndex,
        color,
        createdAt: Date.now(),
        type: "ink",
        strokes: [strokeRef.current],
        strokeWidth,
      })
    }
    strokeRef.current = []
    setDraftStroke(null)

    if (SHAPE_TOOLS.includes(tool) && drawRef.current) {
      const shape = draftShape
      if (shape && shape.width > 2 && shape.height > 2) {
        onAddAnnotation({
          id: makeId("ann"),
          pageIndex: pageState.originalIndex,
          color,
          createdAt: Date.now(),
          type: tool as "rectangle" | "ellipse" | "line" | "arrow",
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
          strokeWidth,
          fill: fillShapes,
        })
      }
      drawRef.current = null
      setDraftShape(null)
    }

    dragRef.current = null
    resizeRef.current = null
  }, [tool, color, strokeWidth, fillShapes, draftShape, pageState.originalIndex, onAddAnnotation])

  const handleBoxPointerDown = useCallback(
    (e: React.PointerEvent, annotation: Annotation) => {
      e.stopPropagation()
      if (tool === "eraser") {
        onRemoveAnnotation(annotation.id)
        return
      }
      if (tool !== "select") return
      onSelectAnnotation(annotation.id)
      if (annotation.type === "text" || annotation.type === "sign" || annotation.type === "rectangle" || annotation.type === "ellipse" || annotation.type === "line" || annotation.type === "arrow") {
        dragRef.current = {
          id: annotation.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          originX: annotation.x,
          originY: annotation.y,
        }
        setInteractingBox(true)
      }
    },
    [tool, onSelectAnnotation, onRemoveAnnotation],
  )

  const handleClickAny = useCallback(
    (annotation: Annotation) => {
      if (tool === "eraser") {
        onRemoveAnnotation(annotation.id)
      } else if (tool === "select") {
        onSelectAnnotation(annotation.id)
      }
    },
    [tool, onSelectAnnotation, onRemoveAnnotation],
  )

  const handleResizeStart = useCallback(
    (e: React.PointerEvent, annotation: Annotation, handle: ResizeHandle) => {
      e.stopPropagation()
      if (tool !== "select") return
      if (!("x" in annotation && "width" in annotation)) return
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      resizeRef.current = {
        id: annotation.id,
        handle,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: annotation.x,
        origY: annotation.y,
        origW: annotation.width,
        origH: annotation.height,
      }
      setInteractingBox(true)
    },
    [tool],
  )

  const handleDoubleClickAny = useCallback(
    (annotation: Annotation) => {
      if (tool === "select" && annotation.type === "text") {
        onSelectAnnotation(annotation.id)
        setEditingTextId(annotation.id)
      }
    },
    [tool, onSelectAnnotation],
  )

  // Global move/up handlers for dragging or resizing an existing box. Handles
  // (with pointer capture) intercept overlay events, so we track on window.
  useEffect(() => {
    if (!interactingBox) return

    function onMove(e: PointerEvent) {
      if (resizeRef.current) {
        const r = resizeRef.current
        const { dx, dy } = screenDeltaToPdf(e.clientX - r.startClientX, e.clientY - r.startClientY)
        let x = r.origX
        let y = r.origY
        let w = r.origW
        let h = r.origH
        const MIN = 8
        if (r.handle.includes("e")) w = r.origW + dx
        if (r.handle.includes("w")) {
          w = r.origW - dx
          x = r.origX + dx
        }
        if (r.handle.includes("n")) h = r.origH + dy
        if (r.handle.includes("s")) {
          h = r.origH - dy
          y = r.origY + dy
        }
        if (w < MIN) {
          if (r.handle.includes("w")) x = r.origX + (r.origW - MIN)
          w = MIN
        }
        if (h < MIN) {
          if (r.handle.includes("s")) y = r.origY + (r.origH - MIN)
          h = MIN
        }
        onUpdateAnnotation(r.id, { x, y, width: w, height: h } as Partial<Annotation>)
      } else if (dragRef.current) {
        const d = dragRef.current
        const { dx, dy } = screenDeltaToPdf(e.clientX - d.startClientX, e.clientY - d.startClientY)
        onUpdateAnnotation(d.id, { x: d.originX + dx, y: d.originY + dy } as Partial<Annotation>)
      }
    }

    function onUp() {
      dragRef.current = null
      resizeRef.current = null
      setInteractingBox(false)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [interactingBox, screenDeltaToPdf, onUpdateAnnotation])

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el
      registerContainer(pageState.originalIndex, el)
    },
    [pageState.originalIndex, registerContainer],
  )

  const overlayInteractive = tool !== "pan" && !HIGHLIGHT_TOOLS.includes(tool)
  const textLayerInteractive = HIGHLIGHT_TOOLS.includes(tool)
  const editingAnnotation = annotations.find((a) => a.id === editingTextId && a.type === "text") as
    | (Annotation & { type: "text" })
    | undefined

  return (
    <div
      ref={setRef}
      data-page-index={pageState.originalIndex}
      className="relative mx-auto bg-page shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.10)]"
      style={{ width: size.width || undefined, height: size.height || undefined }}
    >
      <canvas ref={canvasRef} className="block" />
      <div
        ref={textLayerRef}
        className={cn("textLayer", !textLayerInteractive && "pointer-events-none")}
        onMouseUp={handleTextLayerMouseUp}
        style={{ userSelect: textLayerInteractive ? "text" : "none" }}
      />

      {/* Search highlights */}
      {viewportRef.current && searchMatches.length > 0 && (
        <SearchHighlightLayer matches={searchMatches} viewport={viewportRef.current} />
      )}

      {/* Existing annotations */}
      <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
        {viewportRef.current &&
          annotations.map((ann) => (
            <AnnotationView
              key={ann.id}
              annotation={ann}
              viewport={viewportRef.current!}
              selected={ann.id === selectedId}
              interactive={tool === "select" || tool === "eraser"}
              resizable={tool === "select" && ann.id === selectedId}
              onPointerDownBox={handleBoxPointerDown}
              onClickAny={handleClickAny}
              onDoubleClickAny={handleDoubleClickAny}
              onResizeStart={handleResizeStart}
            />
          ))}

        {/* Live drawing previews */}
        {viewportRef.current && draftStroke && draftStroke.length > 1 && (
          <AnnotationView
            annotation={{
              id: "draft-ink",
              pageIndex: pageState.originalIndex,
              color,
              createdAt: 0,
              type: "ink",
              strokes: [draftStroke],
              strokeWidth,
            }}
            viewport={viewportRef.current}
            selected={false}
            interactive={false}
          />
        )}
        {viewportRef.current && draftShape && SHAPE_TOOLS.includes(tool) && (
          <AnnotationView
            annotation={{
              id: "draft-shape",
              pageIndex: pageState.originalIndex,
              color,
              createdAt: 0,
              type: tool as "rectangle" | "ellipse" | "line" | "arrow",
              x: draftShape.x,
              y: draftShape.y,
              width: draftShape.width,
              height: draftShape.height,
              strokeWidth,
              fill: fillShapes,
            }}
            viewport={viewportRef.current}
            selected={false}
            interactive={false}
          />
        )}
      </div>

      {/* Inline text editor */}
      {editingAnnotation && viewportRef.current && (
        <TextEditorOverlay
          annotation={editingAnnotation}
          viewport={viewportRef.current}
          onCommit={(text) => {
            if (text.trim().length === 0) {
              onRemoveAnnotation(editingAnnotation.id)
            } else {
              onUpdateAnnotation(editingAnnotation.id, { text } as Partial<Annotation>)
            }
            setEditingTextId(null)
          }}
        />
      )}

      {/* Interaction capture layer */}
      <div
        ref={overlayRef}
        className="absolute inset-0"
        style={{
          pointerEvents: overlayInteractive ? "auto" : "none",
          cursor:
            tool === "select"
              ? "default"
              : tool === "eraser"
                ? "crosshair"
                : tool === "pan"
                  ? "grab"
                  : "crosshair",
        }}
        onPointerDown={handleOverlayPointerDown}
        onPointerMove={handleOverlayPointerMove}
        onPointerUp={handleOverlayPointerUp}
        onPointerLeave={handleOverlayPointerUp}
        onClick={() => {
          if (tool === "select") onSelectAnnotation(null)
        }}
      />

      <div className="pointer-events-none absolute -top-6 left-0 text-xs font-medium text-muted-foreground">
        Página {displayNumber}
      </div>
    </div>
  )
}

function SearchHighlightLayer({
  matches,
  viewport,
}: {
  matches: PageSearchMatch[]
  viewport: PageViewportLike
}) {
  const activeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [matches])

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {matches.map((match) =>
        match.rects.map((rect, i) => {
          const vr = pdfRectToViewportRect(viewport, rect)
          return (
            <div
              key={`${match.key}-${i}`}
              ref={match.active && i === 0 ? activeRef : undefined}
              className={cn(
                "absolute rounded-[1px]",
                match.active ? "bg-search-active" : "bg-search-match",
              )}
              style={{
                left: vr.left,
                top: vr.top,
                width: vr.width,
                height: vr.height,
                opacity: match.active ? 0.6 : 0.42,
                outline: match.active ? "1.5px solid var(--search-active)" : "none",
              }}
            />
          )
        }),
      )}
    </div>
  )
}

function TextEditorOverlay({
  annotation,
  viewport,
  onCommit,
}: {
  annotation: Annotation & { type: "text" }
  viewport: PageViewportLike
  onCommit: (text: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  const scaleFactor = Math.hypot(
    viewport.convertToViewportPoint(1, 0)[0] - viewport.convertToViewportPoint(0, 0)[0],
    viewport.convertToViewportPoint(1, 0)[1] - viewport.convertToViewportPoint(0, 0)[1],
  )
  const p1 = viewport.convertToViewportPoint(annotation.x, annotation.y)
  const p2 = viewport.convertToViewportPoint(annotation.x + annotation.width, annotation.y + annotation.height)
  const left = Math.min(p1[0], p2[0])
  const top = Math.min(p1[1], p2[1])
  const width = Math.abs(p2[0] - p1[0])
  const height = Math.abs(p2[1] - p1[1])

  return (
    <textarea
      ref={ref}
      defaultValue={annotation.text}
      className="absolute resize-none border border-primary bg-background/90 p-1 outline-none"
      style={{
        left,
        top,
        width,
        minHeight: height,
        color: annotation.color,
        fontSize: annotation.fontSize * scaleFactor,
        fontFamily: "var(--font-sans)",
      }}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCommit(annotation.text)
      }}
    />
  )
}
