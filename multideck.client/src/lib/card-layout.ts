/**
 * The four layout presets, written down as whole arrangements.
 *
 * A preset is not a page width. It decides where the person's mark sits, how
 * loud the heading is, how the fields are drawn, and how tight the rhythm is —
 * so the four options read as four templates rather than four margins. The
 * public page, the live preview and the picker thumbnails all resolve from this
 * one table, so a preset can never look one way in the chooser and another way
 * in a visitor's browser.
 */

import type { CardLayout } from "@/data/contact-card-data"

/** Box: a bordered field. Underline: a rule under the text, editorial style. */
export type CardFieldVariant = "box" | "underline"

/**
 * Where the identity mark sits.
 * - `above`   mark on its own line, heading below it
 * - `beside`  mark on the same line as the person's name and role
 * - `byline`  mark below the heading, credited like an article author
 * - `hero`    large, centred, with an accent halo
 */
export type CardMarkPlacement = "above" | "beside" | "byline" | "hero"

/** Circles for the softer presets; a rounded square for the dense one. */
export type CardMarkShape = "circle" | "squircle"

/** Pills: icon buttons. Rows: icon plus label, one per line. */
export type CardSocialStyle = "pills" | "rows" | "icons"

export type CardLayoutSpec = {
  id: CardLayout
  label: string
  detail: string
  /** Page column, in px. */
  maxWidth: number
  centred: boolean
  /** Page padding: horizontal, above the content, below it. */
  padX: number
  padTop: number
  padBottom: number
  mark: { size: number; placement: CardMarkPlacement; shape: CardMarkShape; halo: boolean }
  /** Company name above the heading, uppercase and tracked out. */
  eyebrow: boolean
  /** A short accent rule that opens the heading block. */
  rule: boolean
  /** The person's name and role beside or below the heading, on the form screen. */
  showName: boolean
  heading: { size: number; tracking: string; leading: number }
  subheading: { size: number; leading: number }
  social: { style: CardSocialStyle; size: number }
  field: { variant: CardFieldVariant; height: number; gap: number; labelCaps: boolean }
  /** The form sits on a raised surface rather than directly on the page. */
  formOnSurface: boolean
  /** Identity block → social row → form. */
  introGap: number
  socialGap: number
  formGap: number
  /** Exchange screen: the mark inside the contact-details card. */
  detailMark: number
  /** Exchange screen: shadow for depth, or a hairline for a printed feel. */
  detailSurface: "raised" | "outlined"
  /** Exchange screen: vertical padding on each contact row. */
  detailRowPad: number
}

const SPECS: Record<CardLayout, CardLayoutSpec> = {
  classic: {
    id: "classic",
    label: "Classic",
    detail: "Roomy and familiar",
    maxWidth: 480,
    centred: false,
    padX: 24,
    padTop: 36,
    padBottom: 64,
    mark: { size: 56, placement: "above", shape: "circle", halo: false },
    eyebrow: false,
    rule: false,
    showName: false,
    heading: { size: 26, tracking: "-0.012em", leading: 1.2 },
    subheading: { size: 15, leading: 1.55 },
    social: { style: "pills", size: 40 },
    field: { variant: "box", height: 52, gap: 18, labelCaps: false },
    formOnSurface: false,
    introGap: 16,
    socialGap: 20,
    formGap: 32,
    detailMark: 56,
    detailSurface: "raised",
    detailRowPad: 14,
  },

  // Print-page hierarchy: a small tracked-out company line, one loud heading,
  // and the person credited underneath like a byline.
  editorial: {
    id: "editorial",
    label: "Editorial",
    detail: "One loud headline",
    maxWidth: 560,
    centred: false,
    padX: 28,
    padTop: 40,
    padBottom: 72,
    mark: { size: 40, placement: "byline", shape: "circle", halo: false },
    eyebrow: true,
    rule: true,
    showName: true,
    heading: { size: 34, tracking: "-0.028em", leading: 1.08 },
    subheading: { size: 16.5, leading: 1.55 },
    social: { style: "rows", size: 34 },
    field: { variant: "underline", height: 50, gap: 22, labelCaps: true },
    formOnSurface: false,
    introGap: 18,
    socialGap: 24,
    formGap: 36,
    detailMark: 44,
    detailSurface: "outlined",
    detailRowPad: 16,
  },

  // Everything above the fold on a phone: narrower column, smaller type, the
  // name earning its place on the same line as the mark.
  compact: {
    id: "compact",
    label: "Compact",
    detail: "All above the fold",
    maxWidth: 400,
    centred: false,
    padX: 20,
    padTop: 22,
    padBottom: 44,
    mark: { size: 40, placement: "beside", shape: "squircle", halo: false },
    eyebrow: false,
    rule: false,
    showName: true,
    heading: { size: 20, tracking: "-0.008em", leading: 1.25 },
    subheading: { size: 13.5, leading: 1.5 },
    social: { style: "icons", size: 34 },
    field: { variant: "box", height: 48, gap: 12, labelCaps: false },
    formOnSurface: false,
    introGap: 12,
    socialGap: 14,
    formGap: 20,
    detailMark: 40,
    detailSurface: "raised",
    detailRowPad: 10,
  },

  // The person first: a large haloed mark, centred type, and the form set down
  // on its own surface so the page reads as portrait then task.
  spotlight: {
    id: "spotlight",
    label: "Spotlight",
    detail: "Centred on the person",
    maxWidth: 460,
    centred: true,
    padX: 22,
    padTop: 32,
    padBottom: 64,
    mark: { size: 88, placement: "hero", shape: "circle", halo: true },
    eyebrow: false,
    rule: false,
    showName: false,
    heading: { size: 27, tracking: "-0.018em", leading: 1.18 },
    subheading: { size: 15.5, leading: 1.6 },
    social: { style: "pills", size: 44 },
    field: { variant: "box", height: 52, gap: 16, labelCaps: false },
    formOnSurface: true,
    introGap: 18,
    socialGap: 20,
    formGap: 24,
    detailMark: 60,
    detailSurface: "raised",
    detailRowPad: 14,
  },
}

export const CARD_LAYOUT_SPECS: CardLayoutSpec[] = [SPECS.classic, SPECS.editorial, SPECS.compact, SPECS.spotlight]

export function resolveCardLayout(layout: CardLayout | undefined): CardLayoutSpec {
  return SPECS[layout ?? "classic"] ?? SPECS.classic
}

/**
 * How far the mark rises into a cover header.
 *
 * Proportional to the mark, so a hero portrait and a compact tile both sit on
 * the same optical line instead of one floating and the other sinking.
 */
export function markCoverOffset(size: number): number {
  return -Math.round(size * 0.66)
}
