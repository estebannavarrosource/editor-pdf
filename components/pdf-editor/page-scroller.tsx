"use client"

import { useCallback, useRef } from "react"
import type { PdfjsDocument } from "@/lib/pdfjs"
import type { Annotation, PageState, ToolId } from "@/lib/pdf-types"
import { PageCanvas, type PageSearchMatch } from "./page-canvas"

interface PageScrollerProps {
  doc: PdfjsDocument
  pages: PageState[]
  scale: number
  tool: ToolId
  color: string
  strokeWidth: number
  fontSize: number
  fillShapes: boolean
  annotationsByPage: Record<number, Annotation[]>
  searchMatchesByPage: Map<number, PageSearchMatch[]>
  selectedId: string | null
  activeSignature: string | null
  onSelectAnnotation: (id: string | null) => void
  onAddAnnotation: (originalIndex: number, annotation: Annotation) => void
  onUpdateAnnotation: (originalIndex: number, id: string, patch: Partial<Annotation>) => void
  onRemoveAnnotation: (originalIndex: number, id: string) => void
  onRequestSignaturePlacement: () => void
  registerScrollContainer: (el: HTMLDivElement | null) => void
  registerPageContainer: (originalIndex: number, el: HTMLDivElement | null) => void
}

export function PageScroller({
  doc,
  pages,
  scale,
  tool,
  color,
  strokeWidth,
  fontSize,
  fillShapes,
  annotationsByPage,
  searchMatchesByPage,
  selectedId,
  activeSignature,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
  onRequestSignaturePlacement,
  registerScrollContainer,
  registerPageContainer,
}: PageScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const setScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el
      registerScrollContainer(el)
    },
    [registerScrollContainer],
  )

  return (
    <div ref={setScrollRef} className="flex-1 overflow-auto bg-canvas">
      <div className="mx-auto flex flex-col items-center gap-10 px-6 py-10">
        {pages
          .filter((p) => !p.deleted)
          .map((pageState, displayIndex) => {
          const annotations = annotationsByPage[pageState.originalIndex] ?? []
          const searchMatches = searchMatchesByPage.get(pageState.originalIndex) ?? []
          return (
            <PageCanvas
              key={pageState.originalIndex}
              doc={doc}
              pageState={pageState}
              displayNumber={displayIndex + 1}
              scale={scale}
              tool={tool}
              color={color}
              strokeWidth={strokeWidth}
              fontSize={fontSize}
              fillShapes={fillShapes}
              annotations={annotations}
              searchMatches={searchMatches}
              selectedId={selectedId}
              activeSignature={activeSignature}
              onSelectAnnotation={onSelectAnnotation}
              onAddAnnotation={(ann) => onAddAnnotation(pageState.originalIndex, ann)}
              onUpdateAnnotation={(id, patch) => onUpdateAnnotation(pageState.originalIndex, id, patch)}
              onRemoveAnnotation={(id) => onRemoveAnnotation(pageState.originalIndex, id)}
              onRequestSignaturePlacement={onRequestSignaturePlacement}
              registerContainer={registerPageContainer}
            />
          )
          })}
      </div>
    </div>
  )
}
