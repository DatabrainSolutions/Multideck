const text = (value: unknown) => typeof value === "string" ? value.trim() : ""
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row)) : []

export const PROCESSING_FILING_SOURCE = "https://www.gov.uk/government/publications/appendix-1-de-110-requested-and-previous-procedure-codes-of-the-customs-declaration-service-cds/requested-procedure-40-release-to-free-circulation#4051"

/** Completion checks for a declared 4051 Article 86(3) claim, not permission to
 * use the relief or a manual CDS tax override. Never create filing fields from
 * a calculation result. Other release procedures have their own rules. */
export function processingReleaseFilingIssues(item: {
  procedureCode?: unknown; additionalProcedureCode?: unknown; additionalProcedureCodes?: unknown
  additionalInformationStatements?: unknown; additionalDocuments?: unknown
  additionalDocumentCategory?: unknown; additionalDocumentType?: unknown
  additionalDocumentId?: unknown; lpcoExemptionCode?: unknown
}, header: { code?: unknown; description?: unknown } = {}) {
  const issues: { field: "additionalInformationStatements" | "additionalProcedureCode" | "additionalDocuments"; message: string }[] = []
  if (text(item.procedureCode) !== "4051") return issues
  const apcs = [text(item.additionalProcedureCode), ...rows(item.additionalProcedureCodes).map(row => text(row.code))].map(code => code.toUpperCase())
  const statements = [...rows(item.additionalInformationStatements), { statementCode: header.code, statementDescription: header.description }]
    .filter(row => text(row.statementCode).toUpperCase() === "GEN86")
  if (!apcs.includes("F44") && !statements.length) return issues
  if (!apcs.includes("F44")) issues.push({ field: "additionalProcedureCode", message: "GEN86 requires additional procedure F44 for this processing release." })
  if (!statements.length || statements.some(row => text(row.statementDescription) !== "Article 86(3)")) issues.push({ field: "additionalInformationStatements", message: "Add GEN86 with statement text ‘Article 86(3)’ for this F44 processing release." })
  const documents = [{ category: item.additionalDocumentCategory, type: item.additionalDocumentType, reference: item.additionalDocumentId, lpcoExemptionCode: item.lpcoExemptionCode }, ...rows(item.additionalDocuments)]
    .filter(row => `${text(row.category)}${text(row.type)}`.toUpperCase() === "9WKS")
  if (!documents.length) issues.push({ field: "additionalDocuments", message: "Add document 9WKS for the commercial records supporting the processing duty calculation." })
  for (const document of documents) {
    // Require the records reference as well as the prescribed worksheet suffix.
    if (!/^.+\s+see attached worksheet$/i.test(text(document.reference))) issues.push({ field: "additionalDocuments", message: "For 9WKS, enter the commercial-records reference followed by ‘see attached worksheet’." })
    if (text(document.lpcoExemptionCode).toUpperCase() !== "AC") issues.push({ field: "additionalDocuments", message: "Set document 9WKS status (LPCO exemption code) to AC." })
  }
  return issues
}
