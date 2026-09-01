"use client"

import { useEffect, useRef } from "react"
import { ChevronUp, ChevronDown, X, CaseSensitive, WholeWord } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { SearchOptions } from "@/lib/pdf-search"

interface SearchBarProps {
  query: string
  onQueryChange: (value: string) => void
  options: SearchOptions
  onOptionsChange: (options: SearchOptions) => void
  matchCount: number
  activeIndex: number
  searching: boolean
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

export function SearchBar({
  query,
  onQueryChange,
  options,
  onOptionsChange,
  matchCount,
  activeIndex,
  searching,
  onNext,
  onPrev,
  onClose,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const hasQuery = query.trim().length > 0
  const noResults = hasQuery && !searching && matchCount === 0

  return (
    <div
      role="search"
      className="absolute right-4 top-3 z-30 flex items-center gap-1 rounded-lg border border-border bg-card p-1.5 shadow-lg"
    >
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            // Some browsers/input methods report e.key as "Unidentified" for Enter/Escape,
            // so fall back to e.code and the legacy keyCode as well.
            const isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter" || e.keyCode === 13
            const isEscape = e.key === "Escape" || e.code === "Escape" || e.keyCode === 27
            if (isEnter) {
              e.preventDefault()
              if (e.shiftKey) onPrev()
              else onNext()
            } else if (isEscape) {
              e.preventDefault()
              onClose()
            }
          }}
          placeholder="Buscar en el documento"
          aria-label="Buscar en el documento"
          className={cn(
            "h-8 w-56 rounded-md border-0 bg-secondary px-2.5 text-sm text-foreground outline-none ring-1 ring-transparent focus:ring-ring",
            noResults && "ring-destructive/60",
          )}
        />
      </div>

      <div className="flex w-16 shrink-0 items-center justify-center text-xs tabular-nums text-muted-foreground">
        {searching ? (
          <Spinner className="size-3.5" />
        ) : hasQuery ? (
          <span>
            {matchCount > 0 ? `${activeIndex + 1}/${matchCount}` : "0/0"}
          </span>
        ) : null}
      </div>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={options.caseSensitive ? "default" : "ghost"}
              size="icon"
              className="size-8"
              aria-pressed={options.caseSensitive}
              onClick={() => onOptionsChange({ ...options, caseSensitive: !options.caseSensitive })}
              aria-label="Distinguir mayúsculas y minúsculas"
            >
              <CaseSensitive />
            </Button>
          }
        />
        <TooltipContent>Distinguir mayúsculas</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={options.wholeWord ? "default" : "ghost"}
              size="icon"
              className="size-8"
              aria-pressed={options.wholeWord}
              onClick={() => onOptionsChange({ ...options, wholeWord: !options.wholeWord })}
              aria-label="Palabra completa"
            >
              <WholeWord />
            </Button>
          }
        />
        <TooltipContent>Palabra completa</TooltipContent>
      </Tooltip>

      <div className="mx-0.5 h-6 w-px bg-border" />

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={matchCount === 0}
              onClick={onPrev}
              aria-label="Resultado anterior"
            >
              <ChevronUp />
            </Button>
          }
        />
        <TooltipContent>Anterior (Shift+Enter)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={matchCount === 0}
              onClick={onNext}
              aria-label="Resultado siguiente"
            >
              <ChevronDown />
            </Button>
          }
        />
        <TooltipContent>Siguiente (Enter)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Cerrar búsqueda">
              <X />
            </Button>
          }
        />
        <TooltipContent>Cerrar (Esc)</TooltipContent>
      </Tooltip>
    </div>
  )
}
