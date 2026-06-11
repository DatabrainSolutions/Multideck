import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type PaginationProps = {
  page: number
  pageCount: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  pageSizeOptions?: number[]
  onPageSizeChange?: (pageSize: number) => void
  itemLabel?: string
  className?: string
}

function getVisiblePages(page: number, pageCount: number) {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pageCount))
  return Array.from(pages).sort((a, b) => a - b)
}

export function Pagination({
  page,
  pageCount,
  totalItems,
  pageSize,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  itemLabel = "items",
  className,
}: PaginationProps) {
  const safePageCount = Math.max(pageCount, 1)
  const currentPage = Math.min(Math.max(page, 1), safePageCount)
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)
  const visiblePages = getVisiblePages(currentPage, safePageCount)

  return (
    <nav
      className={cn("flex flex-col gap-3 rounded-[var(--md-radius-xl)] bg-white/35 p-2 shadow-[var(--md-shadow-line)] sm:flex-row sm:items-center sm:justify-between", className)}
      aria-label={`${itemLabel} pagination`}
    >
      <div className="flex flex-col gap-2 px-2 sm:flex-row sm:items-center sm:gap-4">
        <p className="text-[13px] font-medium text-[var(--md-text)]">
          Showing <span className="text-[var(--md-ink)]">{startItem}-{endItem}</span> of{" "}
          <span className="text-[var(--md-ink)]">{totalItems}</span> {itemLabel}
        </p>

        {pageSizeOptions?.length && onPageSizeChange ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-[var(--md-subtle)]">Rows</span>
            <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
              <SelectTrigger
                size="sm"
                className="h-8 rounded-[var(--md-radius-md)] border-0 bg-white/55 px-2 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
                aria-label="Rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={String(option)} className="text-[13px]">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={currentPage === 1}
          className="grid size-8 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-text)] transition-all duration-200 hover:bg-white/70 hover:text-[var(--md-ink)] disabled:pointer-events-none disabled:opacity-35"
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="size-4" strokeWidth={1.2} />
        </button>

        {visiblePages.map((pageNumber, index) => {
          const previousPage = visiblePages[index - 1]
          const hasGap = previousPage && pageNumber - previousPage > 1

          return (
            <span key={pageNumber} className="flex items-center gap-1">
              {hasGap ? <span className="px-1 text-[12px] font-medium text-[var(--md-subtle)]">...</span> : null}
              <button
                type="button"
                aria-current={pageNumber === currentPage ? "page" : undefined}
                className={cn(
                  "h-8 min-w-8 rounded-[var(--md-radius-md)] px-2 text-[13px] font-medium text-[var(--md-text)] transition-all duration-200 hover:bg-white/70 hover:text-[var(--md-ink)]",
                  pageNumber === currentPage && "bg-[var(--md-sidebar-bg)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
                )}
                onClick={() => onPageChange(pageNumber)}
              >
                {pageNumber}
              </button>
            </span>
          )
        })}

        <button
          type="button"
          aria-label="Next page"
          disabled={currentPage === safePageCount}
          className="grid size-8 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-text)] transition-all duration-200 hover:bg-white/70 hover:text-[var(--md-ink)] disabled:pointer-events-none disabled:opacity-35"
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight className="size-4" strokeWidth={1.2} />
        </button>
      </div>
    </nav>
  )
}
