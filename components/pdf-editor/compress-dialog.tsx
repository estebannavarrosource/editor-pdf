"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Gem, Scale, Minimize2, type LucideIcon } from "lucide-react"
import type { CompressionLevel } from "@/lib/pdf-compress"
import { cn } from "@/lib/utils"

interface CompressDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompress: (level: CompressionLevel) => Promise<void>
}

const OPTIONS: { id: CompressionLevel; title: string; description: string; note: string; icon: LucideIcon }[] = [
  {
    id: "low",
    title: "Compresión baja",
    description: "Mantiene la máxima calidad visual. Elimina metadatos ocultos y datos repetitivos sin alterar la resolución de las imágenes.",
    note: "Reducción de peso ligera",
    icon: Gem,
  },
  {
    id: "medium",
    title: "Compresión recomendada",
    description: "Equilibrio entre peso y calidad. Baja ligeramente la resolución de las imágenes y optimiza la estructura interna.",
    note: "Ideal para enviar por correo, sin perder legibilidad",
    icon: Scale,
  },
  {
    id: "high",
    title: "Compresión alta",
    description: "Máxima reducción de tamaño. Disminuye drásticamente la resolución de las imágenes (aprox. 72 PPI) y las convierte a escala de grises.",
    note: "Puede implicar una leve pérdida de calidad",
    icon: Minimize2,
  },
]

export function CompressDialog({ open, onOpenChange, onCompress }: CompressDialogProps) {
  const [selected, setSelected] = useState<CompressionLevel>("medium")
  const [compressing, setCompressing] = useState(false)

  const handleCompress = async () => {
    setCompressing(true)
    try {
      await onCompress(selected)
      onOpenChange(false)
    } finally {
      setCompressing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !compressing && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reducir tamaño del PDF</DialogTitle>
          <DialogDescription>Elige el nivel de compresión según lo que necesites priorizar.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {OPTIONS.map(({ id, title, description, note, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              className={cn(
                "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
                selected === id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
              )}
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{title}</span>
                <span className="text-xs text-muted-foreground">{description}</span>
                <span className="text-xs font-medium text-primary">{note}</span>
              </span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={compressing}>
            Cancelar
          </Button>
          <Button onClick={handleCompress} disabled={compressing}>
            {compressing && <Spinner data-icon="inline-start" />}
            {compressing ? "Comprimiendo..." : "Comprimir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
