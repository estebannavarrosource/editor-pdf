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

// Static asset locations for pdf.js's `getDocument()` call, copied from the
// installed pdfjs-dist package into /public (see the wasm/cmaps/standard_fonts
// folders under public/pdfjs/). Without `wasmUrl`, pdf.js can't load the WASM
// module (or its JS fallback) it needs to decode CCITT/JBIG2-encoded images —
// the compression almost every black-and-white scanned document uses. The
// worker silently fails to load the codec and the scanned page's image is
// never resolved, rendering as a permanently blank page. `cMapUrl` and
// `standardFontDataUrl` are included too so embedded CJK/subset fonts and
// glyphs missing from an embedded font also render correctly.
export const PDFJS_DOCUMENT_OPTIONS = {
  wasmUrl: "/pdfjs/wasm/",
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
}

export type PdfjsDocument = pdfjsLib.PDFDocumentProxy
export type PdfjsPage = pdfjsLib.PDFPageProxy
