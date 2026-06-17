import { useMemo, useState } from "react"
import { toast } from "sonner"
import { GeneratedReportsTable, NewReportTemplateCard, ReportTemplateCard } from "@/components/multideck/report-components"
import { FilterChips } from "@/components/multideck/workflow-components"
import { generatedReports, reportFilters, reportTemplates, type GeneratedReport, type ReportTemplate } from "@/data/multideck-data"

type ReportFilter = (typeof reportFilters)[number]

export function ReportsPage({ navigate }: { navigate: (path: string) => void }) {
  const [activeFilter, setActiveFilter] = useState<ReportFilter>("All")

  const visibleReports = useMemo(() => {
    if (activeFilter === "Ready") return generatedReports.filter((report) => report.status === "Ready")
    if (activeFilter === "Scheduled") return generatedReports.filter((report) => report.status === "Scheduled")
    if (activeFilter === "Client reviews") return generatedReports.filter((report) => report.title.includes("review"))
    return generatedReports
  }, [activeFilter])

  function runTemplate(template: ReportTemplate) {
    toast.success(`${template.title} started`, {
      description: "Dexter is preparing the latest shipment, exception, and spend data.",
    })
  }

  function editTemplate(template: ReportTemplate) {
    navigate(`/reports/templates/${template.id}`)
  }

  function viewReport(report: GeneratedReport) {
    navigate(`/reports/${report.id}`)
  }

  function downloadReport(report: GeneratedReport) {
    toast.success("PDF prepared", {
      description: `${report.title} is ready to download.`,
    })
  }

  return (
    <div className="md-page md-page-sections">
      <section className="md-section-stack">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-4">
          <h1 className="text-[18px] font-medium leading-7 text-[var(--md-ink)]">Templates</h1>
          <p className="text-[14px] text-[var(--md-text)]">Reusable layouts — every report starts from one</p>
        </div>

        <div className="grid gap-[var(--md-gap-lg)] md:grid-cols-2 xl:grid-cols-5">
          {reportTemplates.map((template) => (
            <ReportTemplateCard key={template.id} template={template} onRun={runTemplate} onEdit={editTemplate} />
          ))}
          <NewReportTemplateCard
            onCreate={() =>
              navigate("/reports/templates/monthly-client-review")
            }
          />
        </div>
      </section>

      <section className="md-section-stack">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <h2 className="text-[18px] font-medium leading-7 text-[var(--md-ink)]">Generated reports</h2>
            <FilterChips
              options={reportFilters}
              activeOption={activeFilter}
              onChange={(filter) => setActiveFilter(filter as ReportFilter)}
            />
          </div>
          <p className="text-[13px] font-medium text-[var(--md-text)]">Last 30 days · 14 reports</p>
        </div>

        <GeneratedReportsTable reports={visibleReports} onView={viewReport} onDownload={downloadReport} />
      </section>
    </div>
  )
}
