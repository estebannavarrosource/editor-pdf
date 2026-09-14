"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { saveAs } from "file-saver"
import { usePdfDocument } from "@/hooks/use-pdf-document"
import { usePdfEditorStore } from "@/hooks/use-pdf-editor-store"
import { usePdfSearch, type DocumentMatch } from "@/hooks/use-pdf-search"
import type { SearchOptions } from "@/lib/pdf-search"
import type { Annotation, CommentAnnotation, PageState, ToolId } from "@/lib/pdf-types"
import { makeId } from "@/lib/id"
import { buildExportedPdf } from "@/lib/pdf-engine"
import { exportAsDocx, exportPagesAsImages } from "@/lib/pdf-export"
import { readFormFields, toFormFieldValues, type FormFieldDescriptor } from "@/lib/pdf-form"
import { filesToPdfBytes, appendFilesToPdf, ACCEPTED_IMPORT_TYPES, isSupportedImportFile } from "@/lib/pdf-import"
import { runOcr, buildSearchablePdf, documentNeedsOcr, pageNeedsOcr, type OcrProgress } from "@/lib/pdf-ocr"
import {
  insertBlankPage,
  duplicatePages,
  extractPagesPdf,
  insertFilesAtPosition,
  replacePageWithFile,
  toDisplayIndices,
  createBlankPdf,
  type NewPdfOptions,
} from "@/lib/pdf-pages"
import { splitBakedPdf, zipPdfParts } from "@/lib/pdf-split"
import { compressPdf, type CompressionLevel } from "@/lib/pdf-compress"
import { saveSession, loadSession } from "@/lib/pdf-session"
import { HomeScreen } from "./home-screen"
import { EditorToolbar } from "./editor-toolbar"
import { ToolsPanel } from "./tools-panel"
import { PageOrganizerView } from "./page-organizer/page-organizer-view"
import { PageScroller } from "./page-scroller"
import { SignatureDialog } from "./signature-dialog"
import { FormFillSheet } from "./form-fill-sheet"
import { ExportDialog, type ExportFormat } from "./export-dialog"
import { CompressDialog } from "./compress-dialog"
import { OcrProgressOverlay } from "./ocr-progress-overlay"
import { NewPdfDialog } from "./new-pdf-dialog"
import { SearchBar } from "./search-bar"
import { CommentsPanel, type CommentThread } from "./comments-panel"
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
  const { search, prewarm } = usePdfSearch(doc)

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pageOrganizerOpen, setPageOrganizerOpen] = useState(false)
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
  const [compressDialogOpen, setCompressDialogOpen] = useState(false)
  const [formSheetOpen, setFormSheetOpen] = useState(false)
  const [formFields, setFormFields] = useState<FormFieldDescriptor[]>([])
  const [exporting, setExporting] = useState(false)
  const [ocrRunning, setOcrRunning] = useState(false)
  // Shown while combining/parsing files picked by the user (import, append,
  // insert, replace). These run pdf-lib operations that can take a while for
  // large or numerous files, so without this the app can look unresponsive.
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null)
  const [newPdfDialogOpen, setNewPdfDialogOpen] = useState(false)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentDraftId, setCommentDraftId] = useState<string | null>(null)
  const [commentAuthor, setCommentAuthor] = useState(() => {
    if (typeof window === "undefined") return "Yo"
    return window.localStorage.getItem("pdf-comment-author") || "Yo"
  })
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("pdf-comment-author", commentAuthor.trim() || "Yo")
    }
  }, [commentAuthor])
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
  // Set right before an OCR-produced reload; tells the effect below to index
  // the freshly embedded text layer once the new document instance is ready.
  const pendingOcrPrewarmRef = useRef(false)
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
      toast.info("Este documento parece escaneado. Reconoce su texto para poder buscarlo y seleccionarlo.", {
        action: { label: "Reconocer texto", onClick: () => void handleRunOcr() },
        duration: 8000,
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])

  // Visible pages in display order, used to order and scope search results.
  const pageOrder = useMemo(
    () => store.pages.filter((p) => !p.deleted).map((p) => p.originalIndex),
    [store.pages],
  )
  const pageOrderKey = pageOrder.join(",")

  // After an OCR pass reloads the document, index every page's new text layer
  // in the background so the first search is instant, then invite the user to search.
  useEffect(() => {
    if (!doc || !pendingOcrPrewarmRef.current) return
    pendingOcrPrewarmRef.current = false
    let cancelled = false
    void (async () => {
      await prewarm(pageOrder)
      if (cancelled) return
      toast.success("Texto reconocido. El documento ya es buscable y seleccionable.", {
        action: { label: "Buscar", onClick: () => setSearchOpen(true) },
        duration: 8000,
      })
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageOrderKey])

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
    const isSingleNativePdf = valid.length === 1 && valid[0].type === "application/pdf"
    if (!isSingleNativePdf) {
      setBusyMessage(
        valid.length === 1 ? "Importando archivo..." : `Combinando ${valid.length} archivos...`,
      )
    }
    try {
      let buf: ArrayBuffer
      let name: string
      if (isSingleNativePdf) {
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
    } finally {
      setBusyMessage(null)
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
      setBusyMessage(valid.length === 1 ? "Anexando archivo..." : `Anexando ${valid.length} archivos...`)
      try {
        const bytes = await appendFilesToPdf(fileBytes.slice(0), valid)
        setFileBytes(toArrayBuffer(bytes))
        setVersion((v) => v + 1)
        toast.success(valid.length === 1 ? "Archivo anexado" : `${valid.length} archivos anexados`)
      } catch (e) {
        console.error("[v0] append failed", e)
        toast.error("No se pudieron anexar los archivos")
      } finally {
        setBusyMessage(null)
      }
    },
    [fileBytes],
  )

  // One-click OCR: recognizes text and embeds it directly into the document,
  // making it selectable/searchable without any intermediate dialog.
  const handleRunOcr = useCallback(async () => {
    if (!doc || !fileBytes || ocrRunning) return
    setOcrRunning(true)
    setOcrProgress(null)
    ocrSuggestedRef.current = true
    try {
      const active = store.pages.filter((p) => !p.deleted)
      // Only OCR pages that lack extractable text: pages that are already
      // digital keep their original perfect text and avoid a redundant layer.
      const targets: PageState[] = []
      for (const p of active) {
        if (await pageNeedsOcr(doc, p.originalIndex)) targets.push(p)
      }

      if (targets.length === 0) {
        await prewarm(pageOrder)
        toast.info("El documento ya tiene texto buscable y seleccionable.", {
          action: { label: "Buscar", onClick: () => setSearchOpen(true) },
          duration: 6000,
        })
        return
      }

      const results = await runOcr(doc, targets, (p) => setOcrProgress(p))
      const bytes = await buildSearchablePdf(fileBytes.slice(0), results)
      // Preserve current pages/annotations across the reload, then index the new text.
      pendingInitRef.current = { pages: store.pages, annotations: store.annotations }
      pendingOcrPrewarmRef.current = true
      setFileBytes(toArrayBuffer(bytes))
      setVersion((v) => v + 1)
    } catch (e) {
      console.error("[v0] OCR failed", e)
      toast.error("No se pudo reconocer el texto del documento")
    } finally {
      setOcrRunning(false)
      setOcrProgress(null)
    }
  }, [doc, fileBytes, ocrRunning, store.pages, store.annotations, pageOrder, prewarm])

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

  const annotationsByPageMap = useMemo(() => {
    const map = new Map<number, Annotation[]>()
    for (const [key, value] of Object.entries(store.annotations)) {
      map.set(Number(key), value)
    }
    return map
  }, [store.annotations])

  const handleDuplicatePages = useCallback(
    async (indices: number[]) => {
      if (!fileBytes) return
      try {
        const result = await duplicatePages(fileBytes.slice(0), store.pages, store.annotations, indices)
        pendingInitRef.current = { pages: result.pages, annotations: result.annotations }
        setFileBytes(toArrayBuffer(result.bytes))
        setVersion((v) => v + 1)
        toast.success(indices.length === 1 ? "Página duplicada" : `${indices.length} páginas duplicadas`)
      } catch (e) {
        console.error("[v0] duplicate pages failed", e)
        toast.error("No se pudieron duplicar las páginas")
      }
    },
    [fileBytes, store.pages, store.annotations],
  )

  const handleExtractPages = useCallback(
    async (indices: number[]) => {
      if (!fileBytes) return
      try {
        const displayIndices = toDisplayIndices(store.pages, indices)
        if (displayIndices.length === 0) return

        const baked = await buildExportedPdf({
          originalBytes: fileBytes.slice(0),
          pages: store.pages,
          annotationsByPage: annotationsByPageMap,
        })
        const bytes = await extractPagesPdf(toArrayBuffer(baked), displayIndices)
        const baseName = fileName?.replace(/\.pdf$/i, "") || "documento"
        const suffix =
          displayIndices.length === 1 ? `-pagina-${displayIndices[0] + 1}` : `-${displayIndices.length}-paginas`
        saveAs(new Blob([bytes], { type: "application/pdf" }), `${baseName}${suffix}.pdf`)
        toast.success(displayIndices.length === 1 ? "Página extraída" : "Páginas extraídas")
      } catch (e) {
        console.error("[v0] extract pages failed", e)
        toast.error("No se pudieron extraer las páginas")
      }
    },
    [fileBytes, store.pages, fileName, annotationsByPageMap],
  )

  const handleInsertFiles = useCallback(
    async (files: File[], afterIndex: number | null) => {
      if (!fileBytes) return
      const valid = files.filter(isSupportedImportFile)
      if (valid.length === 0) return
      setBusyMessage(valid.length === 1 ? "Insertando archivo..." : `Insertando ${valid.length} archivos...`)
      try {
        const result = await insertFilesAtPosition(fileBytes.slice(0), store.pages, valid, afterIndex)
        pendingInitRef.current = { pages: result.pages, annotations: store.annotations }
        setFileBytes(toArrayBuffer(result.bytes))
        setVersion((v) => v + 1)
        toast.success(valid.length === 1 ? "Página insertada" : `${valid.length} páginas insertadas`)
      } catch (e) {
        console.error("[v0] insert files failed", e)
        toast.error("No se pudieron insertar las páginas")
      } finally {
        setBusyMessage(null)
      }
    },
    [fileBytes, store.pages, store.annotations],
  )

  const handleReplacePage = useCallback(
    async (index: number, files: File[]) => {
      if (!fileBytes) return
      const valid = files.filter(isSupportedImportFile)
      if (valid.length === 0) return
      setBusyMessage("Reemplazando página...")
      try {
        const result = await replacePageWithFile(fileBytes.slice(0), store.pages, store.annotations, index, valid)
        pendingInitRef.current = { pages: result.pages, annotations: result.annotations }
        setFileBytes(toArrayBuffer(result.bytes))
        setVersion((v) => v + 1)
        toast.success("Página reemplazada")
      } catch (e) {
        console.error("[v0] replace page failed", e)
        toast.error("No se pudo reemplazar la página")
      } finally {
        setBusyMessage(null)
      }
    },
    [fileBytes, store.pages, store.annotations],
  )

  const handleSplitDocument = useCallback(
    async (splitIndices: number[]) => {
      if (!fileBytes) return
      try {
        const splitDisplayIndices = toDisplayIndices(store.pages, splitIndices)
        const baked = await buildExportedPdf({
          originalBytes: fileBytes.slice(0),
          pages: store.pages,
          annotationsByPage: annotationsByPageMap,
        })
        const parts = await splitBakedPdf(toArrayBuffer(baked), splitDisplayIndices)
        if (parts.length < 2) {
          toast.info("Selecciona páginas que no formen todo el documento para poder dividirlo")
          return
        }
        const baseName = fileName?.replace(/\.pdf$/i, "") || "documento"
        const zip = await zipPdfParts(parts, baseName)
        saveAs(zip, `${baseName}-dividido.zip`)
        toast.success(`Documento dividido en ${parts.length} partes`)
      } catch (e) {
        console.error("[v0] split document failed", e)
        toast.error("No se pudo dividir el documento")
      }
    },
    [fileBytes, store.pages, fileName, annotationsByPageMap],
  )

  const handleBulkRotate = useCallback(
    (indices: number[], delta: 90 | -90) => {
      const originalIndexes = indices.map((i) => store.pages[i]?.originalIndex).filter((i): i is number => i !== undefined)
      store.rotatePages(originalIndexes, delta)
    },
    [store],
  )

  const handleRotateSinglePage = useCallback(
    (originalIndex: number, delta: 90 | -90) => {
      store.rotatePages([originalIndex], delta)
    },
    [store],
  )

  const handleBulkDelete = useCallback(
    (indices: number[]) => {
      const originalIndexes = indices.map((i) => store.pages[i]?.originalIndex).filter((i): i is number => i !== undefined)
      store.deletePages(originalIndexes)
    },
    [store],
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

  // ---- Comments (Word-style review notes) ----------------------------------
  // Ordered top-to-bottom within each page, pages in display order.
  const commentThreads = useMemo<CommentThread[]>(() => {
    const list: CommentThread[] = []
    for (const [key, anns] of Object.entries(store.annotations)) {
      const pageIndex = Number(key)
      const displayNumber = pageOrder.indexOf(pageIndex) + 1
      for (const ann of anns) {
        if (ann.type === "comment") {
          list.push({ annotation: ann as CommentAnnotation, pageIndex, displayNumber })
        }
      }
    }
    return list.sort((a, b) => {
      if (a.displayNumber !== b.displayNumber) return a.displayNumber - b.displayNumber
      // Higher PDF y = closer to the top of the page.
      return b.annotation.y - a.annotation.y
    })
  }, [store.annotations, pageOrder])

  // Discard comment markers that were placed but never got a message, keeping
  // an optional in-progress draft. Mirrors Word discarding empty comments.
  const purgeEmptyComments = useCallback(
    (keepId?: string) => {
      for (const [key, anns] of Object.entries(store.annotations)) {
        const originalIndex = Number(key)
        for (const ann of anns) {
          if (ann.type === "comment" && ann.messages.length === 0 && ann.id !== keepId) {
            store.removeAnnotation(originalIndex, ann.id)
          }
        }
      }
    },
    [store],
  )

  const handleOpenComments = useCallback(
    (id: string) => {
      purgeEmptyComments(id)
      setCommentsOpen(true)
      setCommentDraftId(id)
      setSelectedId(id)
    },
    [purgeEmptyComments],
  )

  const handleSelectThread = useCallback(
    (thread: CommentThread) => {
      purgeEmptyComments(thread.annotation.id)
      setSelectedId(thread.annotation.id)
      setCommentDraftId(null)
      jumpToPage(thread.pageIndex)
    },
    [jumpToPage, purgeEmptyComments],
  )

  const handleAddCommentMessage = useCallback(
    (originalIndex: number, id: string, text: string) => {
      const current = (store.annotations[originalIndex] ?? []).find((a) => a.id === id) as
        | CommentAnnotation
        | undefined
      if (!current) return
      const message = { id: makeId("msg"), author: commentAuthor.trim() || "Yo", text, createdAt: Date.now() }
      store.updateAnnotation(originalIndex, id, {
        messages: [...current.messages, message],
      } as Partial<Annotation>)
      setCommentDraftId(null)
    },
    [store, commentAuthor],
  )

  const handleToggleCommentResolved = useCallback(
    (originalIndex: number, id: string) => {
      const current = (store.annotations[originalIndex] ?? []).find((a) => a.id === id) as
        | CommentAnnotation
        | undefined
      if (!current) return
      store.updateAnnotation(originalIndex, id, { resolved: !current.resolved } as Partial<Annotation>)
    },
    [store],
  )

  const handleDeleteComment = useCallback(
    (originalIndex: number, id: string) => {
      store.removeAnnotation(originalIndex, id)
      setSelectedId((cur) => (cur === id ? null : cur))
      setCommentDraftId((cur) => (cur === id ? null : cur))
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

  const handlePrint = useCallback(async () => {
    if (!fileBytes) return

    try {
      // Bake annotations and page changes into real PDF content so what
      // gets opened is the document itself, never the editor UI. This is
      // a local, in-memory operation (no network round trip), so it's
      // fast even though it's awaited before opening the tab.
      const bytes = await buildExportedPdf({
        originalBytes: fileBytes.slice(0),
        pages: store.pages,
        annotationsByPage: annotationsByPageMap,
      })
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))

      // Open the PDF directly in a brand-new top-level tab in one step
      // (never a placeholder + later navigation, which just adds an
      // extra round trip and makes the flow feel slower). The browser's
      // native PDF viewer renders it there with its own print button, so
      // printing never calls window.print() from our script - avoiding
      // the SecurityError thrown when this app is itself embedded in a
      // cross-origin iframe (the preview harness) and print() tries to
      // walk up to a blocked window.top.
      const printTab = window.open(url, "_blank", "noopener,noreferrer")

      if (!printTab) {
        toast.error("El navegador bloqueó la pestaña de impresión. Permite las ventanas emergentes e inténtalo de nuevo.")
        URL.revokeObjectURL(url)
        return
      }

      // Clean up the object URL once the print tab is closed, polling
      // since cross-origin/new-tab windows don't reliably fire events
      // we can listen to from the opener.
      const revokeCheck = setInterval(() => {
        if (printTab.closed) {
          URL.revokeObjectURL(url)
          clearInterval(revokeCheck)
        }
      }, 1000)
      setTimeout(() => {
        URL.revokeObjectURL(url)
        clearInterval(revokeCheck)
      }, 10 * 60 * 1000)
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

  const handleCompress = useCallback(
    async (level: CompressionLevel) => {
      if (!fileBytes) return
      const baseName = fileName?.replace(/\.pdf$/i, "") || "documento"
      setBusyMessage("Comprimiendo documento...")
      try {
        const baked = await buildExportedPdf({
          originalBytes: fileBytes.slice(0),
          pages: store.pages,
          annotationsByPage: annotationsByPageMap,
        })
        const result = await compressPdf(toArrayBuffer(baked), level)
        saveAs(new Blob([result.bytes], { type: "application/pdf" }), `${baseName}-comprimido.pdf`)

        const savedPercent = Math.max(
          0,
          Math.round((1 - result.compressedSize / result.originalSize) * 100),
        )
        const formatKb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`
        if (savedPercent > 0) {
          toast.success(
            `Documento comprimido: ${formatKb(result.originalSize)} → ${formatKb(result.compressedSize)} (-${savedPercent}%)`,
          )
        } else {
          toast.info("El documento ya estaba optimizado; el tamaño no varió de forma significativa")
        }
      } catch (e) {
        console.error("[v0] compress failed", e)
        toast.error("No se pudo comprimir el documento")
        throw e
      } finally {
        setBusyMessage(null)
      }
    },
    [fileBytes, fileName, store.pages, annotationsByPageMap],
  )

  const busyOverlay = busyMessage && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-8 py-6 text-center shadow-lg">
        <Spinner className="size-6" />
        <p className="text-sm font-medium">{busyMessage}</p>
        <p className="text-xs text-muted-foreground">Esto puede tardar unos segundos con archivos grandes.</p>
      </div>
    </div>
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
        {busyOverlay}
      </>
    )
  }

  return (
    <div className="flex h-dvh flex-col">
      {busyOverlay}
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
        commentsActive={commentsOpen}
        commentCount={commentThreads.length}
        onToggleComments={() => {
          setCommentsOpen((v) => {
            if (v) purgeEmptyComments()
            return !v
          })
          setCommentDraftId(null)
        }}
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
            tool={tool}
            hasFormFields={formFields.length > 0}
            onToolChange={setTool}
            onCreateNew={() => setNewPdfDialogOpen(true)}
            onOpenFile={() => fileInputRef.current?.click()}
            onImportAppend={() => appendInputRef.current?.click()}
            onOpenSignature={() => setSignatureDialogOpen(true)}
            onOpenForm={() => setFormSheetOpen(true)}
            onOpenExport={() => setExportDialogOpen(true)}
            onOpenCompress={() => setCompressDialogOpen(true)}
            onRunOcr={handleRunOcr}
            onOpenPageOrganizer={() => setPageOrganizerOpen(true)}
          />
        )}

        {selectedAnnotation && selectedAnnotation.annotation.type !== "comment" && tool === "select" && (
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
            onRequestOpenComments={handleOpenComments}
            onToolChange={setTool}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onRotatePage={handleRotateSinglePage}
            onOpenPageOrganizer={() => setPageOrganizerOpen(true)}
            registerScrollContainer={registerScrollContainer}
            registerPageContainer={registerPageContainer}
          />
        )}

        {commentsOpen && doc && (
          <CommentsPanel
            threads={commentThreads}
            author={commentAuthor}
            onAuthorChange={setCommentAuthor}
            selectedId={selectedId}
            draftId={commentDraftId}
            onSelect={handleSelectThread}
            onAddMessage={handleAddCommentMessage}
            onToggleResolved={handleToggleCommentResolved}
            onDelete={handleDeleteComment}
            onClose={() => {
              purgeEmptyComments()
              setCommentsOpen(false)
              setCommentDraftId(null)
            }}
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

      <CompressDialog open={compressDialogOpen} onOpenChange={setCompressDialogOpen} onCompress={handleCompress} />

      <NewPdfDialog open={newPdfDialogOpen} onOpenChange={setNewPdfDialogOpen} onCreate={handleCreateNew} />

      {ocrRunning && <OcrProgressOverlay progress={ocrProgress} />}

      {pageOrganizerOpen && doc && (
        <PageOrganizerView
          doc={doc}
          pages={store.pages}
          canUndo={store.canUndo}
          canRedo={store.canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClose={() => setPageOrganizerOpen(false)}
          onRotate={handleBulkRotate}
          onDelete={handleBulkDelete}
          onReorderBlock={store.reorderPageBlock}
          onDuplicate={handleDuplicatePages}
          onInsertFiles={handleInsertFiles}
          onInsertBlank={handleInsertBlank}
          onReplace={handleReplacePage}
          onExtract={handleExtractPages}
          onSplit={handleSplitDocument}
        />
      )}
    </div>
  )
}
