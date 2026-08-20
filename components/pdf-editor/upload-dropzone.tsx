"use client"

import { useCallback, useRef, useState } from "react"
import { FileText, Upload } from "lucide-react"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface UploadDropzoneProps {
  onFileSelected: (file: File) => void
  error?: string | null
}

export function UploadDropzone({ onFileSelected, error }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (file && file.type === "application/pdf") {
        onFileSelected(file)
      }
    },
    [onFileSelected],
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
            <EmptyTitle>Arrastra un PDF aquí</EmptyTitle>
            <EmptyDescription>
              O selecciona un archivo desde tu dispositivo para empezar a ver, anotar y manipularlo.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => inputRef.current?.click()}>
              <Upload data-icon="inline-start" />
              Seleccionar archivo PDF
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </EmptyContent>
        </Empty>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  )
}
