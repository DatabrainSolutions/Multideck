/**
 * Resolves a card's branding into concrete colours and radii.
 *
 * The public page and the live preview both read from here, so what an owner
 * sees while editing is what a visitor gets. It is also where the contrast rule
 * lives: an accent that cannot carry button text is used for decoration only,
 * and the action falls back to a colour that can.
 */

import { accentCanCarryActions, mix, readableInk, withAlpha } from "@/lib/color"
import type { CardBranding } from "@/data/contact-card-data"

export type ResolvedCardTheme = {
  pageBg: string
  surface: string
  surfaceMuted: string
  fieldBg: string
  ink: string
  text: string
  subtle: string
  hairline: string
  accent: string
  accentSoft: string
  /** The colour actually used behind action text, after the contrast check. */
  actionBg: string
  actionInk: string
  actionHover: string
  focusRing: string
  errorInk: string
  errorSoft: string
  radiusOuter: string
  radiusField: string
  radiusPill: string
  shadow: string
  /** False when the accent failed contrast and the action fell back. */
  accentCarriesActions: boolean
  isDark: boolean
}

const LIGHT = {
  pageBg: "#f1f4f3",
  surface: "#ffffff",
  surfaceMuted: "#f6f8f7",
  ink: "#0b1413",
  text: "#41514e",
  subtle: "#71817e",
  hairline: "rgba(11, 20, 19, 0.09)",
  shadow: "0 1px 2px rgba(11, 20, 19, 0.05), 0 12px 28px rgba(11, 20, 19, 0.07)",
}

const DARK = {
  pageBg: "#0c1413",
  surface: "#161f1e",
  surfaceMuted: "#1c2725",
  ink: "#f1f5f4",
  text: "#b6c3c1",
  subtle: "#8a9997",
  hairline: "rgba(255, 255, 255, 0.1)",
  shadow: "0 1px 2px rgba(0, 0, 0, 0.4), 0 14px 32px rgba(0, 0, 0, 0.34)",
}

export function resolveCardTheme(branding: CardBranding): ResolvedCardTheme {
  const isDark = branding.theme === "dark"
  const base = isDark ? DARK : LIGHT
  const accent = branding.accent

  const pageBg = branding.theme === "tinted" ? mix(accent, "#ffffff", 0.93) : base.pageBg

  // A brand colour may tint a page without being usable behind button text: it
  // has to be legible *and* separable from the surface it sits on.
  const accentCarriesActions = accentCanCarryActions(accent, pageBg)
  const fallbackAction = isDark ? "#f1f5f4" : "#0b1413"

  const actionBg = accentCarriesActions ? accent : fallbackAction
  const actionInk = readableInk(actionBg)

  const soft = branding.cornerStyle === "soft"

  return {
    pageBg,
    surface: base.surface,
    surfaceMuted: branding.theme === "tinted" ? mix(accent, "#ffffff", 0.965) : base.surfaceMuted,
    fieldBg: base.surface,
    ink: base.ink,
    text: base.text,
    subtle: isDark ? "#8a9997" : base.subtle,
    hairline: base.hairline,
    accent,
    accentSoft: withAlpha(accent, isDark ? 0.22 : 0.12),
    actionBg,
    actionInk,
    actionHover: mix(actionBg, isDark ? "#ffffff" : "#000000", 0.12),
    focusRing: withAlpha(accentCarriesActions ? accent : isDark ? "#ffffff" : "#0b1413", 0.28),
    errorInk: isDark ? "#f08c8c" : "#c2453f",
    errorSoft: isDark ? "rgba(240, 140, 140, 0.14)" : "rgba(194, 69, 63, 0.08)",
    radiusOuter: soft ? "18px" : "4px",
    radiusField: soft ? "12px" : "3px",
    radiusPill: soft ? "999px" : "4px",
    shadow: base.shadow,
    accentCarriesActions,
    isDark,
  }
}

/** CSS custom properties, so the public page can be styled without prop drilling. */
export function cardThemeVariables(theme: ResolvedCardTheme): React.CSSProperties {
  return {
    "--card-page-bg": theme.pageBg,
    "--card-surface": theme.surface,
    "--card-surface-muted": theme.surfaceMuted,
    "--card-field-bg": theme.fieldBg,
    "--card-ink": theme.ink,
    "--card-text": theme.text,
    "--card-subtle": theme.subtle,
    "--card-hairline": theme.hairline,
    "--card-accent": theme.accent,
    "--card-accent-soft": theme.accentSoft,
    "--card-action-bg": theme.actionBg,
    "--card-action-ink": theme.actionInk,
    "--card-action-hover": theme.actionHover,
    "--card-focus-ring": theme.focusRing,
    "--card-error-ink": theme.errorInk,
    "--card-error-soft": theme.errorSoft,
    "--card-radius-outer": theme.radiusOuter,
    "--card-radius-field": theme.radiusField,
    "--card-radius-pill": theme.radiusPill,
    "--card-shadow": theme.shadow,
  } as React.CSSProperties
}
