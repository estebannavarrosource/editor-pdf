"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { RectangleVertical, RectangleHorizontal } from "lucide-react"
import { PAGE_SIZES, type PageSizeId, type PageOrientation, type NewPdfOptions } from "@/lib/pdf-pages"
import { cn } from "@/lib/utils"

interface NewPdfDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (options: NewPdfOptions) => Promise<void> | void
}

const SIZE_IDS = Object.keys(PAGE_SIZES) as PageSizeId[]

export function NewPdfDialog({ open, onOpenChange, onCreate }: NewPdfDialogProps) {
  const [size, setSize] = useState<PageSizeId>("a4")
  const [orientation, setOrientation] = useState<PageOrientation>("portrait")
  const [pageCount, setPageCount] = useState(1)
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      await onCreate({ size, orientation, pageCount })
      onOpenChange(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !creating && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo documento</DialogTitle>
          <DialogDescription>Crea un PDF en blanco para empezar desde cero.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Tamaño de página</span>
            <div className="grid grid-cols-4 gap-2">
              {SIZE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSize(id)}
                  className={cn(
                    "rounded-md border py-2 text-sm transition-colors",
                    size === id ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {PAGE_SIZES[id].label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Orientación</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "portrait" as const, label: "Vertical", icon: RectangleVertical },
                  { id: "landscape" as const, label: "Horizontal", icon: RectangleHorizontal },
                ]
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOrientation(id)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-md border py-2 text-sm transition-colors",
                    orientation === id ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <label htmlFor="page-count" className="text-sm font-medium text-foreground">
              Número de páginas
            </label>
            <input
              id="page-count"
              type="number"
              min={1}
              max={50}
              value={pageCount}
              onChange={(e) => setPageCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-right text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Spinner data-icon="inline-start" />}
            {creating ? "Creando..." : "Crear documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
