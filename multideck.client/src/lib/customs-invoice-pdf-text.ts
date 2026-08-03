import type { EvidenceBlock, EvidencePage } from "@/lib/customs-invoice-evidence"

const maxEmbeddedTextCharacters = 160_000
const minimumUsefulCharacters = 240
const minimumUsefulWords = 30
const maxEvidencePages = 30
const maxRowsPerPage = 600
/** How far a fragment's centre may sit from a row's centre and still belong to that row. */
const rowMergeTolerance = 0.5
/** Fragments closer than this share of the text height belong to the same word. */
const wordGapTolerance = 0.25

export type EmbeddedPdfText = {
  text: string
  pageCount: number
  /** One block per rendered text row, so a reviewed line can be pointed at on the page. */
  pages: EvidencePage[]
}

type TextFragment = {
  text: string
  left: number
  top: number
  right: number
  bottom: number
}

type PageGeometry = {
  width: number
  height: number
  transform: number[]
}

export async function extractEmbeddedPdfText(file: File): Promise<EmbeddedPdfText | null> {
  try {
    const [pdf, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ])
    const { getDocument, GlobalWorkerOptions, Util } = pdf
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
          const viewport = page.getViewport({ scale: 1 })
          const pageText = content.items.map((item) => {
            if (!("str" in item)) return ""
            return `${item.str}${item.hasEOL ? "\n" : " "}`
          }).join("").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim()
          const geometry = { width: viewport.width, height: viewport.height, transform: viewport.transform }
          const rows = pageNumber <= maxEvidencePages
            ? buildTextRowPage(pageNumber, geometry, content.items, Util.transform)
            : null
          return { text: `--- Page ${pageNumber} ---\n${pageText}`, rows }
        } finally {
          page.cleanup()
        }
      }))

      const text = pages.map((page) => page.text).join("\n\n").slice(0, maxEmbeddedTextCharacters)
      if (!hasUsableEmbeddedPdfText(text)) return null
      return {
        text,
        pageCount: pages.length,
        pages: pages.flatMap((page) => (page.rows ? [page.rows] : [])),
      }
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
  const replacementCharacters = (visibleCharacters.match(/�/g) ?? []).length
  return replacementCharacters / visibleCharacters.length < 0.01
}

/**
 * Groups the page's text fragments into the rows a reader would see, then stores each row
 * as a page-fraction box. Row boxes are what let the review screen highlight one invoice
 * line on the document the operator recognises.
 */
export function buildTextRowPage(
  page: number,
  geometry: PageGeometry,
  items: unknown[],
  transformPoint: (first: number[], second: number[]) => number[],
): EvidencePage | null {
  if (!(geometry.width > 0) || !(geometry.height > 0)) return null

  const fragments: TextFragment[] = []
  for (const item of items) {
    const fragment = readFragment(item, geometry, transformPoint)
    if (fragment) fragments.push(fragment)
  }
  if (!fragments.length) return null

  const blocks = groupFragmentRows(fragments)
    .slice(0, maxRowsPerPage)
    .map((row, index) => rowToBlock(page, index, row, geometry))
    .filter((block): block is EvidenceBlock => block !== null)
  if (!blocks.length) return null

  return { page, width: Math.round(geometry.width), height: Math.round(geometry.height), blocks }
}

function readFragment(
  item: unknown,
  geometry: PageGeometry,
  transformPoint: (first: number[], second: number[]) => number[],
): TextFragment | null {
  if (!item || typeof item !== "object") return null
  const candidate = item as { str?: unknown; transform?: unknown; width?: unknown; height?: unknown }
  if (typeof candidate.str !== "string" || !candidate.str.trim()) return null
  if (!Array.isArray(candidate.transform)) return null

  const placed = transformPoint(geometry.transform, candidate.transform as number[])
  const height = Math.hypot(placed[2], placed[3]) || numberOr(candidate.height, 0)
  const width = Math.max(numberOr(candidate.width, 0), 0.5)
  if (!(height > 0) || !Number.isFinite(placed[4]) || !Number.isFinite(placed[5])) return null

  const left = placed[4]
  // The viewport transform puts the baseline in top-down page space, so the row starts a line above it.
  const top = placed[5] - height
  return { text: candidate.str, left, top, right: left + width, bottom: top + height }
}

function groupFragmentRows(fragments: TextFragment[]) {
  const ordered = [...fragments].sort((left, right) => left.top - right.top || left.left - right.left)
  const rows: TextFragment[][] = []

  for (const fragment of ordered) {
    const current = rows.at(-1)
    if (current && sharesRow(current, fragment)) current.push(fragment)
    else rows.push([fragment])
  }

  return rows.map((row) => [...row].sort((left, right) => left.left - right.left))
}

function sharesRow(row: TextFragment[], fragment: TextFragment) {
  const rowTop = Math.min(...row.map((entry) => entry.top))
  const rowBottom = Math.max(...row.map((entry) => entry.bottom))
  const rowCentre = (rowTop + rowBottom) / 2
  const fragmentCentre = (fragment.top + fragment.bottom) / 2
  const shortest = Math.min(rowBottom - rowTop, fragment.bottom - fragment.top)
  return Math.abs(fragmentCentre - rowCentre) <= rowMergeTolerance * shortest
}

function rowToBlock(page: number, index: number, row: TextFragment[], geometry: PageGeometry): EvidenceBlock | null {
  const left = Math.min(...row.map((fragment) => fragment.left))
  const top = Math.min(...row.map((fragment) => fragment.top))
  const right = Math.max(...row.map((fragment) => fragment.right))
  const bottom = Math.max(...row.map((fragment) => fragment.bottom))
  const height = bottom - top
  if (!(right > left) || !(height > 0)) return null

  const text = row.reduce((joined, fragment, fragmentIndex) => {
    if (!fragmentIndex) return fragment.text
    const previous = row[fragmentIndex - 1]
    // A word split across fragments has no visible gap, so joining it keeps codes such as SKU-44 whole.
    const separator = fragment.left - previous.right > wordGapTolerance * height ? " " : ""
    return `${joined}${separator}${fragment.text}`
  }, "").replace(/\s{2,}/g, " ").trim()
  if (!text) return null

  const x = fraction(left / geometry.width)
  const y = fraction(top / geometry.height)
  return {
    id: `row-${page}-${index + 1}`,
    type: "line",
    text,
    box: {
      x,
      y,
      width: fraction((right - left) / geometry.width, 1 - x),
      height: fraction(height / geometry.height, 1 - y),
    },
  }
}

function fraction(value: number, max = 1) {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.min(Math.max(value, 0), max) * 100_000) / 100_000
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}
