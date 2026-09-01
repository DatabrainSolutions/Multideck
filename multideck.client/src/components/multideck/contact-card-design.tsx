import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CornerUpLeft,
  ExternalLink,
  ImageUp,
  Info,
  Palette,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Iphone, IPHONE_CONTENT_SAFE_TOP } from "@/components/ui/iphone"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { CopyableField } from "@/components/multideck/copyable-field"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { CardQrDownloads, QrCodeImage, loadImage, qrContrastRatio, useQrCode } from "@/components/multideck/contact-card-components"
import { ContactSocialMark } from "@/components/multideck/contact-social-mark"
import {
  EMPTY_PUBLIC_FORM,
  PublicCardExchange,
  PublicCardFooter,
  PublicCardForm,
  PublicCardPhases,
  PublicCardShell,
} from "@/components/multideck/contact-card-public-view"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import {
  accentCanCarryActions,
  bestInkContrast,
  contrastRatio,
  mix,
  parseHex,
  readableInk,
  toHex,
} from "@/lib/color"
import { resolveCardTheme } from "@/lib/card-theme"
import { CARD_LAYOUT_SPECS, markCoverOffset, resolveCardLayout } from "@/lib/card-layout"
import { cardPublicPath, cardPublicUrl, readLogoFile, updateBranding, MAX_LOGO_BYTES } from "@/lib/contact-card-store"
import {
  CARD_SOCIAL_LABELS,
  defaultBranding,
  type CardBranding,
  type CardLayout,
  type CardSocialKind,
  type CardSocialLink,
  type CardTheme,
  type ContactCard,
  type QrLogoSize,
  type QrQuietZone,
} from "@/data/contact-card-data"
import { encodeQr, qrRender, type EccLevel, type QrEyeStyle, type QrMatrix, type QrModuleStyle } from "@/lib/qr-code"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------- */
/* Choices                                                                     */
/* -------------------------------------------------------------------------- */

const ACCENT_PRESETS = [
  { hex: "#1f6f68", label: "Teal" },
  { hex: "#0e5c7a", label: "Ocean" },
  { hex: "#3f5f8a", label: "Slate blue" },
  { hex: "#5a4b8a", label: "Violet" },
  { hex: "#2f6f3f", label: "Forest" },
  { hex: "#6b7f3a", label: "Olive" },
  { hex: "#b8862b", label: "Amber" },
  { hex: "#8a5a3f", label: "Clay" },
  { hex: "#a34747", label: "Brick" },
  { hex: "#a1477a", label: "Plum" },
  { hex: "#2b2f2e", label: "Graphite" },
  { hex: "#0b1413", label: "Ink" },
] as const

/**
 * The whole-look starting points.
 *
 * A style sets the arrangement, the header, the theme and the corners —
 * everything that decides the shape of the page. It deliberately does *not*
 * touch the accent, the logo or the code: those are the owner's brand, and
 * having a style quietly overwrite them is the fastest way to lose trust in the
 * picker.
 */
type CardStylePreset = {
  id: string
  label: string
  detail: string
  branding: Pick<CardBranding, "layout" | "headerStyle" | "theme" | "cornerStyle">
}

const STYLE_PRESETS: CardStylePreset[] = [
  { id: "clean", label: "Clean", detail: "Roomy and familiar", branding: { layout: "classic", headerStyle: "bar", theme: "light", cornerStyle: "soft" } },
  { id: "press", label: "Press", detail: "One loud headline", branding: { layout: "editorial", headerStyle: "none", theme: "light", cornerStyle: "sharp" } },
  { id: "portrait", label: "Portrait", detail: "The photo leads", branding: { layout: "spotlight", headerStyle: "cover", theme: "light", cornerStyle: "soft" } },
  { id: "counter", label: "Counter", detail: "Everything above the fold", branding: { layout: "compact", headerStyle: "band", theme: "light", cornerStyle: "soft" } },
  { id: "tinted", label: "Tinted", detail: "Page washed in your colour", branding: { layout: "classic", headerStyle: "band", theme: "tinted", cornerStyle: "soft" } },
  { id: "midnight", label: "Midnight", detail: "Dark and quiet", branding: { layout: "spotlight", headerStyle: "none", theme: "dark", cornerStyle: "soft" } },
]

const THEME_CHOICES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "tinted", label: "Tinted" },
] as const satisfies ReadonlyArray<{ id: CardTheme; label: string }>

const CORNER_CHOICES = [
  { id: "soft", label: "Soft" },
  { id: "sharp", label: "Sharp" },
] as const satisfies ReadonlyArray<{ id: CardBranding["cornerStyle"]; label: string }>

const MODULE_CHOICES = [
  { id: "square", label: "Square" },
  { id: "rounded", label: "Rounded" },
  { id: "dots", label: "Dots" },
] as const satisfies ReadonlyArray<{ id: QrModuleStyle; label: string }>

const EYE_CHOICES = [
  { id: "square", label: "Square" },
  { id: "rounded", label: "Rounded" },
  { id: "circle", label: "Circle" },
] as const satisfies ReadonlyArray<{ id: QrEyeStyle; label: string }>

const QR_ERROR_OPTIONS = ["M", "Q", "H"] as const satisfies readonly EccLevel[]
const QR_LOGO_SIZE_OPTIONS = ["small", "medium", "large"] as const satisfies readonly QrLogoSize[]
const QR_QUIET_ZONE_OPTIONS = ["4", "6", "8"] as const

/** Ink and plate pairs for the code. `accent` resolves against the live colour. */
const QR_LOOKS = [
  { id: "classic", label: "Classic", moduleStyle: "square", eyeStyle: "square", dark: "#0b1413", light: "#ffffff" },
  { id: "soft", label: "Soft", moduleStyle: "rounded", eyeStyle: "rounded", dark: "#0b1413", light: "#ffffff" },
  { id: "dot", label: "Dot", moduleStyle: "dots", eyeStyle: "circle", dark: "#0b1413", light: "#ffffff" },
  { id: "brand", label: "Your colour", moduleStyle: "rounded", eyeStyle: "circle", dark: "accent", light: "#ffffff" },
  { id: "cream", label: "Cream", moduleStyle: "square", eyeStyle: "rounded", dark: "#141f1c", light: "#f6f1e6" },
  { id: "slate", label: "Slate", moduleStyle: "dots", eyeStyle: "rounded", dark: "#22323c", light: "#f2f5f6" },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  moduleStyle: QrModuleStyle
  eyeStyle: QrEyeStyle
  dark: string
  light: string
}>

/* -------------------------------------------------------------------------- */
/* Colour rules                                                                */
/* -------------------------------------------------------------------------- */

/** Cameras need real separation, so a brand colour is deepened until it scans. */
function scannableInk(colour: string, plate: string) {
  const light = parseHex(plate)
  if (!light || !parseHex(colour)) return "#0b1413"

  for (const amount of [0, 0.2, 0.35, 0.5, 0.65, 0.8]) {
    const candidate = mix(colour, "#04100e", amount)
    const rgb = parseHex(candidate)
    if (rgb && contrastRatio(rgb, light) >= 4.5) return candidate
  }
  return "#0b1413"
}

/** A colour taken from artwork may be too pale to act as an accent; darken it. */
function usableAccent(colour: string) {
  for (const amount of [0, 0.16, 0.32, 0.48]) {
    const candidate = mix(colour, "#08110f", amount)
    if (accentCanCarryActions(candidate, "#f1f4f3")) return candidate
  }
  return mix(colour, "#08110f", 0.6)
}

/**
 * The colours a logo is actually made of.
 *
 * The image is sampled small, near-white and near-black pixels are dropped so a
 * background or an outline cannot win, and the survivors are bucketed by hue so
 * a gradient reads as one colour rather than forty. Anything too pale to carry a
 * button is deepened rather than offered and then quietly overruled at render.
 */
async function extractLogoColours(dataUrl: string): Promise<string[]> {
  const image = await loadImage(dataUrl)
  const canvas = document.createElement("canvas")
  canvas.width = 44
  canvas.height = 44
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return []

  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 160) continue
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const high = Math.max(r, g, b)
    const low = Math.min(r, g, b)
    // Paper and outlines are not brand colours.
    if (high > 232 && high - low < 22) continue
    if (high < 30) continue

    const key = `${r >> 5}:${g >> 5}:${b >> 5}`
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
  }

  const ranked = [...buckets.values()]
    .filter((bucket) => bucket.count > 6)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((bucket) => usableAccent(toHex({ r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count })))

  return [...new Set(ranked)]
}

/* -------------------------------------------------------------------------- */
/* Card miniature                                                              */
/* -------------------------------------------------------------------------- */

/** The phone width the card is designed against. Miniatures scale down from it. */
const DESIGN_WIDTH = 375

export type CardMiniatureContent = {
  fullName: string
  role: string
  company: string
  heading: string
  subheading: string
  submitLabel: string
  photoDataUrl?: string | null
}

const SAMPLE_CONTENT: CardMiniatureContent = {
  fullName: "Maya Stone",
  role: "Head of Freight",
  company: "Marlow Apparel",
  heading: "Let's stay in touch",
  subheading: "Share your details and Maya will follow up.",
  submitLabel: "Continue",
}

export function cardMiniatureContent(card: ContactCard, photoUrl?: string | null): CardMiniatureContent {
  return {
    fullName: card.person.fullName,
    role: card.person.role,
    company: card.person.company,
    heading: card.publicHeading,
    subheading: card.publicSubheading,
    submitLabel: card.submitLabel,
    photoDataUrl: photoUrl ?? card.person.profileImageDataUrl,
  }
}

/**
 * Measures the box and returns the factor that fits a design-width render into
 * it. Read synchronously before paint, so a miniature never appears at the
 * wrong size and then jump.
 */
function useScaleToWidth(design: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return

    const measure = () => setScale(node.clientWidth / design)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [design])

  return { ref, scale }
}

/**
 * The card itself, drawn at phone width and scaled into a thumbnail.
 *
 * Every visual choice on this tab is picked by looking at one of these, so they
 * carry the real thing: the resolved theme, the layout table's own type sizes
 * and spacing, the owner's heading, their name, their logo. Nothing here is a
 * grey placeholder bar — a chooser made of wireframes tells you where things
 * sit but never whether the result looks good.
 *
 * The page is longer than the frame on purpose: it is cropped at the bottom the
 * way a phone crops it, so a tile reads as a screenshot of the top of the card
 * rather than as a whole page squeezed into a box.
 */
export function CardMiniature({
  branding,
  content = SAMPLE_CONTENT,
  className,
}: {
  branding: CardBranding
  content?: CardMiniatureContent
  className?: string
}) {
  const { t } = useLanguage()
  const theme = resolveCardTheme(branding)
  const spec = resolveCardLayout(branding.layout)
  const { ref, scale } = useScaleToWidth(DESIGN_WIDTH)

  const initials = content.fullName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")

  const photo = content.photoDataUrl
  const logo = !photo ? branding.logoDataUrl : null
  const artwork = Boolean(photo || logo)
  const lifted = branding.headerStyle === "cover" && spec.mark.placement !== "byline"

  const mark = (
    <span
      className="grid shrink-0 place-items-center overflow-hidden font-medium"
      style={{
        width: spec.mark.size,
        height: spec.mark.size,
        marginTop: lifted ? markCoverOffset(spec.mark.size) : undefined,
        borderRadius: spec.mark.shape === "circle" ? 9999 : `calc(${theme.radiusField} + ${Math.round(spec.mark.size / 12)}px)`,
        backgroundColor: artwork ? theme.surface : branding.accent,
        color: artwork ? undefined : readableInk(branding.accent),
        fontSize: Math.round(spec.mark.size * 0.34),
        boxShadow: spec.mark.halo
          ? `0 0 0 5px ${theme.accentSoft}, ${theme.shadow}`
          : artwork
            ? `inset 0 0 0 1px ${theme.hairline}, ${theme.shadow}`
            : undefined,
      }}
    >
      {photo ? (
        <img src={photo} alt="" className="size-full object-cover" />
      ) : logo ? (
        <img src={logo} alt="" className="size-full object-contain" style={{ padding: Math.round(spec.mark.size * 0.16) }} />
      ) : (
        initials
      )}
    </span>
  )

  const headline = (
    <div className="min-w-0">
      {spec.rule ? (
        <span className={cn("mb-4 block h-[3px] w-10 rounded-full", spec.centred && "mx-auto")} style={{ backgroundColor: theme.accent }} />
      ) : null}
      {spec.eyebrow ? (
        <p className="mb-2.5 text-[11.5px] font-medium uppercase tracking-[0.14em]" style={{ color: theme.subtle }}>
          {content.company}
        </p>
      ) : null}
      <p
        className="font-medium"
        style={{
          color: theme.ink,
          fontSize: spec.heading.size,
          lineHeight: spec.heading.leading,
          letterSpacing: spec.heading.tracking,
          textWrap: "balance",
        }}
      >
        {content.heading}
      </p>
      <p style={{ color: theme.text, marginTop: 10, fontSize: spec.subheading.size, lineHeight: spec.subheading.leading }}>
        {content.subheading}
      </p>
    </div>
  )

  const personLine = (size: "sm" | "md") => (
    <div className="min-w-0">
      <p className="truncate font-medium" style={{ color: theme.ink, fontSize: size === "sm" ? 14 : 15, lineHeight: size === "sm" ? "20px" : "22px" }}>
        {content.fullName}
      </p>
      <p className="truncate" style={{ color: theme.text, fontSize: size === "sm" ? 12.5 : 13.5, lineHeight: size === "sm" ? "16px" : "20px" }}>
        {content.role}
        {content.role && content.company ? " · " : ""}
        {content.company}
      </p>
    </div>
  )

  const intro =
    spec.mark.placement === "beside" ? (
      <div>
        <div className="flex items-center gap-3">
          {mark}
          {personLine("sm")}
        </div>
        <div style={{ marginTop: spec.introGap }}>{headline}</div>
      </div>
    ) : spec.mark.placement === "byline" ? (
      <div>
        {headline}
        <div className="mt-6 flex items-center gap-3 pt-4" style={{ borderTop: `1px solid ${theme.hairline}` }}>
          {mark}
          {personLine("md")}
        </div>
      </div>
    ) : (
      <div className={cn("flex flex-col", spec.centred && "items-center")} style={{ gap: spec.introGap }}>
        {mark}
        {headline}
      </div>
    )

  const field = (label: string) => (
    <div key={label} className="text-start">
      <p
        className="font-medium"
        style={
          spec.field.labelCaps
            ? { color: theme.subtle, fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase" }
            : { color: theme.ink, fontSize: 13.5 }
        }
      >
        {label}
      </p>
      <div
        style={{
          marginTop: 6,
          height: spec.field.height,
          ...(spec.field.variant === "underline"
            ? { boxShadow: `inset 0 -1px 0 0 ${theme.hairline}` }
            : {
                borderRadius: theme.radiusField,
                backgroundColor: spec.formOnSurface ? theme.surfaceMuted : theme.fieldBg,
                boxShadow: `inset 0 0 0 1px ${theme.hairline}`,
              }),
        }}
      />
    </div>
  )

  const form = (
    <div
      className="text-start"
      style={{
        marginTop: spec.formGap,
        ...(spec.formOnSurface
          ? { borderRadius: theme.radiusPanel, backgroundColor: theme.surface, padding: 18, boxShadow: theme.shadow }
          : {}),
      }}
    >
      {/* One field, not the whole form. The button has to land inside the frame
          for every arrangement, and a thumbnail only needs to say where the form
          starts and what the action looks like. */}
      {field(t("Work email"))}
      <div
        className="mt-6 grid w-full place-items-center font-medium"
        style={{ height: 54, borderRadius: theme.radiusField, backgroundColor: theme.actionBg, color: theme.actionInk, fontSize: 15 }}
      >
        {content.submitLabel}
      </div>
    </div>
  )

  const header =
    branding.headerStyle === "none" ? null : branding.headerStyle === "bar" ? (
      <div style={{ height: 6, backgroundColor: branding.accent }} />
    ) : branding.headerStyle === "band" ? (
      <div style={{ backgroundColor: branding.accent, color: readableInk(branding.accent), paddingInline: spec.padX, paddingBlock: 20 }}>
        <div className={cn("mx-auto flex items-center gap-3", spec.centred && "justify-center")} style={{ maxWidth: spec.maxWidth - spec.padX * 2 }}>
          {branding.logoDataUrl ? (
            <img src={branding.logoDataUrl} alt="" className="h-7 max-w-[132px] object-contain" />
          ) : (
            <span className="text-[14px] font-medium tracking-[0.01em]">{content.company}</span>
          )}
        </div>
      </div>
    ) : (
      <div
        style={{
          height: Math.round(spec.mark.size * 1.25) + 40,
          background: `linear-gradient(160deg, ${branding.accent} 0%, ${mix(branding.accent, "#000000", 0.26)} 100%)`,
        }}
      />
    )

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn("relative size-full overflow-hidden", className)}
      style={{ backgroundColor: theme.pageBg }}
    >
      {/* Anchored to the physical top-left and scaled from that corner so the
          render lands consistently inside the preview frame. */}
      <div
        className="absolute top-0"
        style={{ left: 0, width: DESIGN_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left", opacity: scale ? 1 : 0 }}
      >
        {header}
        <div
          className={cn("mx-auto", spec.centred && "text-center")}
          style={{ maxWidth: spec.maxWidth, paddingInline: spec.padX, paddingTop: spec.padTop, paddingBottom: spec.padBottom }}
        >
          {intro}
          {form}
        </div>
      </div>
    </div>
  )
}

/**
 * Corners, at a size where the choice is actually visible.
 *
 * The whole card scaled to a thumbnail renders a 12px radius as three pixels,
 * which makes soft and sharp look identical. This shows the two shapes that
 * really change — a field and the button under it — at their true size.
 */
function CornerSample({ branding, content }: { branding: CardBranding; content: CardMiniatureContent }) {
  const theme = resolveCardTheme(branding)

  return (
    <span className="grid h-full content-center gap-2.5 px-4" style={{ backgroundColor: theme.pageBg }} aria-hidden="true">
      <span
        className="block"
        style={{
          height: 34,
          borderRadius: theme.radiusField,
          backgroundColor: theme.fieldBg,
          boxShadow: `inset 0 0 0 1px ${theme.hairline}`,
        }}
      />
      <span
        className="grid place-items-center text-[12px] font-medium"
        style={{ height: 34, borderRadius: theme.radiusField, backgroundColor: theme.actionBg, color: theme.actionInk }}
      >
        {content.submitLabel}
      </span>
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Code miniature                                                              */
/* -------------------------------------------------------------------------- */

/** One sample symbol, encoded once, reused by every code thumbnail on the tab. */
let sampleMatrix: QrMatrix | null | undefined
function sampleQrMatrix() {
  if (sampleMatrix === undefined) sampleMatrix = encodeQr("MULTIDECK", "M")
  return sampleMatrix
}

/** A real encoded symbol at thumbnail size, so a pattern choice shows itself. */
function QrMiniature({
  moduleStyle,
  eyeStyle,
  dark,
  light,
  className,
}: {
  moduleStyle: QrModuleStyle
  eyeStyle: QrEyeStyle
  dark: string
  light: string
  className?: string
}) {
  const matrix = sampleQrMatrix()
  const render = useMemo(
    () => (matrix ? qrRender(matrix, { moduleStyle, eyeStyle, dark, light, quietZone: 4, logoArea: 0 }) : null),
    [matrix, moduleStyle, eyeStyle, dark, light],
  )

  if (!matrix || !render) return null

  return (
    <svg
      aria-hidden="true"
      viewBox={`-1 -1 ${matrix.size + 2} ${matrix.size + 2}`}
      className={cn("block size-full", className)}
    >
      <path d={render.modulesPath} fill={dark} />
      <path d={render.eyeRing} fill={dark} fillRule="evenodd" />
      <path d={render.eyeCore} fill={dark} />
    </svg>
  )
}

/* -------------------------------------------------------------------------- */
/* Control primitives                                                          */
/* -------------------------------------------------------------------------- */

const TILE_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]

/**
 * A grid of tiles that behaves like one radio group.
 *
 * The keyboard contract is the ARIA one: a single tab stop, arrows move the
 * choice, and Home and End jump to the ends. It reads the tiles from the DOM rather than taking a
 * list, so the same wrapper serves a grid of card previews, a row of colour
 * swatches and a set of code patterns without any of them repeating the wiring.
 */
function TileGroup({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  // One tab stop: the chosen tile, or the first one while the card sits on a
  // combination no tile represents.
  useEffect(() => {
    const tiles = [...(ref.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])]
    const checked = tiles.findIndex((tile) => tile.getAttribute("aria-checked") === "true")
    const active = checked >= 0 ? checked : 0
    tiles.forEach((tile, index) => {
      tile.tabIndex = index === active ? 0 : -1
    })
  })

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!TILE_KEYS.includes(event.key)) return
    const tiles = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')]
    if (!tiles.length) return

    event.preventDefault()
    const rtl = window.getComputedStyle(event.currentTarget).direction === "rtl"
    const back = event.key === "ArrowUp" || (rtl ? event.key === "ArrowRight" : event.key === "ArrowLeft")
    const focused = tiles.indexOf(document.activeElement as HTMLElement)
    const checked = tiles.findIndex((tile) => tile.getAttribute("aria-checked") === "true")
    const current = focused >= 0 ? focused : checked

    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tiles.length - 1
        : current < 0
          ? (back ? tiles.length - 1 : 0)
          : (current + (back ? -1 : 1) + tiles.length) % tiles.length

    tiles[next].focus()
    tiles[next].click()
  }

  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={className} onKeyDown={onKeyDown}>
      {children}
    </div>
  )
}

/**
 * One tile in a visual chooser: a picture of the outcome, its name, and a tick.
 *
 * The picture keeps a constant frame whether or not it is selected — a tile that
 * changes what it shows when picked cannot be compared with its neighbours.
 */
function OptionTile({
  selected,
  label,
  detail,
  aspect,
  ariaLabel,
  onSelect,
  children,
}: {
  selected: boolean
  label: string
  detail?: string
  /** CSS aspect ratio for the picture, so the frame follows the column width. */
  aspect: string
  ariaLabel?: string
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel ?? label}
      onClick={onSelect}
      className={cn(
        "group grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-1.5 pb-2 text-start shadow-[var(--md-shadow-line)]",
        "transition-[box-shadow,transform,background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:shadow-[var(--md-shadow-soft)] active:scale-[0.985]",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a22)]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        selected && "bg-[var(--md-selected-bg)] shadow-[inset_0_0_0_1px_var(--md-accent),var(--md-shadow-soft)]",
      )}
    >
      <span
        className="relative block overflow-hidden rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] shadow-[inset_0_0_0_1px_var(--md-hairline)]"
        style={{ aspectRatio: aspect }}
      >
        {children}
      </span>
      <span className="grid gap-0.5 px-1">
        <span className="flex items-center justify-between gap-1.5">
          <span className="truncate text-[12.5px] font-medium text-[var(--md-ink)]">{label}</span>
          <AnimatePresence initial={false}>
            {selected ? (
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 520, damping: 30 }}
              >
                <Check className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={2} />
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
        {detail ? <span className="block truncate text-[11px] leading-4 text-[var(--md-subtle)]">{detail}</span> : null}
      </span>
    </button>
  )
}

/** A labelled band in a design section. Stacked, because pickers need the width. */
function DesignRow({
  label,
  hint,
  action,
  children,
}: {
  label: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
        {action}
      </div>
      {hint ? <p className="-mt-2 text-[12px] leading-[1.5] text-[var(--md-text)]">{hint}</p> : null}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Hex is typed as often as it is picked, so both routes edit the same value. */
function ColourField({
  value,
  onChange,
  label,
  hint,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  hint?: string
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)

  // The swatch and the presets both write straight to the card, so the text box
  // follows the stored value except while someone is part-way through typing.
  useEffect(() => {
    if (!focused) setDraft(value)
  }, [focused, value])

  function commit(next: string) {
    const trimmed = next.trim().replace(/^#?/, "#")
    const expanded = /^#[0-9a-f]{3}$/i.test(trimmed)
      ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
      : trimmed
    if (/^#[0-9a-f]{6}$/i.test(expanded)) onChange(expanded.toLowerCase())
    else setDraft(value)
  }

  return (
    <div className="grid gap-1.5">
      <label className="inline-flex min-w-0 items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-1.5 shadow-[var(--md-shadow-line)]">
        <span className="sr-only">{label}</span>
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="size-8 shrink-0 cursor-pointer rounded-[var(--md-radius-md)] border-0 bg-transparent p-0"
        />
        <Input
          className="h-8 w-[100px] bg-[var(--md-surface)] text-[12.5px] uppercase tabular-nums"
          dir="ltr"
          spellCheck={false}
          value={draft}
          aria-label={`${label} — hex`}
          onFocus={() => setFocused(true)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => {
            setFocused(false)
            commit(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
      </label>
      {hint ? <p className="px-1 text-[11.5px] leading-4 text-[var(--md-subtle)]">{hint}</p> : null}
    </div>
  )
}

/** A quiet advisory line. Amber only when a choice would actually cost something. */
function Advisory({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--md-radius-md)] p-3 text-[12.5px] leading-5 text-[var(--md-text)]",
        tone === "info" ? "bg-[var(--md-surface-tint)]" : "bg-[color-mix(in_srgb,var(--md-amber)_11%,var(--md-surface))]",
      )}
    >
      {tone === "info" ? (
        <Info className="mt-0.5 size-4 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.5} />
      ) : (
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-amber)]" strokeWidth={1.5} />
      )}
      <p className="min-w-0">{children}</p>
    </div>
  )
}

/** The technical settings, folded away until someone needs them. */
function Disclosure({
  open,
  label,
  openLabel,
  closedLabel,
  onToggle,
  children,
}: {
  open: boolean
  label: string
  openLabel: string
  closedLabel: string
  onToggle: () => void
  children: React.ReactNode
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="grid gap-3 py-5 last:pb-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-9 w-full items-center justify-between gap-3 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 text-start text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"
      >
        <span>{label}</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-normal text-[var(--md-subtle)]">
          {open ? openLabel : closedLabel}
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open ? 180 : 0 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
            className="inline-flex"
          >
            <ChevronDown className="size-3.5" strokeWidth={1.6} />
          </motion.span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
            className="overflow-hidden"
          >
            <div className="divide-y divide-[var(--md-hairline)]">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Pickers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Whole looks, each drawn as the card it produces.
 *
 * A style is a starting point, not a lock: it moves the arrangement, header,
 * theme and corners together, then leaves every one of those available
 * underneath. Because the tiles borrow the live colour and copy, choosing one is
 * a straight comparison of shape rather than a guess.
 */
export function CardStylePresetPicker({
  branding,
  content,
  onChange,
}: {
  branding: CardBranding
  content?: CardMiniatureContent
  onChange: (update: Partial<CardBranding>) => void
}) {
  const { t } = useLanguage()

  return (
    <TileGroup label={t("Card style")} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {STYLE_PRESETS.map((preset) => {
        const selected = (Object.keys(preset.branding) as Array<keyof CardStylePreset["branding"]>).every(
          (key) => branding[key] === preset.branding[key],
        )
        return (
          <OptionTile
            key={preset.id}
            selected={selected}
            label={t(preset.label)}
            detail={t(preset.detail)}
            aspect="3 / 4"
            onSelect={() => onChange(preset.branding)}
          >
            <CardMiniature branding={{ ...branding, ...preset.branding }} content={content} />
          </OptionTile>
        )
      })}
    </TileGroup>
  )
}

/**
 * The four arrangements, each shown as the card it produces.
 *
 * `branding` is optional so the component can be inspected on its own; when it
 * is supplied the previews carry the live colours, header and corners, so the
 * only difference between the four is the thing being chosen.
 */
export function ContactCardLayoutPicker({
  value,
  onChange,
  branding,
  content,
}: {
  value: CardLayout
  onChange: (value: CardLayout) => void
  branding?: CardBranding
  content?: CardMiniatureContent
}) {
  const { t } = useLanguage()
  const base = useMemo(() => branding ?? defaultBranding(), [branding])

  return (
    <TileGroup label={t("Layout preset")} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {CARD_LAYOUT_SPECS.map((preset) => (
        <OptionTile
          key={preset.id}
          selected={value === preset.id}
          label={t(preset.label)}
          detail={t(preset.detail)}
          /* Four across is narrower than three, so the frame has to be taller for
             the tallest arrangement to still show its button. */
          aspect="2 / 3"
          onSelect={() => onChange(preset.id)}
        >
          <CardMiniature branding={{ ...base, layout: preset.id }} content={content} />
        </OptionTile>
      ))}
    </TileGroup>
  )
}

/**
 * Six ready-made codes, each a real encoded symbol.
 *
 * Pattern and colour travel together because that is how a code is judged, and
 * "Your colour" resolves the accent to the darkest version that still scans
 * rather than offering a swatch that would be silently overruled.
 */
export function QrStylePicker({
  branding,
  onChange,
}: {
  branding: CardBranding
  onChange: (update: Partial<CardBranding>) => void
}) {
  const { t } = useLanguage()

  return (
    <TileGroup label={t("Code look")} className="grid grid-cols-3 gap-2.5">
      {QR_LOOKS.map((look) => {
        const dark = look.dark === "accent" ? scannableInk(branding.accent, look.light) : look.dark
        const selected =
          branding.qrModuleStyle === look.moduleStyle &&
          branding.qrEyeStyle === look.eyeStyle &&
          branding.qrDark.toLowerCase() === dark.toLowerCase() &&
          branding.qrLight.toLowerCase() === look.light.toLowerCase()

        return (
          <OptionTile
            key={look.id}
            selected={selected}
            label={t(look.label)}
            aspect="1 / 1"
            onSelect={() =>
              onChange({ qrModuleStyle: look.moduleStyle, qrEyeStyle: look.eyeStyle, qrDark: dark, qrLight: look.light })
            }
          >
            <span className="grid h-full place-items-center p-2.5" style={{ backgroundColor: look.light }}>
              <QrMiniature moduleStyle={look.moduleStyle} eyeStyle={look.eyeStyle} dark={dark} light={look.light} />
            </span>
          </OptionTile>
        )
      })}
    </TileGroup>
  )
}

/* -------------------------------------------------------------------------- */
/* Social links                                                                */
/* -------------------------------------------------------------------------- */

const SOCIAL_PLACEHOLDERS: Record<CardSocialKind, string> = {
  linkedin: "linkedin.com/in/harry-phillips",
  facebook: "facebook.com/your-name",
  instagram: "@your-name",
  whatsapp: "+44 7700 900000",
  email: "name@company.com",
  website: "company.com",
}

export function ContactCardSocialLinksEditor({ links, onChange }: { links: CardSocialLink[]; onChange: (links: CardSocialLink[]) => void }) {
  const { t } = useLanguage()

  function update(id: string, update: Partial<CardSocialLink>) {
    onChange(links.map((link) => (link.id === id ? { ...link, ...update } : link)))
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= links.length) return
    const next = [...links]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    onChange(next)
  }

  return (
    <div className="grid gap-2">
      {links.map((link, index) => {
        const label = CARD_SOCIAL_LABELS[link.kind]
        return (
          <div key={link.id} className="grid items-center gap-2 border-b border-[var(--md-line)] py-2 last:border-0 first:pt-0 last:pb-0 sm:grid-cols-[36px_minmax(0,1fr)_auto]">
            <span className="grid size-9 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]" aria-hidden="true">
              <ContactSocialMark kind={link.kind} className="size-4" />
            </span>
            <label className="min-w-0">
              <span className="sr-only">{t(label)}</span>
              <Input
                className="h-9 bg-[var(--md-surface)] text-[13px]"
                dir="ltr"
                type={link.kind === "email" ? "email" : "text"}
                value={link.value}
                placeholder={SOCIAL_PLACEHOLDERS[link.kind]}
                onChange={(event) => update(link.id, { value: event.target.value, enabled: link.enabled || Boolean(event.target.value.trim()) })}
              />
            </label>
            <div className="flex items-center justify-end gap-0.5">
              <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)]" disabled={index === 0} aria-label={`${t("Move earlier")}: ${t(label)}`} onClick={() => move(index, -1)}>
                <ArrowUp className="size-3.5" strokeWidth={1.5} />
              </Button>
              <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)]" disabled={index === links.length - 1} aria-label={`${t("Move later")}: ${t(label)}`} onClick={() => move(index, 1)}>
                <ArrowDown className="size-3.5" strokeWidth={1.5} />
              </Button>
              <Switch checked={link.enabled} disabled={!link.value.trim()} aria-label={`${t("Show")}: ${t(label)}`} onCheckedChange={(enabled) => update(link.id, { enabled })} />
            </div>
          </div>
        )
      })}
      <p className="text-[12px] leading-5 text-[var(--md-subtle)]">{t("Only enabled links appear on the public card. The order here is the order visitors see.")}</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Logo                                                                        */
/* -------------------------------------------------------------------------- */

function LogoControl({ card }: { card: ContactCard }) {
  const { t } = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  async function accept(file: File | undefined) {
    if (!file) return
    try {
      const dataUrl = await readLogoFile(file)
      updateBranding(card.id, { logoDataUrl: dataUrl })
      toast.message(t("Logo changed. Saving…"))
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unreadable"
      toast.error(
        reason === "too-large"
          ? `${t("That image is over")} ${Math.round(MAX_LOGO_BYTES / 1024)}KB.`
          : reason === "unsupported"
            ? t("Choose an image file.")
            : t("That image could not be read."),
      )
    }
  }

  return (
    <div className="grid gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void accept(event.dataTransfer.files[0])
        }}
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3.5",
          "transition-[background-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          dragging && "bg-[var(--md-accent-a10)] shadow-[inset_0_0_0_1px_var(--md-accent-a22)]",
        )}
      >
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[var(--md-radius-md)] bg-white shadow-[var(--md-shadow-line)]">
          {card.branding.logoDataUrl ? (
            <img src={card.branding.logoDataUrl} alt={t("Current logo")} className="size-full object-contain p-1.5" />
          ) : (
            <ImageUp className="size-5 text-[var(--md-subtle)]" strokeWidth={1.4} />
          )}
        </span>

        <div className="min-w-[160px] flex-1">
          <p className="text-[13px] text-[var(--md-ink)]">{card.branding.logoDataUrl ? t("Logo added") : t("Drop an image here, or choose a file.")}</p>
          <p className="mt-1 text-[12px] text-[var(--md-subtle)]">
            {t("PNG or SVG with a transparent background works best. Up to")} {Math.round(MAX_LOGO_BYTES / 1024)}KB.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="outline" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => inputRef.current?.click()}>
            {card.branding.logoDataUrl ? t("Replace") : t("Choose")}
          </Button>
          {card.branding.logoDataUrl ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-red)]"
              aria-label={t("Remove logo")}
              onClick={() => updateBranding(card.id, { logoDataUrl: null, logoInQr: false })}
            >
              <Trash2 className="size-4" strokeWidth={1.4} />
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          void accept(event.target.files?.[0])
          event.target.value = ""
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The preview renders the real public components, not a mock-up, so what the
 * owner tunes here is exactly what a visitor gets. It is inert: every control
 * inside is removed from the tab order.
 */
function CardPreview({ card }: { card: ContactCard }) {
  const { t } = useLanguage()
  const [phase, setPhase] = useState<"form" | "done">("form")

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">{t("Live preview")}</p>
        <SegmentedControl
          options={["form", "done"] as const}
          value={phase}
          onChange={setPhase}
          ariaLabel={t("Preview screen")}
          renderOption={(option) => (option === "form" ? t("Form") : t("Exchange"))}
        />
      </div>

      <Iphone className="mx-auto block h-[min(68dvh,680px)] w-auto max-w-full drop-shadow-[0_24px_34px_rgba(4,12,11,0.18)]">
        <PublicCardShell card={card} preview={false} deviceSafeAreaTop={IPHONE_CONTENT_SAFE_TOP}>
          <PublicCardPhases
            phase={phase}
            form={
              <PublicCardForm
                card={card}
                values={EMPTY_PUBLIC_FORM}
                errors={{}}
                submitting={false}
                slow={false}
                submitError={null}
                onChange={() => undefined}
                onSubmit={(event) => event.preventDefault()}
                interactive={false}
              />
            }
            exchange={<PublicCardExchange card={card} onAddToContacts={() => undefined} downloaded={false} interactive={false} />}
          />
          <PublicCardFooter />
        </PublicCardShell>
      </Iphone>

      <Button
        variant="ghost"
        className="h-9 justify-center rounded-[var(--md-radius-md)] text-[13px] text-[var(--md-text)] hover:text-[var(--md-ink)]"
        onClick={() => window.open(`${cardPublicPath(card)}?preview=1`, "_blank", "noopener,noreferrer")}
      >
        <ExternalLink data-icon="inline-start" strokeWidth={1.4} />
        {t("Open it in a new tab")}
      </Button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Branding history                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A local trail of previous states, so experimenting is cheap.
 *
 * Design work is a lot of small reversible moves. Consecutive nudges to the same
 * control inside a beat collapse into one step, otherwise dragging a colour
 * picker would bury everything that came before it.
 */
function useBrandingHistory(card: ContactCard) {
  const { branding } = card
  const history = useRef<CardBranding[]>([])
  const lastPush = useRef<{ key: string; at: number } | null>(null)
  const [depth, setDepth] = useState(0)

  function apply(update: Partial<CardBranding>, mergeKey?: string) {
    const now = performance.now()
    const previous = lastPush.current
    const coalesce = mergeKey !== undefined && previous !== null && previous.key === mergeKey && now - previous.at < 1500

    if (!coalesce) {
      history.current = [...history.current.slice(-19), branding]
      setDepth(history.current.length)
    }
    lastPush.current = mergeKey ? { key: mergeKey, at: now } : null

    updateBranding(card.id, update)
  }

  function undo() {
    const previous = history.current.pop()
    setDepth(history.current.length)
    lastPush.current = null
    if (previous) updateBranding(card.id, previous)
  }

  return { apply, undo, depth }
}

/** Undo and reset for the surface being edited, sized for a section header. */
function HistoryActions({ depth, onUndo, onReset }: { depth: number; onUndo: () => void; onReset: () => void }) {
  const { t } = useLanguage()

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12.5px] text-[var(--md-text)] hover:text-[var(--md-ink)]"
        disabled={depth === 0}
        onClick={onUndo}
      >
        <CornerUpLeft data-icon="inline-start" strokeWidth={1.5} />
        {t("Undo")}
      </Button>
      <Button
        variant="ghost"
        className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12.5px] text-[var(--md-text)] hover:text-[var(--md-ink)]"
        onClick={onReset}
      >
        <RotateCcw data-icon="inline-start" strokeWidth={1.5} />
        {t("Reset")}
      </Button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Design panel                                                                */
/* -------------------------------------------------------------------------- */

export function CardDesignPanel({ card, profilePhotoUrl }: { card: ContactCard; profilePhotoUrl?: string | null }) {
  const { t } = useLanguage()
  const { branding } = card
  const [logoColours, setLogoColours] = useState<string[]>([])
  const { apply, undo, depth } = useBrandingHistory(card)

  const theme = useMemo(() => resolveCardTheme(branding), [branding])
  const accentSafe = accentCanCarryActions(branding.accent, theme.pageBg)
  const contrast = useMemo(() => bestInkContrast(branding.accent), [branding.accent])
  const content = useMemo(() => cardMiniatureContent(card, profilePhotoUrl), [card, profilePhotoUrl])

  function resetStyling() {
    const defaults = defaultBranding(branding.accent)
    apply({
      layout: defaults.layout,
      headerStyle: defaults.headerStyle,
      theme: defaults.theme,
      cornerStyle: defaults.cornerStyle,
    })
    toast.message(t("Styling reset. Your logo and colour were kept."))
  }

  // Logo colours are read from the artwork itself rather than stored, so a
  // replaced logo can never leave a stale palette behind.
  useEffect(() => {
    const logo = branding.logoDataUrl
    if (!logo) {
      setLogoColours([])
      return
    }

    let cancelled = false
    extractLogoColours(logo)
      .then((colours) => {
        if (!cancelled) setLogoColours(colours)
      })
      .catch(() => {
        if (!cancelled) setLogoColours([])
      })

    return () => {
      cancelled = true
    }
  }, [branding.logoDataUrl])

  // The signed workspace photo is intentionally preview-only. Public cards
  // obtain the same image through their tenant-safe published-profile endpoint,
  // while the card record never stores a short-lived signed URL.
  const previewCard = useMemo(() => profilePhotoUrl
    ? { ...card, person: { ...card.person, profileImageDataUrl: profilePhotoUrl } }
    : card, [card, profilePhotoUrl])

  return (
    <div className="grid items-start gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="grid gap-[var(--md-page-stack-gap)]">
        <Surface padding="md" className="p-5">
          <SectionHeader
            title={t("Start from a look")}
            meta={t("Each one is your card, in your colour and your words. Change anything underneath afterwards.")}
            metaPlacement="stacked"
            action={<HistoryActions depth={depth} onUndo={undo} onReset={resetStyling} />}
          />
          <div className="mt-4">
            <CardStylePresetPicker
              branding={branding}
              content={content}
              onChange={(update) => {
                apply(update)
                toast.message(t("Style applied"))
              }}
            />
          </div>
        </Surface>

        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Arrangement")} meta={t("Where the mark sits, how loud the heading is, how the fields are drawn.")} metaPlacement="stacked" />
          <div className="mt-4 divide-y divide-[var(--md-hairline)]">
            <DesignRow label={t("Layout")}>
              <ContactCardLayoutPicker branding={branding} content={content} value={branding.layout} onChange={(layout) => apply({ layout })} />
            </DesignRow>

            <DesignRow label={t("Corners")} hint={t("Applies to the fields, the buttons and any panel they sit on.")}>
              <TileGroup label={t("Corners")} className="grid max-w-[340px] grid-cols-2 gap-2.5">
                {CORNER_CHOICES.map((choice) => (
                  <OptionTile
                    key={choice.id}
                    selected={branding.cornerStyle === choice.id}
                    label={t(choice.label)}
                    aspect="16 / 9"
                    onSelect={() => apply({ cornerStyle: choice.id })}
                  >
                    <CornerSample branding={{ ...branding, cornerStyle: choice.id }} content={content} />
                  </OptionTile>
                ))}
              </TileGroup>
            </DesignRow>
          </div>
        </Surface>

        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Brand")} meta={t("Your logo, one accent colour, and how the page is lit.")} metaPlacement="stacked" />
          <div className="mt-4 divide-y divide-[var(--md-hairline)]">
            <DesignRow label={t("Logo")} hint={t("Shown on the public page, and optionally in the middle of the code.")}>
              <LogoControl card={card} />
            </DesignRow>

            <DesignRow label={t("Accent")} hint={t("It carries the header, the marks and the buttons.")}>
              <div className="grid gap-3">
                <TileGroup label={t("Accent")} className="flex flex-wrap gap-2">
                  {ACCENT_PRESETS.map((preset) => {
                    const selected = preset.hex.toLowerCase() === branding.accent.toLowerCase()
                    return (
                      <button
                        key={preset.hex}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={t(preset.label)}
                        title={t(preset.label)}
                        onClick={() => apply({ accent: preset.hex })}
                        style={{ backgroundColor: preset.hex, color: readableInk(preset.hex) }}
                        className={cn(
                          "relative grid size-8 place-items-center rounded-full",
                          "transition-transform duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.08] active:scale-[0.96]",
                          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a22)]",
                          "motion-reduce:transition-none motion-reduce:hover:scale-100",
                          selected && "ring-2 ring-[var(--md-ink)] ring-offset-2 ring-offset-[var(--md-surface)]",
                        )}
                      >
                        <AnimatePresence initial={false}>
                          {selected ? (
                            <motion.span
                              initial={{ opacity: 0, scale: 0.6 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.6 }}
                              transition={{ type: "spring", stiffness: 520, damping: 30 }}
                            >
                              <Check className="size-4" strokeWidth={2.4} />
                            </motion.span>
                          ) : null}
                        </AnimatePresence>
                      </button>
                    )
                  })}
                </TileGroup>

                <div className="flex flex-wrap items-start gap-2">
                  <ColourField
                    label={t("Accent")}
                    value={branding.accent}
                    hint={`${t("Text contrast")} ${contrast.toFixed(1)}:1`}
                    onChange={(value) => apply({ accent: value }, "accent")}
                  />

                  {logoColours.length ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-2.5 shadow-[var(--md-shadow-line)]">
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--md-text)]">
                        <Palette className="size-3.5 text-[var(--md-subtle)]" strokeWidth={1.5} />
                        {t("From your logo")}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {logoColours.map((colour) => (
                          <button
                            key={colour}
                            type="button"
                            aria-label={`${t("Use this colour from your logo")}: ${colour}`}
                            title={colour}
                            onClick={() => apply({ accent: colour })}
                            style={{ backgroundColor: colour }}
                            className={cn(
                              "size-7 rounded-full shadow-[var(--md-shadow-line)]",
                              "transition-transform duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.08] active:scale-[0.96]",
                              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a22)]",
                              "motion-reduce:transition-none motion-reduce:hover:scale-100",
                              colour.toLowerCase() === branding.accent.toLowerCase() && "ring-2 ring-[var(--md-ink)] ring-offset-2 ring-offset-[var(--md-surface-tint)]",
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {accentSafe ? null : (
                  <Advisory tone="warn">
                    {t("This colour is too close to the page behind it, so buttons would lose their edge. They will use a readable fallback instead.")}
                  </Advisory>
                )}
              </div>
            </DesignRow>

            <DesignRow label={t("Theme")} hint={t("Tinted washes the page in your accent instead of grey.")}>
              <TileGroup label={t("Theme")} className="grid max-w-[460px] grid-cols-3 gap-2.5">
                {THEME_CHOICES.map((choice) => (
                  <OptionTile
                    key={choice.id}
                    selected={branding.theme === choice.id}
                    label={t(choice.label)}
                    aspect="1 / 1"
                    onSelect={() => apply({ theme: choice.id })}
                  >
                    <CardMiniature branding={{ ...branding, theme: choice.id }} content={content} />
                  </OptionTile>
                ))}
              </TileGroup>
            </DesignRow>
          </div>
        </Surface>
      </div>

      {/* Sticky so the preview stays beside the control being changed. */}
      <div className="xl:sticky xl:top-[var(--md-page-stack-gap)]">
        <Surface padding="md" className="p-5">
          <CardPreview card={previewCard} />
        </Surface>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* QR code panel                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The code, on its own surface.
 *
 * A code is judged on one question — does a camera read it — so this tab keeps
 * the live symbol, its version and its export beside every control, and puts the
 * settings that only matter in print behind a disclosure.
 */
export function CardQrPanel({ card }: { card: ContactCard }) {
  const { t } = useLanguage()
  const { branding } = card
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const { apply, undo, depth } = useBrandingHistory(card)

  const url = cardPublicUrl(card)
  const { matrix } = useQrCode(url, branding)
  const qrContrast = useMemo(() => qrContrastRatio(branding.qrDark, branding.qrLight), [branding.qrDark, branding.qrLight])
  const matchedAccentInk = useMemo(() => scannableInk(branding.accent, branding.qrLight), [branding.accent, branding.qrLight])
  const codeMatchesAccent = branding.qrDark.toLowerCase() === matchedAccentInk.toLowerCase()
  const logoLocked = Boolean(branding.logoInQr && branding.logoDataUrl)

  function resetCode() {
    const defaults = defaultBranding(branding.accent)
    apply({
      qrModuleStyle: defaults.qrModuleStyle,
      qrEyeStyle: defaults.qrEyeStyle,
      qrDark: defaults.qrDark,
      qrLight: defaults.qrLight,
      qrErrorCorrection: defaults.qrErrorCorrection,
      qrLogoSize: defaults.qrLogoSize,
      qrQuietZone: defaults.qrQuietZone,
    })
    toast.message(t("Code reset to the standard look."))
  }

  return (
    <div className="grid items-start gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-[var(--md-page-stack-gap)]">
        <Surface padding="md" className="p-5">
          <SectionHeader
            title={t("Code look")}
            meta={t("Pattern and colour together, as a camera sees them. Anything that would stop a scan is corrected for you.")}
            metaPlacement="stacked"
            action={<HistoryActions depth={depth} onUndo={undo} onReset={resetCode} />}
          />
          <div className="mt-4">
            <QrStylePicker branding={branding} onChange={(update) => apply(update)} />
          </div>
        </Surface>

        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Pattern")} meta={t("The cells and the three corner markers a scanner locks on to.")} metaPlacement="stacked" />
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[13px] font-medium text-[var(--md-ink)]">{t("Modules")}</p>
              <TileGroup label={t("Module style")} className="grid grid-cols-3 gap-2.5">
                {MODULE_CHOICES.map((choice) => (
                  <OptionTile
                    key={choice.id}
                    selected={branding.qrModuleStyle === choice.id}
                    label={t(choice.label)}
                    aspect="1 / 1"
                    onSelect={() => apply({ qrModuleStyle: choice.id })}
                  >
                    <span className="grid h-full place-items-center p-2" style={{ backgroundColor: branding.qrLight }}>
                      <QrMiniature moduleStyle={choice.id} eyeStyle={branding.qrEyeStyle} dark={branding.qrDark} light={branding.qrLight} />
                    </span>
                  </OptionTile>
                ))}
              </TileGroup>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium text-[var(--md-ink)]">{t("Corner eyes")}</p>
              <TileGroup label={t("Eye style")} className="grid grid-cols-3 gap-2.5">
                {EYE_CHOICES.map((choice) => (
                  <OptionTile
                    key={choice.id}
                    selected={branding.qrEyeStyle === choice.id}
                    label={t(choice.label)}
                    aspect="1 / 1"
                    onSelect={() => apply({ qrEyeStyle: choice.id })}
                  >
                    <span className="grid h-full place-items-center p-2" style={{ backgroundColor: branding.qrLight }}>
                      <QrMiniature moduleStyle={branding.qrModuleStyle} eyeStyle={choice.id} dark={branding.qrDark} light={branding.qrLight} />
                    </span>
                  </OptionTile>
                ))}
              </TileGroup>
            </div>
          </div>
        </Surface>

        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Colour and logo")} metaPlacement="stacked" />
          <div className="mt-2 divide-y divide-[var(--md-hairline)]">
            <DesignRow
              label={t("Colours")}
              hint={t("Keep the code dark on light. Inverting it stops many scanners working.")}
              action={
                <Button
                  variant="ghost"
                  className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12.5px] text-[var(--md-text)] hover:text-[var(--md-ink)]"
                  disabled={codeMatchesAccent}
                  onClick={() => apply({ qrDark: matchedAccentInk })}
                >
                  <Sparkles data-icon="inline-start" strokeWidth={1.5} />
                  {t("Match my accent")}
                </Button>
              }
            >
              <div className="grid gap-2.5">
                <div className="flex flex-wrap gap-3">
                  <ColourField label={t("Code colour")} hint={t("The cells")} value={branding.qrDark} onChange={(value) => apply({ qrDark: value }, "qrDark")} />
                  <ColourField label={t("Code background")} hint={t("The plate behind them")} value={branding.qrLight} onChange={(value) => apply({ qrLight: value }, "qrLight")} />
                </div>
                {qrContrast < 3 ? (
                  <Advisory tone="warn">
                    {t("These colours are too close for reliable scanning. The preview and downloads will use a safe black-and-white code until contrast improves.")}
                  </Advisory>
                ) : null}
              </div>
            </DesignRow>

            <DesignRow
              label={t("Logo in the code")}
              hint={branding.logoDataUrl
                ? t("Clears a square in the centre and raises error correction so the code still scans.")
                : t("Add a logo on the Design tab to use it here.")}
            >
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={branding.logoInQr}
                    disabled={!branding.logoDataUrl}
                    aria-label={t("Logo in the code")}
                    onCheckedChange={(checked) => apply({ logoInQr: checked })}
                  />
                  <span className="text-[13px] text-[var(--md-text)]">
                    {!branding.logoDataUrl ? t("No logo yet") : branding.logoInQr ? t("On") : t("Off")}
                  </span>
                </div>
                <SegmentedControl
                  options={QR_LOGO_SIZE_OPTIONS}
                  value={branding.qrLogoSize ?? "medium"}
                  onChange={(qrLogoSize) => apply({ qrLogoSize })}
                  ariaLabel={t("Logo size")}
                  disabled={!logoLocked}
                  renderOption={(option) => t(option === "small" ? "Small" : option === "medium" ? "Medium" : "Large")}
                />
              </div>
            </DesignRow>

            <Disclosure
              open={advancedOpen}
              label={t("Printing and reliability")}
              openLabel={t("Hide")}
              closedLabel={t("Show")}
              onToggle={() => setAdvancedOpen((open) => !open)}
            >
              <DesignRow
                label={t("Reliability")}
                hint={logoLocked ? t("Logo mode uses Maximum automatically to protect scanning.") : t("Higher levels help when the code is printed small or has a logo.")}
              >
                <SegmentedControl
                  options={QR_ERROR_OPTIONS}
                  value={logoLocked ? "H" : branding.qrErrorCorrection ?? "M"}
                  onChange={(qrErrorCorrection) => apply({ qrErrorCorrection })}
                  ariaLabel={t("Error correction")}
                  disabled={logoLocked}
                  renderOption={(option) => t(option === "M" ? "Standard" : option === "Q" ? "Balanced" : "Maximum")}
                />
              </DesignRow>

              <DesignRow label={t("Quiet zone")} hint={t("The clear edge helps cameras recognise the code on busy backgrounds.")}>
                <SegmentedControl
                  options={QR_QUIET_ZONE_OPTIONS}
                  value={String(branding.qrQuietZone ?? 4) as (typeof QR_QUIET_ZONE_OPTIONS)[number]}
                  onChange={(value) => apply({ qrQuietZone: Number(value) as QrQuietZone })}
                  ariaLabel={t("Quiet zone")}
                  renderOption={(option) => t(option === "4" ? "Tight" : option === "6" ? "Balanced" : "Generous")}
                />
              </DesignRow>
            </Disclosure>
          </div>
        </Surface>
      </div>

      {/* Sticky so the code stays beside the control being changed. */}
      <div className="xl:sticky xl:top-[var(--md-page-stack-gap)]">
        <Surface padding="md" className="grid gap-4 p-5">
          <SectionHeader
            title={t("Your code")}
            meta={matrix ? `${t("Version")} ${matrix.version} · ${t("Error correction")} ${matrix.level}` : undefined}
            metaPlacement="stacked"
          />

          {/* The plate stays the chosen light colour so the quiet zone reads. */}
          <div
            className="mx-auto w-full max-w-[260px] rounded-[var(--md-radius-xl)] p-3.5 shadow-[var(--md-shadow-line)]"
            style={{ backgroundColor: branding.qrLight }}
          >
            <QrCodeImage value={url} branding={branding} label={`${t("QR code for")} ${card.label}`} />
          </div>

          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Public link")}</p>
            <CopyableField label={t("Public link")} value={url} className="mt-1.5 w-full">
              <span className="block truncate text-[13px] text-[var(--md-ink)]" data-i18n-skip dir="ltr">
                {url.replace(/^https?:\/\//, "")}
              </span>
            </CopyableField>
          </div>

          <CardQrDownloads card={card} className="grid-cols-2" />

          <p className="text-[12px] leading-5 text-[var(--md-subtle)]">
            {t("Print at 30mm or larger and keep the light margin around the code. A cropped code will not scan.")}
          </p>
        </Surface>
      </div>
    </div>
  )
}
