import type { PdfjsPage } from "./pdfjs"

/** Viewport used to translate between screen pixels and PDF user-space points. */
export type PageViewportLike = ReturnType<PdfjsPage["getViewport"]>

export function getTotalRotation(page: PdfjsPage, extraRotation: number): number {
  return (((page.rotate ?? 0) + extraRotation) % 360 + 360) % 360
}

export function toPdfPoint(viewport: PageViewportLike, x: number, y: number) {
  const [px, py] = viewport.convertToPdfPoint(x, y)
  return { x: px, y: py }
}

export function toViewportPoint(viewport: PageViewportLike, x: number, y: number) {
  const [vx, vy] = viewport.convertToViewportPoint(x, y)
  return { x: vx, y: vy }
}

/** Converts a PDF-space rect (bottom-left origin) into a screen rect (top-left origin, positive w/h). */
export function pdfRectToViewportRect(
  viewport: PageViewportLike,
  rect: { x: number; y: number; width: number; height: number },
) {
  const p1 = toViewportPoint(viewport, rect.x, rect.y)
  const p2 = toViewportPoint(viewport, rect.x + rect.width, rect.y + rect.height)
  const left = Math.min(p1.x, p2.x)
  const top = Math.min(p1.y, p2.y)
  const width = Math.abs(p2.x - p1.x)
  const height = Math.abs(p2.y - p1.y)
  return { left, top, width, height }
}

/** Converts a screen rect (top-left origin) into a PDF-space rect (bottom-left origin, positive w/h). */
export function viewportRectToPdfRect(
  viewport: PageViewportLike,
  rect: { left: number; top: number; width: number; height: number },
) {
  const p1 = toPdfPoint(viewport, rect.left, rect.top)
  const p2 = toPdfPoint(viewport, rect.left + rect.width, rect.top + rect.height)
  const x = Math.min(p1.x, p2.x)
  const y = Math.min(p1.y, p2.y)
  const width = Math.abs(p2.x - p1.x)
  const height = Math.abs(p2.y - p1.y)
  return { x, y, width, height }
}
