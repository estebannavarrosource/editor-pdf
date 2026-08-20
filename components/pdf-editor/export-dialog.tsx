"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { FileText, Image as ImageIcon, FileType2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type ExportFormat = "pdf" | "png" | "jpeg" | "docx"

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onExport: (format: ExportFormat) => Promise<void>
}

const OPTIONS: { id: ExportFormat; title: string; description: string; icon: typeof FileText }[] = [
  {
    id: "pdf",
    title: "PDF anotado",
    description: "Documento final con todas las marcas y cambios de página aplicados.",
    icon: FileText,
  },
  {
    id: "png",
    title: "Imágenes PNG",
    description: "Una imagen por página, agrupadas en un ZIP si hay varias.",
    icon: ImageIcon,
  },
  {
    id: "jpeg",
    title: "Imágenes JPG",
    description: "Igual que PNG, comprimido para archivos más ligeros.",
    icon: ImageIcon,
  },
  {
    id: "docx",
    title: "Documento Word (.docx)",
    description: "Extrae el texto del PDF a un documento editable. El diseño no se conserva.",
    icon: FileType2,
  },
]

export function ExportDialog({ open, onOpenChange, onExport }: ExportDialogProps) {
  const [selected, setSelected] = useState<ExportFormat>("pdf")
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      await onExport(selected)
      onOpenChange(false)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !exporting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar documento</DialogTitle>
          <DialogDescription>Elige el formato de salida para tu documento.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {OPTIONS.map(({ id, title, description, icon: Icon }) => (
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
              </span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting && <Spinner data-icon="inline-start" />}
            {exporting ? "Exportando..." : "Exportar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
