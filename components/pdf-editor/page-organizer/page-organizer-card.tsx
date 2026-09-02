"use client"

import type { DragEvent, MouseEvent } from "react"
import { Copy, FilePlus, MoreVertical, Replace, RotateCcw, RotateCw, Trash2, Undo2 } from "lucide-react"
import type { PdfjsDocument } from "@/lib/pdfjs"
import type { PageState } from "@/lib/pdf-types"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { PageThumbnail } from "../page-thumbnail"

interface PageOrganizerCardProps {
  doc: PdfjsDocument
  pageState: PageState
  index: number
  selected: boolean
  isDropTarget: boolean
  onSelect: (index: number, e: MouseEvent) => void
  onRotate: (delta: 90 | -90) => void
  onToggleDelete: () => void
  onDuplicate: () => void
  onInsertBlankAfter: () => void
  onReplace: () => void
  onExtract: () => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragEnd: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export function PageOrganizerCard({
  doc,
  pageState,
  index,
  selected,
  isDropTarget,
  onSelect,
  onRotate,
  onToggleDelete,
  onDuplicate,
  onInsertBlankAfter,
  onReplace,
  onExtract,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: PageOrganizerCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={cn(
        "group relative rounded-lg border-2 border-transparent p-1 transition-colors",
        isDropTarget && "border-primary bg-primary/5",
      )}
    >
      <button
        type="button"
        onClick={(e) => onSelect(index, e)}
        className={cn(
          "relative block w-full overflow-hidden rounded-md border bg-page shadow-sm transition-all",
          selected ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50",
          pageState.deleted && "opacity-35",
        )}
      >
        <PageThumbnail doc={doc} pageState={pageState} targetWidth={220} />
      </button>

      <div className="mt-1.5 flex items-center justify-center">
        <span className={cn("text-xs font-medium", selected ? "text-primary" : "text-muted-foreground")}>
          {index + 1}
        </span>
      </div>

      <div
        className={cn(
          "absolute top-2 right-2 flex flex-col gap-1 rounded-md bg-popover/95 p-1 shadow-md ring-1 ring-foreground/10 opacity-0 transition-opacity group-hover:opacity-100",
          selected && "opacity-100",
        )}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => onRotate(-90)}
                aria-label="Rotar a la izquierda"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent>Rotar izquierda</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => onRotate(90)}
                aria-label="Rotar a la derecha"
              >
                <RotateCw className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent>Rotar derecha</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={onToggleDelete}
                aria-label={pageState.deleted ? "Restaurar página" : "Eliminar página"}
              >
                {pageState.deleted ? <Undo2 className="size-3.5" /> : <Trash2 className="size-3.5" />}
              </Button>
            }
          />
          <TooltipContent>{pageState.deleted ? "Restaurar" : "Eliminar"}</TooltipContent>
        </Tooltip>
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="icon" className="size-6" aria-label="Más acciones de página">
                <MoreVertical className="size-3.5" />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-52 p-1">
            <button
              type="button"
              onClick={onDuplicate}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <Copy className="size-4" /> Duplicar página
            </button>
            <button
              type="button"
              onClick={onInsertBlankAfter}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <FilePlus className="size-4" /> Insertar en blanco después
            </button>
            <button
              type="button"
              onClick={onReplace}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <Replace className="size-4" /> Reemplazar esta página
            </button>
            <button
              type="button"
              onClick={onExtract}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <FilePlus className="size-4" /> Extraer esta página
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
