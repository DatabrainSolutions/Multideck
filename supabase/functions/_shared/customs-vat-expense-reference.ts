import { VAT_EXPENSE_SOURCE } from "./customs-vat-expenses.mts"

const reviewedSectionSha256 = "df8404f2c91b9418d9feea4497f25f1371df85666d1b9eb9724883134686408b"
const sha256 = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)))].map(v => v.toString(16).padStart(2, "0")).join("")

/** A changed eligibility paragraph is just as significant as a changed price.
 * Formatting whitespace is ignored; any other section change requires review. */
export async function verifyVatExpensePublication(html: string) {
  const marker = 'id="incidental-expenses--simplified-arrangements"'
  const start = html.indexOf(marker), end = html.indexOf("<h2", start)
  if (start < 0 || end < 0 || html.indexOf(marker, start + marker.length) >= 0) throw new Error("HMRC's incidental-expense section could not be identified unambiguously.")
  const section = html.slice(start, end).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  const sectionSha256 = await sha256(new TextEncoder().encode(section))
  if (sectionSha256 !== reviewedSectionSha256) throw new Error("HMRC's incidental-expense schedule or eligibility guidance has changed. Review the source before using national rates.")
  return { section, sectionSha256, ruleReviewDate: "2026-09-14" }
}

export async function fetchVatExpensePublication() {
  const source = VAT_EXPENSE_SOURCE.split("#")[0]
  const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Accept: "text/html" } })
  if (!response.ok || !response.body) throw new Error("HMRC's incidental-expense publication is unavailable.")
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1_000_000) throw new Error("HMRC's incidental-expense publication exceeds the supported size.")
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const publicationHtml = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  const reviewed = await verifyVatExpensePublication(publicationHtml)
  return { source, retrievedAt: new Date().toISOString(), publicationHtml, contentSha256: await sha256(bytes), ...reviewed }
}
