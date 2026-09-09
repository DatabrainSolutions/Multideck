/** Keep the copied link distinct from QR attribution. Existing printed links
 * without a source remain usable, but their origin cannot be inferred. */
export function publicCardUrl(origin: string, slug: string, source?: "qr" | "link") {
  const url = new URL(`/card/${encodeURIComponent(slug)}`, origin)
  if (source) url.searchParams.set("source", source)
  return url.href
}

export function contactCardChannel(search: string) {
  const source = new URLSearchParams(search).get("source")
  return source === "qr" ? "direct-scan" : source === "link" ? "shared-link" : "unknown"
}

export function localCardUrl(url: string) {
  const hostname = new URL(url).hostname
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
}

export function escapeVCard(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,")
}

/** vCard 3.0 uses actual CRLF and folds at 75 UTF-8 octets, never midway
 * through a character. Literal backslash-r/backslash-n is not a valid file. */
export function vCardDocument(lines: string[]) {
  const encoder = new TextEncoder()
  return lines.map((line) => {
    let result = ""
    let bytes = 0
    for (const char of line) {
      const size = encoder.encode(char).length
      if (bytes + size > 75) { result += "\r\n "; bytes = 1 }
      result += char
      bytes += size
    }
    return result
  }).join("\r\n") + "\r\n"
}
