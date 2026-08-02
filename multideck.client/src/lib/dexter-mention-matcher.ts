export type DexterMentionMatch = {
  start: number
  end: number
  title: string
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Finds deliberate Dexter mentions only. An @ inside an email address or URL
 * is ordinary text, so it must not become a provider or record chip later.
 */
export function findDexterMentionMatches(text: string, titles: string[]): DexterMentionMatch[] {
  if (!text.includes("@") || titles.length === 0) return []

  const uniqueTitles = [...new Map(titles.map((title) => [title.toLocaleLowerCase(), title])).values()]
    .sort((a, b) => b.length - a.length)
  const pattern = new RegExp(
    `(^|[\\s([{])@(${uniqueTitles.map(escapeRegularExpression).join("|")})(?=$|[\\s.,!?;:)\\]}])`,
    "giu",
  )

  return [...text.matchAll(pattern)].map((match) => {
    const matchStart = match.index ?? 0
    const boundaryLength = match[1]?.length ?? 0
    return {
      start: matchStart + boundaryLength,
      end: matchStart + match[0].length,
      title: match[2],
    }
  })
}
