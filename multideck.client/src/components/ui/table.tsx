import * as React from "react"
import { createPortal } from "react-dom"
import { TableScrollRail, getTableStickyBounds } from "@/components/ui/table-viewport"

import { cn } from "@/lib/utils"

type TableProps = React.ComponentProps<"table"> & {
  /** DataTable supplies its own interactive headings using the same visual design. */
  enhanced?: boolean
}

function Table({ className, enhanced = true, children, style, ...props }: TableProps) {
  const root = React.useRef<HTMLDivElement>(null)
  const floatingScroll = React.useRef<HTMLDivElement>(null)
  const [layout, setLayout] = React.useState({ visible: false, top: 0, left: 0, width: 0, tableWidth: 0, scrollLeft: 0, columns: [] as number[], dialog: false, nested: false })
  const [widths, setWidths] = React.useState<number[]>([])
  const resizeSession = React.useRef<{ index: number; x: number; widths: number[] } | null>(null)
  const items = React.Children.toArray(children)
  const header = items.find((child) => React.isValidElement(child) && (child.type === "thead" || child.type === TableHeader)) as React.ReactElement<React.ComponentProps<"thead">> | undefined

  React.useLayoutEffect(() => {
    if (!enhanced) return
    const area = root.current?.querySelector<HTMLElement>('[data-slot="table-container"]')
    const table = area?.querySelector("table")
    const head = table?.querySelector("thead")
    if (!area || !table || !head) return
    let frame = 0
    const sync = () => {
      frame = 0
      const rect = area.getBoundingClientRect()
      const bounds = getTableStickyBounds(area)
      const next = {
        visible: rect.top < bounds.top && Math.min(rect.bottom, bounds.bottom) > bounds.top + head.getBoundingClientRect().height && rect.right > bounds.left && rect.left < bounds.right,
        top: bounds.top, left: rect.left, width: rect.width,
        tableWidth: table.getBoundingClientRect().width, scrollLeft: area.scrollLeft,
        columns: [...(Array.from(table.rows).find(row => row.cells.length > 0 && Array.from(row.cells).every(cell => cell.colSpan === 1))?.cells ?? [])].map(cell => cell.getBoundingClientRect().width),
        dialog: bounds.dialog, nested: bounds.nested,
      }
      setLayout(current => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }
    const queue = () => { if (!frame) frame = requestAnimationFrame(sync) }
    const observer = new ResizeObserver(queue)
    observer.observe(area)
    observer.observe(table)
    observer.observe(head)
    document.addEventListener("scroll", queue, true)
    window.addEventListener("resize", queue)
    sync()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener("scroll", queue, true)
      window.removeEventListener("resize", queue)
    }
  }, [enhanced, children, widths])

  React.useLayoutEffect(() => {
    if (floatingScroll.current) floatingScroll.current.scrollLeft = layout.scrollLeft
  }, [layout])

  const measure = () => [...(root.current?.querySelectorAll<HTMLTableCellElement>('table > thead > tr:first-child > th') ?? [])].map(cell => cell.getBoundingClientRect().width)
  const resize = (index: number, next: number, startingWidths = measure()) => {
    if (!startingWidths.length) return
    setWidths(startingWidths.map((width, position) => position === index ? Math.max(84, next) : width))
  }
  const rows = header ? React.Children.toArray(header.props.children) : []
  const singleRow = rows.length === 1 && React.isValidElement(rows[0])
  const cells = singleRow ? React.Children.toArray((rows[0] as React.ReactElement<React.ComponentProps<"tr">>).props.children) : []
  const railColSpan = Math.max(1, ...rows.map(row => React.isValidElement<React.ComponentProps<"tr">>(row) ? React.Children.toArray(row.props.children).reduce<number>((total, cell) => total + (React.isValidElement<React.ComponentProps<"th">>(cell) ? cell.props.colSpan ?? 1 : 0), 0) : 0))
  const canResize = cells.length > 0 && cells.every(cell => React.isValidElement<React.ComponentProps<"th">>(cell) && (cell.props.colSpan ?? 1) === 1 && (cell.props.rowSpan ?? 1) === 1)
  const renderHeader = (hidden: boolean) => {
    if (!header) return null
    const headingRows = canResize ? React.cloneElement(rows[0] as React.ReactElement<React.ComponentProps<"tr">>, {}, cells.map((child, index) => {
      const cell = child as React.ReactElement<React.ComponentProps<"th">>
      return React.cloneElement(cell, { key: cell.key ?? index, style: { ...cell.props.style, position: "relative", width: widths[index] ?? cell.props.style?.width } }, cell.props.children,
        <span role="separator" aria-label={`Resize column ${index + 1}`} aria-orientation="vertical" aria-valuemin={84} aria-valuenow={Math.round(widths[index] ?? layout.columns[index] ?? 160)} tabIndex={0}
          className="absolute inset-y-0 end-0 z-[5] w-2 cursor-col-resize touch-none outline-none before:absolute before:inset-y-0 before:start-1/2 before:w-px before:bg-[var(--md-hairline)] hover:before:bg-[var(--md-accent)] focus-visible:before:bg-[var(--md-accent)]"
          onPointerDown={event => {
            event.preventDefault(); event.stopPropagation()
            const measured = measure()
            resizeSession.current = { index, x: event.clientX, widths: measured }
            setWidths(measured)
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={event => {
            const session = resizeSession.current
            if (session) resize(session.index, session.widths[session.index] + event.clientX - session.x, session.widths)
          }}
          onPointerUp={() => { resizeSession.current = null }}
          onPointerCancel={() => { resizeSession.current = null }}
          onClick={event => event.stopPropagation()}
          onKeyDown={event => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
            event.preventDefault(); event.stopPropagation()
            const measured = measure()
            resize(index, measured[index] + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 24 : 8), measured)
          }}
        />)
    })) : header.props.children
    return React.cloneElement(header, { "aria-hidden": hidden || undefined, inert: hidden || undefined }, headingRows, <TableScrollRail tableRef={root} colSpan={railColSpan} />)
  }
  const frozen = enhanced && widths.length > 0 && canResize
  const tableStyle = frozen ? { ...style, minWidth: widths.reduce((a, b) => a + b, 0), width: widths.reduce((a, b) => a + b, 0), tableLayout: "fixed" as const } : style
  return (
    <div ref={root} className={enhanced ? "md-standard-table overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]" : undefined}>
      <div data-slot="table-container" tabIndex={0} role="region" aria-label={props["aria-label"] || "Scrollable table"}
        className="md-table-scroll relative w-full min-w-0 overflow-x-auto overscroll-x-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent)]">
        <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} style={tableStyle} {...props}>
          {frozen ? <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup> : null}
          {enhanced ? items.map((child, index) => child === header ? <React.Fragment key={index}>{renderHeader(layout.visible)}</React.Fragment> : frozen && React.isValidElement(child) && child.type === "colgroup" ? null : child) : children}
        </table>
      </div>
      {enhanced && layout.visible && header ? createPortal(
        <>
        {!layout.dialog && !layout.nested ? <div aria-hidden="true" className="pointer-events-none fixed top-0 z-[9] bg-[var(--md-bg)]" style={{ left: layout.left - 1, width: layout.width + 2, height: layout.top }} /> : null}
        <div data-table-sticky-header className="md-standard-table fixed overflow-hidden rounded-t-[var(--md-radius-xl)] bg-[var(--md-bg)] shadow-[var(--md-shadow-line)]" style={{ left: layout.left, top: layout.top, width: layout.width, zIndex: layout.dialog ? 60 : 20 }}>
          <div ref={floatingScroll} className="overflow-hidden">
            <table className={className} style={{ width: layout.tableWidth, tableLayout: "fixed" }}>
              <colgroup>{layout.columns.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
              {renderHeader(false)}
            </table>
          </div>
        </div>
        </>, document.body) : null}
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
