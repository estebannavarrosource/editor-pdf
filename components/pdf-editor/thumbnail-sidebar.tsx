"use client"

import { useState } from "react"
import { RotateCcw, RotateCw, Trash2, Undo2, GripVertical } from "lucide-react"
import type { PdfjsDocument } from "@/lib/pdfjs"
import type { PageState } from "@/lib/pdf-types"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { PageThumbnail } from "./page-thumbnail"

interface ThumbnailSidebarProps {
  doc: PdfjsDocument
  pages: PageState[]
  onJumpToPage: (originalIndex: number) => void
  onRotate: (originalIndex: number, delta: 90 | -90) => void
  onToggleDelete: (originalIndex: number) => void
  onReorder: (fromIndex: number, toIndex: number) => void
}

export function ThumbnailSidebar({ doc, pages, onJumpToPage, onRotate, onToggleDelete, onReorder }: ThumbnailSidebarProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  return (
    <aside className="flex h-full w-44 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-xs font-semibold tracking-wide text-sidebar-foreground/70 uppercase">Páginas</span>
        <span className="text-xs text-muted-foreground">{pages.filter((p) => !p.deleted).length}</span>
      </div>
      <ScrollArea className="flex-1">
        <ol className="flex flex-col gap-2 px-3 pb-4">
          {pages.map((page, index) => (
            <li
              key={page.originalIndex}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => {
                e.preventDefault()
                setOverIndex(index)
              }}
              onDragEnd={() => {
                setDragIndex(null)
                setOverIndex(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index)
                setDragIndex(null)
                setOverIndex(null)
              }}
              className={cn(
                "group relative rounded-md border border-transparent p-1.5 transition-colors",
                overIndex === index && dragIndex !== null && dragIndex !== index && "border-primary bg-primary/5",
              )}
            >
              <button
                type="button"
                onClick={() => onJumpToPage(page.originalIndex)}
                className={cn(
                  "block w-full overflow-hidden rounded-sm border bg-page transition-opacity",
                  page.deleted ? "opacity-30" : "border-border hover:border-primary/60",
                )}
              >
                <PageThumbnail doc={doc} pageState={page} />
              </button>

              <div className="mt-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <GripVertical className="size-3 cursor-grab opacity-50" aria-hidden="true" />
                  {index + 1}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => onRotate(page.originalIndex, -90)}
                        aria-label="Rotar a la izquierda"
                      >
                        <RotateCcw className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Rotar izquierda</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => onRotate(page.originalIndex, 90)}
                        aria-label="Rotar a la derecha"
                      >
                        <RotateCw className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Rotar derecha</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => onToggleDelete(page.originalIndex)}
                        aria-label={page.deleted ? "Restaurar página" : "Eliminar página"}
                      >
                        {page.deleted ? <Undo2 className="size-3.5" /> : <Trash2 className="size-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{page.deleted ? "Restaurar" : "Eliminar"}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </ScrollArea>
    </aside>
  )
}
