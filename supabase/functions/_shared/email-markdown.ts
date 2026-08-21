export type EmailMarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "unordered-list" | "ordered-list"; items: string[] }

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function inlineHtml(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:600;color:#292929;">$1</strong>')
    .replace(/__([^_]+)__/g, '<strong style="font-weight:600;color:#292929;">$1</strong>')
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replaceAll("\n", "<br>")
}

export function parseEmailMarkdown(value: string): EmailMarkdownBlock[] {
  const blocks: EmailMarkdownBlock[] = []
  const paragraph: string[] = []
  let listType: "unordered-list" | "ordered-list" | null = null
  let listItems: string[] = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push({ type: "paragraph", text: paragraph.join("\n").trim() })
    paragraph.length = 0
  }
  const flushList = () => {
    if (listType && listItems.length) blocks.push({ type: listType, items: listItems })
    listType = null
    listItems = []
  }

  for (const rawLine of value.replaceAll("\r\n", "\n").split("\n")) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() })
      continue
    }
    const unordered = line.match(/^[-+*•]\s+(.+)$/)
    const ordered = line.match(/^\d+[.)]\s+(.+)$/)
    if (unordered || ordered) {
      flushParagraph()
      const type = unordered ? "unordered-list" : "ordered-list"
      if (listType !== type) {
        flushList()
        listType = type
      }
      listItems.push((unordered?.[1] ?? ordered?.[1] ?? "").trim())
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()
  return blocks
}

export function renderEmailMarkdown(value: string, direction: "ltr" | "rtl" = "ltr") {
  const blocks = parseEmailMarkdown(value)
  const align = direction === "rtl" ? "right" : "left"
  const listPadding = direction === "rtl" ? "padding:0 22px 0 0;" : "padding:0 0 0 22px;"
  const html = blocks.map((block) => {
    if (block.type === "paragraph") {
      return `<p style="margin:0 0 18px;color:#5D5D5D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:24px;text-align:${align};">${inlineHtml(block.text)}</p>`
    }
    if (block.type === "heading") {
      const tag = block.level === 3 ? "h3" : "h2"
      const size = block.level === 1 ? 20 : block.level === 2 ? 18 : 16
      const lineHeight = block.level === 1 ? 28 : block.level === 2 ? 26 : 24
      const marginTop = block.level === 1 ? 28 : 24
      return `<${tag} style="margin:${marginTop}px 0 10px;color:#292929;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:${size}px;font-weight:600;line-height:${lineHeight}px;text-align:${align};">${inlineHtml(block.text)}</${tag}>`
    }
    const tag = block.type === "ordered-list" ? "ol" : "ul"
    const items = block.items.map((item) => `<li style="margin:0 0 8px;padding:0 0 0 2px;">${inlineHtml(item)}</li>`).join("")
    return `<${tag} style="margin:0 0 20px;${listPadding}color:#5D5D5D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:23px;text-align:${align};">${items}</${tag}>`
  }).join("")
  const text = blocks.map((block) => {
    if (block.type === "heading" || block.type === "paragraph") return block.text.replace(/\*\*|__/g, "").replace(/([*_])([^*_]+)\1/g, "$2")
    return block.items.map((item, index) => `${block.type === "ordered-list" ? `${index + 1}.` : "•"} ${item.replace(/\*\*|__/g, "").replace(/([*_])([^*_]+)\1/g, "$2")}`).join("\n")
  }).join("\n\n")
  return { html, text }
}
