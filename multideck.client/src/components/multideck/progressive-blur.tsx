import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

/**
 * A band that dissolves whatever scrolls under it: three compounding blur passes
 * plus a colour fade, each masked to a different depth so the ramp from clear to
 * gone has no visible step in it.
 *
 * Two constraints on where this can be mounted, both load-bearing:
 *
 * 1. `backdrop-filter` samples what is painted *below it in its backdrop root*.
 *    Any ancestor carrying a transform, an opacity below 1, a filter or a
 *    `will-change` for one of those starts a new root and the veil goes blind.
 *    So mount it as a sibling of the scroller, not inside an animated wrapper.
 * 2. It must be painted after the scroller and before whatever sits on top of it
 *    (a header, a composer), which is what the `z` on the caller's classes is for.
 *
 * Nothing here animates, so the layers stay off the compositor's dirty list and
 * only re-rasterise when the content behind them actually moves.
 */
export function ProgressiveBlur({
  edge = "top",
  tone = "page",
  height,
  offset,
  tint,
  className,
}: {
  edge?: "top" | "bottom"
  /** `page` fades to the app background; `rail` leaves the fade to the caller. */
  tone?: "page" | "rail"
  /** Band depth in px. The ramp is proportional, so a taller band is a softer one. */
  height?: number
  /**
   * Inset from the pinned edge, in px. The dense end of the ramp belongs against
   * whatever the veil hands content over to — a floating composer's top edge, not
   * the viewport's bottom — otherwise most of the ramp is spent behind something
   * opaque and content slides under it still sharp.
   */
  offset?: number
  /** The colour the band fades to. Defaults to the page background. */
  tint?: string
  className?: string
}) {
  // Written inline rather than as classes: the stylesheet's own rules are
  // unlayered, so a Tailwind arbitrary-property class would lose the cascade to
  // them. Inline wins outright and keeps the override readable at the call site.
  const style = {
    ...(height === undefined ? null : { "--md-progressive-blur-height": `${height}px` }),
    ...(offset === undefined ? null : { "--md-progressive-blur-offset": `${offset}px` }),
    ...(tint === undefined ? null : { "--md-progressive-blur-tint": tint }),
  } as CSSProperties

  return (
    <span
      aria-hidden="true"
      data-edge={edge}
      data-tone={tone}
      style={style}
      className={cn("md-progressive-blur pointer-events-none", className)}
    >
      <span />
      <span />
      <span />
      <span className="md-progressive-blur__tint" />
    </span>
  )
}
