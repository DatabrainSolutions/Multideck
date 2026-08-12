import type { KeyboardEvent } from "react"

const fieldSelector = [
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[data-form-field]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="radio"]',
  '[role="switch"]',
].join(",")

function visibleFormFields() {
  return Array.from(document.querySelectorAll<HTMLElement>(fieldSelector)).filter((element, index, elements) => {
    if (elements.indexOf(element) !== index) return false
    if (element.tabIndex < 0 || element.closest("[inert]") || element.getAttribute("aria-disabled") === "true") return false
    const style = window.getComputedStyle(element)
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0
  })
}

export function moveTabToAdjacentField(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return

  const fields = visibleFormFields()
  const origin = event.target instanceof HTMLElement ? event.target : event.currentTarget
  const currentIndex = fields.indexOf(origin)
  const nextIndex = currentIndex + (event.shiftKey ? -1 : 1)
  const nextField = currentIndex >= 0 ? fields[nextIndex] : undefined

  // Preserve native Tab at the edges so the user can still reach form actions.
  if (!nextField) return
  event.preventDefault()
  nextField.focus()
}
