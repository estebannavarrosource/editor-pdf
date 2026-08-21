"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { saveAs } from "file-saver"
import { usePdfDocument } from "@/hooks/use-pdf-document"
import { usePdfEditorStore } from "@/hooks/use-pdf-editor-store"
import type { Annotation, ToolId } from "@/lib/pdf-types"
import { buildExportedPdf } from "@/lib/pdf-engine"
import { exportAsDocx, exportPagesAsImages } from "@/lib/pdf-export"
import { readFormFields, toFormFieldValues, type FormFieldDescriptor } from "@/lib/pdf-form"
import { filesToPdfBytes, appendFilesToPdf, ACCEPTED_IMPORT_TYPES, isSupportedImportFile } from "@/lib/pdf-import"
import { buildSearchablePdf, documentNeedsOcr, type OcrPageResult } from "@/lib/pdf-ocr"
import { UploadDropzone } from "./upload-dropzone"
import { EditorToolbar } from "./editor-toolbar"
import { ThumbnailSidebar } from "./thumbnail-sidebar"
import { PageScroller } from "./page-scroller"
import { SignatureDialog } from "./signature-dialog"
import { FormFillSheet } from "./form-fill-sheet"
import { ExportDialog, type ExportFormat } from "./export-dialog"
import { OcrDialog } from "./ocr-dialog"
import { Spinner } from "@/components/ui/spinner"

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const SCALE_STEP = 0.15

export function PdfEditor() {
  const [fileBytes, setFileBytes] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  const { doc, pages: docPages, loading, error } = usePdfDocument(fileBytes, version)
  const store = usePdfEditorStore()

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [tool, setTool] = useState<ToolId>("select")
  const [color, setColor] = useState("#1d3fae")
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [fontSize] = useState(16)
  const [fillShapes, setFillShapes] = useState(false)
  const [scale, setScale] = useState(1.1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeSignature, setActiveSignature] = useState<string | null>(null)
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [formSheetOpen, setFormSheetOpen] = useState(false)
  const [formFields, setFormFields] = useState<FormFieldDescriptor[]>([])
  const [exporting, setExporting] = useState(false)
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const appendInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const pageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const ocrSuggestedRef = useRef(false)

  useEffect(() => {
    if (docPages.length > 0) {
      store.initDocument(docPages)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docPages])

  useEffect(() => {
    if (!fileBytes) return
    readFormFields(fileBytes.slice(0)).then(setFormFields)
  }, [fileBytes, version])

  useEffect(() => {
    if (error) setLoadError(error)
  }, [error])

  useEffect(() => {
    if (!doc || ocrSuggestedRef.current) return
    let cancelled = false
    documentNeedsOcr(doc).then((needs) => {
      if (cancelled || !needs) return
      ocrSuggestedRef.current = true
      toast.info("Este documento parece escaneado. Usa OCR para reconocer su texto.", {
        action: { label: "Aplicar OCR", onClick: () => setOcrDialogOpen(true) },
        duration: 8000,
      })
    })
    return () => {
      cancelled = true
    }
  }, [doc])

  const handleFilesSelected = useCallback(async (files: File[]) => {
    setLoadError(null)
    const valid = files.filter(isSupportedImportFile)
    if (valid.length === 0) return
    try {
      let buf: ArrayBuffer
      let name: string
      if (valid.length === 1 && valid[0].type === "application/pdf") {
        // Keep the original bytes so AcroForm fields are preserved.
        buf = await valid[0].arrayBuffer()
        name = valid[0].name
      } else {
        const bytes = await filesToPdfBytes(valid)
        buf = toArrayBuffer(bytes)
        if (valid.length === 1) {
          name = valid[0].name.replace(/\.[^.]+$/, "") + ".pdf"
        } else {
          name = "documento-importado.pdf"
        }
      }
      ocrSuggestedRef.current = false
      setFileName(name)
      setFileBytes(buf)
      setVersion((v) => v + 1)
      setSelectedId(null)
      setCurrentPageIndex(0)
      setTool("select")
    } catch (e) {
      console.error("[v0] import failed", e)
      setLoadError("No se pudieron importar los archivos seleccionados.")
    }
  }, [])

  const handleAppendFiles = useCallback(
    async (files: File[]) => {
      if (!fileBytes) return
      const valid = files.filter(isSupportedImportFile)
      if (valid.length === 0) return
      try {
        const bytes = await appendFilesToPdf(fileBytes.slice(0), valid)
        setFileBytes(toArrayBuffer(bytes))
        setVersion((v) => v + 1)
        toast.success(valid.length === 1 ? "Archivo anexado" : `${valid.length} archivos anexados`)
      } catch (e) {
        console.error("[v0] append failed", e)
        toast.error("No se pudieron anexar los archivos")
      }
    },
    [fileBytes],
  )

  const handleApplySearchable = useCallback(
    async (results: OcrPageResult[]) => {
      if (!fileBytes) return
      const bytes = await buildSearchablePdf(fileBytes.slice(0), results)
      setFileBytes(toArrayBuffer(bytes))
      setVersion((v) => v + 1)
      toast.success("PDF con texto buscable creado")
    },
    [fileBytes],
  )

  const computeCurrentPage = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const containerTop = container.getBoundingClientRect().top
    let best: number | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const [idx, el] of pageContainerRefs.current) {
      const rect = el.getBoundingClientRect()
      if (rect.bottom <= containerTop) continue
      const dist = Math.abs(rect.top - containerTop)
      if (dist < bestDist) {
        bestDist = dist
        best = idx
      }
    }
    if (best !== null) setCurrentPageIndex(best)
  }, [])

  const registerScrollContainer = useCallback(
    (el: HTMLDivElement | null) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.removeEventListener("scroll", computeCurrentPage)
      }
      scrollContainerRef.current = el
      if (el) el.addEventListener("scroll", computeCurrentPage, { passive: true })
    },
    [computeCurrentPage],
  )

  const registerPageContainer = useCallback((originalIndex: number, el: HTMLDivElement | null) => {
    if (el) pageContainerRefs.current.set(originalIndex, el)
    else pageContainerRefs.current.delete(originalIndex)
  }, [])

  const jumpToPage = useCallback((originalIndex: number) => {
    const el = pageContainerRefs.current.get(originalIndex)
    el?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const handleAddAnnotation = useCallback(
    (originalIndex: number, annotation: Annotation) => {
      store.addAnnotation(originalIndex, annotation)
      setSelectedId(annotation.id)
    },
    [store],
  )

  const handleUpdateAnnotation = useCallback(
    (originalIndex: number, id: string, patch: Partial<Annotation>) => {
      store.updateAnnotation(originalIndex, id, patch)
    },
    [store],
  )

  const handleRemoveAnnotation = useCallback(
    (originalIndex: number, id: string) => {
      store.removeAnnotation(originalIndex, id)
      setSelectedId((cur) => (cur === id ? null : cur))
    },
    [store],
  )

  const handleUndo = useCallback(() => {
    store.undo()
  }, [store])

  const handleRedo = useCallback(() => {
    store.redo()
  }, [store])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod) return
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handleUndo, handleRedo])

  const handleSignatureConfirm = useCallback((dataUrl: string) => {
    setActiveSignature(dataUrl)
    setTool("sign")
  }, [])

  const zoomIn = useCallback(() => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP)), [])
  const zoomOut = useCallback(() => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP)), [])

  const annotationsByPageMap = useMemo(() => {
    const map = new Map<number, Annotation[]>()
    for (const [key, value] of Object.entries(store.annotations)) {
      map.set(Number(key), value)
    }
    return map
  }, [store.annotations])

  const handleFormFieldChange = useCallback((name: string, updated: FormFieldDescriptor) => {
    setFormFields((prev) => prev.map((f) => (f.name === name ? updated : f)))
  }, [])

  const handleFormApply = useCallback(
    async (flatten: boolean) => {
      if (!fileBytes) return
      try {
        const values = toFormFieldValues(formFields)
        const bytes = await buildExportedPdf({
          originalBytes: fileBytes.slice(0),
          pages: store.pages,
          annotationsByPage: annotationsByPageMap,
          formValues: values,
          flattenForm: flatten,
        })
        setFileBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
        setVersion((v) => v + 1)
        setFormSheetOpen(false)
        toast.success(flatten ? "Formulario aplicado y aplanado" : "Formulario aplicado")
      } catch (e) {
        console.error("[v0] form apply failed", e)
        toast.error("No se pudo aplicar el formulario")
      }
    },
    [fileBytes, formFields, store.pages, annotationsByPageMap],
  )

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!fileBytes || !doc) return
      const baseName = fileName?.replace(/\.pdf$/i, "") || "documento"

      try {
        if (format === "pdf") {
          const bytes = await buildExportedPdf({
            originalBytes: fileBytes.slice(0),
            pages: store.pages,
            annotationsByPage: annotationsByPageMap,
          })
          saveAs(new Blob([bytes], { type: "application/pdf" }), `${baseName}-editado.pdf`)
        } else if (format === "png" || format === "jpeg") {
          const blob = await exportPagesAsImages(doc, store.pages, format)
          const isZip = blob.type === "application/zip" || store.pages.filter((p) => !p.deleted).length > 1
          saveAs(blob, isZip ? `${baseName}-paginas.zip` : `${baseName}.${format === "jpeg" ? "jpg" : "png"}`)
        } else if (format === "docx") {
          const blob = await exportAsDocx(doc, store.pages)
          saveAs(blob, `${baseName}.docx`)
        }
        toast.success("Exportación completada")
      } catch (e) {
        console.error("[v0] export failed", e)
        toast.error("No se pudo completar la exportación")
        throw e
      }
    },
    [fileBytes, doc, fileName, store.pages, annotationsByPageMap],
  )

  if (!fileBytes) {
    return (
      <div className="flex h-dvh flex-col">
        <UploadDropzone onFilesSelected={handleFilesSelected} error={loadError} />
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col">
      <EditorToolbar
        fileName={fileName}
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={setStrokeWidth}
        fillShapes={fillShapes}
        onFillShapesChange={setFillShapes}
        canUndo={store.canUndo}
        canRedo={store.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        zoomPercent={Math.round(scale * 100)}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onOpenFile={() => fileInputRef.current?.click()}
        onImportAppend={() => appendInputRef.current?.click()}
        onOpenOcr={() => setOcrDialogOpen(true)}
        onOpenExport={() => setExportDialogOpen(true)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenSignature={() => setSignatureDialogOpen(true)}
        onOpenForm={() => setFormSheetOpen(true)}
        hasFormFields={formFields.length > 0}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMPORT_TYPES}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length > 0) handleFilesSelected(files)
          e.target.value = ""
        }}
      />

      <input
        ref={appendInputRef}
        type="file"
        accept={ACCEPTED_IMPORT_TYPES}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length > 0) handleAppendFiles(files)
          e.target.value = ""
        }}
      />

      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && doc && (
          <ThumbnailSidebar
            doc={doc}
            pages={store.pages}
            onJumpToPage={jumpToPage}
            onRotate={store.rotatePage}
            onToggleDelete={store.toggleDeletePage}
            onReorder={store.reorderPages}
          />
        )}

        {loading && (
          <div className="flex flex-1 items-center justify-center bg-canvas">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Spinner className="size-6" />
              <span className="text-sm">Cargando documento...</span>
            </div>
          </div>
        )}

        {!loading && doc && (
          <PageScroller
            doc={doc}
            pages={store.pages}
            scale={scale}
            tool={tool}
            color={color}
            strokeWidth={strokeWidth}
            fontSize={fontSize}
            fillShapes={fillShapes}
            annotationsByPage={store.annotations}
            selectedId={selectedId}
            activeSignature={activeSignature}
            onSelectAnnotation={setSelectedId}
            onAddAnnotation={handleAddAnnotation}
            onUpdateAnnotation={handleUpdateAnnotation}
            onRemoveAnnotation={handleRemoveAnnotation}
            onRequestSignaturePlacement={() => setSignatureDialogOpen(true)}
            registerScrollContainer={registerScrollContainer}
            registerPageContainer={registerPageContainer}
          />
        )}
      </div>

      <SignatureDialog
        open={signatureDialogOpen}
        onOpenChange={setSignatureDialogOpen}
        onConfirm={handleSignatureConfirm}
      />

      <FormFillSheet
        open={formSheetOpen}
        onOpenChange={setFormSheetOpen}
        fields={formFields}
        onChange={handleFormFieldChange}
        onApply={handleFormApply}
      />

      <ExportDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen} onExport={handleExport} />

      <OcrDialog
        open={ocrDialogOpen}
        onOpenChange={setOcrDialogOpen}
        doc={doc}
        pages={store.pages}
        currentPageIndex={currentPageIndex}
        onApplySearchable={handleApplySearchable}
      />
    </div>
  )
}
