"use client"

import { type DragEvent, type MouseEvent, useCallback, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  Copy,
  Download,
  FilePlus,
  MoreHorizontal,
  Redo2,
  Replace,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
  Undo2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import type { PdfjsDocument } from "@/lib/pdfjs"
import { ACCEPTED_IMPORT_TYPES } from "@/lib/pdf-import"
import type { PageState } from "@/lib/pdf-types"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PageOrganizerCard } from "./page-organizer-card"

interface PageOrganizerViewProps {
  doc: PdfjsDocument
  pages: PageState[]
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClose: () => void
  onRotate: (indices: number[], delta: 90 | -90) => void
  onDelete: (indices: number[]) => void
  onReorderBlock: (fromIndices: number[], toIndex: number) => void
  onDuplicate: (indices: number[]) => void
  onInsertFiles: (files: File[], afterIndex: number | null) => void
  onInsertBlank: (afterIndex: number | null) => void
  onReplace: (index: number, files: File[]) => void
  onExtract: (indices: number[]) => void
  onSplit: (splitAtIndices: number[]) => void
}

/** Whether a page renders wider than tall, accounting for its current rotation. */
function isLandscape(page: PageState): boolean {
  const swapped = Math.abs(page.rotation % 180) === 90
  const width = swapped ? page.height : page.width
  const height = swapped ? page.width : page.height
  return width > height
}

export function PageOrganizerView({
  doc,
  pages,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClose,
  onRotate,
  onDelete,
  onReorderBlock,
  onDuplicate,
  onInsertFiles,
  onInsertBlank,
  onReplace,
  onExtract,
  onSplit,
}: PageOrganizerViewProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [dragIndices, setDragIndices] = useState<number[] | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const insertInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  // Position/index a pending Insert or Replace action targets, captured at
  // click time so we still have it once the (async) file picker resolves.
  const pendingTargetRef = useRef<number | null>(null)

  const selectedList = useMemo(() => Array.from(selected).sort((a, b) => a - b), [selected])
  const activeCount = pages.filter((p) => !p.deleted).length

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setAnchor(null)
  }, [])

  const handleSelect = useCallback(
    (index: number, e: MouseEvent) => {
      const isRange = e.shiftKey && anchor !== null
      const isToggle = e.metaKey || e.ctrlKey

      if (isRange) {
        const [from, to] = anchor! < index ? [anchor!, index] : [index, anchor!]
        const range = new Set<number>()
        for (let i = from; i <= to; i++) range.add(i)
        setSelected(range)
        return
      }

      if (isToggle) {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(index)) next.delete(index)
          else next.add(index)
          return next
        })
        setAnchor(index)
        return
      }

      setSelected(new Set([index]))
      setAnchor(index)
    },
    [anchor],
  )

  const handleDragStart = useCallback(
    (index: number) => (e: DragEvent) => {
      e.dataTransfer.effectAllowed = "move"
      const block = selected.has(index) ? selectedList : [index]
      setDragIndices(block)
    },
    [selected, selectedList],
  )

  const handleDragOver = useCallback(
    (index: number) => (e: DragEvent) => {
      e.preventDefault()
      setOverIndex(index)
    },
    [],
  )

  const handleDragEnd = useCallback(() => {
    setDragIndices(null)
    setOverIndex(null)
  }, [])

  const handleDrop = useCallback(
    (index: number) => (e: DragEvent) => {
      e.preventDefault()
      if (dragIndices && !dragIndices.includes(index)) {
        onReorderBlock(dragIndices, index)
        clearSelection()
      }
      setDragIndices(null)
      setOverIndex(null)
    },
    [dragIndices, onReorderBlock, clearSelection],
  )

  const requireSelection = useCallback(() => {
    if (selectedList.length === 0) {
      toast.info("Selecciona al menos una página primero")
      return false
    }
    return true
  }, [selectedList])

  const handleBulkRotate = useCallback(
    (delta: 90 | -90) => {
      if (!requireSelection()) return
      onRotate(selectedList, delta)
    },
    [requireSelection, selectedList, onRotate],
  )

  const handleBulkDelete = useCallback(() => {
    if (!requireSelection()) return
    onDelete(selectedList)
    clearSelection()
  }, [requireSelection, selectedList, onDelete, clearSelection])

  const handleBulkDuplicate = useCallback(() => {
    if (!requireSelection()) return
    onDuplicate(selectedList)
    clearSelection()
  }, [requireSelection, selectedList, onDuplicate, clearSelection])

  const handleExtractClick = useCallback(() => {
    if (!requireSelection()) return
    onExtract(selectedList)
  }, [requireSelection, selectedList, onExtract])

  const handleSplitClick = useCallback(() => {
    if (!requireSelection()) return
    if (selectedList.includes(0) && selectedList.length === 1) {
      toast.info("Selecciona la(s) página(s) donde debe comenzar cada nueva parte (distinta a la primera)")
      return
    }
    onSplit(selectedList)
    clearSelection()
  }, [requireSelection, selectedList, onSplit, clearSelection])

  /** Quick-select helper backing the count dropdown's "Páginas pares/impares/…" options. */
  const selectByFilter = useCallback(
    (filter: "even" | "odd" | "landscape" | "portrait" | "all") => {
      const next = new Set<number>()
      pages.forEach((page, index) => {
        if (page.deleted) return
        const pageNumber = index + 1
        const matches =
          filter === "all" ||
          (filter === "even" && pageNumber % 2 === 0) ||
          (filter === "odd" && pageNumber % 2 !== 0) ||
          (filter === "landscape" && isLandscape(page)) ||
          (filter === "portrait" && !isLandscape(page))
        if (matches) next.add(index)
      })
      if (next.size === 0) {
        toast.info("No hay páginas que coincidan con ese filtro")
        return
      }
      setSelected(next)
      setAnchor(null)
    },
    [pages],
  )

  const openInsertPicker = useCallback(() => {
    pendingTargetRef.current = selectedList.length > 0 ? selectedList[selectedList.length - 1] : null
    insertInputRef.current?.click()
  }, [selectedList])

  const openReplacePicker = useCallback(() => {
    if (selectedList.length !== 1) {
      toast.info("Selecciona exactamente una página para reemplazar")
      return
    }
    pendingTargetRef.current = selectedList[0]
    replaceInputRef.current?.click()
  }, [selectedList])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <input
        ref={insertInputRef}
        type="file"
        accept={ACCEPTED_IMPORT_TYPES}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length > 0) onInsertFiles(files, pendingTargetRef.current)
          e.target.value = ""
          clearSelection()
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPTED_IMPORT_TYPES}
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length > 0 && pendingTargetRef.current !== null) {
            onReplace(pendingTargetRef.current, files)
          }
          e.target.value = ""
          clearSelection()
        }}
      />

      <header className="flex items-center gap-1 border-b border-border px-4 py-2.5">
        <h1 className="mr-3 text-sm font-semibold text-foreground">Organizar páginas</h1>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="sm" className="mr-4 gap-1.5 bg-muted px-2 text-xs text-muted-foreground">
                {selectedList.length > 0 ? `${selectedList.length} seleccionada(s)` : `${activeCount} página(s)`}
                <ChevronDown className="size-3.5" />
              </Button>
            }
          />
          <PopoverContent align="start" className="w-44 p-1">
            <button
              type="button"
              onClick={() => selectByFilter("even")}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              Páginas pares
            </button>
            <button
              type="button"
              onClick={() => selectByFilter("odd")}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              Páginas impares
            </button>
            <button
              type="button"
              onClick={() => selectByFilter("landscape")}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              Páginas horizontales
            </button>
            <button
              type="button"
              onClick={() => selectByFilter("portrait")}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              Páginas verticales
            </button>
            <button
              type="button"
              onClick={() => selectByFilter("all")}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              Todas las páginas
            </button>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} aria-label="Deshacer">
                <Undo2 className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Deshacer</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} aria-label="Rehacer">
                <Redo2 className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Rehacer</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBulkDelete}
                aria-label="Eliminar páginas seleccionadas"
              >
                <Trash2 className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Eliminar</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

        <Button variant="ghost" size="sm" onClick={handleExtractClick} className="gap-1.5">
          <Download className="size-4" /> Extraer
        </Button>
        <Button variant="ghost" size="sm" onClick={openInsertPicker} className="gap-1.5">
          <FilePlus className="size-4" /> Insertar
        </Button>
        <Button variant="ghost" size="sm" onClick={openReplacePicker} className="gap-1.5">
          <Replace className="size-4" /> Reemplazar
        </Button>
        <Button variant="ghost" size="sm" onClick={handleSplitClick} className="gap-1.5">
          <Scissors className="size-4" /> Dividir
        </Button>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-1.5">
                <MoreHorizontal className="size-4" /> Más
              </Button>
            }
          />
          <PopoverContent align="start" className="w-56 p-1">
            <button
              type="button"
              onClick={handleBulkDuplicate}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <Copy className="size-4" /> Duplicar seleccionadas
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertBlank(selectedList.length > 0 ? selectedList[selectedList.length - 1] : null)
                clearSelection()
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <FilePlus className="size-4" /> Insertar página en blanco
            </button>
            <button
              type="button"
              onClick={() => handleBulkRotate(-90)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <RotateCcw className="size-4" /> Girar a la izquierda
            </button>
            <button
              type="button"
              onClick={() => handleBulkRotate(90)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <RotateCw className="size-4" /> Girar a la derecha
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set(pages.map((_, i) => i)))}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              Seleccionar todo
            </button>
            {selectedList.length > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
              >
                Deseleccionar todo
              </button>
            )}
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar organizador de páginas">
          <X className="size-4" />
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div
          className="grid gap-6 p-6"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) clearSelection()
          }}
        >
          {pages.map((page, index) => (
            <PageOrganizerCard
              key={page.originalIndex}
              doc={doc}
              pageState={page}
              index={index}
              selected={selected.has(index)}
              isDropTarget={overIndex === index && dragIndices !== null && !dragIndices.includes(index)}
              onSelect={handleSelect}
              onRotate={(delta) => onRotate([index], delta)}
              onToggleDelete={() => onDelete([index])}
              onDuplicate={() => onDuplicate([index])}
              onInsertBlankAfter={() => onInsertBlank(index)}
              onReplace={() => {
                pendingTargetRef.current = index
                replaceInputRef.current?.click()
              }}
              onExtract={() => onExtract([index])}
              onDragStart={handleDragStart(index)}
              onDragOver={handleDragOver(index)}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop(index)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
