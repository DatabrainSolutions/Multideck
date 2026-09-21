import { fromMarkdown } from "mdast-util-from-markdown"

type PreviewNode = {
  type: string
  value?: string
  alt?: string | null
  children?: PreviewNode[]
}

function readableText(node: PreviewNode): string {
  if (node.type === "html" || node.type === "definition") return ""
  if (node.type === "break" || node.type === "thematicBreak") return " "
  if (node.type === "image" || node.type === "imageReference") return node.alt ?? ""
  if (typeof node.value === "string") return node.value
  const separator = ["root", "blockquote", "list", "listItem"].includes(node.type) ? " " : ""
  return (node.children ?? []).map(readableText).join(separator)
}

/** Plain text for compact previews; the original message and destination stay intact. */
export function notificationPreviewText(body: string): string {
  return readableText(fromMarkdown(body)).replace(/\s+/g, " ").trim()
}
