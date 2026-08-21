"use client"

import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { Copy, ScanText, FileSearch } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { PdfjsDocument } from "@/lib/pdfjs"
import type { PageState } from "@/lib/pdf-types"
import { runOcr, type OcrPageResult, type OcrProgress } from "@/lib/pdf-ocr"

interface OcrDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  doc: PdfjsDocument | null
  pages: PageState[]
  currentPageIndex: number
  onApplySearchable: (results: OcrPageResult[]) => Promise<void>
}

type Scope = "current" | "all"

const STATUS_LABELS: Record<string, string> = {
  "loading tesseract core": "Cargando motor OCR",
  "initializing tesseract": "Inicializando",
  "loading language traineddata": "Cargando idiomas",
  "initializing api": "Preparando",
  "recognizing text": "Reconociendo texto",
}

export function OcrDialog({
  open,
  onOpenChange,
  doc,
  pages,
  currentPageIndex,
  onApplySearchable,
}: OcrDialogProps) {
  const [scope, setScope] = useState<Scope>("current")
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [results, setResults] = useState<OcrPageResult[] | null>(null)
  const [applying, setApplying] = useState(false)

  const activePages = useMemo(() => pages.filter((p) => !p.deleted), [pages])

  const combinedText = useMemo(() => {
    if (!results) return ""
    return results
      .map((r) => (results.length > 1 ? `--- Página ${r.pageNumber} ---\n${r.text}` : r.text))
      .join("\n\n")
  }, [results])

  const reset = useCallback(() => {
    setResults(null)
    setProgress(null)
    setRunning(false)
    setApplying(false)
  }, [])

  const handleRun = useCallback(async () => {
    if (!doc) return
    setRunning(true)
    setResults(null)
    setProgress(null)
    try {
      const targetPages =
        scope === "current"
          ? activePages.filter((p) => p.originalIndex === currentPageIndex)
          : activePages
      const scoped = targetPages.length > 0 ? targetPages : activePages
      const res = await runOcr(doc, scoped, setProgress)
      setResults(res)
      const totalWords = res.reduce((acc, r) => acc + r.words.length, 0)
      if (totalWords === 0) {
        toast.warning("No se detectó texto reconocible en las páginas seleccionadas")
      } else {
        toast.success(`OCR completado: ${totalWords} palabras reconocidas`)
      }
    } catch (e) {
      console.error("[v0] OCR failed", e)
      toast.error("No se pudo completar el OCR")
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }, [doc, scope, activePages, currentPageIndex])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(combinedText)
      toast.success("Texto copiado al portapapeles")
    } catch {
      toast.error("No se pudo copiar el texto")
    }
  }, [combinedText])

  const handleApply = useCallback(async () => {
    if (!results) return
    setApplying(true)
    try {
      await onApplySearchable(results)
      onOpenChange(false)
      reset()
    } catch (e) {
      console.error("[v0] apply searchable failed", e)
      toast.error("No se pudo crear el PDF con texto buscable")
    } finally {
      setApplying(false)
    }
  }, [results, onApplySearchable, onOpenChange, reset])

  const progressPercent = progress ? Math.round(progress.progress * 100) : 0
  const statusLabel = progress ? (STATUS_LABELS[progress.status] ?? progress.status) : ""

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanText className="size-5 text-primary" />
            Reconocimiento de texto (OCR)
          </DialogTitle>
          <DialogDescription>
            Extrae texto de páginas escaneadas o basadas en imágenes. El proceso se ejecuta localmente en tu
            navegador (español e inglés).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Alcance</span>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={scope === "current" ? "default" : "outline"}
                onClick={() => setScope("current")}
                disabled={running || applying}
                className={cn("justify-center", scope === "current" && "pointer-events-none")}
              >
                Página actual
              </Button>
              <Button
                type="button"
                variant={scope === "all" ? "default" : "outline"}
                onClick={() => setScope("all")}
                disabled={running || applying}
                className={cn("justify-center", scope === "all" && "pointer-events-none")}
              >
                Todo el documento ({activePages.length})
              </Button>
            </div>
          </div>

          {running && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Spinner className="size-4" />
                <span>
                  {statusLabel || "Procesando"}
                  {progress ? ` · Página ${progress.pageNumber}/${progress.totalPages}` : ""}
                </span>
              </div>
              <Progress value={progressPercent} />
            </div>
          )}

          {results && !running && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Texto reconocido</span>
                <Button variant="ghost" size="sm" onClick={handleCopy} disabled={!combinedText}>
                  <Copy data-icon="inline-start" />
                  Copiar
                </Button>
              </div>
              <textarea
                readOnly
                value={combinedText || "No se detectó texto."}
                className="h-40 w-full resize-none rounded-lg border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={handleRun} disabled={running || applying || !doc}>
            {running ? <Spinner data-icon="inline-start" /> : <ScanText data-icon="inline-start" />}
            {results ? "Volver a analizar" : "Iniciar OCR"}
          </Button>
          <Button onClick={handleApply} disabled={!results || running || applying}>
            {applying ? <Spinner data-icon="inline-start" /> : <FileSearch data-icon="inline-start" />}
            Crear PDF buscable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
