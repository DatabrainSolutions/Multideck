// Task titles are plain text. Keep destinations separately before limiting titles.
export function todoText(value: string) {
  const links: { label: string; url: string }[] = []
  const title = value
    .replace(/!?\[([^\]\n]+)\]\(\s*(<[^>\n]+>|(?:[^\s()]|\([^()]*\))+)(?:\s+["'][^\n]*?["'])?\s*\)/g, (_match, label: string, destination: string) => {
      const url = destination.replace(/^<|>$/g, "")
      if (/^(?:https?:\/\/|mailto:|\/(?!\/))/i.test(url) && !links.some((link) => link.url === url)) {
        links.push({ label: label.replace(/[*`~]/g, "").slice(0, 120), url })
      }
      return label
    })
    // Earlier saves may have cut a Markdown destination off at 240 characters.
    .replace(/\[([^\]\n]+)\]\([^\n]*$/g, "$1")
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/(^|\s)_{1,2}([^_]+)_{1,2}(?=\s|[.,:;!?]|$)/g, "$1$2")
    .replace(/[*`]|~~/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return { title: title.slice(0, 240), links: links.slice(0, 12) }
}
