"use client"

import { useCallback, useRef, useState } from "react"
import { FileText, Upload, ImageIcon, FilePlus2 } from "lucide-react"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ACCEPTED_IMPORT_TYPES, isSupportedImportFile } from "@/lib/pdf-import"

interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void
  onCreateNew?: () => void
  error?: string | null
}

export function UploadDropzone({ onFilesSelected, onCreateNew, error }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return
      const valid = Array.from(files).filter(isSupportedImportFile)
      if (valid.length > 0) onFilesSelected(valid)
    },
    [onFilesSelected],
  )

  return (
    <div className="flex flex-1 items-center justify-center bg-canvas p-6">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          "w-full max-w-lg rounded-xl border-2 border-dashed border-border bg-card transition-colors",
          dragging && "border-primary bg-primary/5",
        )}
      >
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>Arrastra tus archivos aquí</EmptyTitle>
            <EmptyDescription>
              Importa uno o varios PDFs e imágenes (PNG, JPG, WEBP) para empezar a ver, anotar y manipular tu
              documento. Las imágenes se convierten en páginas PDF.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => inputRef.current?.click()}>
                <Upload data-icon="inline-start" />
                Seleccionar archivos
              </Button>
              {onCreateNew && (
                <Button variant="outline" onClick={onCreateNew}>
                  <FilePlus2 data-icon="inline-start" />
                  Crear PDF en blanco
                </Button>
              )}
            </div>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ImageIcon className="size-3.5" />
              PDF · PNG · JPG · WEBP
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </EmptyContent>
        </Empty>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMPORT_TYPES}
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </div>
    </div>
  )
}
