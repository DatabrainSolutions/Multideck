/**
 * Reads the text layer from a PDF before sending it to the extraction service.
 *
 * This is deliberately only a fast path: image-only or malformed PDFs return
 * null and are uploaded for server-side OCR instead.
 */
const maxEmbeddedTextCharacters = 160_000
const minimumUsefulCharacters = 240
const minimumUsefulWords = 30

export type EmbeddedPdfText = {
  text: string
  pageCount: number
}

export async function extractEmbeddedPdfText(file: File): Promise<EmbeddedPdfText | null> {
  try {
    const [pdf, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ])
    const { getDocument, GlobalWorkerOptions } = pdf
    GlobalWorkerOptions.workerSrc = worker.default

    const loadingTask = getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useSystemFonts: true,
    })
    const document = await loadingTask.promise

    try {
      const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
        const pageNumber = index + 1
        const page = await document.getPage(pageNumber)
        try {
          const content = await page.getTextContent()
          const pageText = content.items.map((item) => {
            if (!("str" in item)) return ""
            return `${item.str}${item.hasEOL ? "\\n" : " "}`
          }).join("").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim()
          return `--- Page ${pageNumber} ---\n${pageText}`
        } finally {
          page.cleanup()
        }
      }))

      const text = pages.join("\n\n").slice(0, maxEmbeddedTextCharacters)
      return hasUsableEmbeddedPdfText(text) ? { text, pageCount: pages.length } : null
    } finally {
      await loadingTask.destroy()
    }
  } catch {
    return null
  }
}

export function hasUsableEmbeddedPdfText(text: string) {
  const normalized = text.replace(/--- Page \d+ ---/g, " ").trim()
  if (normalized.length < minimumUsefulCharacters) return false
  const words = normalized.match(/[\p{L}\p{N}][\p{L}\p{N}.,'’/&+()-]*/gu) ?? []
  if (words.length < minimumUsefulWords) return false
  const visibleCharacters = normalized.replace(/\s/g, "")
  if (!visibleCharacters.length) return false
  return (visibleCharacters.match(/�/g) ?? []).length / visibleCharacters.length < 0.01
}
