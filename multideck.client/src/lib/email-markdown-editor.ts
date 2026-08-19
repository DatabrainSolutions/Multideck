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
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
}

export function emailMarkdownToEditorHtml(value: string) {
  const blocks: string[] = []
  const paragraph: string[] = []
  let listType: "ul" | "ol" | null = null
  let listItems: string[] = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push(`<p>${inlineHtml(paragraph.join(" ").trim())}</p>`)
    paragraph.length = 0
  }
  const flushList = () => {
    if (listType && listItems.length) blocks.push(`<${listType}>${listItems.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${listType}>`)
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
      const tag = heading[1].length >= 3 ? "h3" : "h2"
      blocks.push(`<${tag}>${inlineHtml(heading[2].trim())}</${tag}>`)
      continue
    }
    const unordered = line.match(/^[-+*•]\s+(.+)$/)
    const ordered = line.match(/^\d+[.)]\s+(.+)$/)
    if (unordered || ordered) {
      flushParagraph()
      const nextListType = unordered ? "ul" : "ol"
      if (listType && listType !== nextListType) flushList()
      listType = nextListType
      listItems.push((unordered?.[1] ?? ordered?.[1] ?? "").trim())
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()
  return blocks.join("")
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replaceAll("\u00a0", " ")
  if (!(node instanceof HTMLElement)) return ""
  const content = Array.from(node.childNodes).map(inlineMarkdown).join("")
  if (node.tagName === "BR") return "\n"
  if (node.tagName === "STRONG" || node.tagName === "B") return content.trim() ? `**${content}**` : ""
  if (node.tagName === "EM" || node.tagName === "I") return content.trim() ? `*${content}*` : ""
  return content
}

function cleanBlock(value: string) {
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

function blockMarkdown(node: Node): string[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = cleanBlock(node.textContent ?? "")
    return text ? [text] : []
  }
  if (!(node instanceof HTMLElement)) return []
  const tag = node.tagName
  if (tag === "H1" || tag === "H2") return [`## ${cleanBlock(Array.from(node.childNodes).map(inlineMarkdown).join(""))}`]
  if (tag === "H3") return [`### ${cleanBlock(Array.from(node.childNodes).map(inlineMarkdown).join(""))}`]
  if (tag === "UL" || tag === "OL") {
    return [Array.from(node.children).filter((child) => child.tagName === "LI").map((item, index) => {
      const marker = tag === "OL" ? `${index + 1}.` : "-"
      return `${marker} ${cleanBlock(Array.from(item.childNodes).map(inlineMarkdown).join(""))}`
    }).join("\n")]
  }
  if (tag === "P" || tag === "DIV") {
    const nestedBlocks = Array.from(node.children).some((child) => ["DIV", "P", "H1", "H2", "H3", "UL", "OL"].includes(child.tagName))
    if (nestedBlocks) return Array.from(node.childNodes).flatMap(blockMarkdown)
    const text = cleanBlock(Array.from(node.childNodes).map(inlineMarkdown).join(""))
    return text ? [text] : []
  }
  const text = cleanBlock(Array.from(node.childNodes).map(inlineMarkdown).join(""))
  return text ? [text] : []
}

export function emailEditorElementToMarkdown(element: HTMLElement) {
  return Array.from(element.childNodes).flatMap(blockMarkdown).filter(Boolean).join("\n\n").trim()
}
