"use client"

import type { Annotation } from "@/lib/pdf-types"
import { pdfRectToViewportRect, toViewportPoint, type PageViewportLike } from "@/lib/pdf-coords"
import { cn } from "@/lib/utils"

interface AnnotationViewProps {
  annotation: Annotation
  viewport: PageViewportLike
  selected: boolean
  interactive: boolean
  onPointerDownBox?: (e: React.PointerEvent, annotation: Annotation) => void
  onClickAny?: (annotation: Annotation) => void
}

export function AnnotationView({
  annotation,
  viewport,
  selected,
  interactive,
  onPointerDownBox,
  onClickAny,
}: AnnotationViewProps) {
  switch (annotation.type) {
    case "highlight":
    case "underline":
    case "strikethrough": {
      return (
        <svg
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: interactive ? "auto" : "none" }}
          onClick={() => onClickAny?.(annotation)}
        >
          {annotation.rects.map((r, i) => {
            const vr = pdfRectToViewportRect(viewport, r)
            if (annotation.type === "highlight") {
              // Selection client rects include line-height padding, so hug the
              // glyphs by insetting ~18% top/bottom for a tighter marker look.
              const inset = vr.height * 0.18
              return (
                <rect
                  key={i}
                  x={vr.left}
                  y={vr.top + inset}
                  width={vr.width}
                  height={Math.max(1, vr.height - inset * 2)}
                  rx={1}
                  fill={annotation.color}
                  opacity={annotation.opacity}
                />
              )
            }
            const strokeY = annotation.type === "underline" ? vr.top + vr.height - 1.5 : vr.top + vr.height / 2
            return (
              <line
                key={i}
                x1={vr.left}
                y1={strokeY}
                x2={vr.left + vr.width}
                y2={strokeY}
                stroke={annotation.color}
                strokeWidth={Math.max(1.5, vr.height * 0.1)}
              />
            )
          })}
        </svg>
      )
    }
    case "ink": {
      return (
        <svg
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: interactive ? "auto" : "none" }}
          onClick={() => onClickAny?.(annotation)}
        >
          {annotation.strokes.map((stroke, i) => {
            const pts = stroke.map((p) => toViewportPoint(viewport, p.x, p.y))
            const d = pts.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={annotation.color}
                strokeWidth={annotation.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          })}
        </svg>
      )
    }
    case "rectangle":
    case "ellipse":
    case "line":
    case "arrow": {
      const vr = pdfRectToViewportRect(viewport, annotation)
      const scaleFactor = Math.hypot(
        viewport.convertToViewportPoint(1, 0)[0] - viewport.convertToViewportPoint(0, 0)[0],
        viewport.convertToViewportPoint(1, 0)[1] - viewport.convertToViewportPoint(0, 0)[1],
      )
      const strokeW = annotation.strokeWidth * scaleFactor
      return (
        <div
          className={cn(
            "absolute",
            selected && "outline outline-2 outline-primary outline-offset-2",
            interactive && "cursor-move",
          )}
          style={{ left: vr.left, top: vr.top, width: vr.width, height: vr.height, pointerEvents: interactive ? "auto" : "none" }}
          onPointerDown={(e) => onPointerDownBox?.(e, annotation)}
        >
          <svg className="h-full w-full overflow-visible">
            {annotation.type === "rectangle" && (
              <rect
                x={strokeW / 2}
                y={strokeW / 2}
                width={Math.max(0, vr.width - strokeW)}
                height={Math.max(0, vr.height - strokeW)}
                fill={annotation.fill ? annotation.color : "none"}
                fillOpacity={0.25}
                stroke={annotation.color}
                strokeWidth={strokeW}
              />
            )}
            {annotation.type === "ellipse" && (
              <ellipse
                cx={vr.width / 2}
                cy={vr.height / 2}
                rx={Math.max(0, vr.width / 2 - strokeW / 2)}
                ry={Math.max(0, vr.height / 2 - strokeW / 2)}
                fill={annotation.fill ? annotation.color : "none"}
                fillOpacity={0.25}
                stroke={annotation.color}
                strokeWidth={strokeW}
              />
            )}
            {(annotation.type === "line" || annotation.type === "arrow") && (
              <g>
                <defs>
                  <marker
                    id={`arrow-${annotation.id}`}
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 Z" fill={annotation.color} />
                  </marker>
                </defs>
                <line
                  x1={0}
                  y1={0}
                  x2={vr.width}
                  y2={vr.height}
                  stroke={annotation.color}
                  strokeWidth={strokeW}
                  markerEnd={annotation.type === "arrow" ? `url(#arrow-${annotation.id})` : undefined}
                />
              </g>
            )}
          </svg>
        </div>
      )
    }
    case "text": {
      const vr = pdfRectToViewportRect(viewport, annotation)
      const scaleFactor = Math.hypot(
        viewport.convertToViewportPoint(1, 0)[0] - viewport.convertToViewportPoint(0, 0)[0],
        viewport.convertToViewportPoint(1, 0)[1] - viewport.convertToViewportPoint(0, 0)[1],
      )
      return (
        <div
          className={cn(
            "absolute whitespace-pre-wrap break-words leading-snug",
            selected && "outline outline-2 outline-primary outline-offset-2",
            interactive && "cursor-move",
          )}
          style={{
            left: vr.left,
            top: vr.top,
            width: vr.width,
            height: vr.height,
            color: annotation.color,
            fontSize: annotation.fontSize * scaleFactor,
            fontFamily: "var(--font-sans)",
            pointerEvents: interactive ? "auto" : "none",
          }}
          onPointerDown={(e) => onPointerDownBox?.(e, annotation)}
        >
          {annotation.text}
        </div>
      )
    }
    case "sign": {
      const vr = pdfRectToViewportRect(viewport, annotation)
      return (
        <div
          className={cn(
            "absolute",
            selected && "outline outline-2 outline-primary outline-offset-2",
            interactive && "cursor-move",
          )}
          style={{ left: vr.left, top: vr.top, width: vr.width, height: vr.height, pointerEvents: interactive ? "auto" : "none" }}
          onPointerDown={(e) => onPointerDownBox?.(e, annotation)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={annotation.dataUrl || "/placeholder.svg"} alt="Firma" className="h-full w-full select-none" draggable={false} />
        </div>
      )
    }
    default:
      return null
  }
}
