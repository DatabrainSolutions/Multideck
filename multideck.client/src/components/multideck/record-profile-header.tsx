import { useId, type ReactNode } from "react"
import { ArrowLeft } from "@/components/icons/hugeicons"
import { cn } from "@/lib/utils"

/**
 * The top of a record: a short banner, the record's mark overlapping its lower
 * edge, then identity, actions and a hairline strip of figures.
 *
 * The banner is deliberately shallow (72px on a phone, 96px from `sm`) so the
 * first working content stays above the fold. It is drawn from the Multideck
 * accent and neutral tokens only, so it follows the operator's accent and theme
 * and never takes tenant branding. When the record has a route worth naming
 * (a company's main trade lane, say), `bannerLabel` prints it beside the arc.
 */
export function RecordProfileHeader({
  avatar,
  avatarShape = "organisation",
  title,
  badges,
  meta,
  actions,
  bannerLabel,
  back,
  stats,
  className,
}: {
  /** The record's mark, sized to fill (`size-full`). It sits on an opaque plate, so a tinted avatar reads cleanly over the banner. */
  avatar: ReactNode
  /** Organisations get a rounded square and people a circle, so the two never read as the same kind of record. */
  avatarShape?: "organisation" | "person"
  title: ReactNode
  badges?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  bannerLabel?: ReactNode
  back?: { label: string; onClick: () => void }
  /** `RecordProfileStat` cells. They share one hairline strip beneath the identity. */
  stats?: ReactNode
  className?: string
}) {
  const person = avatarShape === "person"

  return (
    <section className={cn("min-w-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", className)}>
      <div className="relative h-[72px] sm:h-[96px]">
        <RecordProfileBanner />
        {back ? (
          <button
            type="button"
            onClick={back.onClick}
            className="absolute start-3 top-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--md-surface)_82%,transparent)] px-2.5 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] backdrop-blur-md transition-[color,background-color,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-surface)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a24)] active:scale-[0.96] motion-reduce:transition-none sm:start-4"
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" strokeWidth={1.4} aria-hidden="true" />
            {back.label}
          </button>
        ) : null}
        {bannerLabel ? (
          <div className="absolute end-3 top-3 max-w-[60%] truncate rounded-full bg-[color-mix(in_srgb,var(--md-surface)_82%,transparent)] px-2.5 py-1 text-[11px] font-medium leading-4 text-[var(--md-text)] shadow-[var(--md-shadow-line)] backdrop-blur-md sm:end-4">
            {bannerLabel}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
        {/* The plate is the surface colour, so the ring reads as a cut-out of
            the banner rather than a border drawn on top of it.
            Radius: outer 18px, 4px plate, inner mark 14px. */}
        <div
          className={cn(
            "relative -mt-[30px] w-fit shrink-0 bg-[var(--md-surface)] p-1 sm:-mt-[38px]",
            person ? "rounded-full" : "rounded-[var(--md-radius-2xl)]",
          )}
        >
          <div className={cn("grid size-[60px] place-items-center overflow-hidden sm:size-[76px]", person ? "rounded-full" : "rounded-[var(--md-radius-xl)]")}>
            {avatar}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:pt-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
              {title}
              {badges}
            </div>
            {meta ? <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-4 text-[var(--md-text)]">{meta}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>

      {stats ? (
        // Every cell draws its start and top hairline; the first column and row
        // are pulled one pixel outside the clip, so any count of cells wraps
        // into a clean grid without a stray edge or an empty filled cell.
        // On a phone the figures run as one swipeable row, so the header stays
        // a header rather than three rows of numbers.
        <div className="overflow-hidden border-t border-[var(--md-line)]">
          <div className="-ms-px -mt-px grid snap-x snap-mandatory auto-cols-[minmax(148px,46%)] grid-flow-col overflow-x-auto [scrollbar-width:none] sm:snap-none sm:grid-flow-row sm:grid-cols-3 sm:overflow-visible lg:grid-cols-[repeat(auto-fit,minmax(136px,1fr))] [&::-webkit-scrollbar]:hidden [&>*]:snap-start [&>*]:border-s [&>*]:border-t [&>*]:border-[var(--md-line)]">
            {stats}
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** One figure in the header strip: what it is, the figure, and what it is made of. */
export function RecordProfileStat({
  label,
  value,
  detail,
  icon,
  tone = "default",
  children,
}: {
  label: string
  value?: ReactNode
  detail?: ReactNode
  icon?: ReactNode
  tone?: "default" | "attention" | "danger" | "muted"
  /** Replaces the figure and detail when the value needs its own shape, such as a score ring. */
  children?: ReactNode
}) {
  return (
    <div className="min-w-0 px-4 py-3 sm:px-5">
      <p className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-[var(--md-subtle)]">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      {children ?? (
        <>
          <p
            className={cn(
              "mt-1 truncate text-[17px] font-medium leading-6 tabular-nums",
              tone === "danger" ? "text-[var(--md-red)]" : tone === "attention" ? "text-[var(--md-amber)]" : tone === "muted" ? "text-[var(--md-subtle)]" : "text-[var(--md-ink)]",
            )}
          >
            {value}
          </p>
          {detail ? <p className="mt-0.5 truncate text-[11px] leading-4 text-[var(--md-text)]">{detail}</p> : null}
        </>
      )}
    </div>
  )
}

/**
 * A quiet chart of the sea: a fine dot grid fading in from the right, and one
 * dashed route arc between two ports. Decorative, so it is hidden from
 * assistive technology and never moves.
 */
function RecordProfileBanner() {
  const id = useId().replace(/:/g, "")

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden bg-[radial-gradient(110%_170%_at_4%_0%,var(--md-accent-a32),transparent_62%),radial-gradient(60%_150%_at_97%_135%,var(--md-accent-a24),transparent_68%),linear-gradient(115deg,var(--md-surface-tint),var(--md-surface-soft)_55%,var(--md-surface-tint))]"
    >
      <svg className="absolute inset-0 size-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`${id}-dots`} width="11" height="11" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.9" fill="var(--md-accent)" />
          </pattern>
          <linearGradient id={`${id}-fade`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0.2" stopColor="white" stopOpacity="0" />
            <stop offset="1" stopColor="white" stopOpacity="1" />
          </linearGradient>
          <mask id={`${id}-mask`}>
            <rect width="100%" height="100%" fill={`url(#${id}-fade)`} />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id}-dots)`} mask={`url(#${id}-mask)`} opacity="0.36" />
      </svg>
      <svg className="absolute bottom-0 end-0 h-full w-[min(520px,78%)] rtl:-scale-x-100" viewBox="0 0 520 96" preserveAspectRatio="xMaxYMax meet" xmlns="http://www.w3.org/2000/svg">
        <path d="M86 84 C 190 -10, 360 -6, 470 58" fill="none" stroke="var(--md-accent)" strokeOpacity="0.7" strokeWidth="1.25" strokeDasharray="2 5" strokeLinecap="round" />
        <circle cx="86" cy="84" r="3.5" fill="var(--md-surface)" stroke="var(--md-accent)" strokeWidth="1.25" />
        <circle cx="470" cy="58" r="3.5" fill="var(--md-accent)" />
        <circle cx="470" cy="58" r="8" fill="var(--md-accent)" fillOpacity="0.14" />
      </svg>
    </div>
  )
}
