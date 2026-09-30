import { useEffect, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from "react"
import { useLanguage } from "@/i18n/language-provider"

type ScrollRailLayout = {
  visible: boolean
  viewportWidth: number
  contentWidth: number
  scrollLeft: number
}

const hiddenScrollRail: ScrollRailLayout = { visible: false, viewportWidth: 0, contentWidth: 0, scrollLeft: 0 }

/** Sits directly below the sticky column headings in a wide register. */
export function TableScrollRail({ tableRef, colSpan }: { tableRef: RefObject<HTMLDivElement | null>; colSpan: number }) {
  const { t } = useLanguage()
  const [layout, setLayout] = useState<ScrollRailLayout>(hiddenScrollRail)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef<number | null>(null)

  useEffect(() => {
    const scrollArea = tableRef.current?.querySelector<HTMLElement>('[data-slot="table-container"]')
    const table = scrollArea?.querySelector("table")
    if (!scrollArea || !table) return

    let frame = 0
    const sync = () => {
      frame = 0
      const next: ScrollRailLayout = {
        visible: scrollArea.scrollWidth - scrollArea.clientWidth > 2,
        viewportWidth: scrollArea.clientWidth,
        contentWidth: scrollArea.scrollWidth,
        scrollLeft: scrollArea.scrollLeft,
      }
      setLayout((current) => Object.keys(next).every((key) => current[key as keyof ScrollRailLayout] === next[key as keyof ScrollRailLayout]) ? current : next)
    }
    const queueSync = () => { if (!frame) frame = window.requestAnimationFrame(sync) }
    const observer = new ResizeObserver(queueSync)
    observer.observe(scrollArea)
    observer.observe(table)
    scrollArea.addEventListener("scroll", queueSync, { passive: true })
    window.addEventListener("resize", queueSync)
    sync()
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer.disconnect()
      scrollArea.removeEventListener("scroll", queueSync)
      window.removeEventListener("resize", queueSync)
    }
  }, [tableRef])

  const maxScroll = Math.max(0, layout.contentWidth - layout.viewportWidth)
  const thumbFraction = Math.max(0.1, Math.min(1, layout.viewportWidth / (layout.contentWidth || 1)))
  const thumbStart = maxScroll ? (layout.scrollLeft / maxScroll) * (1 - thumbFraction) : 0

  function scrollFromPointer(clientX: number, offset: number) {
    const scrollArea = tableRef.current?.querySelector<HTMLElement>('[data-slot="table-container"]')
    const track = trackRef.current
    if (!scrollArea || !track) return
    const rect = track.getBoundingClientRect()
    const thumbWidth = rect.width * thumbFraction
    const travel = rect.width - thumbWidth
    if (travel <= 0) return
    const position = Math.max(0, Math.min(travel, clientX - rect.left - offset))
    scrollArea.scrollLeft = (position / travel) * (scrollArea.scrollWidth - scrollArea.clientWidth)
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const track = trackRef.current
    if (!track) return
    const thumb = track.querySelector<HTMLElement>('[data-scroll-rail-thumb]')
    dragOffset.current = thumb?.contains(event.target as Node)
      ? event.clientX - thumb.getBoundingClientRect().left
      : track.getBoundingClientRect().width * thumbFraction / 2
    event.currentTarget.setPointerCapture(event.pointerId)
    scrollFromPointer(event.clientX, dragOffset.current)
  }

  if (!layout.visible) return null
  return (
    <tr data-table-scroll-rail-row className="h-3 border-0 bg-[var(--md-surface-soft)] hover:bg-[var(--md-surface-soft)]">
    <th colSpan={colSpan} className="h-3 p-0">
    <div
      data-table-viewport-scroll-rail
      className="sticky start-0 z-20 flex h-3 items-center bg-[var(--md-surface-soft)] px-2"
      style={{ width: layout.viewportWidth }}
    >
      <div
        ref={trackRef}
        role="scrollbar"
        aria-label={t("Scroll table horizontally")}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxScroll)}
        aria-valuenow={Math.round(layout.scrollLeft)}
        tabIndex={0}
        className="relative h-2.5 min-w-0 flex-1 touch-none cursor-pointer rounded-[var(--md-radius-md)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]"
        onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); startDrag(event) }}
        onPointerMove={(event) => { if (dragOffset.current !== null) scrollFromPointer(event.clientX, dragOffset.current) }}
        onPointerUp={(event) => { event.stopPropagation(); dragOffset.current = null }}
        onPointerCancel={() => { dragOffset.current = null }}
        onClick={(event) => { event.stopPropagation() }}
        onKeyDown={(event) => {
          const scrollArea = tableRef.current?.querySelector<HTMLElement>('[data-slot="table-container"]')
          if (!scrollArea) return
          const step = event.key === "PageDown" || event.key === "PageUp" ? scrollArea.clientWidth * 0.8 : 80
          if (event.key === "ArrowRight" || event.key === "PageDown") scrollArea.scrollLeft += step
          else if (event.key === "ArrowLeft" || event.key === "PageUp") scrollArea.scrollLeft -= step
          else if (event.key === "Home") scrollArea.scrollLeft = 0
          else if (event.key === "End") scrollArea.scrollLeft = scrollArea.scrollWidth
          else return
          event.preventDefault()
        }}
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--md-line)]" />
        <span data-scroll-rail-thumb aria-hidden="true" className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--md-accent)]" style={{ left: `${thumbStart * 100}%`, width: `${thumbFraction * 100}%` }} />
      </div>
    </div>
    </th>
    </tr>
  )
}

/** Restrict floating headings to the page or panel that owns the table. */
export function getTableStickyBounds(scrollArea: HTMLElement) {
  const dialog = scrollArea.closest<HTMLElement>('[role="dialog"]')
  const topBar = dialog ? null : document.querySelector<HTMLElement>(".md-topbar")
  let top = dialog ? dialog.getBoundingClientRect().top : Math.max(0, (topBar?.getBoundingClientRect().bottom ?? 0) + 8)
  let bottom = Math.min(window.innerHeight, dialog?.getBoundingClientRect().bottom ?? window.innerHeight)
  let nested = false
  let left = 0
  let right = window.innerWidth
  for (let parent = scrollArea.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    const rect = parent.getBoundingClientRect()
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight + 1) {
      nested = nested || rect.top > top
      top = Math.max(top, rect.top)
      bottom = Math.min(bottom, rect.bottom)
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      left = Math.max(left, rect.left)
      right = Math.min(right, rect.right)
    }
  }
  return { top, bottom, left, right, dialog: Boolean(dialog), nested }
}
