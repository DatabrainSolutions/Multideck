import { Fragment, useEffect, useId } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Pagination as PaginationRoot, PaginationContent, PaginationItem, PaginationEllipsis } from "@/components/ui/pagination"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n/language-provider"
import { paginationPageSizes, paginationRange, paginationVisiblePages } from "@/lib/pagination"
import { mdMotion, reduceMotion } from "@/lib/motion"

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
  /** Actual returned rows, so a short response never claims a full page. */
  itemCount?: number
  itemLabel?: string
  className?: string
}

const pageButtonClass = "relative isolate size-8 shrink-0 rounded-[var(--md-radius-md)] text-[12px] font-medium text-[var(--md-text)] transition-[color,background-color,transform] duration-150 hover:text-[var(--md-ink)] active:scale-95 disabled:opacity-35 motion-reduce:transition-none motion-reduce:transform-none max-sm:size-11"

/** Multideck-owned navigation. It never fetches data or animates table rows. */
export function Pagination({
  page, totalItems, pageSize, onPageChange,
  pageSizeOptions = paginationPageSizes, onPageSizeChange,
  loading = false, error = false, itemCount, itemLabel = "items", className,
}: PaginationProps) {
  const { t, language } = useLanguage()
  const id = useId()
  const reducedMotion = useReducedMotion()
  const range = paginationRange(totalItems, page, pageSize, itemCount)
  const { pageCount: safePageCount, currentPage } = range
  const visiblePages = paginationVisiblePages(currentPage, safePageCount)
  const number = new Intl.NumberFormat(language)
  const sizeOptions = [...new Set([...pageSizeOptions, pageSize])].filter((size) => Number.isInteger(size) && size > 0).sort((a, b) => a - b)

  useEffect(() => {
    if (!loading && !error && page !== currentPage) onPageChange(currentPage)
  }, [currentPage, error, loading, onPageChange, page])

  function selectPage(nextPage: number) {
    if (!loading && nextPage !== currentPage && nextPage >= 1 && nextPage <= safePageCount) onPageChange(nextPage)
  }

  return (
    <PaginationRoot
      className={cn("mx-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-3 py-2", className)}
      aria-label={t(`${itemLabel} pagination`)} aria-busy={loading}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[12px] text-[var(--md-subtle)]" aria-live="polite" aria-atomic="true">
          {loading ? t("Loading rows…") : error ? t("Rows could not be loaded.") : (
            <motion.span key={`${range.start}-${range.end}-${range.total}`}
              initial={reducedMotion ? false : { opacity: 0.5 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.16 }}
            >
              <span className="font-medium tabular-nums text-[var(--md-ink)]" data-i18n-skip>{number.format(range.start)}–{number.format(range.end)}</span>
              {" "}{t("of")}{" "}<span className="tabular-nums" data-i18n-skip>{number.format(range.total)}</span>{" "}{t(itemLabel)}
            </motion.span>
          )}
        </p>
        {onPageSizeChange ? (
          <Select disabled={loading} value={String(pageSize)} onValueChange={(value) => { onPageSizeChange(Number(value)); onPageChange(1) }}>
            <SelectTrigger size="sm" aria-label={t("Rows per page")}
              className="gap-1.5 rounded-[var(--md-radius-md)] border-0 bg-transparent px-2 text-[12px] text-[var(--md-subtle)] shadow-none hover:bg-[var(--md-hover)] data-[size=sm]:h-8 max-sm:data-[size=sm]:h-11"
            >
              <SelectValue /><span aria-hidden="true">/ {t("page")}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>{sizeOptions.map((option) => <SelectItem key={option} value={String(option)}>{number.format(option)}</SelectItem>)}</SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {safePageCount > 1 ? (
        <PaginationContent className="gap-1 max-sm:ms-auto">
          <PaginationItem>
            <Button type="button" variant="ghost" size="icon" aria-label={t("Previous page")} title={t("Previous page")}
              disabled={loading || currentPage === 1} className={pageButtonClass} onClick={() => selectPage(currentPage - 1)}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
          </PaginationItem>
          {visiblePages.map((pageNumber, index) => (
            <Fragment key={pageNumber}>
              {index > 0 && pageNumber - visiblePages[index - 1] > 1 ? <PaginationItem className="hidden sm:block"><PaginationEllipsis text={t("More pages")} className="size-6 text-[var(--md-subtle)]" /></PaginationItem> : null}
              <PaginationItem className="hidden sm:block">
                <Button type="button" variant="ghost" size="icon" disabled={loading}
                  aria-disabled={loading} aria-label={`${t("Page")} ${number.format(pageNumber)}`} aria-current={pageNumber === currentPage ? "page" : undefined}
                  className={cn(pageButtonClass, pageNumber === currentPage && "text-[var(--md-ink)]")}
                  onClick={() => selectPage(pageNumber)}>
                  {pageNumber === currentPage ? <motion.span aria-hidden="true" layoutId={`${id}-page`}
                    className="absolute inset-0 -z-10 rounded-[inherit] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]"
                    transition={reduceMotion(Boolean(reducedMotion), mdMotion.fast)} /> : null}
                  <span data-i18n-skip className="tabular-nums">{number.format(pageNumber)}</span>
                </Button>
              </PaginationItem>
            </Fragment>
          ))}
          <PaginationItem className="px-1 text-[12px] tabular-nums text-[var(--md-text)] sm:hidden">
            {t("Page")} {number.format(currentPage)} {t("of")} {number.format(safePageCount)}
          </PaginationItem>
          <PaginationItem>
            <Button type="button" variant="ghost" size="icon" aria-label={t("Next page")} title={t("Next page")}
              disabled={loading || currentPage === safePageCount} className={pageButtonClass} onClick={() => selectPage(currentPage + 1)}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </PaginationItem>
        </PaginationContent>
      ) : null}
    </PaginationRoot>
  )
}
