import type { CSSProperties } from "react"

export type PublicBranding = {
  displayName: string
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  surfaceColor: string
  textColor: string
  appearanceMode: "light" | "dark"
  cornerStyle: "rounded" | "sharp"
  emailSignOff: string
}

/**
 * The bounded brand contract for tenant-brandable public surfaces.
 *
 * Two rules meet here. Multideck design tokens stay the default, so nothing
 * rewrites a `--md-*` or shadcn variable; this declares its own `--brand-*` set
 * on the one element that owns a customer-facing surface, and components read
 * them as `var(--brand-accent, var(--md-accent))`. Outside a branded surface
 * the fallback is the only value there is, so the same component renders in
 * Multideck's palette on operator screens and in the gallery.
 *
 * And a public page is not the visitor's application. It is Multideck teal on
 * white, or the tenant's own palette where one is saved — never the visitor's
 * system or app theme. Every value is therefore declared even with no brand,
 * and `colorScheme` is pinned, so a visitor in dark mode still sees the page
 * the organiser published.
 */
export type PublicBrandTheme = CSSProperties

const multideckLight = {
  background: "#ffffff",
  surface: "#ffffff",
  ink: "#0b1413",
  accent: "#0E7D74",
  corners: "rounded" as const,
  appearance: "light" as const,
}

/** White or near-black, whichever the brand's own colour can actually carry. */
export function readableInk(color: string) {
  const hex = color.trim().replace("#", "")
  const full = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) return "#ffffff"
  const channel = (index: number) => {
    const value = Number.parseInt(full.slice(index, index + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4) > 0.42 ? "#0b1413" : "#ffffff"
}

export function publicBrandTheme(brand: PublicBranding | null | undefined): PublicBrandTheme {
  const ink = brand?.textColor || multideckLight.ink
  const surface = brand?.surfaceColor || multideckLight.surface
  const accent = brand?.primaryColor || multideckLight.accent
  const appearance = brand?.appearanceMode || multideckLight.appearance
  const accentInk = readableInk(accent)
  const wash = (percentage: number) => `color-mix(in srgb, ${accent} ${percentage}%, transparent)`
  const inked = (percentage: number) => `color-mix(in srgb, ${ink} ${percentage}%, ${surface})`
  return {
    "--brand-bg": brand?.backgroundColor || multideckLight.background,
    "--brand-surface": surface,
    "--brand-tint": inked(4),
    "--brand-hover": inked(7),
    "--brand-ink": ink,
    "--brand-text": inked(72),
    "--brand-subtle": inked(54),
    "--brand-line": `color-mix(in srgb, ${ink} 10%, transparent)`,
    "--brand-field": inked(5),
    "--brand-field-hover": inked(8),
    "--brand-accent": accent,
    "--brand-accent-ink": accentInk,
    "--brand-a08": wash(8),
    "--brand-a14": wash(14),
    "--brand-a16": wash(16),
    "--brand-a20": wash(20),
    "--brand-a28": wash(28),
    "--brand-a38": wash(38),
    "--brand-a48": wash(48),
    // Errors stay a fixed red rather than the app's theme-dependent one, so the
    // page reads the same for every visitor.
    "--brand-danger": appearance === "dark" ? "#f08a8a" : "#c93f3f",
    "--brand-radius": (brand?.cornerStyle || multideckLight.corners) === "sharp" ? "6px" : "18px",
    colorScheme: appearance,
  } as CSSProperties
}
