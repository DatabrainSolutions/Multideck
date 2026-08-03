import { useEffect, useRef, useState, type ReactNode } from "react"
import { FileText, Maximize2, Minus, Plus } from "lucide-react"
import { useReducedMotion } from "motion/react"
import { Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

const minZoom = 0.6
const maxZoom = 3
const zoomStep = 0.25

export type EvidenceViewerPage = {
  page: number
  width: number
  height: number
  /** Rendered page image. Pages without one show a placeholder of the right shape. */
  url?: string
}

export type EvidenceViewerBox = {
  id: string
  page: number
  /** Page fractions from 0 to 1. */
  box: { x: number; y: number; width: number; height: number }
  label?: string
  /** Drawn as a dashed edge, for a box interpolated inside a larger block. */
  approximate?: boolean
  tone?: "accent" | "amber"
}

/**
 * Shows a document beside the data taken from it, with a box over the place each value was
 * read. Selecting a box, or selecting a row elsewhere, brings that part of the page into view.
 */
export function DocumentEvidenceViewer({
  pages,
  boxes,
  activeBoxId,
  onSelectBox,
  title,
  meta,
  empty,
  className,
  bodyClassName,
}: {
  pages: EvidenceViewerPage[]
  boxes: EvidenceViewerBox[]
  activeBoxId?: string | null
  onSelectBox?: (boxId: string) => void
  title: string
  meta?: ReactNode
  empty?: ReactNode
  className?: string
  bodyClassName?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [zoom, setZoom] = useState(1)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!activeBoxId || !activeRef.current) return
    activeRef.current.scrollIntoView({ block: "center", inline: "nearest", behavior: shouldReduceMotion ? "auto" : "smooth" })
  }, [activeBoxId, shouldReduceMotion])

  return <Surface padding="none" className={cn("flex min-h-0 flex-col overflow-hidden rounded-[var(--md-radius-xl)]", className)}>
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--md-line)] px-4 py-2.5">
      <span className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-[13px] font-medium">{title}</h2>
        {meta}
      </span>
      <span className="flex items-center gap-0.5 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] p-0.5 shadow-[var(--md-shadow-line)]">
        <ZoomButton label={t("Zoom out")} onClick={() => setZoom((current) => Math.max(minZoom, current - zoomStep))} disabled={zoom <= minZoom}><Minus className="size-3.5" /></ZoomButton>
        <span className="min-w-[42px] px-1 text-center text-[10.5px] tabular-nums text-[var(--md-text)]">{Math.round(zoom * 100)}%</span>
        <ZoomButton label={t("Zoom in")} onClick={() => setZoom((current) => Math.min(maxZoom, current + zoomStep))} disabled={zoom >= maxZoom}><Plus className="size-3.5" /></ZoomButton>
        <ZoomButton label={t("Fit width")} onClick={() => setZoom(1)} disabled={zoom === 1}><Maximize2 className="size-3.5" /></ZoomButton>
      </span>
    </header>

    <div className={cn("min-h-0 flex-1 overflow-auto overscroll-contain bg-[var(--md-surface-soft)] p-3", bodyClassName)}>
      {pages.length
        ? <div className="mx-auto space-y-3" style={{ width: `${zoom * 100}%`, maxWidth: zoom > 1 ? "none" : "100%" }}>
          {pages.map((page) => <div key={page.page} className="relative overflow-hidden rounded-[var(--md-radius-md)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
            <span className="block w-full" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
              {page.url
                ? <img src={page.url} alt={`${t("Page")} ${page.page}`} className="size-full object-contain" draggable={false} />
                : <span className="grid size-full place-items-center text-[var(--md-muted)]"><FileText className="size-6" /></span>}
            </span>

            {boxes.filter((entry) => entry.page === page.page).map((entry) => {
              const active = entry.id === activeBoxId
              return <button
                key={entry.id}
                ref={active ? activeRef : undefined}
                type="button"
                tabIndex={-1}
                onClick={() => onSelectBox?.(entry.id)}
                aria-label={entry.label ?? `${t("Page")} ${page.page}`}
                className={cn(
                  "absolute rounded-[3px] transition-[background,box-shadow] duration-150 ease-out motion-reduce:transition-none",
                  entry.approximate ? "outline-dashed" : "outline-solid",
                  "outline-1 outline-offset-0",
                  active
                    ? "z-10 bg-[var(--md-accent-a18)] outline-2 outline-[var(--md-accent)] shadow-[0_0_0_4px_var(--md-accent-a10)]"
                    : entry.tone === "amber"
                      ? "bg-[rgba(221,138,43,0.12)] outline-[var(--md-amber)] hover:bg-[rgba(221,138,43,0.2)]"
                      : "bg-[var(--md-accent-a04)] outline-[var(--md-accent-a28)] hover:bg-[var(--md-accent-a10)]",
                )}
                style={{
                  insetInlineStart: `${entry.box.x * 100}%`,
                  top: `calc(${entry.box.y * 100}% - 2px)`,
                  width: `${entry.box.width * 100}%`,
                  height: `calc(${entry.box.height * 100}% + 4px)`,
                }}
              >
                {active && entry.label
                  ? <span className="absolute -top-[9px] start-0 max-w-full truncate rounded-full bg-[var(--md-accent)] px-1.5 text-[9px] font-medium leading-[15px] text-white shadow-[var(--md-shadow-line)]">{entry.label}</span>
                  : null}
              </button>
            })}

            <span className="pointer-events-none absolute bottom-1 end-1 rounded-full bg-[var(--md-surface)] px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">{page.page}</span>
          </div>)}
        </div>
        : <div className="grid h-full min-h-[240px] place-items-center px-6 text-center">
          <span className="text-[11px] leading-5 text-[var(--md-subtle)]">{empty}</span>
        </div>}
    </div>
  </Surface>
}

function ZoomButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className="grid size-6 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-text)] hover:bg-[var(--md-hover)] disabled:opacity-40 disabled:hover:bg-transparent"
  >{children}</button>
}
