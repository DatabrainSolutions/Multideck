import type { ExtractedInvoiceLine, InvoiceLineSelection } from "@/lib/customs-invoice-import"
import type { EvidencePage } from "@/lib/customs-invoice-evidence"

const storageKeyPrefix = "multideck.customs.invoice-import"
const recoveryVersion = 2

export type InvoiceImportReviewFilter = "all" | "attention" | "approved"
export type InvoiceImportReviewTab = "lines" | "result"

export type CustomsInvoiceImportRecovery = {
  version: typeof recoveryVersion
  extractionId: string
  invoiceName: string
  extractedInvoiceNumber: string
  lines: ExtractedInvoiceLine[]
  selections: Record<string, InvoiceLineSelection>
  descriptionOverrides: Record<string, string>
  evidencePages: EvidencePage[]
  activeLineId: string
  reviewFilter: InvoiceImportReviewFilter
  reviewTab: InvoiceImportReviewTab
  savedAt: number
}

export type CustomsInvoiceImportRecoveryInput = Omit<CustomsInvoiceImportRecovery, "version" | "savedAt">
type StoredCustomsInvoiceImportRecovery = Omit<Partial<CustomsInvoiceImportRecovery>, "version"> & { version?: number }

function storageKey(declarationKey: string) {
  return `${storageKeyPrefix}.${encodeURIComponent(declarationKey)}`
}

function storage() {
  return typeof window === "undefined" ? null : window.sessionStorage
}

export function readCustomsInvoiceImportRecovery(declarationKey: string): CustomsInvoiceImportRecovery | null {
  try {
    const parsed = JSON.parse(storage()?.getItem(storageKey(declarationKey)) ?? "null") as StoredCustomsInvoiceImportRecovery | null
    if (!parsed || (parsed.version !== 1 && parsed.version !== recoveryVersion)) return null
    const lines = Array.isArray(parsed.lines) ? parsed.lines as ExtractedInvoiceLine[] : []
    const extractionId = typeof parsed.extractionId === "string" ? parsed.extractionId : ""
    if (!extractionId && !lines.length) return null
    return {
      version: recoveryVersion,
      extractionId,
      invoiceName: typeof parsed.invoiceName === "string" ? parsed.invoiceName : "",
      extractedInvoiceNumber: typeof parsed.extractedInvoiceNumber === "string" ? parsed.extractedInvoiceNumber : "",
      lines,
      selections: record(parsed.selections) as Record<string, InvoiceLineSelection>,
      descriptionOverrides: record(parsed.descriptionOverrides) as Record<string, string>,
      evidencePages: Array.isArray(parsed.evidencePages) ? parsed.evidencePages as EvidencePage[] : [],
      activeLineId: typeof parsed.activeLineId === "string" ? parsed.activeLineId : lines[0]?.id ?? "",
      reviewFilter: isReviewFilter(parsed.reviewFilter) ? parsed.reviewFilter : "all",
      reviewTab: isReviewTab(parsed.reviewTab) ? parsed.reviewTab : "lines",
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    }
  } catch {
    return null
  }
}

export function hasCustomsInvoiceImportRecovery(declarationKey: string) {
  return readCustomsInvoiceImportRecovery(declarationKey) !== null
}

export function saveCustomsInvoiceImportRecovery(
  declarationKey: string,
  recovery: CustomsInvoiceImportRecoveryInput,
  now = Date.now(),
) {
  const target = storage()
  if (!target || (!recovery.extractionId && !recovery.lines.length)) return

  const next: CustomsInvoiceImportRecovery = { ...recovery, version: recoveryVersion, savedAt: now }
  try {
    target.setItem(storageKey(declarationKey), JSON.stringify(next.extractionId
      ? { ...next, lines: [], evidencePages: [] }
      : next))
  } catch {
    // Evidence text can be large. The extracted fields and operator decisions are the
    // irreplaceable part, so keep those even if the browser's session quota is tight.
    try {
      target.setItem(storageKey(declarationKey), JSON.stringify(next.extractionId
        ? { ...next, lines: [], evidencePages: [] }
        : { ...next, evidencePages: [] }))
    } catch {
      // Blocked or full storage must not interrupt the live review workflow.
    }
  }
}

export function clearCustomsInvoiceImportRecovery(declarationKey: string) {
  try {
    storage()?.removeItem(storageKey(declarationKey))
  } catch {
    // Storage can be blocked in privacy modes; the live workflow still remains usable.
  }
}

export function moveCustomsInvoiceImportRecovery(fromDeclarationKey: string, toDeclarationKey: string) {
  if (fromDeclarationKey === toDeclarationKey) return
  const recovery = readCustomsInvoiceImportRecovery(fromDeclarationKey)
  if (!recovery) return
  const { version: _version, savedAt, ...input } = recovery
  saveCustomsInvoiceImportRecovery(toDeclarationKey, input, savedAt)
  clearCustomsInvoiceImportRecovery(fromDeclarationKey)
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function isReviewFilter(value: unknown): value is InvoiceImportReviewFilter {
  return value === "all" || value === "attention" || value === "approved"
}

function isReviewTab(value: unknown): value is InvoiceImportReviewTab {
  return value === "lines" || value === "result"
}
