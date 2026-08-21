export type TextareaSelection = { start: number; end: number; text: string }
export type TextareaSelectionAnchor = { left: number; top: number }

export function textareaSelectionAnchor(
  textarea: HTMLTextAreaElement,
  start: number,
): TextareaSelectionAnchor {
  const computed = window.getComputedStyle(textarea)
  const mirror = document.createElement("div")
  const marker = document.createElement("span")
  const copiedProperties = [
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "letter-spacing",
    "line-height",
    "padding-block-start",
    "padding-inline-end",
    "padding-block-end",
    "padding-inline-start",
    "text-align",
    "text-indent",
    "text-transform",
    "word-spacing",
  ]

  for (const property of copiedProperties) {
    mirror.style.setProperty(property, computed.getPropertyValue(property))
  }
  mirror.style.position = "fixed"
  mirror.style.insetInlineStart = "-10000px"
  mirror.style.top = "0"
  mirror.style.visibility = "hidden"
  mirror.style.boxSizing = "border-box"
  mirror.style.width = `${textarea.clientWidth}px`
  mirror.style.whiteSpace = "pre-wrap"
  mirror.style.overflowWrap = "break-word"
  mirror.textContent = textarea.value.slice(0, start)
  marker.textContent = "\u200b"
  mirror.append(marker)
  document.body.append(mirror)

  const anchor = {
    left: Math.max(116, Math.min(textarea.clientWidth - 116, marker.offsetLeft - textarea.scrollLeft)),
    top: Math.max(
      46,
      Math.min(
        textarea.offsetTop + textarea.clientHeight - 8,
        textarea.offsetTop + marker.offsetTop - textarea.scrollTop - 8,
      ),
    ),
  }
  mirror.remove()
  return anchor
}
