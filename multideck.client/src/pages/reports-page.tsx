import { useMemo, useState } from "react"
import { toast } from "sonner"
import { GeneratedReportsTable, NewReportTemplateCard, ReportTemplateCard } from "@/components/multideck/report-components"
import { generatedReports, reportFilters, reportTemplates, type GeneratedReport, type ReportTemplate } from "@/data/multideck-data"
import { cn } from "@/lib/utils"

type ReportFilter = (typeof reportFilters)[number]

export function ReportsPage() {
  const [activeFilter, setActiveFilter] = useState<ReportFilter>("All")

  const visibleReports = useMemo(() => {
    if (activeFilter === "Ready") return generatedReports.filter((report) => report.status === "Ready")
    if (activeFilter === "Scheduled") return generatedReports.filter((report) => report.status === "Scheduled")
    if (activeFilter === "Client reviews") return generatedReports.filter((report) => report.title.includes("review"))
    return generatedReports
  }, [activeFilter])

  function runTemplate(template: ReportTemplate) {
    toast.success(`${template.title} started`, {
      description: "Artie is preparing the latest shipment, exception, and spend data.",
    })
  }

  function editTemplate(template: ReportTemplate) {
    toast.success(`${template.title} opened`, {
      description: "Template rules, recipients, and output format are ready to edit.",
    })
  }

  function viewReport(report: GeneratedReport) {
    toast.success(`${report.title} opened`, {
      description: "The report preview is ready.",
    })
  }

  function downloadReport(report: GeneratedReport) {
    toast.success("PDF prepared", {
      description: `${report.title} is ready to download.`,
    })
  }

  return (
    <div className="pb-8">
      <section>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-4">
          <h1 className="text-[18px] font-medium leading-7 text-[var(--md-ink)]">Templates</h1>
          <p className="text-[14px] text-[var(--md-text)]">Reusable layouts — every report starts from one</p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {reportTemplates.map((template) => (
            <ReportTemplateCard key={template.id} template={template} onRun={runTemplate} onEdit={editTemplate} />
          ))}
          <NewReportTemplateCard
            onCreate={() =>
              toast.success("Blank template created", {
                description: "Choose sections, schedule, and output format next.",
              })
            }
          />
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <h2 className="text-[18px] font-medium leading-7 text-[var(--md-ink)]">Generated reports</h2>
            <div className="flex flex-wrap items-center gap-2">
              {reportFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={activeFilter === filter}
                  className={cn(
                    "h-9 rounded-full px-4 text-[13px] font-medium shadow-[var(--md-shadow-line)] transition-all",
                    activeFilter === filter
                      ? "bg-[var(--md-ink)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),0_0_0_3px_rgba(11,20,19,0.06)]"
                      : "bg-white/25 text-[var(--md-text)] hover:bg-white/50 hover:text-[var(--md-ink)]",
                  )}
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[13px] font-medium text-[var(--md-text)]">Last 30 days · 14 reports</p>
        </div>

        <GeneratedReportsTable className="mt-4" reports={visibleReports} onView={viewReport} onDownload={downloadReport} />
      </section>
    </div>
  )
}
