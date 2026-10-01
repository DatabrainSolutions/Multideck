import catalogue from "./template-preview-catalogue.json" with { type: "json" }
import { bookingTemplateSample } from "./booking-template-validation.ts"
import { transportTemplateSample } from "./transport-template-validation.ts"
import { multideckDocumentLogo } from "./multideck-document-logo.ts"

// Only byte-for-byte reviewed sources may appear in the template demo surface.
// Names, extensions and Carbone tags cannot prove that fixed text/artwork is safe.
// A changed or uploaded source needs a new privacy review, including its images.
export function templatePreviewSample(sourceSha256: string): Record<string, unknown> | null {
  // These exact default Word sources were inspected, including their artwork.
  // Required tags alone never prove that an uploaded file is demo-safe.
  if (sourceSha256 === "db76cc6ab5f94c06d778a0732f8d04435a9df2cf1d5c4743e88864b854af4ccc") {
    return { ...bookingTemplateSample(), branding: { logoDataUri: multideckDocumentLogo } }
  }
  if (sourceSha256 === "439f0208bc97e1ba8ab35a763d6608a810afd17ef514fa8b45f18040a287fc47") return transportTemplateSample("HBL")
  if (sourceSha256 === "892df6229274a0f5674a8d9c7baeec3370d24000159dcbacf385fefdd094ea50") return transportTemplateSample("HAWB")
  const entries = catalogue as Record<string, { sampleData: Record<string, unknown> }>
  const entry = Object.hasOwn(entries, sourceSha256) ? entries[sourceSha256] : null
  return entry ? structuredClone(entry.sampleData) : null
}

export const templatePreviewPrivacyMessage = "Preview hidden for privacy. This source has not been checked for embedded customer details. Use a clean, privacy-reviewed template source."
