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

  /** Bulk version of {@link rotatePage}: rotates several pages as a single history entry. */
  const rotatePages = useCallback(
    (originalIndexes: number[], delta: 90 | -90) => {
      const set = new Set(originalIndexes)
      mutate((draft) => ({
        pages: draft.pages.map((pg) =>
          set.has(pg.originalIndex)
            ? { ...pg, rotation: ((((pg.rotation + delta) % 360) + 360) % 360) as PageState["rotation"] }
            : pg,
        ),
        annotations: draft.annotations,
      }))
    },
    [mutate],
  )

  /** Bulk, decisive version of {@link toggleDeletePage}: always marks as deleted (not a toggle). */
  const deletePages = useCallback(
    (originalIndexes: number[]) => {
      const set = new Set(originalIndexes)
      mutate((draft) => ({
        pages: draft.pages.map((pg) => (set.has(pg.originalIndex) ? { ...pg, deleted: true } : pg)),
        annotations: draft.annotations,
      }))
    },
    [mutate],
  )

  /**
   * Moves the block of pages at `fromIndices` (full-array positions,
   * preserving their relative order) so it starts at `toIndex`. Used to drag
   * a multi-selection of cards to a new spot in one step.
   */
  const reorderPageBlock = useCallback(
    (fromIndices: number[], toIndex: number) => {
      mutate((draft) => {
        const fromSet = new Set(fromIndices)
        const block = fromIndices
          .filter((i) => draft.pages[i] !== undefined)
          .sort((a, b) => a - b)
          .map((i) => draft.pages[i])
        if (block.length === 0) return draft

        const rest = draft.pages.filter((_, i) => !fromSet.has(i))
        // Count how many moved pages originally sat before the target index,
        // so removing them first doesn't shift where the block lands.
        const removedBefore = fromIndices.filter((i) => i < toIndex).length
        const insertAt = Math.max(0, Math.min(rest.length, toIndex - removedBefore))

        const nextPages = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]
        return { pages: nextPages, annotations: draft.annotations }
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
    rotatePages,
    deletePages,
    reorderPageBlock,
    undo,
    redo,
    canUndo,
    canRedo,
    allAnnotationsFlat,
    historyTick,
  }
}
