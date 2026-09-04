"use client"

import { useMemo, useState } from "react"
import {
  Search,
  FilePlus,
  FolderOpen,
  FilePlus2,
  Layers,
  MousePointer2,
  Hand,
  Type,
  Highlighter,
  Underline,
  Strikethrough,
  Pencil,
  Square,
  Circle,
  Minus,
  ArrowUpRight,
  Eraser,
  MessageSquarePlus,
  PenTool,
  FileSignature,
  FileDown,
  ScanText,
  type LucideIcon,
} from "lucide-react"
import type { ToolId } from "@/lib/pdf-types"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type ToolAction =
  | "createNew"
  | "openFile"
  | "importAppend"
  | "gotoPages"
  | "signature"
  | "form"
  | "export"
  | "ocr"

interface ToolItem {
  id: string
  icon: LucideIcon
  label: string
  tool?: ToolId
  action?: ToolAction
  requiresFormFields?: boolean
}

interface ToolCategory {
  label: string
  accent: string
  items: ToolItem[]
}

const CATEGORIES: ToolCategory[] = [
  {
    label: "Archivo",
    accent: "text-rose-600",
    items: [
      { id: "create", icon: FilePlus, label: "Crear PDF en blanco", action: "createNew" },
      { id: "open", icon: FolderOpen, label: "Abrir archivo", action: "openFile" },
      { id: "append", icon: FilePlus2, label: "Importar y anexar", action: "importAppend" },
    ],
  },
  {
    label: "Organizar",
    accent: "text-blue-600",
    items: [{ id: "pages", icon: Layers, label: "Organizar páginas", action: "gotoPages" }],
  },
  {
    label: "Editar y anotar",
    accent: "text-fuchsia-600",
    items: [
      { id: "select", icon: MousePointer2, label: "Seleccionar", tool: "select" },
      { id: "pan", icon: Hand, label: "Mover vista", tool: "pan" },
      { id: "text", icon: Type, label: "Añadir texto", tool: "text" },
      { id: "highlight", icon: Highlighter, label: "Resaltar", tool: "highlight" },
      { id: "underline", icon: Underline, label: "Subrayar", tool: "underline" },
      { id: "strikethrough", icon: Strikethrough, label: "Tachar", tool: "strikethrough" },
      { id: "ink", icon: Pencil, label: "Dibujo libre", tool: "ink" },
      { id: "rectangle", icon: Square, label: "Rectángulo", tool: "rectangle" },
      { id: "ellipse", icon: Circle, label: "Elipse", tool: "ellipse" },
      { id: "line", icon: Minus, label: "Línea", tool: "line" },
      { id: "arrow", icon: ArrowUpRight, label: "Flecha", tool: "arrow" },
      { id: "comment", icon: MessageSquarePlus, label: "Comentario", tool: "comment" },
      { id: "eraser", icon: Eraser, label: "Borrador de anotaciones", tool: "eraser" },
    ],
  },
  {
    label: "Firmar",
    accent: "text-purple-600",
    items: [
      { id: "sign", icon: PenTool, label: "Firmar documento", action: "signature" },
      { id: "form", icon: FileSignature, label: "Rellenar formulario", action: "form", requiresFormFields: true },
    ],
  },
  {
    label: "Exportar",
    accent: "text-teal-600",
    items: [{ id: "export", icon: FileDown, label: "Exportar como...", action: "export" }],
  },
  {
    label: "Reconocimiento",
    accent: "text-emerald-600",
    items: [{ id: "ocr", icon: ScanText, label: "Reconocer texto (OCR)", action: "ocr" }],
  },
]

interface ToolsPanelProps {
  tool: ToolId
  hasFormFields: boolean
  onToolChange: (tool: ToolId) => void
  onCreateNew: () => void
  onOpenFile: () => void
  onImportAppend: () => void
  onOpenSignature: () => void
  onOpenForm: () => void
  onOpenExport: () => void
  onRunOcr: () => void
  onOpenPageOrganizer: () => void
}

export function ToolsPanel({
  tool,
  hasFormFields,
  onToolChange,
  onCreateNew,
  onOpenFile,
  onImportAppend,
  onOpenSignature,
  onOpenForm,
  onOpenExport,
  onRunOcr,
  onOpenPageOrganizer,
}: ToolsPanelProps) {
  const [query, setQuery] = useState("")

  const handleAction = (action: ToolAction) => {
    switch (action) {
      case "createNew":
        onCreateNew()
        break
      case "openFile":
        onOpenFile()
        break
      case "importAppend":
        onImportAppend()
        break
      case "gotoPages":
        onOpenPageOrganizer()
        break
      case "signature":
        onOpenSignature()
        break
      case "form":
        onOpenForm()
        break
      case "export":
        onOpenExport()
        break
      case "ocr":
        onRunOcr()
        break
    }
  }

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CATEGORIES
    return CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => item.label.toLowerCase().includes(q)),
    })).filter((cat) => cat.items.length > 0)
  }, [query])

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-sidebar">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="relative shrink-0 p-2.5">
          <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Búsqueda de herramientas"
            className="h-8 pl-7 text-sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {filteredCategories.map((cat) => (
            <div key={cat.label} className="mb-1">
              <p className="px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {cat.label}
              </p>
              <div className="flex flex-col">
                {cat.items.map((item) => {
                  if (item.requiresFormFields && !hasFormFields) return null
                  const isActive = item.tool !== undefined && item.tool === tool
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => (item.tool ? onToolChange(item.tool) : item.action && handleAction(item.action))}
                      aria-pressed={isActive}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                        isActive ? "bg-primary/10 font-medium text-foreground" : "text-foreground hover:bg-accent",
                      )}
                    >
                      <item.icon className={cn("size-4 shrink-0", cat.accent)} aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {filteredCategories.length === 0 && (
            <p className="px-2.5 pt-6 text-center text-sm text-muted-foreground">Sin resultados</p>
          )}
        </div>
      </div>
    </aside>
  )
}
