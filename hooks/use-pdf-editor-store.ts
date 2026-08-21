"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import type { Annotation, PageState } from "@/lib/pdf-types"

interface DocState {
  pages: PageState[]
  annotations: Record<number, Annotation[]>
}

const HISTORY_LIMIT = 50
const EMPTY_STATE: DocState = { pages: [], annotations: {} }

export function usePdfEditorStore() {
  const [state, setState] = useState<DocState>(EMPTY_STATE)
  const past = useRef<DocState[]>([])
  const future = useRef<DocState[]>([])
  const [historyTick, setHistoryTick] = useState(0)

  const initDocument = useCallback(
    (newPages: PageState[], newAnnotations: Record<number, Annotation[]> = {}) => {
      past.current = []
      future.current = []
      setState({ pages: newPages, annotations: newAnnotations })
      setHistoryTick((t) => t + 1)
    },
    [],
  )

  const mutate = useCallback((updater: (draft: DocState) => DocState) => {
    setState((prev) => {
      past.current.push(prev)
      if (past.current.length > HISTORY_LIMIT) past.current.shift()
      future.current = []
      return updater(prev)
    })
    setHistoryTick((t) => t + 1)
  }, [])

  const addAnnotation = useCallback(
    (originalIndex: number, annotation: Annotation) => {
      mutate((draft) => ({
        pages: draft.pages,
        annotations: {
          ...draft.annotations,
          [originalIndex]: [...(draft.annotations[originalIndex] ?? []), annotation],
        },
      }))
    },
    [mutate],
  )

  const updateAnnotation = useCallback(
    (originalIndex: number, id: string, patch: Partial<Annotation>) => {
      mutate((draft) => ({
        pages: draft.pages,
        annotations: {
          ...draft.annotations,
          [originalIndex]: (draft.annotations[originalIndex] ?? []).map((ann) =>
            ann.id === id ? ({ ...ann, ...patch } as Annotation) : ann,
          ),
        },
      }))
    },
    [mutate],
  )

  const removeAnnotation = useCallback(
    (originalIndex: number, id: string) => {
      mutate((draft) => ({
        pages: draft.pages,
        annotations: {
          ...draft.annotations,
          [originalIndex]: (draft.annotations[originalIndex] ?? []).filter((ann) => ann.id !== id),
        },
      }))
    },
    [mutate],
  )

  const rotatePage = useCallback(
    (originalIndex: number, delta: 90 | -90) => {
      mutate((draft) => ({
        pages: draft.pages.map((pg) =>
          pg.originalIndex === originalIndex
            ? { ...pg, rotation: ((((pg.rotation + delta) % 360) + 360) % 360) as PageState["rotation"] }
            : pg,
        ),
        annotations: draft.annotations,
      }))
    },
    [mutate],
  )

  const toggleDeletePage = useCallback(
    (originalIndex: number) => {
      mutate((draft) => ({
        pages: draft.pages.map((pg) => (pg.originalIndex === originalIndex ? { ...pg, deleted: !pg.deleted } : pg)),
        annotations: draft.annotations,
      }))
    },
    [mutate],
  )

  const reorderPages = useCallback(
    (fromIndex: number, toIndex: number) => {
      mutate((draft) => {
        const next = [...draft.pages]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        return { pages: next, annotations: draft.annotations }
      })
    },
    [mutate],
  )

  const undo = useCallback(() => {
    if (past.current.length === 0) return
    const prev = past.current.pop()!
    setState((current) => {
      future.current.push(current)
      return prev
    })
    setHistoryTick((t) => t + 1)
  }, [])

  const redo = useCallback(() => {
    if (future.current.length === 0) return
    const next = future.current.pop()!
    setState((current) => {
      past.current.push(current)
      return next
    })
    setHistoryTick((t) => t + 1)
  }, [])

  const canUndo = past.current.length > 0
  const canRedo = future.current.length > 0

  const allAnnotationsFlat = useMemo(() => Object.values(state.annotations).flat(), [state.annotations])

  return {
    pages: state.pages,
    annotations: state.annotations,
    initDocument,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    rotatePage,
    toggleDeletePage,
    reorderPages,
    undo,
    redo,
    canUndo,
    canRedo,
    allAnnotationsFlat,
    historyTick,
  }
}
