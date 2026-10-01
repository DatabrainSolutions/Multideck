import catalogue from "./template-preview-catalogue.json" with { type: "json" }

// Only byte-for-byte reviewed sources may appear in the template demo surface.
// Names, extensions and Carbone tags cannot prove that fixed text/artwork is safe.
// A changed or uploaded source needs a new privacy review, including its images.
export function templatePreviewSample(sourceSha256: string): Record<string, unknown> | null {
  const entries = catalogue as Record<string, { sampleData: Record<string, unknown> }>
  const entry = Object.hasOwn(entries, sourceSha256) ? entries[sourceSha256] : null
  return entry ? structuredClone(entry.sampleData) : null
}

export const templatePreviewPrivacyMessage = "Preview hidden for privacy. This source has not been checked for embedded customer details. Use a clean, privacy-reviewed template source."
