export type ToolId =
  | "select"
  | "pan"
  | "highlight"
  | "underline"
  | "strikethrough"
  | "ink"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "line"
  | "text"
  | "sign"
  | "eraser"

export interface RectSelection {
  pageIndex: number
  /** PDF user-space points (bottom-left origin), independent of zoom/rotation */
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  /** PDF user-space points (bottom-left origin) */
  x: number
  y: number
}

interface BaseAnnotation {
  id: string
  /** Stable original page index this annotation belongs to */
  pageIndex: number
  color: string
  createdAt: number
}

export interface HighlightAnnotation extends BaseAnnotation {
  type: "highlight" | "underline" | "strikethrough"
  rects: RectSelection[]
  opacity: number
}

export interface InkAnnotation extends BaseAnnotation {
  type: "ink"
  /** Each stroke is a list of normalized points (0-1 relative to page) */
  strokes: Point[][]
  strokeWidth: number
}

export interface ShapeAnnotation extends BaseAnnotation {
  type: "rectangle" | "ellipse" | "line" | "arrow"
  x: number
  y: number
  width: number
  height: number
  strokeWidth: number
  fill: boolean
}

export interface TextBoxAnnotation extends BaseAnnotation {
  type: "text"
  x: number
  y: number
  width: number
  height: number
  text: string
  fontSize: number
}

export interface SignatureAnnotation extends BaseAnnotation {
  type: "sign"
  x: number
  y: number
  width: number
  height: number
  dataUrl: string
}

export type Annotation =
  | HighlightAnnotation
  | InkAnnotation
  | ShapeAnnotation
  | TextBoxAnnotation
  | SignatureAnnotation

export interface PageState {
  /** Original index in the source document (stable identity) */
  originalIndex: number
  rotation: 0 | 90 | 180 | 270
  deleted: boolean
  width: number
  height: number
}

export interface FormFieldValue {
  name: string
  value: string | boolean | string[]
}
