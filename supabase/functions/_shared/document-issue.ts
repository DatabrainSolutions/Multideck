// Document issue status is independent of a template's draft/published status.
// Originals/copies require a separate controlled transport-document lifecycle.
export type DocumentIssueStatus = "draft" | "final" | "original" | "copy"

export function bookingDocumentFamily(code: string): "booking" | "sea" | "air" | null {
  if (/^JOB_CONFIRMATION(?:_[A-Z0-9]+)*$/.test(code)) return "booking"
  if (["FIATA_BOL_REFERENCE", "JE2648771_FBL_MULTIMODAL_CTRS_A4260714093859"].includes(code)) return "sea"
  if (["MAWB", "MNG_AWB", "HAWB"].includes(code)) return "air"
  return null
}

export function resolveDocumentIssue(code: string, requested: unknown): DocumentIssueStatus | null {
  const family = bookingDocumentFamily(code)
  if (!family && requested === undefined) return null // Existing unrelated workflows stay unchanged.
  const status = requested === undefined ? "draft" : requested
  if (typeof status !== "string" || !["draft", "final", "original", "copy"].includes(status)) throw new Error("Choose a valid document issue status.")
  if (status === "original" || status === "copy") {
    throw new Error("Originals and copies require an approved issuing and reprint workflow. Generate a Draft for review instead.")
  }
  if (!family || family !== "booking" && status !== "draft") {
    throw new Error("This document is not approved for final issue from Booking.")
  }
  return status as DocumentIssueStatus
}

export function documentIssueConversion(format: "pdf" | "docx", status: DocumentIssueStatus | null) {
  if (!status) return format
  if (format !== "pdf") throw new Error("Marked Booking documents must be saved as PDF.")
  return {
    formatName: "pdf",
    formatOptions: {
      Watermarks: status === "draft" ? [
        { text: "DRAFT", anchor: "center", rotation: 45, color: "#7F7F7F", opacity: 0.15, size: 64, font: "Helvetica" },
        { text: "DRAFT - FOR REVIEW ONLY", anchor: "bottomLeft", offsetX: 18, offsetY: 10, size: 9, color: "#5D5D5D", font: "Helvetica" },
      ] : [
        { text: "FINAL", anchor: "bottomLeft", offsetX: 18, offsetY: 10, size: 9, color: "#5D5D5D", font: "Helvetica" },
      ],
    },
  }
}
