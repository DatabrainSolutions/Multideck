/**
 * Small colour helpers for card branding.
 *
 * A card owner can pick any accent they like. These functions exist so the
 * public page can decide what that colour is safe to be used *for* — a brand
 * colour that fails contrast is allowed to tint a band, but never to sit behind
 * button text.
 */

export type Rgb = { r: number; g: number; b: number }

export function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, "")
  const expanded = value.length === 3 ? value.split("").map((part) => part + part).join("") : value
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  }
}

export function toHex({ r, g, b }: Rgb) {
  const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")
  return `#${part(r)}${part(g)}${part(b)}`
}

/** WCAG relative luminance. */
export function luminance(color: Rgb) {
  const channel = (value: number) => {
    const ratio = value / 255
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

export function contrastRatio(a: Rgb, b: Rgb) {
  const first = luminance(a)
  const second = luminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 11, g: 20, b: 19 }

/** The better of white or near-black text on the given background. */
export function readableInk(background: string) {
  const color = parseHex(background)
  if (!color) return "#ffffff"
  return contrastRatio(color, WHITE) >= contrastRatio(color, BLACK) ? "#ffffff" : "#0b1413"
}

export function bestInkContrast(background: string) {
  const color = parseHex(background)
  if (!color) return 0
  return Math.max(contrastRatio(color, WHITE), contrastRatio(color, BLACK))
}

/**
 * Whether an accent can carry button-sized text at 4.5:1.
 *
 * Because the ink flips between white and near-black, this is true for almost
 * every colour — the worst case sits around 4.58:1 at the crossover. It is kept
 * as an explicit gate rather than assumed, so a future palette change cannot
 * quietly ship unreadable buttons.
 */
export function isAccentReadable(accent: string) {
  return bestInkContrast(accent) >= 4.5
}

/**
 * Whether an accent is separable from the surface behind it.
 *
 * This is the check that actually bites: a pale brand colour on a pale page
 * makes a button with no discernible edge, which reads as broken even though
 * its label is perfectly legible.
 */
export function isAccentDistinct(accent: string, background: string, minimum = 1.7) {
  const a = parseHex(accent)
  const b = parseHex(background)
  if (!a || !b) return true
  return contrastRatio(a, b) >= minimum
}

/** Both gates: an accent may sit behind action text only if it passes each. */
export function accentCanCarryActions(accent: string, background: string) {
  return isAccentReadable(accent) && isAccentDistinct(accent, background)
}

export function mix(from: string, to: string, amount: number) {
  const a = parseHex(from)
  const b = parseHex(to)
  if (!a || !b) return from
  return toHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  })
}

export function withAlpha(hex: string, alpha: number) {
  const color = parseHex(hex)
  if (!color) return hex
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
}

/** A soft, readable page tint derived from the accent, for tinted themes. */
export function tintedSurface(accent: string, theme: "light" | "dark") {
  return theme === "dark" ? mix(accent, "#07100f", 0.86) : mix(accent, "#ffffff", 0.94)
}
