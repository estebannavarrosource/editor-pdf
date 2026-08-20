"use client"

import { useEffect, useRef, useState } from "react"
import SignaturePad from "signature_pad"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Eraser } from "lucide-react"

interface SignatureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (dataUrl: string) => void
}

const SIGNATURE_FONTS = ["cursive", "sans-serif", "serif"]

export function SignatureDialog({ open, onOpenChange, onConfirm }: SignatureDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const [typedText, setTypedText] = useState("")
  const [fontIndex, setFontIndex] = useState(0)
  const [mode, setMode] = useState("draw")

  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return

    function resize() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const rect = canvas!.getBoundingClientRect()
      canvas!.width = rect.width * ratio
      canvas!.height = rect.height * ratio
      canvas!.getContext("2d")?.scale(ratio, ratio)
    }
    resize()

    padRef.current = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#111827",
    })

    window.addEventListener("resize", resize)
    return () => {
      window.removeEventListener("resize", resize)
      padRef.current?.off()
      padRef.current = null
    }
  }, [open])

  const handleClear = () => {
    padRef.current?.clear()
  }

  const handleConfirm = () => {
    if (mode === "draw") {
      const pad = padRef.current
      if (!pad || pad.isEmpty()) return
      onConfirm(pad.toDataURL("image/png"))
    } else {
      if (!typedText.trim()) return
      const dataUrl = renderTypedSignature(typedText, SIGNATURE_FONTS[fontIndex])
      onConfirm(dataUrl)
    }
    onOpenChange(false)
    setTypedText("")
    padRef.current?.clear()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear firma</DialogTitle>
          <DialogDescription>Dibuja o escribe tu firma para colocarla en el documento.</DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="w-full">
            <TabsTrigger value="draw" className="flex-1">
              Dibujar
            </TabsTrigger>
            <TabsTrigger value="type" className="flex-1">
              Escribir
            </TabsTrigger>
          </TabsList>
          <TabsContent value="draw" className="mt-3">
            <div className="relative h-40 w-full overflow-hidden rounded-md border border-border bg-white">
              <canvas ref={canvasRef} className="h-full w-full touch-none" />
              <div className="pointer-events-none absolute bottom-3 left-4 right-4 border-b border-dashed border-muted-foreground/40" />
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={handleClear}>
              <Eraser data-icon="inline-start" />
              Limpiar
            </Button>
          </TabsContent>
          <TabsContent value="type" className="mt-3 flex flex-col gap-3">
            <Input
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder="Escribe tu nombre"
              autoFocus
            />
            <div className="flex gap-2">
              {SIGNATURE_FONTS.map((font, i) => (
                <button
                  key={font}
                  type="button"
                  onClick={() => setFontIndex(i)}
                  className={`flex-1 rounded-md border px-3 py-3 text-lg ${
                    fontIndex === i ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  style={{ fontFamily: font }}
                >
                  {typedText.trim() || "Firma"}
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>Usar firma</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function renderTypedSignature(text: string, fontFamily: string): string {
  const canvas = document.createElement("canvas")
  canvas.width = 600
  canvas.height = 200
  const ctx = canvas.getContext("2d")!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = "#111827"
  ctx.font = `56px ${fontFamily}`
  ctx.textBaseline = "middle"
  ctx.textAlign = "center"
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  return canvas.toDataURL("image/png")
}
