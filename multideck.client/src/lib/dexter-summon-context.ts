/**
 * Turning a point on the screen into something Dexter can reason about.
 *
 * The summon gesture lands on a DOM node, but an operator does not mean "this
 * div" — they mean the field they were filling, the chart they were reading, or
 * the row they were checking. These helpers do that promotion, then flatten the
 * result into a short brief so the request stays cheap on the Fast model.
 *
 * No React and no motion here: the overlay calls these during a pointer event and
 * must not pay for a render to find out what it is pointing at.
 */

export type SummonTargetKind =
  | "field"
  | "control"
  | "cell"
  | "text"
  | "chart"
  | "table"
  | "row"
  | "panel"
  | "region"
  | "selection"

export type SummonTarget = {
  element: HTMLElement
  kind: SummonTargetKind
  /** What the operator would call this thing. */
  label: string
  /** The value of a field, or the highlighted text. */
  value: string | null
  /** Visible content, collapsed and capped. */
  text: string
}

/** Ignore the overlay's own chrome when hit-testing. */
export const summonIgnoreAttribute = "data-md-summon-ignore"

/** Opt a container in as a summon region, and optionally name it. */
const summonOptIn = "[data-md-summon]"
const summonLabelAttribute = "data-md-summon-label"

const fieldSelector = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
  "[role='spinbutton']",
].join(",")

/**
 * Small, meaningful targets that should win before their surrounding section.
 * The order is intentional: a button inside a table cell is the action the
 * operator is pointing at, while text inside that button still belongs to the
 * button rather than becoming a loose label target.
 */
const controlSelector = [
  "button",
  "a[href]",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='menuitem']",
  "[role='option']",
  "[role='tab']",
].join(",")

const cellSelector = "td, th, [role='cell'], [role='gridcell']"

const textSelector = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "label",
  "legend",
  "dt",
  "dd",
  "caption",
  "figcaption",
  "blockquote",
  "pre",
  "code",
  "output",
  "time",
  "[data-slot='card-title']",
  "[data-slot='card-description']",
].join(",")

const regionSelector = [
  summonOptIn,
  "[data-slot='card']",
  "[data-slot='chart']",
  "[data-slot='table']",
  ".md-settings-panel",
  ".md-panel",
  "table",
  "[role='table']",
  "[role='grid']",
  "tr",
  "[role='row']",
  "figure",
  "form",
  "fieldset",
  "section",
  "article",
  "aside",
  "li",
  "[role='listitem']",
  "[role='tabpanel']",
  "[role='dialog']",
  "header",
  "nav",
].join(",")

const chartSelector = "[data-slot='chart'], .recharts-wrapper, .recharts-responsive-container, svg[class*='recharts']"

const minimumRegionWidth = 72
const minimumRegionHeight = 26
/** A region larger than this share of the viewport is the page, not a thing on it. */
const maximumRegionArea = 0.74
const maximumBriefText = 1600

function isVisible(element: Element) {
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false

  const styles = window.getComputedStyle(element)
  return styles.visibility !== "hidden" && styles.display !== "none" && Number(styles.opacity) !== 0
}

function collapse(value: string | null | undefined, limit = 240) {
  const text = (value ?? "").replace(/\s+/g, " ").trim()
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text
}

function labelledByText(element: Element) {
  const ids = element.getAttribute("aria-labelledby")
  if (!ids) return ""

  return collapse(
    ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" "),
  )
}

function fieldLabel(element: HTMLElement) {
  const id = element.getAttribute("id")
  if (id) {
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id
    const explicit = document.querySelector(`label[for="${escaped}"]`)
    if (explicit) return collapse(explicit.textContent)
  }

  const wrapping = element.closest("label")
  if (wrapping) return collapse(wrapping.textContent)

  const placeholder = element.getAttribute("placeholder")
  if (placeholder) return collapse(placeholder)

  // Settings and form rows put the label in the first column of a grid row.
  const row = element.closest("[data-md-field-row], .md-settings-panel > div")
  const rowLabel = row?.querySelector("label, p")
  if (rowLabel) return collapse(rowLabel.textContent)

  return collapse(element.getAttribute("name"))
}

function nearestHeading(element: HTMLElement) {
  let current: HTMLElement | null = element

  while (current && current !== document.body) {
    const heading = current.querySelector("h1, h2, h3, h4, [data-slot='card-title']")
    if (heading && collapse(heading.textContent)) return collapse(heading.textContent)

    let sibling = current.previousElementSibling
    while (sibling) {
      if (/^H[1-4]$/.test(sibling.tagName) && collapse(sibling.textContent)) return collapse(sibling.textContent)
      sibling = sibling.previousElementSibling
    }

    current = current.parentElement
  }

  return ""
}

function kindOf(element: HTMLElement): SummonTargetKind {
  if (element.matches(fieldSelector)) return "field"
  if (element.matches(controlSelector)) return "control"
  if (element.matches(cellSelector)) return "cell"
  if (element.matches(textSelector)) return "text"
  if (element.closest(chartSelector)) return "chart"
  if (element.matches("table, [role='table'], [role='grid']")) return "table"
  if (element.matches("tr, [role='row']")) return "row"
  if (element.matches(`${summonOptIn}, [data-slot='card'], .md-settings-panel, section, article, aside, form, fieldset`)) return "panel"
  return "region"
}

const kindNames: Record<SummonTargetKind, string> = {
  field: "field",
  control: "control",
  cell: "table cell",
  text: "text",
  chart: "chart",
  table: "table",
  row: "row",
  panel: "panel",
  region: "area",
  selection: "selected text",
}

export function summonKindName(kind: SummonTargetKind) {
  return kindNames[kind]
}

/** The placeholder for the summon composer, phrased for what it is attached to. */
export function summonPlaceholder(kind: SummonTargetKind) {
  switch (kind) {
    case "field":
      return "Ask about this field, or ask for a value"
    case "control":
      return "Ask what this control does"
    case "cell":
      return "Ask about this value"
    case "text":
      return "Ask about this text"
    case "chart":
      return "Ask what this chart is telling you"
    case "table":
    case "row":
      return "Ask about these records"
    case "selection":
      return "Ask about the selected text"
    default:
      return "Ask about this part of the screen"
  }
}

function readFieldValue(element: HTMLElement) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
      return element.checked ? "Selected" : "Not selected"
    }
    return element.type === "password" ? null : collapse(element.value, 400)
  }
  if (element instanceof HTMLSelectElement) return collapse(element.selectedOptions[0]?.textContent, 200)
  if (element.isContentEditable) return collapse(element.textContent, 400)
  return null
}

/** The text an operator has highlighted, when it sits inside the target. */
function selectionWithin(element: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer
  const node = container instanceof Element ? container : container.parentElement
  if (!node || !(element.contains(node) || node.contains(element))) return null

  return collapse(selection.toString(), 600) || null
}

export function describeSummonTarget(element: HTMLElement): SummonTarget {
  const kind = kindOf(element)
  const explicit = element.getAttribute(summonLabelAttribute)
  const value = kind === "field" ? readFieldValue(element) : selectionWithin(element)

  const label =
    collapse(explicit) ||
    collapse(element.getAttribute("aria-label")) ||
    labelledByText(element) ||
    (kind === "field" ? fieldLabel(element) : "") ||
    (kind === "control" || kind === "cell" || kind === "text" ? collapse(element.innerText || element.textContent, 180) : "") ||
    (kind === "row" ? collapse(element.querySelector("td, th, [role='cell'], [role='gridcell']")?.textContent) : "") ||
    collapse(element.getAttribute("title")) ||
    nearestHeading(element) ||
    kindNames[kind]

  const text = kind === "field" ? "" : collapse(element.innerText || element.textContent, maximumBriefText)

  return { element, kind, label, value, text }
}

/**
 * Promotes a hit-tested node to the thing worth asking about.
 *
 * Fields win outright — pointing at the text inside an input means the input. For
 * everything else the smallest sensible enclosing block wins, so double-clicking
 * a chart gives the chart rather than the dashboard around it.
 */
export function resolveSummonTarget(from: Element | null): HTMLElement | null {
  if (!(from instanceof HTMLElement)) return null
  if (from.closest(`[${summonIgnoreAttribute}]`)) return null

  const field = from.closest(fieldSelector)
  if (field instanceof HTMLElement && isVisible(field)) return field

  const control = from.closest(controlSelector)
  if (control instanceof HTMLElement && isVisible(control)) return control

  const cell = from.closest(cellSelector)
  if (cell instanceof HTMLElement && isVisible(cell)) return cell

  const text = from.closest(textSelector)
  if (text instanceof HTMLElement && collapse(text.innerText || text.textContent) && isVisible(text)) return text

  return resolveSummonRegion(from)
}

export function resolveSummonRegion(from: Element | null): HTMLElement | null {
  if (!(from instanceof HTMLElement)) return null
  if (from.closest(`[${summonIgnoreAttribute}]`)) return null

  const viewportArea = window.innerWidth * window.innerHeight
  const candidates: HTMLElement[] = []

  let current: HTMLElement | null = from
  while (current && current !== document.body && current !== document.documentElement) {
    if (current.matches(regionSelector)) candidates.push(current)
    current = current.parentElement
  }

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect()
    if (rect.width < minimumRegionWidth || rect.height < minimumRegionHeight) continue
    if (rect.width * rect.height > viewportArea * maximumRegionArea) continue
    if (!isVisible(candidate)) continue
    return candidate
  }

  // Nothing opted in at a usable size, so fall back to the nearest ancestor that
  // is at least a readable block rather than a bare span.
  current = from
  while (current && current !== document.body) {
    const rect = current.getBoundingClientRect()
    if (
      rect.width >= minimumRegionWidth &&
      rect.height >= minimumRegionHeight &&
      rect.width * rect.height <= viewportArea * maximumRegionArea &&
      isVisible(current)
    ) {
      return current
    }
    current = current.parentElement
  }

  return null
}

/**
 * The element to summon against when there is no pointer, only focus.
 *
 * Deliberately narrow: only a field the operator is actually editing counts as
 * "the thing I mean". Focus that happens to be resting on a button they clicked a
 * moment ago is not an intention, so the keyboard route falls through to the area
 * picker instead of guessing at a panel.
 */
export function resolveFocusedSummonTarget(): HTMLElement | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || active === document.body) return null
  if (active.closest(`[${summonIgnoreAttribute}]`)) return null

  const field = active.closest(fieldSelector)
  return field instanceof HTMLElement && isVisible(field) ? field : null
}

export type SummonPageContext = {
  route: string
  title: string
}

export function readSummonPageContext(): SummonPageContext {
  const heading = document.querySelector("main h1, h1")
  return {
    route: window.location.pathname,
    title: collapse(heading?.textContent) || collapse(document.title.split("·")[0]) || "Multideck",
  }
}

/**
 * The preamble sent ahead of the operator's question. Written as plain prose
 * because that is what the model reads best, and kept short because the summon
 * always runs on the Fast engine.
 */
export function buildSummonBrief(target: SummonTarget, page: SummonPageContext) {
  const lines = [
    `The operator is working on the "${page.title}" screen of Multideck (route ${page.route}).`,
    `They summoned you on a ${kindNames[target.kind]} they would call "${target.label}".`,
  ]

  if (target.value) lines.push(`Its current content is: ${target.value}`)
  if (target.text) lines.push(`What that area shows on screen:\n${target.text}`)
  lines.push("Answer about this specific thing. Be short, concrete and useful in two or three sentences unless more is genuinely needed.")

  return lines.join("\n\n")
}

/**
 * A rounded-rect radius that traces the target. A square-cornered row still gets
 * a small radius so the ring reads as a deliberate highlight rather than a border
 * somebody forgot to style.
 */
export function readSummonRadius(element: HTMLElement, minimum = 8) {
  const styles = window.getComputedStyle(element)
  const corners = [
    styles.borderTopLeftRadius,
    styles.borderTopRightRadius,
    styles.borderBottomRightRadius,
    styles.borderBottomLeftRadius,
  ]

  if (corners.some((corner) => corner.includes("%"))) return corners.join(" ")

  return corners
    .map((corner) => {
      const parsed = Number.parseFloat(corner)
      return `${Math.max(Number.isFinite(parsed) ? parsed : 0, minimum)}px`
    })
    .join(" ")
}

export type SummonRect = { top: number; left: number; width: number; height: number }

export function readSummonRect(element: HTMLElement, padding = 4): SummonRect {
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  }
}

export function rectsEqual(a: SummonRect | null, b: SummonRect | null) {
  if (!a || !b) return a === b
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  )
}
