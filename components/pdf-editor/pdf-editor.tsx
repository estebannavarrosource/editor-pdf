"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { saveAs } from "file-saver"
import { usePdfDocument } from "@/hooks/use-pdf-document"
import { usePdfEditorStore } from "@/hooks/use-pdf-editor-store"
import { usePdfSearch, type DocumentMatch } from "@/hooks/use-pdf-search"
import type { SearchOptions } from "@/lib/pdf-search"
import type { Annotation, PageState, ToolId } from "@/lib/pdf-types"
import { buildExportedPdf } from "@/lib/pdf-engine"
import { exportAsDocx, exportPagesAsImages } from "@/lib/pdf-export"
import { readFormFields, toFormFieldValues, type FormFieldDescriptor } from "@/lib/pdf-form"
import { filesToPdfBytes, appendFilesToPdf, ACCEPTED_IMPORT_TYPES, isSupportedImportFile } from "@/lib/pdf-import"
import { buildSearchablePdf, documentNeedsOcr, type OcrPageResult } from "@/lib/pdf-ocr"
import { insertBlankPage, duplicatePage, extractPagesPdf, createBlankPdf, type NewPdfOptions } from "@/lib/pdf-pages"
import { saveSession, loadSession } from "@/lib/pdf-session"
import { HomeScreen } from "./home-screen"
import { EditorToolbar } from "./editor-toolbar"
import { ToolsPanel } from "./tools-panel"
import { PageScroller } from "./page-scroller"
import { SignatureDialog } from "./signature-dialog"
import { FormFillSheet } from "./form-fill-sheet"
import { ExportDialog, type ExportFormat } from "./export-dialog"
import { OcrDialog } from "./ocr-dialog"
import { NewPdfDialog } from "./new-pdf-dialog"
import { SearchBar } from "./search-bar"
import { AnnotationProperties } from "./annotation-properties"
import type { PageSearchMatch } from "./page-canvas"
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
  const { search } = usePdfSearch(doc)

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<"tools" | "pages">("tools")
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
  const [newPdfDialogOpen, setNewPdfDialogOpen] = useState(false)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    ignoreAccents: true,
    wholeWord: false,
  })
  const [matches, setMatches] = useState<DocumentMatch[]>([])
  const [activeMatch, setActiveMatch] = useState(0)
  const [searching, setSearching] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const appendInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const pageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const ocrSuggestedRef = useRef(false)
  // When set, the next document load restores this exact page/annotation state
  // instead of a fresh reset. Used by session restore and page operations.
  const pendingInitRef = useRef<{ pages: PageState[]; annotations: Record<number, Annotation[]> } | null>(null)
  const canAutosaveRef = useRef(false)
  const selectedIdRef = useRef<string | null>(null)
  const deleteSelectedRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (docPages.length === 0) return
    const pending = pendingInitRef.current
    pendingInitRef.current = null
    if (pending) {
      store.initDocument(pending.pages, pending.annotations)
    } else {
      store.initDocument(docPages)
    }
    canAutosaveRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docPages])

  useEffect(() => {
    if (!fileBytes) return
    readFormFields(fileBytes.slice(0)).then(setFormFields)
  }, [fileBytes, version])

  const restoreSession = useCallback(async () => {
    const session = await loadSession()
    if (!session) return
    pendingInitRef.current = { pages: session.pages, annotations: session.annotations }
    ocrSuggestedRef.current = true
    setFileName(session.fileName)
    setFileBytes(session.bytes)
    setVersion((v) => v + 1)
    setSelectedId(null)
    setCurrentPageIndex(0)
    setTool("select")
    toast.success("Sesión restaurada")
  }, [])

  // Debounced autosave of the working session to IndexedDB.
  useEffect(() => {
    if (!fileBytes || !canAutosaveRef.current || store.pages.length === 0) return
    const handle = setTimeout(() => {
      void saveSession({
        fileName,
        bytes: fileBytes,
        pages: store.pages,
        annotations: store.annotations,
      })
    }, 800)
    return () => clearTimeout(handle)
  }, [fileBytes, fileName, store.pages, store.annotations])

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

  // Visible pages in display order, used to order and scope search results.
  const pageOrder = useMemo(
    () => store.pages.filter((p) => !p.deleted).map((p) => p.originalIndex),
    [store.pages],
  )
  const pageOrderKey = pageOrder.join(",")

  // Run the search (debounced) whenever the query, options, document, or page order change.
  useEffect(() => {
    if (!searchOpen) return
    const query = searchQuery.trim()
    if (query.length === 0) {
      setMatches([])
      setActiveMatch(0)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const handle = setTimeout(async () => {
      const results = await search(searchQuery, searchOptions, pageOrder)
      if (cancelled) return
      setMatches(results)
      setActiveMatch(0)
      setSearching(false)
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchOptions, searchOpen, search, pageOrderKey, version])

  const goToMatch = useCallback(
    (next: number) => {
      setActiveMatch((prev) => {
        if (matches.length === 0) return 0
        const count = matches.length
        return ((next % count) + count) % count
      })
    },
    [matches.length],
  )
  const handleNextMatch = useCallback(() => goToMatch(activeMatch + 1), [goToMatch, activeMatch])
  const handlePrevMatch = useCallback(() => goToMatch(activeMatch - 1), [goToMatch, activeMatch])

  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setMatches([])
    setSearchQuery("")
    setActiveMatch(0)
  }, [])

  const searchMatchesByPage = useMemo(() => {
    const map = new Map<number, PageSearchMatch[]>()
    matches.forEach((m, gi) => {
      const list = map.get(m.pageIndex) ?? []
      list.push({ key: `m-${gi}`, rects: m.rects, active: gi === activeMatch })
      map.set(m.pageIndex, list)
    })
    return map
  }, [matches, activeMatch])

  // Locate the selected annotation and the page it lives on for the properties panel.
  const selectedAnnotation = useMemo(() => {
    if (!selectedId) return null
    for (const [key, list] of Object.entries(store.annotations)) {
      const found = list.find((a) => a.id === selectedId)
      if (found) return { annotation: found, pageIndex: Number(key) }
    }
    return null
  }, [selectedId, store.annotations])

  // Keep refs in sync so the keydown listener can delete without re-subscribing.
  useEffect(() => {
    selectedIdRef.current = selectedId
    deleteSelectedRef.current = selectedAnnotation
      ? () => {
          store.removeAnnotation(selectedAnnotation.pageIndex, selectedAnnotation.annotation.id)
          setSelectedId(null)
        }
      : null
  }, [selectedId, selectedAnnotation, store])

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

  const handleCreateNew = useCallback(async (options: NewPdfOptions) => {
    setLoadError(null)
    try {
      const bytes = await createBlankPdf(options)
      ocrSuggestedRef.current = true
      setFileName("documento-nuevo.pdf")
      setFileBytes(toArrayBuffer(bytes))
      setVersion((v) => v + 1)
      setSelectedId(null)
      setCurrentPageIndex(0)
      setTool("select")
      toast.success("Documento en blanco creado")
    } catch (e) {
      console.error("[v0] create pdf failed", e)
      setLoadError("No se pudo crear el documento en blanco.")
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

  const handleInsertBlank = useCallback(
    async (afterIndex: number | null) => {
      if (!fileBytes) return
      try {
        const result = await insertBlankPage(fileBytes.slice(0), store.pages, afterIndex)
        pendingInitRef.current = { pages: result.pages, annotations: store.annotations }
        setFileBytes(toArrayBuffer(result.bytes))
        setVersion((v) => v + 1)
        toast.success("Página en blanco insertada")
      } catch (e) {
        console.error("[v0] insert blank failed", e)
        toast.error("No se pudo insertar la página")
      }
    },
    [fileBytes, store.pages, store.annotations],
  )

  const handleDuplicatePage = useCallback(
    async (index: number) => {
      if (!fileBytes) return
      try {
        const result = await duplicatePage(fileBytes.slice(0), store.pages, store.annotations, index)
        pendingInitRef.current = { pages: result.pages, annotations: result.annotations }
        setFileBytes(toArrayBuffer(result.bytes))
        setVersion((v) => v + 1)
        toast.success("Página duplicada")
      } catch (e) {
        console.error("[v0] duplicate page failed", e)
        toast.error("No se pudo duplicar la página")
      }
    },
    [fileBytes, store.pages, store.annotations],
  )

  const handleExtractPage = useCallback(
    async (index: number) => {
      if (!fileBytes) return
      try {
        // Display index = count of visible pages before this one in the array.
        let displayIndex = 0
        for (let i = 0; i < index; i++) if (!store.pages[i].deleted) displayIndex++

        const map = new Map<number, Annotation[]>()
        for (const [key, value] of Object.entries(store.annotations)) map.set(Number(key), value)

        const baked = await buildExportedPdf({
          originalBytes: fileBytes.slice(0),
          pages: store.pages,
          annotationsByPage: map,
        })
        const bytes = await extractPagesPdf(toArrayBuffer(baked), [displayIndex])
        const baseName = fileName?.replace(/\.pdf$/i, "") || "documento"
        saveAs(new Blob([bytes], { type: "application/pdf" }), `${baseName}-pagina-${displayIndex + 1}.pdf`)
        toast.success("Página extraída")
      } catch (e) {
        console.error("[v0] extract page failed", e)
        toast.error("No se pudo extraer la página")
      }
    },
    [fileBytes, store.pages, store.annotations, fileName],
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
        const target = e.target as HTMLElement | null
        const typing =
          target &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        const isMod = e.metaKey || e.ctrlKey
        if (isMod && e.key.toLowerCase() === "f") {
          e.preventDefault()
          openSearch()
          return
        }
        if (!typing && (e.key === "Delete" || e.key === "Backspace") && selectedIdRef.current) {
          e.preventDefault()
          deleteSelectedRef.current?.()
          return
        }
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
  }, [handleUndo, handleRedo, openSearch])

  const handleSignatureConfirm = useCallback((dataUrl: string) => {
    setActiveSignature(dataUrl)
    setTool("sign")
  }, [])

  const zoomIn = useCallback(() => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP)), [])
  const zoomOut = useCallback(() => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP)), [])

  const currentDisplayPos = useMemo(() => {
    const pos = pageOrder.indexOf(currentPageIndex)
    return pos === -1 ? 0 : pos
  }, [pageOrder, currentPageIndex])

  const handlePrevPage = useCallback(() => {
    const pos = pageOrder.indexOf(currentPageIndex)
    if (pos > 0) jumpToPage(pageOrder[pos - 1])
  }, [pageOrder, currentPageIndex, jumpToPage])

  const handleNextPage = useCallback(() => {
    const pos = pageOrder.indexOf(currentPageIndex)
    if (pos !== -1 && pos < pageOrder.length - 1) jumpToPage(pageOrder[pos + 1])
  }, [pageOrder, currentPageIndex, jumpToPage])

  const handleJumpToPageNumber = useCallback(
    (pageNumber: number) => {
      const pos = Math.min(Math.max(pageNumber, 1), pageOrder.length) - 1
      const originalIndex = pageOrder[pos]
      if (originalIndex !== undefined) jumpToPage(originalIndex)
    },
    [pageOrder, jumpToPage],
  )

  const handleGoHome = useCallback(() => {
    setFileBytes(null)
    setFileName(null)
    setSelectedId(null)
    setSearchOpen(false)
    setTool("select")
  }, [])

  const annotationsByPageMap = useMemo(() => {
    const map = new Map<number, Annotation[]>()
    for (const [key, value] of Object.entries(store.annotations)) {
      map.set(Number(key), value)
    }
    return map
  }, [store.annotations])

  const handlePrint = useCallback(async () => {
    if (!fileBytes) return
    try {
      // Bake annotations and page changes into real PDF content so the
      // print dialog receives the document itself, not the editor UI.
      const bytes = await buildExportedPdf({
        originalBytes: fileBytes.slice(0),
        pages: store.pages,
        annotationsByPage: annotationsByPageMap,
      })
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))

      const iframe = document.createElement("iframe")
      iframe.style.position = "fixed"
      iframe.style.inset = "0"
      iframe.style.width = "0"
      iframe.style.height = "0"
      iframe.style.border = "none"
      iframe.setAttribute("aria-hidden", "true")

      const cleanup = () => {
        URL.revokeObjectURL(url)
        iframe.remove()
      }

      iframe.onload = () => {
        const win = iframe.contentWindow
        if (!win) {
          cleanup()
          toast.error("No se pudo preparar el documento para imprimir")
          return
        }
        win.addEventListener("afterprint", cleanup, { once: true })
        win.focus()
        win.print()
        // Fallback cleanup in case the browser never fires afterprint.
        setTimeout(cleanup, 60_000)
      }

      iframe.src = url
      document.body.appendChild(iframe)
    } catch (e) {
      console.error("[v0] print failed", e)
      toast.error("No se pudo preparar el documento para imprimir")
    }
  }, [fileBytes, store.pages, annotationsByPageMap])

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
      <>
        <HomeScreen
          onFilesSelected={handleFilesSelected}
          onCreateNew={() => setNewPdfDialogOpen(true)}
          onContinue={restoreSession}
          error={loadError}
        />
        <NewPdfDialog open={newPdfDialogOpen} onOpenChange={setNewPdfDialogOpen} onCreate={handleCreateNew} />
      </>
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
        onOpenSearch={openSearch}
        onOpenExport={() => setExportDialogOpen(true)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onGoHome={handleGoHome}
        onQuickSave={() => handleExport("pdf")}
        onPrint={handlePrint}
        currentPage={currentDisplayPos + 1}
        totalPages={Math.max(pageOrder.length, 1)}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onJumpToPageNumber={handleJumpToPageNumber}
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

      <div className="relative flex flex-1 overflow-hidden">
        {searchOpen && doc && (
          <SearchBar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            options={searchOptions}
            onOptionsChange={setSearchOptions}
            matchCount={matches.length}
            activeIndex={activeMatch}
            searching={searching}
            onNext={handleNextMatch}
            onPrev={handlePrevMatch}
            onClose={closeSearch}
          />
        )}

        {sidebarOpen && doc && (
          <ToolsPanel
            doc={doc}
            pages={store.pages}
            tool={tool}
            hasFormFields={formFields.length > 0}
            activeTab={sidebarTab}
            onActiveTabChange={setSidebarTab}
            onToolChange={setTool}
            onCreateNew={() => setNewPdfDialogOpen(true)}
            onOpenFile={() => fileInputRef.current?.click()}
            onImportAppend={() => appendInputRef.current?.click()}
            onOpenSignature={() => setSignatureDialogOpen(true)}
            onOpenForm={() => setFormSheetOpen(true)}
            onOpenExport={() => setExportDialogOpen(true)}
            onOpenOcr={() => setOcrDialogOpen(true)}
            onJumpToPage={jumpToPage}
            onRotate={store.rotatePage}
            onToggleDelete={store.toggleDeletePage}
            onReorder={store.reorderPages}
            onInsertBlank={handleInsertBlank}
            onDuplicate={handleDuplicatePage}
            onExtract={handleExtractPage}
          />
        )}

        {selectedAnnotation && tool === "select" && (
          <AnnotationProperties
            annotation={selectedAnnotation.annotation}
            onUpdate={(patch) =>
              store.updateAnnotation(selectedAnnotation.pageIndex, selectedAnnotation.annotation.id, patch)
            }
            onRemove={() => {
              store.removeAnnotation(selectedAnnotation.pageIndex, selectedAnnotation.annotation.id)
              setSelectedId(null)
            }}
            onClose={() => setSelectedId(null)}
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
            searchMatchesByPage={searchMatchesByPage}
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

      <NewPdfDialog open={newPdfDialogOpen} onOpenChange={setNewPdfDialogOpen} onCreate={handleCreateNew} />

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
