/**
 * Links each extracted invoice line back to the place it was read from on the operator's
 * own document, so the review screen can point at the evidence instead of asking for trust.
 *
 * Both import routes produce the same shape: scanned PDFs return paragraph-level blocks
 * from the extraction service, and text PDFs produce one block per rendered text row in
 * the browser. Boxes are page fractions so they overlay cleanly at any zoom.
 */

export type EvidenceBox = {
  x: number
  y: number
  width: number
  height: number
}

export type EvidenceBlock = {
  id: string
  type: string
  text: string
  box: EvidenceBox
}

export type EvidencePage = {
  page: number
  width: number
  height: number
  blocks: EvidenceBlock[]
}

export type InvoiceLineEvidence = {
  lineId: string
  page: number
  box: EvidenceBox
  /** True when the box was interpolated inside a larger block, such as one row of a table. */
  approximate: boolean
  /** How much of the line's identifying detail was found in that block, from 0 to 1. */
  strength: number
}

export type EvidenceLineInput = {
  id: string
  page: number
  sku: string
  description: string
  quantity: number
  unitPrice: number
}

type Clue = { alternatives: string[]; weight: number }
type Candidate = { key: string; page: number; box: EvidenceBox; approximate: boolean; strength: number }

const minimumStrength = 0.3
const minimumMatchedWeight = 1.5
const otherPagePenalty = 0.8
const rowSliceRatio = 0.7
const maxCandidatesPerLine = 8

/** Words too common in goods descriptions to identify a specific row. */
const ignoredWords = new Set([
  "and", "for", "the", "with", "each", "per", "pcs", "pieces", "unit", "units",
  "item", "items", "new", "set", "sets", "pack", "packs", "type", "size", "colour", "color",
])

export function buildInvoiceLineEvidence(
  lines: EvidenceLineInput[],
  pages: EvidencePage[],
): Record<string, InvoiceLineEvidence> {
  if (!pages.length) return {}

  const ranked = lines
    .map((line) => ({ line, candidates: rankLineCandidates(line, pages) }))
    .sort((left, right) => (right.candidates[0]?.strength ?? 0) - (left.candidates[0]?.strength ?? 0))

  const claimed = new Set<string>()
  const evidence: Record<string, InvoiceLineEvidence> = {}

  // Confident lines claim their block first so two similar rows cannot point at the same place.
  for (const { line, candidates } of ranked) {
    const candidate = candidates.find((option) => !claimed.has(option.key))
    if (!candidate) continue
    claimed.add(candidate.key)
    evidence[line.id] = {
      lineId: line.id,
      page: candidate.page,
      box: candidate.box,
      approximate: candidate.approximate,
      strength: Math.round(candidate.strength * 100) / 100,
    }
  }

  return evidence
}

export function matchInvoiceLineEvidence(line: EvidenceLineInput, pages: EvidencePage[]): InvoiceLineEvidence | null {
  const [candidate] = rankLineCandidates(line, pages)
  if (!candidate) return null
  return {
    lineId: line.id,
    page: candidate.page,
    box: candidate.box,
    approximate: candidate.approximate,
    strength: Math.round(candidate.strength * 100) / 100,
  }
}

function rankLineCandidates(line: EvidenceLineInput, pages: EvidencePage[]): Candidate[] {
  const clues = lineClues(line)
  if (!clues.length) return []

  const candidates: Candidate[] = []

  for (const page of pages) {
    const pageWeight = page.page === line.page ? 1 : otherPagePenalty

    for (const block of page.blocks) {
      if (!block.text) continue
      const blockMatch = scoreClues(clues, block.text)
      // A block's score is the ceiling for any row inside it, so weak blocks can be skipped.
      if (blockMatch.ratio * pageWeight < minimumStrength || blockMatch.matched < minimumMatchedWeight) continue

      const rows = contentRows(block.text)
      const rowMatch = rows.length > 1 ? bestRow(clues, rows) : null

      if (rowMatch && rowMatch.match.ratio >= blockMatch.ratio * rowSliceRatio && rowMatch.match.matched >= minimumMatchedWeight) {
        candidates.push({
          key: `${page.page}:${block.id}:${rowMatch.index}`,
          page: page.page,
          box: sliceRow(block.box, rowMatch.index, rows.length),
          approximate: true,
          strength: rowMatch.match.ratio * pageWeight,
        })
        continue
      }

      candidates.push({
        key: `${page.page}:${block.id}`,
        page: page.page,
        box: block.box,
        approximate: false,
        strength: blockMatch.ratio * pageWeight,
      })
    }
  }

  return candidates
    .sort((left, right) => right.strength - left.strength || boxArea(left.box) - boxArea(right.box))
    .slice(0, maxCandidatesPerLine)
}

function lineClues(line: EvidenceLineInput): Clue[] {
  const clues: Clue[] = []
  const seen = new Set<string>()

  function addClue(alternatives: string[], weight: number) {
    const unique = alternatives.filter((alternative) => alternative && !seen.has(alternative))
    if (!unique.length) return
    unique.forEach((alternative) => seen.add(alternative))
    clues.push({ alternatives: unique, weight })
  }

  tokenise(line.sku, 2).forEach((token) => addClue([token], 3))
  tokenise(line.description, 3).filter((token) => !ignoredWords.has(token)).forEach((token) => addClue([token], 1))
  addClue(numberAlternatives(line.quantity * line.unitPrice), 0.9)
  addClue(numberAlternatives(line.unitPrice), 0.6)
  addClue(numberAlternatives(line.quantity), 0.5)

  return clues
}

function scoreClues(clues: Clue[], text: string) {
  const tokens = new Set(tokenise(text, 1))
  let total = 0
  let matched = 0

  for (const clue of clues) {
    total += clue.weight
    if (clue.alternatives.some((alternative) => tokens.has(alternative))) matched += clue.weight
  }

  return { matched, ratio: total ? matched / total : 0 }
}

function bestRow(clues: Clue[], rows: string[]) {
  return rows.reduce<{ index: number; match: ReturnType<typeof scoreClues> } | null>((best, row, index) => {
    const match = scoreClues(clues, row)
    return !best || match.ratio > best.match.ratio ? { index, match } : best
  }, null)
}

/** Rows in a transcribed table share the block's height evenly, which is close enough to point at one. */
function sliceRow(box: EvidenceBox, index: number, rowCount: number): EvidenceBox {
  const height = box.height / rowCount
  return { x: box.x, y: box.y + index * height, width: box.width, height }
}

function contentRows(text: string) {
  return text.split("\n").map((row) => row.trim()).filter((row) => row && !isTableRule(row))
}

/** Matches the `| --- | --- |` divider that carries no height on the page. */
function isTableRule(row: string) {
  return row.includes("-") && /^[|\s:+-]+$/.test(row)
}

function tokenise(value: string, minLength: number) {
  return (value
    .toLowerCase()
    // Join thousands separators so 1,234.50 and 1 234.50 read as one number token.
    .replace(/(\d)[,\u00a0\u202f\u2019'](\d)/g, "$1$2")
    .match(/[\p{L}\p{N}][\p{L}\p{N}./-]*/gu) ?? [])
    .map((token) => token.replace(/[./-]+$/, ""))
    .filter((token) => token.length >= minLength)
}

function numberAlternatives(value: number) {
  if (!Number.isFinite(value) || value <= 0) return []
  const fixed = value.toFixed(2)
  return [...new Set([fixed, String(Number(fixed)), String(Math.round(value))])]
}

function boxArea(box: EvidenceBox) {
  return box.width * box.height
}
