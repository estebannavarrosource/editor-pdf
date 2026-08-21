"use client"

import { Trash2 } from "lucide-react"
import type { Annotation } from "@/lib/pdf-types"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"

const SWATCHES = ["#111827", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#db2777"]

interface AnnotationPropertiesProps {
  annotation: Annotation
  onUpdate: (patch: Partial<Annotation>) => void
  onRemove: () => void
  onClose: () => void
}

const TYPE_LABELS: Record<Annotation["type"], string> = {
  highlight: "Resaltado",
  underline: "Subrayado",
  strikethrough: "Tachado",
  ink: "Dibujo",
  rectangle: "Rectángulo",
  ellipse: "Elipse",
  line: "Línea",
  arrow: "Flecha",
  text: "Texto",
  sign: "Firma",
}

export function AnnotationProperties({ annotation, onUpdate, onRemove, onClose }: AnnotationPropertiesProps) {
  const hasColor = annotation.type !== "sign"
  const hasStroke =
    annotation.type === "ink" ||
    annotation.type === "rectangle" ||
    annotation.type === "ellipse" ||
    annotation.type === "line" ||
    annotation.type === "arrow"
  const hasFill = annotation.type === "rectangle" || annotation.type === "ellipse"
  const isText = annotation.type === "text"
  const isHighlight = annotation.type === "highlight"

  return (
    <div className="absolute right-4 top-4 z-30 w-64 rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-card-foreground">{TYPE_LABELS[annotation.type]}</span>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Cerrar panel">
          <span aria-hidden>×</span>
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {hasColor && (
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onUpdate({ color: c } as Partial<Annotation>)}
                  aria-label={`Color ${c}`}
                  className="size-6 rounded-full border border-border ring-offset-2 ring-offset-card transition-[box-shadow] data-[active=true]:ring-2 data-[active=true]:ring-primary"
                  data-active={annotation.color?.toLowerCase() === c}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        )}

        {isHighlight && "opacity" in annotation && (
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Opacidad ({Math.round(annotation.opacity * 100)}%)</Label>
            <Slider
              min={0.1}
              max={1}
              step={0.05}
              value={[annotation.opacity]}
              onValueChange={(v) => onUpdate({ opacity: Array.isArray(v) ? v[0] : v } as Partial<Annotation>)}
            />
          </div>
        )}

        {hasStroke && "strokeWidth" in annotation && (
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Grosor ({annotation.strokeWidth}px)</Label>
            <Slider
              min={1}
              max={20}
              step={1}
              value={[annotation.strokeWidth]}
              onValueChange={(v) => onUpdate({ strokeWidth: Array.isArray(v) ? v[0] : v } as Partial<Annotation>)}
            />
          </div>
        )}

        {isText && "fontSize" in annotation && (
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Tamaño de fuente ({annotation.fontSize}px)</Label>
            <Slider
              min={8}
              max={72}
              step={1}
              value={[annotation.fontSize]}
              onValueChange={(v) => onUpdate({ fontSize: Array.isArray(v) ? v[0] : v } as Partial<Annotation>)}
            />
          </div>
        )}

        {hasFill && "fill" in annotation && (
          <label className="flex items-center gap-2 text-sm text-card-foreground">
            <input
              type="checkbox"
              checked={!!annotation.fill}
              onChange={(e) => onUpdate({ fill: e.target.checked } as Partial<Annotation>)}
              className="size-4 accent-[var(--primary)]"
            />
            Relleno
          </label>
        )}

        <Button variant="destructive" size="sm" onClick={onRemove} className="mt-1 w-full">
          <Trash2 data-icon="inline-start" />
          Eliminar
        </Button>
      </div>
    </div>
  )
}
