"use client"

import { useEffect, useRef, useState } from "react"
import { MessageSquare, X, Check, Trash2, CornerDownLeft, RotateCcw } from "lucide-react"
import type { CommentAnnotation } from "@/lib/pdf-types"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface CommentThread {
  annotation: CommentAnnotation
  pageIndex: number
  displayNumber: number
}

interface CommentsPanelProps {
  threads: CommentThread[]
  author: string
  onAuthorChange: (author: string) => void
  selectedId: string | null
  /** A freshly created comment awaiting its first message; auto-focuses. */
  draftId: string | null
  onSelect: (thread: CommentThread) => void
  onAddMessage: (pageIndex: number, id: string, text: string) => void
  onToggleResolved: (pageIndex: number, id: string) => void
  onDelete: (pageIndex: number, id: string) => void
  onClose: () => void
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function relativeTime(ts: number) {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return "ahora"
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} d`
  return new Date(ts).toLocaleDateString("es", { day: "numeric", month: "short" })
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
      {initials(name)}
    </span>
  )
}

export function CommentsPanel({
  threads,
  author,
  onAuthorChange,
  selectedId,
  draftId,
  onSelect,
  onAddMessage,
  onToggleResolved,
  onDelete,
  onClose,
}: CommentsPanelProps) {
  const openCount = threads.filter((t) => !t.annotation.resolved).length

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <MessageSquare className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Comentarios</span>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
          {openCount}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" className="ml-auto size-8" onClick={onClose} aria-label="Cerrar comentarios">
                <X />
              </Button>
            }
          />
          <TooltipContent>Cerrar</TooltipContent>
        </Tooltip>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <label htmlFor="comment-author" className="text-xs text-muted-foreground">
          Autor
        </label>
        <input
          id="comment-author"
          value={author}
          onChange={(e) => onAuthorChange(e.target.value)}
          className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
          placeholder="Tu nombre"
        />
      </div>

      {threads.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <MessageSquare className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Sin comentarios</p>
          <p className="text-xs text-muted-foreground">
            Usa la herramienta de comentario y haz clic en el documento para añadir uno.
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 p-3">
            {threads.map((thread) => (
              <CommentCard
                key={thread.annotation.id}
                thread={thread}
                author={author}
                selected={thread.annotation.id === selectedId}
                autoFocus={thread.annotation.id === draftId}
                onSelect={onSelect}
                onAddMessage={onAddMessage}
                onToggleResolved={onToggleResolved}
                onDelete={onDelete}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </aside>
  )
}

function CommentCard({
  thread,
  author,
  selected,
  autoFocus,
  onSelect,
  onAddMessage,
  onToggleResolved,
  onDelete,
}: {
  thread: CommentThread
  author: string
  selected: boolean
  autoFocus: boolean
  onSelect: (thread: CommentThread) => void
  onAddMessage: (pageIndex: number, id: string, text: string) => void
  onToggleResolved: (pageIndex: number, id: string) => void
  onDelete: (pageIndex: number, id: string) => void
}) {
  const { annotation, pageIndex, displayNumber } = thread
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    onAddMessage(pageIndex, annotation.id, text)
    setDraft("")
  }

  const isEmpty = annotation.messages.length === 0
  const replyPlaceholder = isEmpty ? "Escribe un comentario..." : "Responder..."

  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-3 transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
        annotation.resolved && "opacity-70",
      )}
      onClick={() => onSelect(thread)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onSelect(thread)
      }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Pág. {displayNumber}
        </span>
        {annotation.resolved && (
          <span className="flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Check className="size-2.5" />
            Resuelto
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {!isEmpty && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleResolved(pageIndex, annotation.id)
                    }}
                    aria-label={annotation.resolved ? "Reabrir comentario" : "Marcar como resuelto"}
                  >
                    {annotation.resolved ? <RotateCcw /> : <Check />}
                  </Button>
                }
              />
              <TooltipContent>{annotation.resolved ? "Reabrir" : "Resolver"}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(pageIndex, annotation.id)
                  }}
                  aria-label="Eliminar comentario"
                >
                  <Trash2 />
                </Button>
              }
            />
            <TooltipContent>Eliminar</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {annotation.messages.length > 0 && (
        <div className="mb-2 flex flex-col gap-3">
          {annotation.messages.map((msg) => (
            <div key={msg.id} className="flex gap-2">
              <Avatar name={msg.author} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate text-xs font-semibold text-foreground">{msg.author}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(msg.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!annotation.resolved && (
        <>
          {!isEmpty && <Separator className="my-2" />}
          <div className="flex items-end gap-1.5">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={1}
              placeholder={replyPlaceholder}
              aria-label={replyPlaceholder}
              className="max-h-28 min-h-8 flex-1 resize-none rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
            <Button
              size="icon"
              className="size-8 shrink-0"
              disabled={!draft.trim()}
              onClick={(e) => {
                e.stopPropagation()
                submit()
              }}
              aria-label="Enviar comentario"
            >
              <CornerDownLeft />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
