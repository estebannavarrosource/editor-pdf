"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  FileText,
  Upload,
  FilePlus2,
  ImagePlus,
  Highlighter,
  Signature,
  Search,
  ScanText,
  Layers,
  FileOutput,
  Clock,
  ArrowRight,
  ShieldCheck,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ACCEPTED_IMPORT_TYPES, isSupportedImportFile } from "@/lib/pdf-import"
import { peekSessionMeta, clearSession } from "@/lib/pdf-session"

interface HomeScreenProps {
  onFilesSelected: (files: File[]) => void
  onCreateNew: () => void
  onContinue: () => void
  error?: string | null
}

const FEATURES = [
  { icon: Highlighter, title: "Anotar y resaltar", desc: "Texto, formas, notas y dibujo a mano alzada." },
  { icon: Signature, title: "Firmar documentos", desc: "Dibuja o coloca tu firma en cualquier página." },
  { icon: Search, title: "Buscar en el texto", desc: "Encuentra y navega coincidencias al instante." },
  { icon: ScanText, title: "OCR de escaneados", desc: "Reconoce texto en documentos escaneados." },
  { icon: Layers, title: "Gestionar páginas", desc: "Reordena, rota, duplica, inserta o extrae." },
  { icon: FileOutput, title: "Exportar", desc: "Guarda como PDF, Word o imagen." },
]

export function HomeScreen({ onFilesSelected, onCreateNew, onContinue, error }: HomeScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [recent, setRecent] = useState<{ fileName: string | null; savedAt: number } | null>(null)

  useEffect(() => {
    peekSessionMeta().then(setRecent)
  }, [])

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return
      const valid = Array.from(files).filter(isSupportedImportFile)
      if (valid.length > 0) onFilesSelected(valid)
    },
    [onFilesSelected],
  )

  const discardRecent = useCallback(async () => {
    await clearSession()
    setRecent(null)
  }, [])

  return (
    <div
      className="flex h-dvh flex-col overflow-y-auto bg-background"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
    >
      {/* App bar */}
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dga-logo.png"
            alt="Ministerio de Obras Públicas — Dirección General de Aguas"
            className="h-11 w-auto rounded-sm bg-white p-1 ring-1 ring-border"
          />
          <div className="border-l border-border pl-3 leading-none">
            <p className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <span className="flex size-5 items-center justify-center rounded bg-primary text-primary-foreground">
                <FileText className="size-3" />
              </span>
              DGA-PDF
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Editor de documentos · Dirección General de Aguas</p>
          </div>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground sm:flex">
          <ShieldCheck className="size-3.5 text-primary" />
          Todo se procesa en tu navegador
        </span>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-pretty text-3xl font-semibold tracking-tight sm:text-4xl">
            Trabaja tus PDF de principio a fin
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Abre un documento, empieza uno en blanco o convierte imágenes en páginas. Anota, firma, busca, aplica OCR
            y exporta, sin instalar nada.
          </p>
        </div>

        {/* Continue card */}
        {recent && (
          <div className="mx-auto mt-6 flex max-w-2xl items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <Clock className="size-5" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium">{recent.fileName ?? "Documento sin título"}</p>
              <p className="text-xs text-muted-foreground">
                Continúa donde lo dejaste · {new Date(recent.savedAt).toLocaleString("es")}
              </p>
            </div>
            <Button size="sm" onClick={onContinue}>
              Continuar
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={discardRecent}
              aria-label="Descartar sesión guardada"
            >
              <X className="size-4" />
            </Button>
          </div>
        )}

        {/* Primary actions */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {/* Open / drop */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "group flex flex-col items-start gap-3 rounded-xl border-2 border-dashed border-border bg-card p-5 text-left transition-colors md:col-span-1",
              "hover:border-primary hover:bg-primary/5",
              dragging && "border-primary bg-primary/5",
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Upload className="size-5" />
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-semibold">Abrir o arrastrar</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">
                Suelta un PDF aquí o haz clic para elegirlo desde tu equipo.
              </span>
            </span>
          </button>

          {/* Create blank */}
          <button
            type="button"
            onClick={onCreateNew}
            className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-primary/5"
          >
            <span className="flex size-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <FilePlus2 className="size-5" />
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-semibold">Crear PDF en blanco</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">
                Elige tamaño y orientación y empieza desde cero.
              </span>
            </span>
          </button>

          {/* Import images */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-primary/5"
          >
            <span className="flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <ImagePlus className="size-5" />
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-semibold">Importar imágenes</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">
                Convierte PNG, JPG o WEBP en páginas PDF.
              </span>
            </span>
          </button>
        </div>

        {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}

        {/* Features */}
        <div className="mt-10">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Todo lo que puedes hacer</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <f.icon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Drag overlay hint */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-card px-8 py-6 text-center shadow-lg">
            <Upload className="mx-auto size-8 text-primary" />
            <p className="mt-2 text-sm font-medium">Suelta para abrir</p>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMPORT_TYPES}
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
}
