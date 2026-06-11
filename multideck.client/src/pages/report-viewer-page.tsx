import { useMemo, useState } from "react"
import { ArrowLeft, Download, Share2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { StatusPill } from "@/components/multideck/status-pill"
import {
  monthlyReviewPages,
  ReportDocumentPage,
  ReportPageControls,
  ReportPageThumbnailRail,
} from "@/components/multideck/report-components"
import { generatedReports } from "@/data/multideck-data"

export function ReportViewerPage({ navigate, reportId }: { navigate: (path: string) => void; reportId: string }) {
  const [activePageId, setActivePageId] = useState(monthlyReviewPages[0].id)
  const activePageIndex = useMemo(() => monthlyReviewPages.findIndex((page) => page.id === activePageId), [activePageId])
  const activePage = monthlyReviewPages[Math.max(activePageIndex, 0)] ?? monthlyReviewPages[0]
  const report = generatedReports.find((item) => item.id === reportId) ?? generatedReports[0]

  function movePage(direction: -1 | 1) {
    const nextIndex = Math.min(Math.max(activePageIndex + direction, 0), monthlyReviewPages.length - 1)
    setActivePageId(monthlyReviewPages[nextIndex].id)
  }

  return (
    <div className="min-h-screen bg-[var(--md-bg)] text-[var(--md-ink)]">
      <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between gap-4 bg-[rgba(251,253,253,0.88)] px-4 shadow-[inset_0_-1px_0_rgba(11,20,19,0.06)] backdrop-blur-xl sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <button type="button" className="flex shrink-0 items-center gap-2 text-[14px] font-medium text-[var(--md-text)] transition-colors hover:text-[var(--md-ink)]" onClick={() => navigate("/reports")}>
            <ArrowLeft className="size-4" strokeWidth={1.4} />
            Reports
          </button>
          <span className="hidden text-[18px] text-[var(--md-subtle)] sm:block">/</span>
          <h1 className="truncate text-[17px] font-medium text-[var(--md-ink)]">{report.title}</h1>
          <StatusPill tone="green" className="hidden sm:inline-flex">
            Ready
          </StatusPill>
          <p className="hidden truncate text-[14px] text-[var(--md-text)] lg:block">Generated {report.created} · 6 pages · {report.subtitle.split(" · ").at(-1)}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ReportPageControls page={activePage.pageNumber} totalPages={monthlyReviewPages.length} onPrevious={() => movePage(-1)} onNext={() => movePage(1)} />
          <Button
            type="button"
            variant="ghost"
            className="hidden h-11 rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[14px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70 md:inline-flex"
            onClick={() => toast.success("Share link copied", { description: "Anyone with access to Marlow Apparel can view this report." })}
          >
            <Share2 data-icon="inline-start" strokeWidth={1.3} />
            Share link
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="hidden h-11 rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[14px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70 sm:inline-flex"
            onClick={() => toast.success("XLSX prepared", { description: "The workbook export is ready." })}
          >
            <Download data-icon="inline-start" strokeWidth={1.4} />
            XLSX
          </Button>
          <Button
            type="button"
            className="h-11 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[14px] font-medium text-white shadow-[var(--md-shadow-line)] hover:bg-[var(--md-accent)]/88"
            onClick={() => toast.success("PDF prepared", { description: `${report.title} is ready to download.` })}
          >
            <Download data-icon="inline-start" strokeWidth={1.4} />
            Download PDF
          </Button>
        </div>
      </header>

      <main className="grid lg:grid-cols-[206px_minmax(0,1fr)]">
        <ReportPageThumbnailRail pages={monthlyReviewPages} activePageId={activePageId} onChange={setActivePageId} />
        <div className="min-h-[calc(100vh-76px)] overflow-auto px-5 py-10 md:px-10">
          <ReportDocumentPage page={activePage} totalPages={monthlyReviewPages.length} />
        </div>
      </main>
    </div>
  )
}
