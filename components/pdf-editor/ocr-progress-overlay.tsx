"use client"

import { ScanText } from "lucide-react"
import type { OcrProgress } from "@/lib/pdf-ocr"
import { Spinner } from "@/components/ui/spinner"

interface OcrProgressOverlayProps {
  progress: OcrProgress | null
}

/** Human-readable label for tesseract's raw status strings. */
function statusLabel(status: string): string {
  if (status.includes("recognizing")) return "Reconociendo texto"
  if (status.includes("loading") || status.includes("initializ") || status.includes("loaded")) return "Preparando motor"
  return "Procesando"
}

/**
 * Discreet, non-blocking OCR progress card pinned to the bottom-right of the
 * editor. Replaces the old modal so recognition feels applied directly to the
 * document while the user keeps seeing their pages.
 */
export function OcrProgressOverlay({ progress }: OcrProgressOverlayProps) {
  const hasPage = progress !== null && progress.totalPages > 0
  const pagePct = hasPage ? Math.round(((progress.pageNumber - 1 + progress.progress) / progress.totalPages) * 100) : 0

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-72 rounded-lg border border-border bg-card p-4 shadow-lg"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ScanText className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">Reconociendo texto</p>
          <p className="truncate text-xs text-muted-foreground">
            {hasPage
              ? `${statusLabel(progress.status)} · página ${progress.pageNumber} de ${progress.totalPages}`
              : "Preparando motor de OCR…"}
          </p>
        </div>
        <Spinner className="size-4 text-muted-foreground" />
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${hasPage ? Math.max(6, pagePct) : 6}%` }}
        />
      </div>
    </div>
  )
}
