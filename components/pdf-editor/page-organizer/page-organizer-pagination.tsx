"use client"

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PageOrganizerPaginationProps {
  currentPage: number
  totalPages: number
  pageSize: number
  totalItems: number
  /** Called while dragging over a control so pages can be moved across blocks. */
  isDragging: boolean
  onChange: (page: number) => void
}

/** Builds a compact list like [1, "…", 4, 5, 6, "…", 20] around the current page. */
function buildPageList(current: number, total: number): (number | "ellipsis-start" | "ellipsis-end")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | "ellipsis-start" | "ellipsis-end")[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  if (start > 2) pages.push("ellipsis-start")
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 1) pages.push("ellipsis-end")
  pages.push(total)
  return pages
}

export function PageOrganizerPagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  isDragging,
  onChange,
}: PageOrganizerPaginationProps) {
  if (totalPages <= 1) return null

  const from = (currentPage - 1) * pageSize + 1
  const to = Math.min(currentPage * pageSize, totalItems)
  const pageList = buildPageList(currentPage, totalPages)

  // While dragging pages, hovering a control jumps to that block so pages can be moved across blocks.
  const dragHover = (page: number) => () => {
    if (isDragging && page !== currentPage && page >= 1 && page <= totalPages) onChange(page)
  }

  return (
    <nav
      aria-label="Paginación de páginas del documento"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-4 py-2.5"
    >
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Mostrando {from}–{to} de {totalItems}
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onChange(1)}
          onDragEnter={dragHover(1)}
          disabled={currentPage === 1}
          aria-label="Primera página"
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onChange(currentPage - 1)}
          onDragEnter={dragHover(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-4" />
        </Button>

        {pageList.map((item) =>
          typeof item === "number" ? (
            <Button
              key={item}
              variant={item === currentPage ? "default" : "ghost"}
              size="sm"
              className={cn("h-8 min-w-8 px-2 text-xs tabular-nums")}
              onClick={() => onChange(item)}
              onDragEnter={dragHover(item)}
              aria-label={`Ir al bloque ${item}`}
              aria-current={item === currentPage ? "page" : undefined}
            >
              {item}
            </Button>
          ) : (
            <span key={item} aria-hidden="true" className="px-1 text-xs text-muted-foreground">
              …
            </span>
          ),
        )}

        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onChange(currentPage + 1)}
          onDragEnter={dragHover(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Página siguiente"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onChange(totalPages)}
          onDragEnter={dragHover(totalPages)}
          disabled={currentPage === totalPages}
          aria-label="Última página"
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </nav>
  )
}
