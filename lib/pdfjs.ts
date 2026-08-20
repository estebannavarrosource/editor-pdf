"use client"

import * as pdfjsLib from "pdfjs-dist"

let configured = false

export function getPdfjs() {
  if (!configured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
    configured = true
  }
  return pdfjsLib
}

export type PdfjsDocument = pdfjsLib.PDFDocumentProxy
export type PdfjsPage = pdfjsLib.PDFPageProxy
