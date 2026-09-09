/**
 * Every Drive upload is previewed in the browser before it is stored, so a tile
 * shows the real file rather than a generic glyph.
 *
 * Two artefacts come out of one decode:
 *
 * - `thumbnail`: a 640px WebP stored beside the original. It is what the operator
 *   actually looks at, and it is a fraction of the original's weight.
 * - `seed`: a ~20px WebP inlined as a data URI on the file row. It ships with the
 *   folder listing, so a tile can paint the file's own colours on its first frame
 *   while the signed thumbnail URL is still being issued. The swap between the two
 *   is a cross-fade over the same box, which is why there is no flash.
 *
 * Decoding happens through `createImageBitmap` and, where the browser has it, an
 * `OffscreenCanvas`, keeping the resize off the main thread's paint path.
 */

const thumbnailMaxEdge = 640
const seedMaxEdge = 20
const seedMaxLength = 3_900

export type DrivePreview = {
  thumbnail: Blob | null
  seed: string | null
  width: number | null
  height: number | null
}

export const emptyDrivePreview: DrivePreview = { thumbnail: null, seed: null, width: null, height: null }

export type DriveFileKind = "image" | "vector" | "pdf" | "video" | "audio" | "sheet" | "slides" | "document" | "archive" | "font" | "text" | "other"

export function driveFileKind(mimeType: string, name = ""): DriveFileKind {
  const type = mimeType.toLowerCase()
  const extension = name.toLowerCase().split(".").at(-1) ?? ""

  if (type === "image/svg+xml") return "vector"
  if (type.startsWith("image/")) return "image"
  if (type === "application/pdf") return "pdf"
  if (type.startsWith("video/")) return "video"
  if (type.startsWith("audio/")) return "audio"
  if (type.startsWith("font/") || ["woff2", "woff", "ttf", "otf"].includes(extension)) return "font"
  if (type.includes("spreadsheet") || type.includes("ms-excel") || ["csv", "xlsx", "xls"].includes(extension)) return "sheet"
  if (type.includes("presentation") || type.includes("powerpoint") || ["pptx", "ppt", "key"].includes(extension)) return "slides"
  if (type.includes("word") || type.includes("opendocument.text") || ["docx", "doc", "rtf"].includes(extension)) return "document"
  if (type.includes("zip") || type.includes("compressed") || ["zip", "rar", "7z", "tar", "gz"].includes(extension)) return "archive"
  if (type.startsWith("text/") || type === "application/json") return "text"
  return "other"
}

/** Files whose first frame or first page is worth rendering. */
export function canPreviewDriveFile(mimeType: string, name = "") {
  return ["image", "vector", "pdf", "video"].includes(driveFileKind(mimeType, name))
}

type Drawable = ImageBitmap | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement

function sourceSize(source: Drawable) {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight }
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth || 0, height: source.naturalHeight || 0 }
  return { width: source.width, height: source.height }
}

function fitInside(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

type Surface = { canvas: OffscreenCanvas | HTMLCanvasElement; context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D }

function createSurface(width: number, height: number): Surface | null {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext("2d", { alpha: true })
    if (context) return { canvas, context }
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { alpha: true })
  return context ? { canvas, context } : null
}

async function surfaceToBlob(surface: Surface, quality: number) {
  if (surface.canvas instanceof OffscreenCanvas) {
    return surface.canvas.convertToBlob({ type: "image/webp", quality })
  }

  const canvas = surface.canvas
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality))
}

async function drawScaled(source: Drawable, maxEdge: number, quality: number) {
  const { width, height } = sourceSize(source)
  if (!width || !height) return null

  const target = fitInside(width, height, maxEdge)
  const surface = createSurface(target.width, target.height)
  if (!surface) return null

  surface.context.imageSmoothingEnabled = true
  surface.context.imageSmoothingQuality = "high"
  surface.context.drawImage(source as CanvasImageSource, 0, 0, target.width, target.height)

  const blob = await surfaceToBlob(surface, quality)
  return blob ? { blob, ...target } : null
}

async function blobToDataUrl(blob: Blob) {
  const reader = new FileReader()
  return new Promise<string | null>((resolve) => {
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

/** The tiny inline preview. Quality is deliberately low; it is only ever seen blurred. */
async function buildSeed(source: Drawable) {
  const scaled = await drawScaled(source, seedMaxEdge, 0.5)
  if (!scaled) return null

  const dataUrl = await blobToDataUrl(scaled.blob)
  if (!dataUrl || dataUrl.length > seedMaxLength) return null
  return dataUrl
}

async function previewFromDrawable(source: Drawable, intrinsic?: { width: number; height: number }): Promise<DrivePreview> {
  const size = intrinsic ?? sourceSize(source)
  const [thumbnail, seed] = await Promise.all([drawScaled(source, thumbnailMaxEdge, 0.82), buildSeed(source)])

  return {
    thumbnail: thumbnail?.blob ?? null,
    seed,
    width: size.width || null,
    height: size.height || null,
  }
}

async function loadImageElement(url: string, fallbackEdge = 512) {
  const image = new Image()
  image.decoding = "async"
  image.src = url

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("The image could not be decoded."))
  })

  // An SVG with only a viewBox reports no intrinsic size. Give it a square box so
  // it still renders instead of failing the draw.
  if (!image.naturalWidth || !image.naturalHeight) {
    image.width = fallbackEdge
    image.height = fallbackEdge
  }

  return image
}

async function imagePreview(file: File): Promise<DrivePreview> {
  try {
    const bitmap = await createImageBitmap(file)
    try {
      return await previewFromDrawable(bitmap)
    } finally {
      bitmap.close()
    }
  } catch {
    // Safari refuses some formats through createImageBitmap; the element path
    // handles those, and SVG always goes through it.
    return elementImagePreview(file)
  }
}

async function elementImagePreview(file: File): Promise<DrivePreview> {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImageElement(url)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    return previewFromDrawable(image, { width, height })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function pdfPreview(file: File): Promise<DrivePreview> {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ])
  GlobalWorkerOptions.workerSrc = worker.default

  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true })

  try {
    const pdf = await task.promise
    const page = await pdf.getPage(1)
    try {
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(thumbnailMaxEdge / Math.max(base.width, base.height), 3) })
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(viewport.width))
      canvas.height = Math.max(1, Math.round(viewport.height))

      // A page rendered onto transparency reads as a grey smear once scaled down,
      // so the sheet is painted white first.
      const context = canvas.getContext("2d")
      if (context) {
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, canvas.width, canvas.height)
      }

      await page.render({ canvas, viewport }).promise
      // Awaited inside the try so the page and worker are only torn down once the
      // scaled copies have been read off the canvas.
      return await previewFromDrawable(canvas, { width: Math.round(base.width), height: Math.round(base.height) })
    } finally {
      page.cleanup()
    }
  } finally {
    // Tears down the worker as well as the document, so one preview does not leave
    // a thread behind for the rest of the session.
    await task.destroy()
  }
}

async function videoPreview(file: File): Promise<DrivePreview> {
  const url = URL.createObjectURL(file)
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.preload = "metadata"
  video.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      const fail = () => reject(new Error("The video could not be read."))
      video.onloadedmetadata = () => resolve()
      video.onerror = fail
    })

    // The very first frame of a video is often black. A short way in is
    // representative without being slow to seek.
    const target = Number.isFinite(video.duration) ? Math.min(video.duration * 0.1, 1) : 0
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve()
      video.onerror = () => reject(new Error("The video frame could not be read."))
      video.currentTime = target
    })

    return previewFromDrawable(video)
  } finally {
    video.removeAttribute("src")
    video.load()
    URL.revokeObjectURL(url)
  }
}

/**
 * Never throws: a file that cannot be previewed still uploads, it just shows its
 * type glyph instead of a picture.
 */
export async function createDrivePreview(file: File): Promise<DrivePreview> {
  try {
    switch (driveFileKind(file.type, file.name)) {
      case "image":
        return await imagePreview(file)
      case "vector":
        return await elementImagePreview(file)
      case "pdf":
        return await pdfPreview(file)
      case "video":
        return await videoPreview(file)
      default:
        return emptyDrivePreview
    }
  } catch {
    return emptyDrivePreview
  }
}
