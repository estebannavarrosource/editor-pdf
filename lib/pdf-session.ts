import type { Annotation, PageState } from "./pdf-types"

const DB_NAME = "pdf-editor"
const STORE = "session"
const KEY = "current"
const DB_VERSION = 1

export interface SavedSession {
  fileName: string | null
  bytes: ArrayBuffer
  pages: PageState[]
  annotations: Record<number, Annotation[]>
  savedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no disponible"))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("No se pudo abrir IndexedDB"))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = fn(tx.objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

/** Persists the whole working session. Bytes are cloned so later edits don't mutate the record. */
export async function saveSession(session: Omit<SavedSession, "savedAt">): Promise<void> {
  const record: SavedSession = {
    ...session,
    bytes: session.bytes.slice(0),
    savedAt: Date.now(),
  }
  try {
    await withStore("readwrite", (store) => store.put(record, KEY))
  } catch (e) {
    console.error("[v0] saveSession failed", e)
  }
}

export async function loadSession(): Promise<SavedSession | null> {
  try {
    const result = await withStore<SavedSession | undefined>("readonly", (store) => store.get(KEY))
    return result ?? null
  } catch (e) {
    console.error("[v0] loadSession failed", e)
    return null
  }
}

export async function clearSession(): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(KEY))
  } catch (e) {
    console.error("[v0] clearSession failed", e)
  }
}

export async function peekSessionMeta(): Promise<{ fileName: string | null; savedAt: number } | null> {
  const session = await loadSession()
  if (!session) return null
  return { fileName: session.fileName, savedAt: session.savedAt }
}
