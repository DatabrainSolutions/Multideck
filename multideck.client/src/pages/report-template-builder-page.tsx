import { useState } from "react"
import { ArrowLeft, Eye, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { StatusPill } from "@/components/multideck/status-pill"
import { ThemeToggle } from "@/components/multideck/theme-toggle"
import {
  createReportBlockFromWidget,
  monthlyTemplatePages,
  ReportBlockDataEditorDialog,
  reportWidgets,
  ReportDocumentPage,
  ReportPageThumbnailRail,
  ReportWidgetPalette,
  type ReportBlock,
  type ReportPage,
  type ReportWidget,
} from "@/components/multideck/report-components"
import multideckMark from "@/assets/brand/multideck-logo-mark.svg"

export function ReportTemplateBuilderPage({ navigate }: { navigate: (path: string) => void }) {
  const [pages, setPages] = useState<ReportPage[]>(monthlyTemplatePages)
  const [activePageId, setActivePageId] = useState(pages[0].id)
  const [selectedBlockId, setSelectedBlockId] = useState(pages[0].blocks[0]?.id)
  const [editingBlock, setEditingBlock] = useState<ReportBlock>()
  const [activeWidgetId, setActiveWidgetId] = useState<string>()
  const [query, setQuery] = useState("")

  function addWidget(widget: ReportWidget, targetPageId = activePageId) {
    const newBlock = createReportBlockFromWidget(widget, pages.flatMap((page) => page.blocks).length)
    setPages((currentPages) =>
      currentPages.map((page) =>
        page.id === targetPageId
          ? {
              ...page,
              blocks: [...page.blocks, newBlock],
            }
          : page,
      ),
    )
    setActivePageId(targetPageId)
    setSelectedBlockId(newBlock.id)
    setActiveWidgetId(widget.id)
    toast.success(`${widget.title} added`, { description: "It now uses this template's report scope and period." })
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
      <header className="sticky top-0 z-40 flex h-[76px] items-center justify-between gap-[var(--md-gap-lg)] bg-[var(--md-topbar-bg)] px-[var(--md-page-pad)] shadow-[var(--md-stroke-bottom)] backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-4">
          <img src={multideckMark} alt="" className="hidden h-8 w-8 sm:block" />
          <button type="button" className="flex shrink-0 items-center gap-2 text-[14px] font-medium text-[var(--md-text)] transition-colors hover:text-[var(--md-ink)]" onClick={() => navigate("/reports")}>
            <ArrowLeft className="size-4" strokeWidth={1.4} />
            Reports
          </button>
          <span className="hidden text-[18px] text-[var(--md-subtle)] sm:block">/</span>
          <h1 className="truncate text-[17px] font-medium text-[var(--md-ink)]">Monthly client review</h1>
          <StatusPill tone="neutral" className="hidden sm:inline-flex">
            Template
          </StatusPill>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <p className="hidden text-[14px] text-[var(--md-text)] lg:block">Saved 2 min ago</p>
          <ThemeToggle compact className="hidden bg-[var(--md-glass)] md:flex" />
          <Button
            type="button"
            variant="ghost"
            className="h-11 rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[14px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70"
            onClick={() => toast.success("Preview ready", { description: "The template is filled with Marlow Apparel's May data." })}
          >
            <Eye data-icon="inline-start" strokeWidth={1.3} />
            Preview with real data
          </Button>
          <Button
            type="button"
            className="h-11 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[14px] font-medium text-white shadow-[var(--md-shadow-line)] hover:bg-[var(--md-accent)]/88"
            onClick={() => toast.success("Template saved", { description: "Monthly client review is ready for the next scheduled run." })}
          >
            <Save data-icon="inline-start" strokeWidth={1.3} />
            Save template
          </Button>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-76px)] lg:grid-cols-[minmax(0,1fr)_470px]">
        <section className="grid min-h-0 lg:grid-cols-[0_minmax(0,1fr)] xl:grid-cols-[174px_minmax(0,1fr)]">
          <ReportPageThumbnailRail pages={pages} activePageId={activePageId} onChange={setActivePageId} className="hidden xl:flex" />
          <div className="md-scrollbar min-h-[calc(100vh-76px)] overflow-y-auto px-[var(--md-page-pad)] py-[var(--md-workspace-pad-y)]">
            <div className="mx-auto flex max-w-[860px] flex-col gap-[var(--md-page-section-gap)]">
              {pages.map((page) => (
                <ReportDocumentPage
                  key={page.id}
                  page={page}
                  totalPages={pages.length}
                  template={page.id === activePageId}
                  editable
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={selectBlock}
                  onDropWidget={addWidgetById}
                  className="max-w-[740px]"
                />
              ))}
            </div>
          </div>
        </section>

        <div className="min-h-0">
          <ReportWidgetPalette widgets={reportWidgets} query={query} onQueryChange={setQuery} activeWidgetId={activeWidgetId} onAddWidget={addWidget} className="sticky top-[76px] h-[calc(100vh-76px)]" />
        </div>
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
