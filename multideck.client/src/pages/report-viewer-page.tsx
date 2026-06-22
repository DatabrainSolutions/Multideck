import { useMemo, useState } from "react"
import { ArrowLeft, Download, Share2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { StatusPill } from "@/components/multideck/status-pill"
import { ThemeToggle } from "@/components/multideck/theme-toggle"
import {
  createReportBlockFromWidget,
  monthlyReviewPages,
  ReportBlockDataEditorDialog,
  ReportDocumentPage,
  ReportPageControls,
  ReportPageThumbnailRail,
  reportWidgets,
  ReportWidgetPalette,
  type ReportBlock,
  type ReportPage,
  type ReportWidget,
} from "@/components/multideck/report-components"
import { generatedReports } from "@/data/multideck-data"

export function ReportViewerPage({ navigate, reportId }: { navigate: (path: string) => void; reportId: string }) {
  const [pages, setPages] = useState<ReportPage[]>(monthlyReviewPages)
  const [activePageId, setActivePageId] = useState(pages[0].id)
  const [selectedBlockId, setSelectedBlockId] = useState<string>()
  const [editingBlock, setEditingBlock] = useState<ReportBlock>()
  const [activeWidgetId, setActiveWidgetId] = useState<string>()
  const [query, setQuery] = useState("")
  const activePageIndex = useMemo(() => pages.findIndex((page) => page.id === activePageId), [activePageId, pages])
  const activePage = pages[Math.max(activePageIndex, 0)] ?? pages[0]
  const report = generatedReports.find((item) => item.id === reportId) ?? generatedReports[0]

  function movePage(direction: -1 | 1) {
    const nextIndex = Math.min(Math.max(activePageIndex + direction, 0), pages.length - 1)
    setActivePageId(pages[nextIndex].id)
  }

  function addWidget(widget: ReportWidget, targetPageId = activePageId) {
    const newBlock = createReportBlockFromWidget(widget, pages.flatMap((page) => page.blocks).length)
    setPages((currentPages) =>
      currentPages.map((page) => (page.id === targetPageId ? { ...page, blocks: [...page.blocks, newBlock] } : page)),
    )
    setActivePageId(targetPageId)
    setSelectedBlockId(newBlock.id)
    setActiveWidgetId(widget.id)
    toast.success(`${widget.title} added`, { description: "Click it to choose the data it should show." })
  }

  function addWidgetById(widgetId: string, targetPageId: string) {
    const widget = reportWidgets.find((item) => item.id === widgetId)
    if (widget) addWidget(widget, targetPageId)
  }

  function selectBlock(block: ReportBlock) {
    setSelectedBlockId(block.id)
    setActiveWidgetId(undefined)
    setEditingBlock(block)
  }

  function saveBlock(nextBlock: ReportBlock) {
    setPages((currentPages) =>
      currentPages.map((page) => ({
        ...page,
        blocks: page.blocks.map((block) => (block.id === nextBlock.id ? nextBlock : block)),
      })),
    )
    setSelectedBlockId(nextBlock.id)
    setEditingBlock(nextBlock)
    toast.success("Report data updated", { description: `${nextBlock.title} now uses the selected report data.` })
  }

  return (
    <div className="min-h-screen bg-[var(--md-bg)] text-[var(--md-ink)]">
      <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between gap-[var(--md-gap-lg)] bg-[var(--md-topbar-bg)] px-[var(--md-page-pad)] shadow-[var(--md-stroke-bottom)] backdrop-blur-xl">
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
          <ReportPageControls page={activePage.pageNumber} totalPages={pages.length} onPrevious={() => movePage(-1)} onNext={() => movePage(1)} />
          <ThemeToggle compact className="hidden bg-[var(--md-glass)] md:flex" />
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

      <main className="grid lg:grid-cols-[206px_minmax(0,1fr)] xl:grid-cols-[206px_minmax(0,1fr)_420px]">
        <ReportPageThumbnailRail pages={pages} activePageId={activePageId} onChange={setActivePageId} />
        <div className="min-h-[calc(100vh-76px)] overflow-auto px-[var(--md-page-pad)] py-[var(--md-workspace-pad-y)]">
          <ReportDocumentPage
            page={activePage}
            totalPages={pages.length}
            editable
            selectedBlockId={selectedBlockId}
            onSelectBlock={selectBlock}
            onDropWidget={addWidgetById}
          />
        </div>
        <ReportWidgetPalette widgets={reportWidgets} query={query} onQueryChange={setQuery} activeWidgetId={activeWidgetId} onAddWidget={addWidget} className="hidden xl:flex xl:sticky xl:top-[76px] xl:h-[calc(100vh-76px)]" />
      </main>

      <ReportBlockDataEditorDialog
        block={editingBlock}
        open={Boolean(editingBlock)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingBlock(undefined)
        }}
        onSave={saveBlock}
      />
    </div>
  )
}
