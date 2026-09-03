import { useEffect, useState, useSyncExternalStore } from "react"
import { animate } from "motion/react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getApiWorkspacePreferences } from "@/lib/api"
import {
  getCompanyAppearanceSnapshot,
  loadCompanyAppearance,
  subscribeCompanyAppearance,
  type CompanyAppearanceBrand,
} from "@/lib/company-appearance"
import { readableInk } from "@/lib/color"
import { getClientAuth, supabase } from "@/lib/supabase"
import { updateWorkspaceBootstrapPreferences } from "@/lib/workspace-bootstrap"
import { watchCompanyAppearanceReset } from "@/lib/company-appearance-sync"

/**
 * The product reads its accent from one place. Every accent surface in the app —
 * solid fills, alpha washes, focus rings, selected rows, the brand shadows and
 * the Dexter shader ramps — derives from the base colours emitted here, so
 * swapping the accent is a single stylesheet write rather than a sweep through
 * hundreds of declarations.
 *
 * Derivation happens in Oklab: a hue rotation in sRGB drifts in lightness and
 * would break contrast on the neutral surfaces, whereas holding Oklab lightness
 * fixed keeps every preset landing on the same perceived weight.
 */

/* ------------------------------------------------------------------ colour math */

const srgbToLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)

const linearToSrgb = (channel: number) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055

type Rgb = [number, number, number]
type Oklab = [number, number, number]

export type Oklch = { l: number; c: number; h: number }

function hexToRgb(hex: string): Rgb {
  const raw = hex.replace("#", "")
  const full = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw
  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255) as Rgb
}

function rgbToHex([r, g, b]: Rgb) {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

function rgbToOklab([r, g, b]: Rgb): Oklab {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToRgb([lightness, a, b]: Oklab): Rgb {
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b
  const l = lRoot ** 3
  const m = mRoot ** 3
  const s = sRoot ** 3

  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

const isDisplayable = (rgb: Rgb) => rgb.every((channel) => channel >= -0.0001 && channel <= 1.0001)

function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180
  return oklabToRgb([l, c * Math.cos(radians), c * Math.sin(radians)])
}

/**
 * Oklab can describe colours sRGB cannot show. Rather than clipping channels —
 * which shifts hue and flattens the colour — walk the chroma down until the
 * colour fits, keeping lightness and hue exactly where the recipe asked for them.
 */
function oklchToHex(target: Oklch): string {
  const clamped: Oklch = { ...target, l: Math.min(1, Math.max(0, target.l)), c: Math.max(0, target.c) }

  if (isDisplayable(oklchToRgb(clamped))) return rgbToHex(oklchToRgb(clamped))

  let low = 0
  let high = clamped.c
  for (let step = 0; step < 20; step += 1) {
    const mid = (low + high) / 2
    if (isDisplayable(oklchToRgb({ ...clamped, c: mid }))) low = mid
    else high = mid
  }

  return rgbToHex(oklchToRgb({ ...clamped, c: low }))
}

export function hexToOklch(hex: string): Oklch {
  const [l, a, b] = rgbToOklab(hexToRgb(hex))
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l, c: Math.hypot(a, b), h }
}

/** Perceptual blend used to keep shader ramps in step with the CSS cross-fade. */
export function mixHexOklab(from: string, to: string, progress: number) {
  const a = rgbToOklab(hexToRgb(from))
  const b = rgbToOklab(hexToRgb(to))
  const lerp = (start: number, end: number) => start + (end - start) * progress
  return rgbToHex(oklabToRgb([lerp(a[0], b[0]), lerp(a[1], b[1]), lerp(a[2], b[2])]))
}

/* ---------------------------------------------------------------------- presets */

export type AccentPresetId =
  | "teal"
  | "meadow"
  | "sky"
  | "ocean"
  | "indigo"
  | "violet"
  | "plum"
  | "rose"
  | "ember"
  | "graphite"
  | "lime"
  | "gold"
  | "coral"
  | "cobalt"
  | "fuchsia"

export type AccentPreset = {
  id: AccentPresetId
  label: string
  hint: string
  /** Sits on the light neutrals; carries white text at 5.4:1 or better. */
  light: string
  /** Sits on the dark neutrals; carries the dark accent ink at 8.5:1 or better. */
  dark: string
}

export const companyAccentPreferenceId = "company" as const
export type AccentPreferenceId = AccentPresetId | typeof companyAccentPreferenceId

/**
 * Each preset is a hand-checked pair rather than one colour dimmed for dark mode:
 * a light accent readable on `#f3f4f4` would disappear on `#1b1e20`, and the dark
 * accent inverts which ink it can carry. Most presets share a consistent Oklab
 * lightness for their mode. Ocean and Plum deliberately vary that weight in both
 * modes so they stay distinct from Cobalt and Fuchsia without sacrificing contrast.
 */
export const accentPresets: AccentPreset[] = [
  { id: "teal", label: "Multideck teal", hint: "The original", light: "#0a7068", dark: "#69d4c2" },
  { id: "meadow", label: "Meadow", hint: "Warm green", light: "#30713d", dark: "#89d394" },
  { id: "sky", label: "Sky", hint: "Bright cyan", light: "#006d80", dark: "#55d1ec" },
  { id: "ocean", label: "Ocean", hint: "Slate blue", light: "#27495d", dark: "#b9e1f3" },
  { id: "indigo", label: "Indigo", hint: "Cool blue", light: "#4e5a9f", dark: "#aabaff" },
  { id: "violet", label: "Violet", hint: "Soft purple", light: "#705090", dark: "#d0abf9" },
  { id: "plum", label: "Plum", hint: "Muted berry", light: "#5b3048", dark: "#f1d2df" },
  { id: "rose", label: "Rose", hint: "Muted red", light: "#93454a", dark: "#ff9fa2" },
  { id: "ember", label: "Ember", hint: "Burnt orange", light: "#8d4e1c", dark: "#f7aa74" },
  { id: "graphite", label: "Graphite", hint: "Near neutral", light: "#566465", dark: "#b1c2c3" },
  { id: "lime", label: "Electric lime", hint: "Sharp chartreuse", light: "#516c00", dark: "#a8ce5b" },
  { id: "gold", label: "Gold", hint: "Warm metallic", light: "#7b5b00", dark: "#e7b643" },
  { id: "coral", label: "Vivid coral", hint: "Bright red orange", light: "#a83212", dark: "#ffa28b" },
  { id: "cobalt", label: "Cobalt", hint: "Electric royal blue", light: "#2d56c5", dark: "#9fbdff" },
  { id: "fuchsia", label: "Fuchsia", hint: "High energy pink", light: "#90368b", dark: "#ed9fe6" },
]

export const defaultAccentPresetId: AccentPresetId = "teal"

const presetsById = new Map(accentPresets.map((preset) => [preset.id, preset]))

export function isAccentPresetId(value: unknown): value is AccentPresetId {
  return typeof value === "string" && presetsById.has(value as AccentPresetId)
}

export function isAccentPreferenceId(value: unknown): value is AccentPreferenceId {
  return value === companyAccentPreferenceId || isAccentPresetId(value)
}

export function getAccentPreset(id: AccentPresetId): AccentPreset {
  return presetsById.get(id) ?? presetsById.get(defaultAccentPresetId)!
}

/* ------------------------------------------------------------------ derivations */

/**
 * A role in the ramp: absolute Oklab lightness where given (otherwise an offset
 * from the base), a chroma multiplier, and a hue offset in degrees.
 */
type Recipe = { l?: number; dl?: number; c: number; dh?: number }

function derive(base: Oklch, recipe: Recipe) {
  return oklchToHex({
    l: recipe.l ?? base.l + (recipe.dl ?? 0),
    c: base.c * recipe.c,
    h: base.h + (recipe.dh ?? 0),
  })
}

/**
 * Every number below was read back off the hand-tuned teal the product shipped
 * with, so the default preset reproduces it to within a rounding step and each
 * other preset inherits the same relationships.
 */
const lightRecipes = {
  hover: { dl: -0.003, c: 1 },
  tint: { dl: 0.04, c: 1.08 },
  selectedBg: { l: 0.878, c: 0.27, dh: -10 },
  selectedText: { l: 0.4275, c: 0.81, dh: -1 },
} satisfies Record<string, Recipe>

const darkRecipes = {
  hover: { dl: 0.022, c: 1 },
  tint: { dl: -0.02, c: 1 },
  selectedBg: { l: 0.333, c: 0.27 },
  selectedText: { l: 0.898, c: 0.5 },
  ink: { l: 0.223, c: 0.3 },
} satisfies Record<string, Recipe>

/**
 * Brand-dark colours and the shader ramps read from the *light* member in both
 * themes: the Dexter pill and brand mark are lit surfaces of their own, and the
 * product keeps that identity fixed rather than inverting it at night.
 *
 * The hue offsets matter as much as the lightness steps. A ramp that only varies
 * lightness renders as a flat wash, so the shader's stops rotate a little
 * counter-clockwise as they darken — that spread is what gives the pill its
 * depth, and it is why these are recipes rather than tints.
 */
const brandRecipes = {
  deep: { l: 0.355, c: 0.73, dh: -4.4 },
  abyss: { l: 0.237, c: 0.43, dh: -3.3 },
  shaderA: { l: 0.321, c: 0.74, dh: -14.5 },
  shaderB: { l: 0.486, c: 1.11, dh: -13.2 },
  shaderC: { l: 0.129, c: 0.085, dh: -11.4 },
  /* Watch mode's ambient background sits directly on the workspace. Its light
     ramp must remain luminous, unlike the deliberately dark Dexter brand ramp
     used by buttons and the composer. */
  watchLightA: { l: 0.91, c: 0.28, dh: -14.5 },
  watchLightB: { l: 0.98, c: 0.06, dh: -13.2 },
  watchLightC: { l: 0.9, c: 0.35, dh: -11.4 },
  brandA: { l: 0.508, c: 1.14, dh: -10.6 },
  brandB: { l: 0.735, c: 1.46, dh: -10.9 },
  brandC: { l: 0.24, c: 0.45, dh: -8.5 },
  /* The AI edge glow layers a bright core, a highlight and a rotated warm stop.
     The rotation is the point: two stops of the same hue blur into a flat halo,
     whereas 50° of separation keeps the glow reading as light with a direction. */
  glowCore: { l: 0.574, c: 1.18, dh: 0.7 },
  glowBright: { l: 0.691, c: 1.34, dh: -5.4 },
  glowWarm: { l: 0.603, c: 1.13, dh: -51 },
  /* Accents bright enough to sit on the near-black brand panels, where the
     ordinary accent would disappear. */
  lift: { l: 0.818, c: 0.85, dh: 0 },
  liftStrong: { l: 0.888, c: 0.95, dh: -5 },
  liftWarm: { l: 0.818, c: 1.36, dh: -25 },
} satisfies Record<string, Recipe>

export type AccentModeRamp = {
  accent: string
  accentHover: string
  accentInk: string
  accentTint: string
  selectedBg: string
  selectedText: string
}

export type ShaderStops = [string, string, string]

export type AccentBrandRamp = {
  deep: string
  abyss: string
  glowCore: string
  glowBright: string
  glowWarm: string
  lift: string
  liftStrong: string
  liftWarm: string
  shader: ShaderStops
  watchLight: ShaderStops
  brand: ShaderStops
}

export type AccentRamp = {
  light: AccentModeRamp
  dark: AccentModeRamp
  brand: AccentBrandRamp
}

const rampCache = new Map<AccentPresetId, AccentRamp>()
const companyRampCache = new Map<string, AccentRamp>()

function buildCompanyAccentRamp(brand: CompanyAppearanceBrand): AccentRamp {
  const key = `${brand.primaryColor}:${brand.secondaryColor}`
  const cached = companyRampCache.get(key)
  if (cached) return cached

  const primaryHex = brand.primaryColor.toLowerCase()
  const secondaryHex = brand.secondaryColor.toLowerCase()
  const primary = hexToOklch(primaryHex)
  const secondary = hexToOklch(secondaryHex)
  // Admin stores one customer-facing palette. The signed-in product derives a
  // brighter member for dark mode while preserving the company's hue, so this
  // personal choice remains readable in both Multideck appearance modes.
  const darkAccent = derive(primary, { l: 0.82, c: 0.72 })
  const dark = hexToOklch(darkAccent)

  const ramp: AccentRamp = {
    light: {
      accent: primaryHex,
      accentHover: derive(primary, lightRecipes.hover),
      accentInk: readableInk(primaryHex),
      accentTint: derive(primary, lightRecipes.tint),
      selectedBg: derive(primary, lightRecipes.selectedBg),
      selectedText: derive(primary, lightRecipes.selectedText),
    },
    dark: {
      accent: darkAccent,
      accentHover: derive(dark, darkRecipes.hover),
      accentInk: readableInk(darkAccent),
      accentTint: derive(dark, darkRecipes.tint),
      selectedBg: derive(dark, darkRecipes.selectedBg),
      selectedText: derive(dark, darkRecipes.selectedText),
    },
    brand: {
      deep: secondaryHex,
      abyss: derive(secondary, brandRecipes.abyss),
      glowCore: derive(primary, brandRecipes.glowCore),
      glowBright: derive(primary, brandRecipes.glowBright),
      glowWarm: derive(secondary, brandRecipes.glowWarm),
      lift: derive(primary, brandRecipes.lift),
      liftStrong: derive(primary, brandRecipes.liftStrong),
      liftWarm: derive(secondary, brandRecipes.liftWarm),
      shader: [secondaryHex, primaryHex, derive(secondary, brandRecipes.shaderC)],
      watchLight: [derive(primary, brandRecipes.watchLightA), derive(primary, brandRecipes.watchLightB), derive(secondary, brandRecipes.watchLightC)],
      brand: [primaryHex, derive(primary, brandRecipes.brandB), secondaryHex],
    },
  }

  companyRampCache.set(key, ramp)
  return ramp
}

export function buildAccentRamp(id: AccentPreferenceId): AccentRamp {
  if (id === companyAccentPreferenceId) {
    const brand = getCompanyAppearanceSnapshot().brand
    return brand ? buildCompanyAccentRamp(brand) : buildAccentRamp(defaultAccentPresetId)
  }
  const cached = rampCache.get(id)
  if (cached) return cached

  const preset = getAccentPreset(id)
  const light = hexToOklch(preset.light)
  const dark = hexToOklch(preset.dark)

  const ramp: AccentRamp = {
    light: {
      accent: preset.light,
      accentHover: derive(light, lightRecipes.hover),
      accentInk: "#ffffff",
      accentTint: derive(light, lightRecipes.tint),
      selectedBg: derive(light, lightRecipes.selectedBg),
      selectedText: derive(light, lightRecipes.selectedText),
    },
    dark: {
      accent: preset.dark,
      accentHover: derive(dark, darkRecipes.hover),
      accentInk: derive(dark, darkRecipes.ink),
      accentTint: derive(dark, darkRecipes.tint),
      selectedBg: derive(dark, darkRecipes.selectedBg),
      selectedText: derive(dark, darkRecipes.selectedText),
    },
    brand: {
      deep: derive(light, brandRecipes.deep),
      abyss: derive(light, brandRecipes.abyss),
      glowCore: derive(light, brandRecipes.glowCore),
      glowBright: derive(light, brandRecipes.glowBright),
      glowWarm: derive(light, brandRecipes.glowWarm),
      lift: derive(light, brandRecipes.lift),
      liftStrong: derive(light, brandRecipes.liftStrong),
      liftWarm: derive(light, brandRecipes.liftWarm),
      shader: [
        derive(light, brandRecipes.shaderA),
        derive(light, brandRecipes.shaderB),
        derive(light, brandRecipes.shaderC),
      ],
      watchLight: [
        derive(light, brandRecipes.watchLightA),
        derive(light, brandRecipes.watchLightB),
        derive(light, brandRecipes.watchLightC),
      ],
      brand: [
        derive(light, brandRecipes.brandA),
        derive(light, brandRecipes.brandB),
        derive(light, brandRecipes.brandC),
      ],
    },
  }

  rampCache.set(id, ramp)
  return ramp
}

/* ------------------------------------------------------------------- application */

export const accentShiftDurationMs = 460
/** Eases in gently, covers the middle quickly, then settles — no visible step. */
export const accentShiftEase = [0.32, 0.06, 0.2, 1] as [number, number, number, number]

const storageKey = "multideck.accentPreset"
const changeEventName = "multideck:accent-preset"
const styleElementId = "md-accent-theme"

export function readAccentPresetId(): AccentPreferenceId {
  if (typeof window === "undefined") return defaultAccentPresetId

  try {
    const stored = window.localStorage.getItem(storageKey)
    return isAccentPreferenceId(stored) ? stored : defaultAccentPresetId
  } catch {
    // Private-mode Safari throws on localStorage access; the default is fine.
    return defaultAccentPresetId
  }
}

function modeBlock(selector: string, ramp: AccentModeRamp, brand: AccentBrandRamp) {
  return [
    `${selector}{`,
    `--md-accent:${ramp.accent};`,
    `--md-accent-hover:${ramp.accentHover};`,
    `--md-accent-ink:${ramp.accentInk};`,
    `--md-accent-tint:${ramp.accentTint};`,
    `--md-accent-deep:${brand.deep};`,
    `--md-accent-abyss:${brand.abyss};`,
    `--md-accent-glow-core:${brand.glowCore};`,
    `--md-accent-glow-bright:${brand.glowBright};`,
    `--md-accent-glow-warm:${brand.glowWarm};`,
    `--md-accent-lift:${brand.lift};`,
    `--md-accent-lift-strong:${brand.liftStrong};`,
    `--md-accent-lift-warm:${brand.liftWarm};`,
    `--md-selected-bg:${ramp.selectedBg};`,
    `--md-selected-text:${ramp.selectedText};`,
    "}",
  ].join("")
}

export function accentCssText(id: AccentPreferenceId) {
  const ramp = buildAccentRamp(id)
  return modeBlock(":root", ramp.light, ramp.brand) + modeBlock(":root.dark", ramp.dark, ramp.brand)
}

function accentStyleElement() {
  const existing = document.getElementById(styleElementId)
  if (existing instanceof HTMLStyleElement) return existing

  const element = document.createElement("style")
  element.id = styleElementId
  // Appended last so it outranks the token defaults in styles.css without
  // needing !important or a specificity bump.
  document.head.append(element)
  return element
}

let shiftTimer: number | undefined
let pendingFrame: number | undefined

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function writeAccentCss(id: AccentPreferenceId) {
  const element = accentStyleElement()
  const next = accentCssText(id)
  if (element.textContent !== next) element.textContent = next
}

/* ---------------------------------------------------------------- brand ramp store */

/**
 * WebGL uniforms cannot read CSS custom properties, so the shader colours have to
 * be walked through the curve in JS to stay level with the CSS cross-fade.
 *
 * One tween serves every subscriber. Interpolating inside each shader would mean
 * five instances doing the same Oklab arithmetic sixty times a second, and any
 * drift between their start times would show as the pill and the brand mark
 * arriving at the new accent a frame or two apart.
 */
let brandRamp = buildAccentRamp(defaultAccentPresetId).brand
const brandRampListeners = new Set<() => void>()
let brandRampTween: { stop: () => void } | undefined

const readBrandRamp = () => brandRamp

function subscribeBrandRamp(listener: () => void) {
  brandRampListeners.add(listener)
  return () => brandRampListeners.delete(listener)
}

function publishBrandRamp(next: AccentBrandRamp) {
  brandRamp = next
  for (const listener of brandRampListeners) listener()
}

const brandRampKeys = ["deep", "abyss", "glowCore", "glowBright", "glowWarm", "lift", "liftStrong", "liftWarm"] as const

function blendBrandRamp(from: AccentBrandRamp, to: AccentBrandRamp, progress: number): AccentBrandRamp {
  const next = {} as AccentBrandRamp
  for (const key of brandRampKeys) next[key] = mixHexOklab(from[key], to[key], progress)
  next.shader = from.shader.map((stop, index) => mixHexOklab(stop, to.shader[index], progress)) as ShaderStops
  next.watchLight = from.watchLight.map((stop, index) => mixHexOklab(stop, to.watchLight[index], progress)) as ShaderStops
  next.brand = from.brand.map((stop, index) => mixHexOklab(stop, to.brand[index], progress)) as ShaderStops
  return next
}

function moveBrandRamp(target: AccentBrandRamp, shouldAnimate: boolean) {
  brandRampTween?.stop()
  brandRampTween = undefined

  if (!shouldAnimate || prefersReducedMotion()) {
    publishBrandRamp(target)
    return
  }

  // Starts from whatever is on screen, not from the preset we were heading
  // towards, so picking twice in quick succession redirects rather than jumps.
  const from = brandRamp
  brandRampTween = animate(0, 1, {
    duration: accentShiftDurationMs / 1000,
    ease: accentShiftEase,
    onUpdate: (progress) => publishBrandRamp(blendBrandRamp(from, target, progress)),
    onComplete: () => {
      brandRampTween = undefined
      publishBrandRamp(target)
    },
  })
}

/**
 * Paints the preset. The cross-fade is opt-in per call because the first paint
 * and any restore-from-storage must land instantly — animating those would show
 * the default teal for half a second before the real accent arrived.
 */
export function applyAccentPreset(id: AccentPreferenceId, { animate: shouldAnimate = false } = {}) {
  if (typeof document === "undefined") return

  const root = document.documentElement

  if (pendingFrame !== undefined) {
    cancelAnimationFrame(pendingFrame)
    pendingFrame = undefined
  }
  if (shiftTimer !== undefined) {
    window.clearTimeout(shiftTimer)
    shiftTimer = undefined
  }

  const target = buildAccentRamp(id).brand

  // A hidden tab never services `requestAnimationFrame`, so the deferred write
  // below would leave the accent unapplied until the tab came back. Nothing is
  // being watched either way, so apply it outright.
  if (!shouldAnimate || prefersReducedMotion() || document.visibilityState === "hidden") {
    root.removeAttribute("data-accent-shift")
    writeAccentCss(id)
    moveBrandRamp(target, false)
    return
  }

  // The transition has to be in place *before* the values change, so arm the
  // attribute on this frame and swap colours on the next one.
  root.setAttribute("data-accent-shift", "")
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = undefined
    writeAccentCss(id)
    // Started in the same frame as the CSS swap so the shaders and the stylesheet
    // travel the curve together.
    moveBrandRamp(target, true)
    // Dropping the attribute afterwards keeps the rest of the session free of a
    // transition that would otherwise fight the light/dark switch.
    shiftTimer = window.setTimeout(() => {
      shiftTimer = undefined
      root.removeAttribute("data-accent-shift")
    }, accentShiftDurationMs + 60)
  })
}

export function writeAccentPreferenceId(id: AccentPreferenceId) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(storageKey, id)
  } catch {
    // Persistence is a nicety; the accent still applies for this session.
  }

  applyAccentPreset(id, { animate: true })
  window.dispatchEvent(new CustomEvent(changeEventName, { detail: id }))
  hasLocalEdit = true
  void pushAccentPreference(id)
}

export function writeAccentPresetId(id: AccentPresetId) {
  writeAccentPreferenceId(id)
}

/** Called once before React mounts so the first paint already carries the accent. */
export function ensureAccentApplied() {
  applyAccentPreset(readAccentPresetId())
}

/* ----------------------------------------------------------- profile persistence */

let loadedUserId: string | null = null
let loadPromise: Promise<void> | null = null
let pendingSave: Promise<void> = Promise.resolve()
let hasLocalEdit = false
let watchingAuth = false
let watchingCompanyAppearance = false
let canPersistProfileAccent = true
let stopCompanyResetWatch: (() => void) | null = null

async function currentSession(client: SupabaseClient) {
  const { data, error } = await getClientAuth(client).getSession()
  if (error) throw error
  return data.session
}

function applySavedAccent(id: AccentPreferenceId) {
  try {
    window.localStorage.setItem(storageKey, id)
  } catch {
    // The saved profile still restores the accent when storage is unavailable.
  }
  applyAccentPreset(id)
  window.dispatchEvent(new CustomEvent(changeEventName, { detail: id }))
}

function saveRemoteAccent(id: AccentPreferenceId) {
  const client = supabase
  const userId = loadedUserId
  if (!client || !userId || !canPersistProfileAccent) return pendingSave

  pendingSave = pendingSave
    .then(async () => {
      // A queued write must stay attached to the account that chose it. This
      // matters on shared browsers where one operator can sign out while a
      // profile save is still waiting behind an earlier request.
      if (loadedUserId !== userId) return

      const { data, error } = await client.rpc("set_current_user_accent_preference", { p_accent_preset: id })
      if (error) throw error
      if (loadedUserId !== userId) return
      const saved = Array.isArray(data) ? data[0]?.accent_preset : data?.accent_preset
      const confirmedId = isAccentPreferenceId(saved) ? saved : id
      updateWorkspaceBootstrapPreferences({ accentPreset: confirmedId })
      if (confirmedId !== id && readAccentPresetId() === id) {
        applySavedAccent(confirmedId)
        void loadCompanyAppearance({ force: true })
      }
    })
    .catch((error: unknown) => {
      console.warn("Your accent colour could not be saved to your profile.", error)
    })

  return pendingSave
}

async function pushAccentPreference(id: AccentPreferenceId) {
  await ensureAccentPreferenceLoaded()
  await saveRemoteAccent(id)
}

async function loadAccentPreference(client: SupabaseClient) {
  const session = await currentSession(client)
  const userId = session?.user.id ?? null
  loadedUserId = userId
  stopCompanyResetWatch?.()
  stopCompanyResetWatch = null
  if (!userId) return

  const workspacePreferences = session?.access_token
    ? await getApiWorkspacePreferences(session.access_token)
    : null
  if (workspacePreferences === null) {
    canPersistProfileAccent = false
    return
  }
  canPersistProfileAccent = true

  let value: unknown = workspacePreferences?.accentPreset ?? null
  if (workspacePreferences === undefined) {
    const { data, error } = await client.rpc("get_current_user_accent_preference")
    if (error) throw error
    value = Array.isArray(data) ? data[0]?.accent_preset : data?.accent_preset
  }
  if (hasLocalEdit) return

  if (isAccentPreferenceId(value)) {
    applySavedAccent(value)
    if (value === companyAccentPreferenceId) {
      const company = await loadCompanyAppearance()
      if (company.status === "unavailable") {
        applySavedAccent(defaultAccentPresetId)
        await saveRemoteAccent(defaultAccentPresetId)
      }
    }
    return
  }

  // Existing operators already have a deliberate browser-side choice from
  // before profile persistence shipped. Adopt it once when the new profile
  // field is empty; all later browsers then restore that Supabase value.
  await saveRemoteAccent(readAccentPresetId())
}

function watchAccentAuth(client: SupabaseClient) {
  if (watchingAuth) return
  watchingAuth = true

  getClientAuth(client).onAuthStateChange((_event, session) => {
    const userId = session?.user.id ?? null
    const settled = loadPromise ?? Promise.resolve()
    void settled.then(() => {
      if (userId === loadedUserId) return
      loadedUserId = null
      loadPromise = null
      hasLocalEdit = false
      canPersistProfileAccent = true
      void ensureAccentPreferenceLoaded()
    })
  })
}

function watchCompanyAppearance() {
  if (watchingCompanyAppearance) return
  watchingCompanyAppearance = true
  subscribeCompanyAppearance(() => {
    if (readAccentPresetId() !== companyAccentPreferenceId) return
    const company = getCompanyAppearanceSnapshot()
    if (company.brand) {
      applyAccentPreset(companyAccentPreferenceId, { animate: true })
      window.dispatchEvent(new CustomEvent(changeEventName, { detail: companyAccentPreferenceId }))
    } else if (company.status === "unavailable") {
      applySavedAccent(defaultAccentPresetId)
      void saveRemoteAccent(defaultAccentPresetId)
    }
  })
}

/** Restores the signed-in operator's accent after the fast local first paint. */
export function ensureAccentPreferenceLoaded() {
  const client = supabase
  if (!client) return Promise.resolve()

  loadPromise ??= loadAccentPreference(client).then(() => {
    if (!loadedUserId) return
    stopCompanyResetWatch = watchCompanyAppearanceReset(client, loadedUserId, {
      isCompanySelected: () => readAccentPresetId() === companyAccentPreferenceId,
      afterPendingSaves: () => pendingSave,
      onReset: () => {
        applySavedAccent(defaultAccentPresetId)
        updateWorkspaceBootstrapPreferences({ accentPreset: defaultAccentPresetId })
      },
      refreshBrand: () => loadCompanyAppearance({ force: true }),
    })
  }).catch((error: unknown) => {
    console.warn("Your saved accent colour could not be loaded from your profile.", error)
  })
  watchAccentAuth(client)
  watchCompanyAppearance()
  return loadPromise
}

/* -------------------------------------------------------------------------- hooks */

export function useAccentPresetId() {
  const [id, setId] = useState(readAccentPresetId)

  useEffect(() => {
    function handleChange(event: Event) {
      const next = (event as CustomEvent<AccentPreferenceId>).detail
      if (isAccentPreferenceId(next)) setId(next)
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === storageKey) {
        const next = readAccentPresetId()
        setId(next)
        // Another tab changed it, so this one has to repaint too.
        applyAccentPreset(next, { animate: true })
      }
    }

    window.addEventListener(changeEventName, handleChange)
    window.addEventListener("storage", handleStorage)

    return () => {
      window.removeEventListener(changeEventName, handleChange)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  return id
}

export function useAccentBrandRamp() {
  return useSyncExternalStore(subscribeBrandRamp, readBrandRamp, readBrandRamp)
}

/** The three stops the Dexter pill and brand mark hand to their shader. */
export function useAccentShaderRamp(tone: "button" | "brand"): ShaderStops {
  const ramp = useAccentBrandRamp()
  return tone === "brand" ? ramp.brand : ramp.shader
}
