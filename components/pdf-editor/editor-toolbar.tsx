"use client"

import {
  MousePointer2,
  Hand,
  Highlighter,
  Underline,
  Strikethrough,
  Pencil,
  Square,
  Circle,
  Minus,
  ArrowUpRight,
  Type,
  PenTool,
  Eraser,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  FileDown,
  Upload,
  FilePlus2,
  FilePlus,
  ScanText,
  Search,
  PanelLeft,
} from "lucide-react"
import type { ToolId } from "@/lib/pdf-types"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

const TOOL_GROUPS: { id: ToolId; icon: typeof MousePointer2; label: string }[][] = [
  [
    { id: "select", icon: MousePointer2, label: "Seleccionar" },
    { id: "pan", icon: Hand, label: "Mover vista" },
  ],
  [
    { id: "highlight", icon: Highlighter, label: "Resaltar texto" },
    { id: "underline", icon: Underline, label: "Subrayar texto" },
    { id: "strikethrough", icon: Strikethrough, label: "Tachar texto" },
  ],
  [
    { id: "ink", icon: Pencil, label: "Dibujo libre" },
    { id: "rectangle", icon: Square, label: "Rectángulo" },
    { id: "ellipse", icon: Circle, label: "Elipse" },
    { id: "line", icon: Minus, label: "Línea" },
    { id: "arrow", icon: ArrowUpRight, label: "Flecha" },
    { id: "text", icon: Type, label: "Texto" },
  ],
  [
    { id: "sign", icon: PenTool, label: "Firmar" },
    { id: "eraser", icon: Eraser, label: "Borrar anotación" },
  ],
]

const SWATCHES = ["#1d3fae", "#dc2626", "#059669", "#d97706", "#7c3aed", "#111827"]

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
  onCreateNew: () => void
  onOpenFile: () => void
  onImportAppend: () => void
  onOpenOcr: () => void
  onOpenExport: () => void
  onToggleSidebar: () => void
  onOpenSignature: () => void
  onOpenForm: () => void
  hasFormFields: boolean
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
  onCreateNew,
  onOpenFile,
  onImportAppend,
  onOpenOcr,
  onOpenExport,
  onToggleSidebar,
  onOpenSignature,
  onOpenForm,
  hasFormFields,
}: EditorToolbarProps) {
  const showColorAndWidth = tool !== "select" && tool !== "pan" && tool !== "eraser"
  const showFill = ["rectangle", "ellipse"].includes(tool)

  return (
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Mostrar/ocultar páginas">
              <PanelLeft />
            </Button>
          }
        />
        <TooltipContent>Panel de páginas</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-7" />

      <div className="flex min-w-0 items-center gap-2 pr-2">
        <span className="hidden max-w-40 truncate text-sm font-medium text-foreground sm:inline">
          {fileName ?? "Sin documento"}
        </span>
      </div>

      <Separator orientation="vertical" className="h-7" />

      <div className="flex items-center gap-1 overflow-x-auto">
        {TOOL_GROUPS.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <Separator orientation="vertical" className="mx-1 h-7" />}
            {group.map(({ id, icon: Icon, label }) => (
              <Tooltip key={id}>
                <TooltipTrigger
                  render={
                    <Button
                      variant={tool === id ? "default" : "ghost"}
                      size="icon"
                      onClick={() => (id === "sign" ? onOpenSignature() : onToolChange(id))}
                      aria-label={label}
                      aria-pressed={tool === id}
                    >
                      <Icon />
                    </Button>
                  }
                />
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        ))}
      </div>

      {showColorAndWidth && (
        <>
          <Separator orientation="vertical" className="h-7" />
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Color">
                  <span className="size-4 rounded-full border border-border" style={{ backgroundColor: color }} />
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
              {tool !== "highlight" && tool !== "underline" && tool !== "strikethrough" && (
                <div className="mt-3 flex flex-col gap-1.5">
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
                <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={fillShapes}
                    onChange={(e) => onFillShapesChange(e.target.checked)}
                    className="size-3.5 accent-primary"
                  />
                  Rellenar forma
                </label>
              )}
            </PopoverContent>
          </Popover>
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        {hasFormFields && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="outline" size="sm" onClick={onOpenForm}>
                  Formulario
                </Button>
              }
            />
            <TooltipContent>Rellenar campos del formulario</TooltipContent>
          </Tooltip>
        )}

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

        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onOpenOcr} aria-label="Reconocer texto (OCR)">
                <ScanText />
              </Button>
            }
          />
          <TooltipContent>Reconocer texto (OCR)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onCreateNew} aria-label="Crear documento en blanco">
                <FilePlus />
              </Button>
            }
          />
          <TooltipContent>Nuevo documento en blanco</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onImportAppend} aria-label="Importar y anexar archivos">
                <FilePlus2 />
              </Button>
            }
          />
          <TooltipContent>Importar y anexar (PDF / imágenes)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={onOpenFile} aria-label="Abrir archivo">
                <Upload />
              </Button>
            }
          />
          <TooltipContent>Abrir archivo (reemplazar)</TooltipContent>
        </Tooltip>

        <Button onClick={onOpenExport} size="sm">
          <FileDown data-icon="inline-start" />
          Exportar
        </Button>
      </div>
    </header>
  )
}
