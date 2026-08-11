import { useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, Download, ExternalLink, LoaderCircle, RefreshCw, TriangleAlert, type LucideIcon } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CopyableField } from "@/components/multideck/copyable-field"
import { StatusPill } from "@/components/multideck/status-pill"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { readableInk } from "@/lib/color"
import { encodeQr, qrPngDataUrl, qrRender, qrSvgDocument, QR_QUIET_ZONE, type EccLevel, type QrStyle } from "@/lib/qr-code"
import {
  cardPublicPath,
  cardPublicUrl,
  downloadDataUrl,
  downloadFile,
  useContactCardStore,
  type SaveStatus,
} from "@/lib/contact-card-store"
import type { CardAutomation, CardBranding, ContactCard, ContactCardStatus } from "@/data/contact-card-data"
import type { StatusTone } from "@/data/multideck-data"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

const CARD_STATUS_TONE: Record<ContactCardStatus, StatusTone> = {
  draft: "neutral",
  published: "green",
  paused: "amber",
}

const CARD_STATUS_LABEL: Record<ContactCardStatus, string> = {
  draft: "Draft",
  published: "Live",
  paused: "Paused",
}

export function CardStatusPill({ status }: { status: ContactCardStatus }) {
  const { t } = useLanguage()
  return <StatusPill tone={CARD_STATUS_TONE[status]}>{t(CARD_STATUS_LABEL[status])}</StatusPill>
}

export type AutomationHealth = { tone: StatusTone; label: string; detail: string }

/** One reading of an automation, shared by the register chip and the health band. */
export function automationHealth(automation: CardAutomation): AutomationHealth {
  if (automation.state === "off") {
    return { tone: "neutral", label: "Off", detail: "Nothing runs when someone shares their details." }
  }
  if (automation.autoPausedReason) {
    return { tone: "amber", label: "Attention", detail: automation.autoPausedReason }
  }
  if (automation.state === "paused") {
    return { tone: "amber", label: "Paused", detail: "Paused by you. No actions are running." }
  }
  if (automation.failures > 0) {
    return { tone: "amber", label: "Attention", detail: `${automation.failures} recent actions failed.` }
  }
  return { tone: "green", label: "Active", detail: "Running on every new exchange." }
}

export function AutomationHealthChip({ automation }: { automation: CardAutomation }) {
  const { t } = useLanguage()
  const health = automationHealth(automation)

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          health.tone === "green" && "bg-[var(--md-green)]",
          health.tone === "amber" && "bg-[var(--md-amber)]",
          health.tone === "neutral" && "bg-[var(--md-subtle)]",
        )}
      />
      <span className="text-[12.5px] text-[var(--md-text)]">{t(health.label)}</span>
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* QR code                                                                     */
/* -------------------------------------------------------------------------- */

/** Share of the symbol width cleared for a logo. Safe at level H. */
export const QR_LOGO_AREA = 0.24

/** Style and error-correction level are decided together: a logo needs level H. */
export function qrStyleForCard(branding: CardBranding): QrStyle {
  return {
    moduleStyle: branding.qrModuleStyle,
    eyeStyle: branding.qrEyeStyle,
    dark: branding.qrDark,
    light: branding.qrLight,
    logoArea: branding.logoInQr && branding.logoDataUrl ? QR_LOGO_AREA : 0,
  }
}

export function useQrCode(value: string, branding: CardBranding) {
  const style = useMemo(() => qrStyleForCard(branding), [branding])
  const level: EccLevel = style.logoArea > 0 ? "H" : "M"
  const matrix = useMemo(() => encodeQr(value, level), [level, value])
  const render = useMemo(() => (matrix ? qrRender(matrix, style) : null), [matrix, style])

  return { matrix, render, style }
}

/**
 * The code itself, rendered inline as three paths — modules, eye rings, eye
 * cores — so the whole symbol stays one small piece of DOM even at card size.
 * The quiet zone is always preserved: a cropped code is a code that will not
 * scan, however good it looks.
 */
export function QrCodeImage({
  value,
  branding,
  className,
  label,
}: {
  value: string
  branding: CardBranding
  className?: string
  label: string
}) {
  const { render, style } = useQrCode(value, branding)
  const { t } = useLanguage()

  if (!render) {
    return (
      <div className={cn("grid aspect-square place-items-center rounded-[var(--md-radius-lg)] bg-white p-4 text-center", className)}>
        <p className="text-[12px] text-[var(--md-subtle)]">{t("This link is too long to encode.")}</p>
      </div>
    )
  }

  const logo = render.logoBounds
  const inset = 0.6

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${render.extent} ${render.extent}`}
      className={cn("aspect-square h-auto w-full", className)}
    >
      <rect width={render.extent} height={render.extent} fill={style.light} />
      <g transform={`translate(${QR_QUIET_ZONE} ${QR_QUIET_ZONE})`}>
        <path d={render.modulesPath} fill={style.dark} />
        <path d={render.eyeRing} fill={style.dark} fillRule="evenodd" />
        <path d={render.eyeCore} fill={style.dark} />
        {logo && branding.logoDataUrl ? (
          <image
            href={branding.logoDataUrl}
            x={logo.start + inset}
            y={logo.start + inset}
            width={logo.span - inset * 2}
            height={logo.span - inset * 2}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : null}
      </g>
    </svg>
  )
}

/**
 * The physical-world handoff: the code, the link, and the two downloads a
 * printer will actually ask for.
 */
export function CardCodePanel({
  card,
  className,
  compact = false,
}: {
  card: ContactCard
  className?: string
  compact?: boolean
}) {
  const { t } = useLanguage()
  const url = cardPublicUrl(card)
  const { matrix, style } = useQrCode(url, card.branding)
  const [downloading, setDownloading] = useState<"png" | "svg" | null>(null)

  async function downloadPng() {
    if (!matrix) return
    setDownloading("png")

    try {
      let logo: HTMLImageElement | null = null
      if (style.logoArea > 0 && card.branding.logoDataUrl) {
        logo = await loadImage(card.branding.logoDataUrl)
      }
      const dataUrl = qrPngDataUrl(matrix, 1536, style, logo)
      if (dataUrl) downloadDataUrl(`${card.slug}-qr.png`, dataUrl)
      else toast.error(t("The PNG could not be generated."))
    } catch {
      toast.error(t("The PNG could not be generated."))
    } finally {
      setDownloading(null)
    }
  }

  function downloadSvg() {
    if (!matrix) return
    setDownloading("svg")
    window.setTimeout(() => {
      downloadFile(`${card.slug}-qr.svg`, qrSvgDocument(matrix, style, card.branding.logoDataUrl), "image/svg+xml")
      setDownloading(null)
    }, 60)
  }

  return (
    <Surface padding="md" className={cn("flex flex-col gap-5 p-5", className)}>
      <SectionHeader
        title={t("Share this card")}
        meta={matrix ? `${t("Version")} ${matrix.version} · ${t("Error correction")} ${matrix.level}` : undefined}
      />

      {/* The plate stays plain white-or-chosen-light so the quiet zone reads. */}
      <div
        className="mx-auto w-full max-w-[248px] rounded-[var(--md-radius-xl)] p-3 shadow-[var(--md-shadow-line)]"
        style={{ backgroundColor: style.light }}
      >
        <QrCodeImage value={url} branding={card.branding} label={`${t("QR code for")} ${card.label}`} />
      </div>

      <div className="min-w-0">
        <p className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Public link")}</p>
        <CopyableField label={t("Public link")} value={url} className="mt-1.5 w-full">
          <span className="block truncate text-[13px] text-[var(--md-ink)]" data-i18n-skip dir="ltr">
            {url.replace(/^https?:\/\//, "")}
          </span>
        </CopyableField>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          className="h-10 rounded-[var(--md-radius-md)] text-[13px]"
          onClick={downloadPng}
          disabled={!matrix || downloading !== null}
        >
          {downloading === "png" ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" strokeWidth={1.4} />
          ) : (
            <Download data-icon="inline-start" strokeWidth={1.4} />
          )}
          {t("PNG")}
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-[var(--md-radius-md)] text-[13px]"
          onClick={downloadSvg}
          disabled={!matrix || downloading !== null}
        >
          {downloading === "svg" ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" strokeWidth={1.4} />
          ) : (
            <Download data-icon="inline-start" strokeWidth={1.4} />
          )}
          {t("SVG")}
        </Button>
      </div>

      <Button
        variant="ghost"
        className="h-9 justify-start rounded-[var(--md-radius-md)] px-2 text-[13px] text-[var(--md-text)] hover:text-[var(--md-ink)]"
        onClick={() => window.open(`${cardPublicPath(card)}?preview=1`, "_blank", "noopener")}
      >
        <ExternalLink data-icon="inline-start" strokeWidth={1.4} />
        {t("Open the public card")}
      </Button>

      {compact ? null : (
        <p className="text-[12px] leading-5 text-[var(--md-subtle)]">
          {t("Print at 30mm or larger and keep the light margin around the code. A cropped code will not scan.")}
        </p>
      )}
    </Surface>
  )
}

/** Decode a data URL into an image element, for compositing a logo into a PNG. */
export function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("unreadable"))
    image.src = source
  })
}

/* -------------------------------------------------------------------------- */
/* Card preview                                                                */
/* -------------------------------------------------------------------------- */

export function cardInitials(card: ContactCard) {
  return card.person.fullName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
}

/** The card's mark: its logo where one exists, otherwise the person's initials. */
export function CardPersonBadge({ card, size = "md" }: { card: ContactCard; size?: "sm" | "md" | "lg" }) {
  const dimension = size === "sm" ? "size-8 text-[12px]" : size === "lg" ? "size-14 text-[18px]" : "size-11 text-[15px]"

  if (card.branding.logoDataUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-[var(--md-shadow-line)]", dimension)}
      >
        <img src={card.branding.logoDataUrl} alt="" className="size-full object-contain p-1" />
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center rounded-full font-medium", dimension)}
      style={{ backgroundColor: card.branding.accent, color: readableInk(card.branding.accent) }}
    >
      {cardInitials(card)}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                     */
/* -------------------------------------------------------------------------- */

export function CardMetricTile({
  label,
  value,
  detail,
  tone = "neutral",
  className,
}: {
  label: string
  value: string
  detail?: string
  tone?: StatusTone
  className?: string
}) {
  return (
    <Surface padding="sm" className={cn("min-h-[86px] rounded-[var(--md-radius-xl)] p-4", className)}>
      <p className="truncate text-[12px] font-medium leading-4 text-[var(--md-text)]">{label}</p>
      <strong
        className={cn(
          "mt-1.5 block text-[26px] font-medium leading-none tracking-normal tabular-nums",
          tone === "green" && "text-[var(--md-green)]",
          tone === "amber" && "text-[var(--md-amber)]",
          tone === "neutral" && "text-[var(--md-ink)]",
          tone === "teal" && "text-[var(--md-accent)]",
        )}
      >
        {value}
      </strong>
      {detail ? <p className="mt-2 truncate text-[12px] text-[var(--md-subtle)]">{detail}</p> : null}
    </Surface>
  )
}

/* -------------------------------------------------------------------------- */
/* Shared states                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Empty, error and permission messages all share one left-aligned shape. No
 * centred illustrations: these read as part of the page, not a detour from it.
 */
export function PanelMessage({
  icon: Icon,
  title,
  body,
  action,
  tone = "neutral",
  className,
}: {
  icon?: LucideIcon
  title: string
  body?: ReactNode
  action?: ReactNode
  tone?: "neutral" | "warning"
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 py-2", className)}>
      {Icon ? (
        <span
          className={cn(
            "grid size-8 place-items-center rounded-[var(--md-radius-md)]",
            tone === "warning" ? "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]" : "bg-[var(--md-surface-tint)] text-[var(--md-subtle)]",
          )}
        >
          <Icon className="size-4" strokeWidth={1.4} />
        </span>
      ) : null}
      <div className="max-w-[52ch]">
        <p className="text-[14px] font-medium text-[var(--md-ink)]">{title}</p>
        {body ? <p className="mt-1.5 text-[13px] leading-5 text-[var(--md-text)]">{body}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

export function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useLanguage()

  return (
    <PanelMessage
      icon={TriangleAlert}
      tone="warning"
      title={t("This didn't load")}
      body={message}
      action={
        <Button variant="outline" className="h-8 rounded-[var(--md-radius-md)] text-[13px]" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" strokeWidth={1.4} />
          {t("Try again")}
        </Button>
      }
    />
  )
}

/** Skeletons match the real footprint so nothing resizes when data lands. */
export function PanelSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-9 w-full rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)]" />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Save indicator                                                              */
/* -------------------------------------------------------------------------- */

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
}

/**
 * Saving is communicated in text, in one fixed place. It never moves and never
 * changes the width of what sits beside it.
 */
export function SaveIndicator({ cardId, className }: { cardId: string; className?: string }) {
  const { save } = useContactCardStore()
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const active = save.cardId === cardId ? save.status : "idle"

  return (
    <span
      className={cn("inline-flex h-5 min-w-[68px] items-center gap-1.5 text-[12px] text-[var(--md-subtle)]", className)}
      role="status"
      aria-live="polite"
    >
      <AnimatePresence mode="wait" initial={false}>
        {active === "idle" ? null : (
          <motion.span
            key={active}
            className={cn("inline-flex items-center gap-1.5", active === "error" && "text-[var(--md-red)]")}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.smooth)}
          >
            {active === "saved" ? <Check className="size-3.5" strokeWidth={1.8} /> : null}
            {t(SAVE_LABEL[active])}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Layout helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A full-width band rather than another card. Used where a single status needs
 * to be read at a glance without adding one more bordered box to the page.
 */
export function StatusBand({
  tone = "neutral",
  icon: Icon,
  title,
  detail,
  actions,
  className,
}: {
  tone?: "neutral" | "warning" | "positive"
  icon?: LucideIcon
  title: string
  detail?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[var(--md-radius-lg)] p-4 sm:flex-row sm:items-center sm:justify-between",
        tone === "warning" && "bg-[rgba(221,138,43,0.08)] shadow-[inset_0_0_0_1px_rgba(221,138,43,0.16)]",
        tone === "positive" && "bg-[var(--md-accent-a06)] shadow-[var(--md-shadow-line)]",
        tone === "neutral" && "bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <Icon
            className={cn("mt-0.5 size-4 shrink-0", tone === "warning" ? "text-[var(--md-amber)]" : "text-[var(--md-subtle)]")}
            strokeWidth={1.4}
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-[var(--md-ink)]">{title}</p>
          {detail ? <p className="mt-1 text-[12.5px] leading-5 text-[var(--md-text)]">{detail}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
