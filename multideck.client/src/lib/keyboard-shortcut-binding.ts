/**
 * The shortcut grammar shared by the settings panel, the global dispatcher and
 * the Dexter summon gesture.
 *
 * Deliberately free of React and of `window` at module scope so the rules can be
 * unit tested and so a binding can be parsed during the first paint.
 *
 * A binding is one of two things:
 * - a `chord`: one or two key steps. Two steps make a sequence ("G" then "B"),
 *   which is how the navigation shortcuts avoid competing with browser chords.
 * - a `pointer`: a mouse gesture with modifiers, which is what makes
 *   "hold the platform modifier and double-click anything" expressible as a
 *   customisable shortcut rather than a hardcoded listener.
 *
 * `mod` is the platform's command modifier: ⌘ on Apple hardware, Ctrl elsewhere.
 * Storing intent rather than a literal key is what lets one saved preference
 * follow an operator between a Mac and a Windows machine.
 */

export type ShortcutStep = {
  /** Layout-independent key name: "K", "7", "/", "Enter", "ArrowUp", "F2". */
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
}

export type ShortcutPointerGesture = "double-click"

export type ShortcutBinding =
  | { kind: "chord"; steps: ShortcutStep[] }
  | { kind: "pointer"; gesture: ShortcutPointerGesture; mod: boolean; shift: boolean; alt: boolean }

export const maxShortcutSteps = 2

const namedKeys = [
  "Enter",
  "Escape",
  "Space",
  "Tab",
  "Backspace",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]

const namedKeyLookup = new Map(namedKeys.map((key) => [key.toLowerCase(), key]))

/**
 * Keys the browser or operating system claims. A binding may still use them —
 * an operator who wants ⌘W is entitled to it — but the editor warns first, which
 * is cheaper than debugging a shortcut that closes the tab.
 *
 * ⌘D is absent on purpose: Multideck claims it for the Dexter summon and cancels
 * the browser's default, so warning about it would be warning about ourselves.
 */
const reservedModKeys = new Set(["W", "T", "N", "Q", "L", "R", "P", "S", "F", "M", "H"])

const keyLabels: Record<string, string> = {
  Space: "Space",
  Enter: "↵",
  Escape: "Esc",
  Tab: "⇥",
  Backspace: "⌫",
  Delete: "⌦",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  PageUp: "⇞",
  PageDown: "⇟",
  Home: "↖",
  End: "↘",
}

export function isApplePlatform() {
  if (typeof navigator === "undefined") return false

  const withPlatform = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = withPlatform.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent
  return /Mac|iPhone|iPad|iPod/i.test(platform)
}

export type ShortcutPlatform = "apple" | "other"

export function shortcutPlatform(): ShortcutPlatform {
  return isApplePlatform() ? "apple" : "other"
}

export function modifierLabels(platform: ShortcutPlatform) {
  return platform === "apple"
    ? { mod: "⌘", shift: "⇧", alt: "⌥" }
    : { mod: "Ctrl", shift: "Shift", alt: "Alt" }
}

export function emptyStep(): ShortcutStep {
  return { key: "", mod: false, shift: false, alt: false }
}

export function chord(key: string, modifiers: Partial<Omit<ShortcutStep, "key">> = {}): ShortcutBinding {
  return { kind: "chord", steps: [{ ...emptyStep(), ...modifiers, key }] }
}

export function sequence(first: string, second: string): ShortcutBinding {
  return { kind: "chord", steps: [{ ...emptyStep(), key: first }, { ...emptyStep(), key: second }] }
}

export function pointerGesture(modifiers: Partial<Omit<ShortcutStep, "key">> = {}): ShortcutBinding {
  return { kind: "pointer", gesture: "double-click", mod: true, shift: false, alt: false, ...modifiers }
}

function normalizeKeyName(value: string) {
  if (!value) return ""
  if (value === " ") return "Space"

  const named = namedKeyLookup.get(value.toLowerCase())
  if (named) return named
  if (/^f([1-9]|1[0-2])$/i.test(value)) return value.toUpperCase()
  if (value.length === 1) return value.toUpperCase()

  return value
}

/**
 * The key a physical `code` stands for, when that code is a plain letter or
 * digit. `event.key` is unreliable under Alt on macOS (⌥K reports "˚") and under
 * non-Latin layouts, so the code is the honest answer where one exists.
 */
function keyFromCode(code: string | undefined) {
  if (!code) return ""
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]
  const digit = /^Digit([0-9])$/.exec(code)
  if (digit) return digit[1]

  switch (code) {
    case "Slash":
      return "/"
    case "Comma":
      return ","
    case "Period":
      return "."
    case "Semicolon":
      return ";"
    case "Quote":
      return "'"
    case "BracketLeft":
      return "["
    case "BracketRight":
      return "]"
    case "Backslash":
      return "\\"
    case "Minus":
      return "-"
    case "Equal":
      return "="
    case "Backquote":
      return "`"
    case "Space":
      return "Space"
    default:
      return ""
  }
}

const modifierKeyNames = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph", "Dead", "Unidentified", "Process"])

export type ShortcutKeyEvent = {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export function isModifierOnlyEvent(event: ShortcutKeyEvent) {
  return modifierKeyNames.has(event.key)
}

/** Reads the platform command modifier, and rejects the other one being held. */
function readModifier(event: { metaKey: boolean; ctrlKey: boolean }, platform: ShortcutPlatform) {
  const primary = platform === "apple" ? event.metaKey : event.ctrlKey
  const secondary = platform === "apple" ? event.ctrlKey : event.metaKey
  return { mod: primary, foreign: secondary }
}

/** The step an operator just pressed, or null when only modifiers are down. */
export function stepFromEvent(event: ShortcutKeyEvent, platform = shortcutPlatform()): ShortcutStep | null {
  if (isModifierOnlyEvent(event)) return null

  const { mod } = readModifier(event, platform)
  const key = keyFromCode(event.code) || normalizeKeyName(event.key)
  if (!key) return null

  return { key, mod, shift: event.shiftKey, alt: event.altKey }
}

export function matchesStep(step: ShortcutStep, event: ShortcutKeyEvent, platform = shortcutPlatform()) {
  if (isModifierOnlyEvent(event)) return false

  const { mod, foreign } = readModifier(event, platform)
  if (mod !== step.mod || foreign) return false
  if (event.shiftKey !== step.shift || event.altKey !== step.alt) return false

  const fromCode = keyFromCode(event.code)
  const fromKey = normalizeKeyName(event.key)
  return step.key === fromCode || step.key === fromKey
}

export function matchesPointerBinding(
  binding: ShortcutBinding,
  event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  platform = shortcutPlatform(),
) {
  if (binding.kind !== "pointer") return false

  const { mod, foreign } = readModifier(event, platform)
  return mod === binding.mod && !foreign && event.shiftKey === binding.shift && event.altKey === binding.alt
}

function serializeStep(step: ShortcutStep) {
  const parts: string[] = []
  if (step.mod) parts.push("Mod")
  if (step.alt) parts.push("Alt")
  if (step.shift) parts.push("Shift")
  parts.push(step.key)
  return parts.join("+")
}

/** The stored form. Steps are space separated so a sequence reads as "G B". */
export function serializeBinding(binding: ShortcutBinding): string {
  if (binding.kind === "pointer") {
    const parts: string[] = []
    if (binding.mod) parts.push("Mod")
    if (binding.alt) parts.push("Alt")
    if (binding.shift) parts.push("Shift")
    parts.push("DoubleClick")
    return parts.join("+")
  }

  return binding.steps.map(serializeStep).join(" ")
}

function parseStep(value: string): ShortcutStep | null {
  const parts = value.split("+").map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return null

  const step = emptyStep()
  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === "mod" || lower === "cmd" || lower === "meta" || lower === "ctrl" || lower === "control") step.mod = true
    else if (lower === "shift") step.shift = true
    else if (lower === "alt" || lower === "option" || lower === "opt") step.alt = true
    else step.key = normalizeKeyName(part)
  }

  return step.key ? step : null
}

export function parseBinding(value: string | null | undefined): ShortcutBinding | null {
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  if (!trimmed) return null

  if (/doubleclick/i.test(trimmed)) {
    const parts = trimmed.split("+").map((part) => part.trim().toLowerCase())
    return {
      kind: "pointer",
      gesture: "double-click",
      mod: parts.includes("mod") || parts.includes("cmd") || parts.includes("meta") || parts.includes("ctrl"),
      shift: parts.includes("shift"),
      alt: parts.includes("alt") || parts.includes("option"),
    }
  }

  const steps = trimmed.split(/\s+/).map(parseStep).filter((step): step is ShortcutStep => Boolean(step))
  if (steps.length === 0) return null

  return { kind: "chord", steps: steps.slice(0, maxShortcutSteps) }
}

export function bindingsEqual(a: ShortcutBinding | null, b: ShortcutBinding | null) {
  if (!a || !b) return a === b
  return serializeBinding(a) === serializeBinding(b)
}

/**
 * The tokens to render, one array per step, so a sequence can be drawn as two
 * `Kbd` groups joined by "then" rather than one unreadable run of glyphs.
 */
export function bindingTokens(binding: ShortcutBinding | null, platform = shortcutPlatform()): string[][] {
  if (!binding) return []

  const labels = modifierLabels(platform)
  const decorate = (source: { mod: boolean; alt: boolean; shift: boolean }, key: string) => {
    const tokens: string[] = []
    if (source.mod) tokens.push(labels.mod)
    if (source.alt) tokens.push(labels.alt)
    if (source.shift) tokens.push(labels.shift)
    tokens.push(key)
    return tokens
  }

  if (binding.kind === "pointer") return [decorate(binding, "Double-click")]
  return binding.steps.map((step) => decorate(step, keyLabels[step.key] ?? step.key))
}

/** A single flat label, for tooltips, `title` attributes and screen readers. */
export function bindingLabel(binding: ShortcutBinding | null, platform = shortcutPlatform()) {
  const tokens = bindingTokens(binding, platform)
  if (tokens.length === 0) return ""
  return tokens.map((step) => step.join(" ")).join(" then ")
}

/** The `aria-keyshortcuts` form, which is specified in terms of real key names. */
export function bindingAriaKeyshortcuts(binding: ShortcutBinding | null) {
  if (!binding || binding.kind !== "chord" || binding.steps.length !== 1) return undefined

  const [step] = binding.steps
  const parts: string[] = []
  if (step.mod) parts.push("Meta", "Control")
  if (step.alt) parts.push("Alt")
  if (step.shift) parts.push("Shift")
  const key = step.key === "Space" ? " " : step.key

  // Both platform spellings are advertised, space separated, per the ARIA spec.
  if (step.mod) {
    const others = parts.filter((part) => part !== "Meta" && part !== "Control")
    return [["Meta", ...others, key].join("+"), ["Control", ...others, key].join("+")].join(" ")
  }

  return [...parts, key].join("+")
}

export function isSequenceBinding(binding: ShortcutBinding | null) {
  return Boolean(binding && binding.kind === "chord" && binding.steps.length > 1)
}

/**
 * True when a binding is safe to fire while the operator is typing. Only chords
 * that hold a modifier qualify: a bare "/" or a "G B" sequence has to stay out
 * of the way of a search box, a note field or the Dexter composer.
 */
export function bindingSurvivesTyping(binding: ShortcutBinding | null) {
  if (!binding) return false
  if (binding.kind === "pointer") return true
  return binding.steps.length === 1 && (binding.steps[0].mod || binding.steps[0].alt)
}

export function isReservedBinding(binding: ShortcutBinding | null) {
  if (!binding || binding.kind !== "chord" || binding.steps.length !== 1) return false

  const [step] = binding.steps
  return step.mod && !step.alt && !step.shift && reservedModKeys.has(step.key)
}

const editableInputTypes = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
])

/** Whether keystrokes at this element belong to the operator's typing. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false

  const element = target as HTMLElement
  if (element.isContentEditable) return true

  const tag = element.tagName
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (tag === "INPUT") {
    const type = (element as HTMLInputElement).type?.toLowerCase() ?? "text"
    return editableInputTypes.has(type)
  }

  return Boolean(element.closest('[contenteditable="true"]'))
}
