"use client"

import dynamic from "next/dynamic"

const PdfEditor = dynamic(() => import("@/components/pdf-editor/pdf-editor").then((mod) => mod.PdfEditor), {
  ssr: false,
})

export function PdfEditorClient() {
  return <PdfEditor />
}
