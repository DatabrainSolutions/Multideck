import { Fragment, useEffect, type MouseEvent } from "react"
import {
  Pagination as PaginationRoot,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n/language-provider"
import { paginationPageSizes, paginationRange } from "@/lib/pagination"

type PaginationProps = {
  page: number
  pageCount: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  pageSizeOptions?: number[]
  onPageSizeChange?: (pageSize: number) => void
  loading?: boolean
  error?: boolean
  /** Actual rows returned; avoids claiming a full page when a request returned fewer. */
  itemCount?: number
  itemLabel?: string
  className?: string
}

function getVisiblePages(page: number, pageCount: number) {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pageCount))
  return Array.from(pages).sort((a, b) => a - b)
}

export function Pagination({
  page,
  totalItems,
  pageSize,
  onPageChange,
  pageSizeOptions = paginationPageSizes,
  onPageSizeChange,
  loading = false,
  error = false,
  itemCount,
  itemLabel = "items",
  className,
}: PaginationProps) {
  const { t } = useLanguage()
  const { pageCount: safePageCount, currentPage, start: startItem, end: endItem } = paginationRange(totalItems, page, pageSize, itemCount)
  const visiblePages = getVisiblePages(currentPage, safePageCount)
  const previousDisabled = loading || currentPage === 1
  const nextDisabled = loading || currentPage === safePageCount
  const sizeOptions = [...new Set([...pageSizeOptions, pageSize])].filter((size) => Number.isInteger(size) && size > 0).sort((a, b) => a - b)

  useEffect(() => {
    if (!loading && !error && page !== currentPage) onPageChange(currentPage)
  }, [currentPage, error, loading, onPageChange, page])

  function selectPage(event: MouseEvent<HTMLAnchorElement>, nextPage: number) {
    event.preventDefault()
    if (!loading && nextPage !== currentPage) onPageChange(nextPage)
  }

  return (
    <PaginationRoot
      className={cn("mx-0 flex-wrap gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-2 shadow-[var(--md-shadow-line)] sm:items-center sm:justify-between", className)}
      aria-label={t(`${itemLabel} pagination`)}
      aria-busy={loading}
    >
      <div className="flex flex-col gap-2 px-2 sm:flex-row sm:items-center sm:gap-4">
        <p className="text-[13px] font-medium text-[var(--md-text)]" aria-live="polite" aria-atomic="true">
          {loading ? t("Loading rows…") : error ? t("Rows could not be loaded.") : <>{t("Showing")} <span className="text-[var(--md-ink)]" data-i18n-skip dir="ltr">{startItem}-{endItem}</span> {t("of")}{" "}
          <span className="text-[var(--md-ink)]" data-i18n-skip dir="ltr">{totalItems}</span> {t(itemLabel)}</>}
        </p>

        {onPageSizeChange ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Rows per page")}</span>
            <Select disabled={loading} value={String(pageSize)} onValueChange={(value) => { onPageSizeChange(Number(value)); onPageChange(1) }}>
              <SelectTrigger
                size="sm"
                className="h-8 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] px-2 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
                aria-label={t("Rows per page")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
                <SelectGroup>
                  {sizeOptions.map((option) => (
                    <SelectItem key={option} value={String(option)} className="text-[13px]">
                      {option}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            text={t("Previous")}
            aria-label={t("Previous page")}
            aria-disabled={previousDisabled}
            tabIndex={previousDisabled ? -1 : undefined}
            className="rounded-[var(--md-radius-md)] text-[13px] text-[var(--md-text)] aria-disabled:pointer-events-none aria-disabled:opacity-35"
            onClick={(event) => {
              if (!previousDisabled) selectPage(event, currentPage - 1)
              else event.preventDefault()
            }}
          />
        </PaginationItem>

        {visiblePages.map((pageNumber, index) => {
          const previousPage = visiblePages[index - 1]
          const hasGap = previousPage && pageNumber - previousPage > 1

          return (
            <Fragment key={pageNumber}>
              {hasGap ? (
                <PaginationItem className="hidden sm:block">
                  <PaginationEllipsis text={t("More pages")} className="text-[var(--md-subtle)]" />
                </PaginationItem>
              ) : null}
              <PaginationItem className="hidden sm:block">
                <PaginationLink
                  href="#"
                  isActive={pageNumber === currentPage}
                  aria-label={`${t("Page")} ${pageNumber}`}
                  aria-disabled={loading}
                  tabIndex={loading ? -1 : undefined}
                  className="rounded-[var(--md-radius-md)] text-[13px] text-[var(--md-text)] data-[active=true]:bg-[var(--md-sidebar-bg)] data-[active=true]:text-[var(--md-ink)] data-[active=true]:shadow-[var(--md-shadow-line)]"
                  onClick={(event) => selectPage(event, pageNumber)}
                >
                  <span data-i18n-skip dir="ltr">{pageNumber}</span>
                </PaginationLink>
              </PaginationItem>
            </Fragment>
          )
        })}

        <PaginationItem className="px-2 text-[12px] text-[var(--md-text)] sm:hidden">
          {t("Page")} {currentPage} {t("of")} {safePageCount}
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            href="#"
            text={t("Next")}
            aria-label={t("Next page")}
            aria-disabled={nextDisabled}
            tabIndex={nextDisabled ? -1 : undefined}
            className="rounded-[var(--md-radius-md)] text-[13px] text-[var(--md-text)] aria-disabled:pointer-events-none aria-disabled:opacity-35"
            onClick={(event) => {
              if (!nextDisabled) selectPage(event, currentPage + 1)
              else event.preventDefault()
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </PaginationRoot>
  )
}
