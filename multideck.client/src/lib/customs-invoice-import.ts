import { createExportDeclarationItem, type ExportDeclarationItem } from "@/lib/customs-declaration"

export type ExtractedInvoiceLine = {
  id: string
  invoiceLine: number
  page: number
  sku: string
  commodityCode: string
  description: string
  quantity: number
  unitPrice: number
  currency: string
  netMass: number
  grossMass: number
  originCountry: string
  packageKind: string
  packageMarks: string
  packageCount: number
}

export type InvoiceLineSelection = {
  include: boolean
  consolidate: boolean
}

export type InvoiceConsolidationGroup = {
  id: string
  commodityCode: string
  lines: ExtractedInvoiceLine[]
  descriptionSimilarity: number
}

export type InvoiceOutputLine = {
  id: string
  sourceLineIds: string[]
  sourceLineNumbers: number[]
  commodityCode: string
  description: string
  quantity: number
  itemPrice: number
  currency: string
  netMass: number
  grossMass: number
  originCountry: string
  packageKind: string
  packageMarks: string
  packageCount: number
  consolidated: boolean
}

export function createDefaultInvoiceSelections(lines: ExtractedInvoiceLine[]) {
  const commodityCounts = lines.reduce<Record<string, number>>((counts, line) => {
    if (line.commodityCode) counts[line.commodityCode] = (counts[line.commodityCode] ?? 0) + 1
    return counts
  }, {})
  return Object.fromEntries(lines.map((line) => [line.id, {
    include: Boolean(line.description.trim()),
    consolidate: Boolean(line.commodityCode && commodityCounts[line.commodityCode] > 1),
  }])) as Record<string, InvoiceLineSelection>
}

export function groupInvoiceLines(lines: ExtractedInvoiceLine[]): InvoiceConsolidationGroup[] {
  const groups = new Map<string, ExtractedInvoiceLine[]>()
  lines.forEach((line) => {
    const key = line.commodityCode || `unclassified-${line.id}`
    groups.set(key, [...(groups.get(key) ?? []), line])
  })

  return [...groups.entries()].map(([key, groupLines]) => ({
    id: `group-${key}`,
    commodityCode: groupLines[0]?.commodityCode ?? "",
    lines: groupLines,
    descriptionSimilarity: averageDescriptionSimilarity(groupLines),
  })).sort((a, b) => (a.lines[0]?.invoiceLine ?? 0) - (b.lines[0]?.invoiceLine ?? 0))
}

export function buildInvoiceOutputLines(
  groups: InvoiceConsolidationGroup[],
  selections: Record<string, InvoiceLineSelection>,
  descriptionOverrides: Record<string, string>,
): InvoiceOutputLine[] {
  const output: InvoiceOutputLine[] = []

  groups.forEach((group) => {
    const included = group.lines.filter((line) => selections[line.id]?.include)
    const combined = included.filter((line) => selections[line.id]?.consolidate)
    const standalone = included.filter((line) => !selections[line.id]?.consolidate)

    if (combined.length >= 2) {
      output.push(combineLines(group.id, combined, descriptionOverrides[group.id]))
    } else {
      standalone.push(...combined)
    }

    standalone.forEach((line) => output.push(combineLines(`output-${line.id}`, [line])))
  })

  return output.sort((a, b) => Math.min(...a.sourceLineNumbers) - Math.min(...b.sourceLineNumbers))
}

export function invoiceOutputToDeclarationItems(output: InvoiceOutputLine[], invoiceReference: string): ExportDeclarationItem[] {
  return output.map((line, index) => ({
    ...createExportDeclarationItem(index + 1),
    commodityCode: line.commodityCode,
    description: line.description,
    packageKind: line.packageKind,
    packageMarks: line.packageMarks,
    packageCount: line.packageCount ? formatNumber(line.packageCount) : "",
    nonPreferentialOrigin: line.originCountry,
    procedureCode: "",
    additionalProcedureCode: "",
    grossMass: formatNumber(line.grossMass),
    netMass: formatNumber(line.netMass),
    itemPrice: formatNumber(line.itemPrice),
    currency: line.currency,
    statisticalValue: formatNumber(line.itemPrice),
    previousDocumentType: "",
    previousDocumentReference: invoiceReference,
  }))
}

function combineLines(id: string, lines: ExtractedInvoiceLine[], descriptionOverride?: string): InvoiceOutputLine {
  const first = lines[0]
  return {
    id,
    sourceLineIds: lines.map((line) => line.id),
    sourceLineNumbers: lines.map((line) => line.invoiceLine),
    commodityCode: first.commodityCode,
    description: descriptionOverride?.trim() || first.description,
    quantity: sum(lines, (line) => line.quantity),
    itemPrice: sum(lines, (line) => line.quantity * line.unitPrice),
    currency: first.currency,
    netMass: sum(lines, (line) => line.netMass),
    grossMass: sum(lines, (line) => line.grossMass),
    originCountry: commonValue(lines.map((line) => line.originCountry)),
    packageKind: commonValue(lines.map((line) => line.packageKind)),
    packageMarks: [...new Set(lines.map((line) => line.packageMarks).filter(Boolean))].join(", "),
    packageCount: sum(lines, (line) => line.packageCount),
    consolidated: lines.length >= 2,
  }
}

function averageDescriptionSimilarity(lines: ExtractedInvoiceLine[]) {
  if (lines.length < 2) return 100
  const scores: number[] = []
  for (let left = 0; left < lines.length; left += 1) {
    for (let right = left + 1; right < lines.length; right += 1) {
      scores.push(tokenSimilarity(lines[left].description, lines[right].description))
    }
  }
  return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalise(left).split(" ").filter(Boolean))
  const rightTokens = new Set(normalise(right).split(" ").filter(Boolean))
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  return union ? (intersection / union) * 100 : 0
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function sum(lines: ExtractedInvoiceLine[], value: (line: ExtractedInvoiceLine) => number) {
  return lines.reduce((total, line) => total + value(line), 0)
}

function commonValue(values: string[]) {
  const populated = values.filter(Boolean)
  return populated.length && populated.every((value) => value === populated[0]) ? populated[0] : ""
}

function formatNumber(value: number) {
  return Number(value.toFixed(3)).toString()
}
