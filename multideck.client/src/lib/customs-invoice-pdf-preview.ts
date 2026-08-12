/**
 * Renders the operator's own PDF to page images in the browser so the review screen can
 * show the document the boxes belong to. The file never leaves the tab for this.
 */

const defaultTargetWidth = 1_200
const defaultMaxPages = 30

export type RenderedPdfPage = {
  page: number
  width: number
  height: number
  url: string
}

export type RenderPdfPagesOptions = {
  maxPages?: number
  targetWidth?: number
  signal?: AbortSignal
  onPage?: (page: RenderedPdfPage) => void
}

export async function renderPdfPageImages(file: Blob, options: RenderPdfPagesOptions = {}): Promise<RenderedPdfPage[]> {
  const { maxPages = defaultMaxPages, targetWidth = defaultTargetWidth, signal, onPage } = options
  const rendered: RenderedPdfPage[] = []

  try {
    const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ])
    GlobalWorkerOptions.workerSrc = worker.default

    const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true })
    const document = await loadingTask.promise

    try {
      const pageCount = Math.min(document.numPages, maxPages)
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        if (signal?.aborted) break
        const page = await document.getPage(pageNumber)
        try {
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: Math.min(targetWidth / base.width, 4) })
          const canvas = globalThis.document.createElement("canvas")
          canvas.width = Math.max(1, Math.round(viewport.width))
          canvas.height = Math.max(1, Math.round(viewport.height))

          await page.render({ canvas, viewport }).promise
          if (signal?.aborted) break

          const url = await canvasUrl(canvas)
          if (!url) continue
          const image = { page: pageNumber, width: canvas.width, height: canvas.height, url }
          rendered.push(image)
          onPage?.(image)
        } finally {
          page.cleanup()
        }
      }
    } finally {
      await loadingTask.destroy()
    }
  } catch {
    return rendered
  }

  return rendered
}

export function releasePdfPageImages(pages: RenderedPdfPage[]) {
  pages.forEach((page) => {
    if (page.url.startsWith("blob:")) URL.revokeObjectURL(page.url)
  })
}

function canvasUrl(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ""), "image/webp", 0.86)
  })
}
