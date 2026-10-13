import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from "pdf-lib"

export type CompressionLevel = "low" | "medium" | "high"

export interface CompressionResult {
  bytes: Uint8Array
  originalSize: number
  compressedSize: number
  imagesRecompressed: number
  imagesSkipped: number
}

interface LevelConfig {
  /** Images wider/taller than this (in px) get downscaled. Infinity = never downscale. */
  maxDimension: number
  /** JPEG re-encode quality, 0-1. */
  quality: number
  /** Convert every recompressed image to grayscale. */
  grayscale: boolean
  /** Whether images are touched at all. */
  recompressImages: boolean
}

const LEVEL_CONFIG: Record<CompressionLevel, LevelConfig> = {
  // Máxima calidad visual: solo se limpian metadatos y estructura, las imágenes no se tocan.
  low: { maxDimension: Number.POSITIVE_INFINITY, quality: 0.92, grayscale: false, recompressImages: false },
  // Equilibrio peso/calidad: baja ligeramente la resolución, ideal para email.
  medium: { maxDimension: 1600, quality: 0.75, grayscale: false, recompressImages: true },
  // Máxima reducción: resolución equivalente a ~72 PPI y escala de grises.
  high: { maxDimension: 900, quality: 0.45, grayscale: true, recompressImages: true },
}

const FILTER_NAME = PDFName.of("Filter")
const SUBTYPE_NAME = PDFName.of("Subtype")
const IMAGE_NAME = PDFName.of("Image")
const WIDTH_NAME = PDFName.of("Width")
const HEIGHT_NAME = PDFName.of("Height")
const BPC_NAME = PDFName.of("BitsPerComponent")
const COLORSPACE_NAME = PDFName.of("ColorSpace")
const SMASK_NAME = PDFName.of("SMask")
const MASK_NAME = PDFName.of("Mask")
const XOBJECT_NAME = PDFName.of("XObject")
const DCT_DECODE_NAME = PDFName.of("DCTDecode")
const FLATE_DECODE_NAME = PDFName.of("FlateDecode")
const DEVICE_RGB_NAME = PDFName.of("DeviceRGB")
const DEVICE_GRAY_NAME = PDFName.of("DeviceGray")

function lastFilterName(dict: PDFDict): PDFName | undefined {
  const filter = dict.lookup(FILTER_NAME)
  if (filter instanceof PDFName) return filter
  if (filter instanceof PDFArray) {
    const size = filter.size()
    if (size === 0) return undefined
    const last = filter.lookup(size - 1)
    return last instanceof PDFName ? last : undefined
  }
  return undefined
}

/** Renders a bitmap onto a (possibly downscaled, possibly grayscale) canvas and returns re-encoded JPEG bytes. */
async function reencodeAsJpeg(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  config: LevelConfig,
): Promise<Uint8Array | null> {
  const scale = Math.min(1, config.maxDimension / Math.max(sourceWidth, sourceHeight))
  const outWidth = Math.max(1, Math.round(sourceWidth * scale))
  const outHeight = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = document.createElement("canvas")
  canvas.width = outWidth
  canvas.height = outHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(source, 0, 0, outWidth, outHeight)

  if (config.grayscale) {
    const imageData = ctx.getImageData(0, 0, outWidth, outHeight)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      data[i] = data[i + 1] = data[i + 2] = gray
    }
    ctx.putImageData(imageData, 0, 0)
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", config.quality))
  if (!blob) return null
  return new Uint8Array(await blob.arrayBuffer())
}

/** Decodes an 8-bit DeviceRGB/DeviceGray raw bitmap XObject into a drawable ImageBitmap. */
async function decodeRawBitmap(xobj: PDFRawStream, width: number, height: number): Promise<ImageBitmap | null> {
  const bpc = xobj.dict.lookup(BPC_NAME)
  const bits = bpc instanceof PDFNumber ? bpc.asNumber() : 8
  const colorSpace = xobj.dict.lookup(COLORSPACE_NAME)
  if (bits !== 8 || !(colorSpace instanceof PDFName)) return null
  const channels = colorSpace === DEVICE_RGB_NAME ? 3 : colorSpace === DEVICE_GRAY_NAME ? 1 : 0
  if (channels === 0) return null

  let decoded: Uint8Array
  try {
    decoded = decodePDFRawStream(xobj).decode()
  } catch {
    return null
  }
  if (decoded.length < width * height * channels) return null

  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0, p = 0; i < width * height; i++, p += channels) {
    if (channels === 3) {
      rgba[i * 4] = decoded[p]
      rgba[i * 4 + 1] = decoded[p + 1]
      rgba[i * 4 + 2] = decoded[p + 2]
    } else {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = decoded[p]
    }
    rgba[i * 4 + 3] = 255
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0)
  return createImageBitmap(canvas)
}

/**
 * Attempts to recompress a single image XObject in place. Returns new JPEG
 * bytes on success, or null when the image's encoding isn't supported
 * (indexed/CMYK/1-bit/CCITT/JBIG2/JPX) or it has an alpha mask (re-encoding
 * as JPEG would silently drop transparency).
 */
async function recompressImage(xobj: PDFRawStream, config: LevelConfig): Promise<Uint8Array | null> {
  if (xobj.dict.has(SMASK_NAME) || xobj.dict.has(MASK_NAME)) return null

  const widthObj = xobj.dict.lookup(WIDTH_NAME)
  const heightObj = xobj.dict.lookup(HEIGHT_NAME)
  if (!(widthObj instanceof PDFNumber) || !(heightObj instanceof PDFNumber)) return null
  const width = widthObj.asNumber()
  const height = heightObj.asNumber()
  if (width <= 0 || height <= 0) return null

  const filter = lastFilterName(xobj.dict)

  try {
    if (filter === DCT_DECODE_NAME) {
      const blob = new Blob([xobj.contents], { type: "image/jpeg" })
      const bitmap = await createImageBitmap(blob)
      const out = await reencodeAsJpeg(bitmap, bitmap.width, bitmap.height, config)
      bitmap.close()
      return out
    }
    if (filter === FLATE_DECODE_NAME || filter === undefined) {
      const bitmap = await decodeRawBitmap(xobj, width, height)
      if (!bitmap) return null
      const out = await reencodeAsJpeg(bitmap, bitmap.width, bitmap.height, config)
      bitmap.close()
      return out
    }
  } catch {
    return null
  }
  // CCITTFaxDecode, JBIG2Decode, JPXDecode and anything else: not decodable here.
  return null
}

/**
 * Rebuilds a PDF applying one of three compression presets:
 * - low: strips metadata/unused structure only, images stay untouched.
 * - medium: also downsamples + recompresses images at a balanced quality.
 * - high: aggressively downsamples, lowers quality, and grayscales images.
 */
export async function compressPdf(bytes: ArrayBuffer, level: CompressionLevel): Promise<CompressionResult> {
  const config = LEVEL_CONFIG[level]
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })

  // Metadata/structure cleanup applies to every level.
  doc.setProducer("")
  doc.setCreator("")
  doc.setSubject("")
  doc.setKeywords([])
  doc.catalog.delete(PDFName.of("Metadata"))

  let imagesRecompressed = 0
  let imagesSkipped = 0

  if (config.recompressImages) {
    const pages = doc.getPages()

    // Pass 1: collect every unique image XObject referenced by any page.
    const uniqueImages = new Map<PDFRef, PDFRawStream>()
    for (const page of pages) {
      const resources = page.node.Resources()
      const xobjects = resources?.lookupMaybe(XOBJECT_NAME, PDFDict)
      if (!xobjects) continue
      for (const ref of xobjects.values()) {
        if (!(ref instanceof PDFRef)) continue
        if (uniqueImages.has(ref)) continue
        const candidate = doc.context.lookup(ref)
        if (!(candidate instanceof PDFRawStream)) continue
        const subtype = candidate.dict.lookup(SUBTYPE_NAME)
        if (subtype !== IMAGE_NAME) continue
        uniqueImages.set(ref, candidate)
      }
    }

    // Pass 2: recompress each unique image once.
    const replacements = new Map<PDFRef, PDFRef>()
    for (const [ref, xobj] of uniqueImages) {
      const newBytes = await recompressImage(xobj, config)
      if (!newBytes || newBytes.byteLength >= xobj.contents.byteLength) {
        imagesSkipped++
        continue
      }
      const embedded = await doc.embedJpg(newBytes)
      replacements.set(ref, embedded.ref)
      imagesRecompressed++
    }

    // Pass 3: point every page's XObject entries at the recompressed images.
    if (replacements.size > 0) {
      for (const page of pages) {
        const resources = page.node.Resources()
        const xobjects = resources?.lookupMaybe(XOBJECT_NAME, PDFDict)
        if (!xobjects) continue
        for (const key of xobjects.keys()) {
          const ref = xobjects.get(key)
          if (!(ref instanceof PDFRef)) continue
          const replacement = replacements.get(ref)
          if (replacement) page.node.setXObject(key, replacement)
        }
      }
    }
  }

  const outBytes = await doc.save({ useObjectStreams: true })
  return {
    bytes: outBytes,
    originalSize: bytes.byteLength,
    compressedSize: outBytes.byteLength,
    imagesRecompressed,
    imagesSkipped,
  }
}
