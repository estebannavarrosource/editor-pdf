"use client"

import { useState } from "react"
import {
  Home,
  X,
  Save,
  Printer,
  Search,
  ChevronUp,
  ChevronDown,
  MousePointer2,
  Hand,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  FileDown,
  PanelLeft,
  Check,
} from "lucide-react"
import type { ToolId } from "@/lib/pdf-types"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

const SWATCHES = ["#1d3fae", "#dc2626", "#059669", "#d97706", "#7c3aed", "#111827"]

const TOOL_LABELS: Record<ToolId, string> = {
  select: "Seleccionar",
  pan: "Mover vista",
  highlight: "Resaltar texto",
  underline: "Subrayar texto",
  strikethrough: "Tachar texto",
  ink: "Dibujo libre",
  rectangle: "Rectángulo",
  ellipse: "Elipse",
  line: "Línea",
  arrow: "Flecha",
  text: "Texto",
  sign: "Firma",
  eraser: "Borrador",
}

interface EditorToolbarProps {
  fileName: string | null
  tool: ToolId
  onToolChange: (tool: ToolId) => void
  color: string
  onColorChange: (color: string) => void
  strokeWidth: number
  onStrokeWidthChange: (width: number) => void
  fillShapes: boolean
  onFillShapesChange: (fill: boolean) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  zoomPercent: number
  onZoomIn: () => void
  onZoomOut: () => void
  onOpenSearch: () => void
  onOpenExport: () => void
  onToggleSidebar: () => void
  onGoHome: () => void
  onQuickSave: () => void
  onPrint: () => void
  currentPage: number
  totalPages: number
  onPrevPage: () => void
  onNextPage: () => void
  onJumpToPageNumber: (page: number) => void
}

export function EditorToolbar({
  fileName,
  tool,
  onToolChange,
  color,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  fillShapes,
  onFillShapesChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onOpenSearch,
  onOpenExport,
  onToggleSidebar,
  onGoHome,
  onQuickSave,
  onPrint,
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  onJumpToPageNumber,
}: EditorToolbarProps) {
  const [pageInput, setPageInput] = useState(String(currentPage))
  const showColorAndWidth = tool !== "select" && tool !== "pan" && tool !== "eraser"
  const showFill = ["rectangle", "ellipse"].includes(tool)
  const showContextualBar = showColorAndWidth

  return (
    <header className="flex shrink-0 flex-col border-b border-border bg-card">
      {/* Row 1: document tabs */}
      <div className="flex h-10 items-center gap-0.5 border-b border-border px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/dga-logo.png"
          alt="Dirección General de Aguas"
          className="mr-1.5 h-7 w-auto rounded-sm bg-white p-0.5 ring-1 ring-border"
        />
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-1.5 rounded-t-md border border-transparent px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Home className="size-3.5" />
          Inicio
        </button>
        <div className="flex items-center gap-2 rounded-t-md border border-border border-b-transparent bg-background px-3 py-1.5 text-sm font-medium text-foreground">
          <span className="max-w-52 truncate">{fileName ?? "Documento"}</span>
          <button
            type="button"
            onClick={onGoHome}
            aria-label="Cerrar documento"
            className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Row 2: page-level controls */}
      <div className="flex h-12 items-center gap-1 px-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Mostrar/ocultar panel">
                <PanelLeft />
              </Button>
            }
          />
          <TooltipContent>Panel de herramientas</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-7" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onQuickSave} aria-label="Guardar">
                <Save />
              </Button>
            }
          />
          <TooltipContent>Guardar (descarga una copia en PDF)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onPrint} aria-label="Imprimir">
                <Printer />
              </Button>
            }
          />
          <TooltipContent>Imprimir</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onOpenSearch} aria-label="Buscar en el documento">
                <Search />
              </Button>
            }
          />
          <TooltipContent>Buscar (Ctrl+F)</TooltipContent>
        </Tooltip>

        <div className="mx-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" onClick={onPrevPage} aria-label="Página anterior">
                  <ChevronUp />
                </Button>
              }
            />
            <TooltipContent>Página anterior</TooltipContent>
          </Tooltip>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const n = Number.parseInt(pageInput, 10)
              if (Number.isFinite(n)) onJumpToPageNumber(n)
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onFocus={() => setPageInput(String(currentPage))}
              onBlur={() => setPageInput(String(currentPage))}
              inputMode="numeric"
              aria-label="Número de página"
              className="h-7 w-10 rounded-sm border border-border bg-background text-center text-xs tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span>/ {totalPages}</span>
          </form>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" onClick={onNextPage} aria-label="Página siguiente">
                  <ChevronDown />
                </Button>
              }
            />
            <TooltipContent>Página siguiente</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-7" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={tool === "select" ? "default" : "ghost"}
                size="icon"
                onClick={() => onToolChange("select")}
                aria-label="Seleccionar"
                aria-pressed={tool === "select"}
              >
                <MousePointer2 />
              </Button>
            }
          />
          <TooltipContent>Seleccionar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={tool === "pan" ? "default" : "ghost"}
                size="icon"
                onClick={() => onToolChange("pan")}
                aria-label="Mover vista"
                aria-pressed={tool === "pan"}
              >
                <Hand />
              </Button>
            }
          />
          <TooltipContent>Mover vista</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-7" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} aria-label="Deshacer">
                <Undo2 />
              </Button>
            }
          />
          <TooltipContent>Deshacer</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} aria-label="Rehacer">
                <Redo2 />
              </Button>
            }
          />
          <TooltipContent>Rehacer</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-7" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onZoomOut} aria-label="Reducir zoom">
                <ZoomOut />
              </Button>
            }
          />
          <TooltipContent>Alejar</TooltipContent>
        </Tooltip>
        <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{zoomPercent}%</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onZoomIn} aria-label="Aumentar zoom">
                <ZoomIn />
              </Button>
            }
          />
          <TooltipContent>Acercar</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-7" />

        <Button onClick={onOpenExport} size="sm">
          <FileDown data-icon="inline-start" />
          Exportar
        </Button>
      </div>

      {/* Row 3: contextual annotation bar, shown only while a drawing/annotation tool is active */}
      {showContextualBar && (
        <div className="flex h-11 items-center gap-3 border-t border-border bg-muted/40 px-3">
          <span className="text-xs font-medium text-foreground">{TOOL_LABELS[tool]}</span>
          <Separator orientation="vertical" className="h-6" />

          <Popover>
            <PopoverTrigger
              render={
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" aria-label="Color">
                  <span className="size-4 rounded-full border border-border" style={{ backgroundColor: color }} />
                  <span className="text-xs text-muted-foreground">Color</span>
                </Button>
              }
            />
            <PopoverContent className="w-48">
              <div className="grid grid-cols-6 gap-2">
                {SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => onColorChange(swatch)}
                    aria-label={`Color ${swatch}`}
                    className={cn(
                      "size-6 rounded-full border-2 transition-transform hover:scale-110",
                      color === swatch ? "border-foreground" : "border-transparent",
                    )}
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {tool !== "highlight" && tool !== "underline" && tool !== "strikethrough" && (
            <div className="flex w-40 items-center gap-2">
              <span className="text-xs text-muted-foreground">Grosor</span>
              <Slider
                value={strokeWidth}
                min={1}
                max={12}
                step={1}
                onValueChange={(v) => onStrokeWidthChange(v as number)}
              />
            </div>
          )}

          {showFill && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={fillShapes}
                onChange={(e) => onFillShapesChange(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              Rellenar forma
            </label>
          )}

          <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5" onClick={() => onToolChange("select")}>
            <Check className="size-3.5" />
            Listo
          </Button>
        </div>
      )}
    </header>
  )
}
