import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, Download, LoaderCircle, Minus, Plus, X } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLanguage } from "@/i18n/language-provider"
import { releasePdfPageImages, renderPdfPageImages, type RenderedPdfPage } from "@/lib/customs-invoice-pdf-preview"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

type DownloadState = "idle" | "downloading" | "done"

const minZoom = 0.5
const maxZoom = 3
const zoomStep = 0.25

export function PdfDocumentViewerDialog({ open, onOpenChange, blob, title, fileName, meta, onDownload, loading = false }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  blob: Blob | null
  title: string
  fileName: string
  loading?: boolean
  meta?: string
  onDownload: () => Promise<void>
}) {
  const { t } = useLanguage()
  const reducedMotion = Boolean(useReducedMotion())
  const scrollRef = useRef<HTMLDivElement>(null)
  const doneTimerRef = useRef<number | null>(null)
  const [pages, setPages] = useState<RenderedPdfPage[]>([])
  const [rendering, setRendering] = useState(false)
  const [downloadState, setDownloadState] = useState<DownloadState>("idle")
  const [zoom, setZoom] = useState(1)
  const [fitWidth, setFitWidth] = useState(0)

  useEffect(() => {
    if (!open || !blob) {
      setPages((current) => { releasePdfPageImages(current); return [] })
      setRendering(false)
      setDownloadState("idle")
      setZoom(1)
      return
    }

    const controller = new AbortController()
    let received: RenderedPdfPage[] = []
    setRendering(true)
    setPages([])
    setZoom(1)
    void renderPdfPageImages(blob, {
      signal: controller.signal,
      onPage: (page) => {
        received = [...received, page]
        setPages(received)
      },
    }).finally(() => { if (!controller.signal.aborted) setRendering(false) })

    return () => {
      controller.abort()
      releasePdfPageImages(received)
    }
  }, [blob, open])

  useLayoutEffect(() => {
    const container = scrollRef.current
    const firstPage = pages[0]
    if (!open || !container || !firstPage) return undefined
    const measuredContainer = container

    function measure() {
      const page = pages[0]
      if (!page) return
      // The top allowance keeps the complete first sheet clear of the floating controls.
      // Width is also constrained, so A4 opens fully visible on both short laptops and phones.
      const availableWidth = Math.max(180, measuredContainer.clientWidth - 32)
      const availableHeight = Math.max(160, measuredContainer.clientHeight - 96)
      setFitWidth(Math.min(availableWidth, availableHeight * (page.width / page.height)))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(measuredContainer)
    return () => observer.disconnect()
  }, [open, pages])

  useEffect(() => () => {
    if (doneTimerRef.current !== null) window.clearTimeout(doneTimerRef.current)
  }, [])

  async function download() {
    if (downloadState === "downloading") return
    if (doneTimerRef.current !== null) window.clearTimeout(doneTimerRef.current)
    setDownloadState("downloading")
    try {
      await onDownload()
      setDownloadState("done")
      doneTimerRef.current = window.setTimeout(() => {
        setDownloadState("idle")
        doneTimerRef.current = null
      }, reducedMotion ? 900 : 1_400)
    } catch {
      setDownloadState("idle")
    }
  }

  function changeZoom(next: number) {
    setZoom(Math.min(maxZoom, Math.max(minZoom, next)))
  }

  const downloadLabel = downloadState === "downloading" ? t("Downloading") : downloadState === "done" ? t("Done") : t("Download")
  const DownloadIcon = downloadState === "downloading" ? LoaderCircle : downloadState === "done" ? Check : Download

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      showCloseButton={false}
      overlayClassName="bg-black/42 supports-backdrop-filter:backdrop-blur-[18px] supports-backdrop-filter:backdrop-saturate-75"
      className="!fixed !inset-0 !left-0 !top-0 !size-full !max-w-none !translate-x-0 !translate-y-0 !gap-0 !overflow-hidden !rounded-none !border-0 !bg-transparent !p-0 !shadow-none sm:!max-w-none data-open:zoom-in-100 data-closed:zoom-out-100"
      dir="inherit"
    >
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <DialogDescription className="sr-only">{t("Scrollable PDF preview with zoom and download controls.")}</DialogDescription>

      <div
        className="absolute end-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-surface)_78%,transparent)] p-1 text-[var(--md-ink)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.42),0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:end-4 sm:top-4"
        aria-label={t("PDF controls")}
      >
        <ViewerControl label={t("Zoom out")} disabled={zoom <= minZoom || pages.length === 0} onClick={() => changeZoom(zoom - zoomStep)}>
          <Minus className="size-3.5" strokeWidth={1.5} />
          <span className="hidden lg:inline">{t("Zoom out")}</span>
        </ViewerControl>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="h-8 min-w-12 rounded-[var(--md-radius-md)] px-2 text-center text-[11px] font-medium tabular-nums text-[var(--md-text)] outline-none transition-colors hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a28)] motion-reduce:transition-none"
              onClick={() => setZoom(1)}
              disabled={zoom === 1 || pages.length === 0}
              aria-label={t("Fit page")}
            >
              {Math.round(zoom * 100)}%
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("Fit page")}</TooltipContent>
        </Tooltip>

        <ViewerControl label={t("Zoom in")} disabled={zoom >= maxZoom || pages.length === 0} onClick={() => changeZoom(zoom + zoomStep)}>
          <Plus className="size-3.5" strokeWidth={1.5} />
          <span className="hidden lg:inline">{t("Zoom in")}</span>
        </ViewerControl>

        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-[color-mix(in_srgb,var(--md-ink)_12%,transparent)]" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 min-w-[98px] rounded-[var(--md-radius-md)] bg-black px-2.5 text-[11px] text-white shadow-none hover:bg-black/80 hover:text-white"
              disabled={downloadState === "downloading" || !blob}
              onClick={() => void download()}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={downloadState}
                  className="inline-flex items-center gap-1.5"
                  initial={reducedMotion ? false : { opacity: 0, y: 3, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: -3, filter: "blur(3px)" }}
                  transition={reduceMotion(reducedMotion, mdMotion.micro)}
                  aria-live="polite"
                >
                  <DownloadIcon className={cn("size-3.5", downloadState === "downloading" && "animate-spin motion-reduce:animate-none")} strokeWidth={1.5} />
                  {downloadLabel}
                </motion.span>
              </AnimatePresence>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{downloadLabel}</TooltipContent>
        </Tooltip>

        <ViewerControl label={t("Close")} onClick={() => onOpenChange(false)} iconOnly>
          <X className="size-3.5" strokeWidth={1.5} />
        </ViewerControl>
      </div>

      <div ref={scrollRef} className="absolute inset-0 overflow-auto overscroll-contain" data-pdf-scroll-region>
        {pages.length ? (
          <div dir="ltr" className="flex min-h-full w-max min-w-full flex-col items-center gap-5 px-4 pb-5 pt-18 sm:px-5 sm:pb-6 sm:pt-20">
            {pages.map((page) => (
              <figure key={page.page} className="relative shrink-0" style={{ width: `${Math.max(1, fitWidth) * zoom}px` }}>
                <img
                  src={page.url}
                  alt={`${t("Page")} ${page.page}`}
                  className="block h-auto w-full bg-white shadow-[0_20px_65px_rgba(0,0,0,0.28)]"
                  draggable={false}
                />
                {pages.length > 1 ? <figcaption className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/66 px-2 py-0.5 text-[10px] font-medium text-white/90 shadow-sm backdrop-blur-md">{page.page} / {pages.length}</figcaption> : null}
              </figure>
            ))}
          </div>
        ) : (
          <div className="grid size-full place-items-center px-6 text-center">
            <div className="max-w-sm rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-surface)_76%,transparent)] px-4 py-3 text-[12px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)] backdrop-blur-xl">
              {rendering || loading ? <LoaderCircle className="mx-auto mb-2 size-4 animate-spin text-[var(--md-accent)] motion-reduce:animate-none" aria-hidden="true" /> : null}
              <p>{rendering || loading ? t("Preparing the PDF preview") : t("The PDF preview could not be drawn. Download the document to open it.")}</p>
            </div>
          </div>
        )}
      </div>

      <span className="sr-only" data-i18n-skip dir="auto">{fileName}{meta ? ` · ${meta}` : ""}</span>
    </DialogContent>
  </Dialog>
}

function ViewerControl({ label, disabled, onClick, iconOnly = false, children }: {
  label: string
  disabled?: boolean
  onClick: () => void
  iconOnly?: boolean
  children: ReactNode
}) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size={iconOnly ? "icon-sm" : "sm"}
        className={cn(
          "h-8 rounded-[var(--md-radius-md)] px-2 text-[11px] text-[var(--md-text)] shadow-none hover:bg-white/40 hover:text-[var(--md-ink)]",
          iconOnly && "w-8 px-0",
        )}
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
}
