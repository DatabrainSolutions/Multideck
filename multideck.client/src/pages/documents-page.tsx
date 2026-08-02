
import { useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  Download,
  FileClock,
  FilePlus2,
  FileText,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import {
  getDocumentBuilderWorkspace,
  getGeneratedDocumentDownload,
  renderDocument,
  type DocumentBuilderWorkspace,
  type DocumentOutputFormat,
  type DocumentTemplateSummary,
  type GeneratedDocumentSummary,
} from "@/lib/document-builder-api"
import { cn } from "@/lib/utils"

type DocumentsPageProps = {
  navigate?: (path: string) => void
  initialWorkspace?: DocumentBuilderWorkspace
  preview?: boolean
}

type CreateDocumentDialogProps = {
  open: boolean
  templates: DocumentTemplateSummary[]
  initialTemplateCode: string | null
  onOpenChange: (open: boolean) => void
  onRendered: () => Promise<void>
  preview: boolean
}

const statusTone: Record<GeneratedDocumentSummary["status"], string> = {
  queued: "bg-[rgba(76,106,124,0.1)] text-[var(--md-blue)]",
  rendering: "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]",
  ready: "bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]",
  failed: "bg-[rgba(190,70,60,0.1)] text-[var(--md-red)]",
}

function startSignedDownload(url: string, fileName: string) {
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.rel = "noopener noreferrer"
  anchor.style.display = "none"
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

function formatBytes(value: number | null) {
  if (value === null) return "â€”"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function CreateDocumentDialog({
  open,
  templates,
  initialTemplateCode,
  onOpenChange,
  onRendered,
  preview,
}: CreateDocumentDialogProps) {
  const { t } = useLanguage()
  const [templateCode, setTemplateCode] = useState("")
  const [jobId, setJobId] = useState("")
  const [outputFormat, setOutputFormat] = useState<DocumentOutputFormat>("pdf")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const template = templates.find((item) => item.code === initialTemplateCode) ?? templates[0]
    setTemplateCode(template?.code ?? "")
    setOutputFormat(template?.defaultOutputFormat ?? "pdf")
    setJobId("")
    setError(null)
  }, [initialTemplateCode, open, templates])

  const selectedTemplate = templates.find((template) => template.code === templateCode)

  async function submit() {
    if (!selectedTemplate || !jobId.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      if (preview) {
        toast.success(t("Preview complete"), { description: t("No document was generated or sent to Carbone.") })
        onOpenChange(false)
        return
      }

      const result = await renderDocument({
        templateCode: selectedTemplate.code,
        targetType: "Job_Header",
        targetId: jobId.trim(),
        outputFormat,
        reason: "Generated from the Multideck document workspace",
      })
      startSignedDownload(result.signedUrl, result.fileName)
      await onRendered()
      toast.success(t("Document ready"), { description: result.fileName })
      onOpenChange(false)
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : t("The document could not be generated."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-0 shadow-[var(--md-shadow-lift)] sm:max-w-[520px]">
        <DialogHeader className="px-5 pb-4 pt-5 pe-14">
          <DialogTitle className="text-[17px] text-[var(--md-ink)]">{t("Create a document")}</DialogTitle>
          <DialogDescription className="text-[12px] leading-5 text-[var(--md-text)]">
            {t("Choose a template and job. Multideck securely gathers the approved data and prepares the file.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5 shadow-[var(--md-stroke-top)] pt-4">
          <label className="block">
            <span className="text-[11px] font-medium text-[var(--md-ink)]">{t("Template")}</span>
            <Select value={templateCode} onValueChange={setTemplateCode}>
              <SelectTrigger className="mt-1.5 h-10 w-full rounded-[var(--md-radius-md)]">
                <SelectValue placeholder={t("Choose a template")} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.code}>{t(template.name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-[var(--md-ink)]">{t("Job ID")}</span>
            <Input
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              dir="ltr"
              className="mt-1.5 h-10 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-[12px]"
              data-i18n-skip
            />
            <span className="mt-1.5 block text-[10.5px] leading-4 text-[var(--md-subtle)]">
              {t("The job must belong to one of your authorised offices.")}
            </span>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-[var(--md-ink)]">{t("File format")}</span>
            <Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as DocumentOutputFormat)}>
              <SelectTrigger className="mt-1.5 h-10 w-full rounded-[var(--md-radius-md)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(selectedTemplate?.outputFormats ?? ["pdf"]).map((format) => (
                  <SelectItem key={format} value={format}>{format.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="flex gap-2.5 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 text-[11px] leading-4 text-[var(--md-text)]">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" />
            <p>{t("The exact source data is snapshotted for audit before the document is rendered.")}</p>
          </div>

          {error ? (
            <div role="alert" className="flex gap-2 rounded-[var(--md-radius-md)] bg-[rgba(190,70,60,0.08)] p-3 text-[11px] text-[var(--md-red)]">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter className="m-0 rounded-none bg-[var(--md-surface-soft)] px-5 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("Cancel")}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!selectedTemplate || !jobId.trim() || submitting} className="bg-[var(--md-accent)] text-white">
            {submitting ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <FilePlus2 className="size-3.5" aria-hidden="true" />}
            {submitting ? t("Preparing document…") : t("Create and download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DocumentsPage({ navigate, initialWorkspace, preview = false }: DocumentsPageProps) {
  const { language, t } = useLanguage()
  const [workspace, setWorkspace] = useState<DocumentBuilderWorkspace | null>(initialWorkspace ?? null)
  const [loading, setLoading] = useState(!initialWorkspace)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    [language],
  )

  async function loadWorkspace() {
    setLoading(true)
    setError(null)
    try {
      setWorkspace(await getDocumentBuilderWorkspace())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("The document workspace could not be loaded."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!initialWorkspace) void loadWorkspace()
  }, [initialWorkspace])

  function openCreate(templateCode: string | null = null) {
    setSelectedTemplateCode(templateCode)
    setCreateOpen(true)
  }

  async function download(document: GeneratedDocumentSummary) {
    if (preview) {
      toast.info(t("Preview only"), { description: t("Secure downloads are enabled after the service is deployed.") })
      return
    }

    setDownloadingId(document.id)
    try {
      const result = await getGeneratedDocumentDownload(document.id)
      startSignedDownload(result.signedUrl, result.fileName)
    } catch (downloadError) {
      toast.error(t("Download unavailable"), {
        description: downloadError instanceof Error ? downloadError.message : t("A secure download link could not be created."),
      })
    } finally {
      setDownloadingId(null)
    }
  }

  const readyCount = workspace?.generatedDocuments.filter((document) => document.status === "ready").length ?? 0
  const failedCount = workspace?.generatedDocuments.filter((document) => document.status === "failed").length ?? 0

  return (
    <div className="md-page md-page-sections" dir="inherit">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--md-accent)]">{t("Document centre")}</p>
          <h1 className="mt-1 text-[24px] font-medium tracking-[-0.03em] text-[var(--md-ink)]">{t("Create the right document in seconds")}</h1>
          <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">
            {t("Choose an approved template and a job. Multideck takes care of the data, audit trail and secure delivery.")}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => openCreate()}
          disabled={!workspace?.permissions.canGenerate || workspace.templates.length === 0}
          className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-white"
        >
          <FilePlus2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
          {t("Create document")}
        </Button>
      </header>

      {error ? (
        <Surface tone="soft" className="flex items-center justify-between gap-4 border-s-2 border-[var(--md-red)]">
          <div className="flex min-w-0 gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-red)]" aria-hidden="true" />
            <div>
              <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Documents are temporarily unavailable")}</p>
              <p className="mt-1 text-[11px] text-[var(--md-text)]">{error}</p>
            </div>
          </div>
          <Button type="button" variant="ghost" onClick={() => void loadWorkspace()} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden="true" />
            {t("Try again")}
          </Button>
        </Surface>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Published templates", value: workspace?.templates.filter((template) => template.status === "published").length ?? "â€”", icon: FileText },
          { label: "Ready to download", value: readyCount || "â€”", icon: CheckCircle2 },
          { label: "Needs attention", value: failedCount || "â€”", icon: FileClock },
        ].map((metric) => (
          <Surface key={metric.label} tone="soft" padding="sm" className="flex items-center gap-3 rounded-[var(--md-radius-lg)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
              <metric.icon className="size-4" strokeWidth={1.4} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[18px] font-medium leading-none text-[var(--md-ink)]" data-i18n-skip>{metric.value}</p>
              <p className="mt-1 text-[10.5px] text-[var(--md-subtle)]">{t(metric.label)}</p>
            </div>
          </Surface>
        ))}
      </section>

      <section className="md-section-stack">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-medium text-[var(--md-ink)]">{t("Approved templates")}</h2>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Only published templates can generate customer documents.")}</p>
          </div>
          {workspace?.permissions.canManageTemplates && navigate ? (
            <Button type="button" variant="ghost" onClick={() => navigate("/documents/templates")} className="text-[12px]">
              {t("Manage templates")}
            </Button>
          ) : null}
        </div>

        {loading && !workspace ? (
          <Surface tone="soft" className="grid min-h-36 place-items-center">
            <LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" aria-label={t("Loading templates")} />
          </Surface>
        ) : workspace?.templates.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {workspace.templates.map((template) => (
              <Surface key={template.id} tone="soft" padding="sm" className="group flex min-h-44 flex-col overflow-hidden rounded-[var(--md-radius-xl)]">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
                    <FileText className="size-4.5" strokeWidth={1.35} aria-hidden="true" />
                  </span>
                  <Badge variant="outline" className="bg-[var(--md-surface)] text-[10px] text-[var(--md-text)]">v{template.version}</Badge>
                </div>
                <h3 className="mt-4 text-[13px] font-medium text-[var(--md-ink)]">{t(template.name)}</h3>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--md-text)]">{template.description ? t(template.description) : t("No description")}</p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--md-subtle)]" data-i18n-skip>{template.defaultOutputFormat}</span>
                  <Button type="button" size="sm" onClick={() => openCreate(template.code)} disabled={!workspace.permissions.canGenerate || template.status !== "published"}>
                    {t("Use template")}
                  </Button>
                </div>
              </Surface>
            ))}
          </div>
        ) : (
          <Surface tone="soft" className="py-10 text-center">
            <FileText className="mx-auto size-5 text-[var(--md-subtle)]" aria-hidden="true" />
            <p className="mt-3 text-[12px] font-medium text-[var(--md-ink)]">{t("No published templates yet")}</p>
            <p className="mt-1 text-[11px] text-[var(--md-text)]">{t("Publish the first Carbone template to make document creation available.")}</p>
          </Surface>
        )}
      </section>

      <section className="md-section-stack">
        <div>
          <h2 className="text-[17px] font-medium text-[var(--md-ink)]">{t("Recent documents")}</h2>
          <p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Every file is private and downloaded through a short-lived secure link.")}</p>
        </div>
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-[var(--md-surface-soft)] hover:bg-[var(--md-surface-soft)]">
                  <TableHead className="text-start">{t("Document")}</TableHead>
                  <TableHead className="text-start">{t("Job")}</TableHead>
                  <TableHead className="text-start">{t("Customer")}</TableHead>
                  <TableHead className="text-start">{t("Created")}</TableHead>
                  <TableHead className="text-start">{t("Status")}</TableHead>
                  <TableHead className="w-14"><span className="sr-only">{t("Actions")}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspace?.generatedDocuments.map((document) => (
                  <TableRow key={document.id} className="hover:bg-[var(--md-hover)]">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]"><FileText className="size-3.5" /></span>
                        <div className="min-w-0">
                          <p className="max-w-[260px] truncate text-[11.5px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{document.fileName}</p>
                          <p className="mt-0.5 text-[10px] text-[var(--md-subtle)]"><span>{t(document.templateName)}</span> · <span data-i18n-skip>{formatBytes(document.fileSizeBytes)}</span></p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{document.targetReference}</TableCell>
                    <TableCell className="text-[11px] text-[var(--md-text)]" data-i18n-skip dir="auto">{document.customerName ?? "â€”"}</TableCell>
                    <TableCell className="text-[10.5px] text-[var(--md-text)]" data-i18n-skip>{dateFormatter.format(new Date(document.createdAt))}</TableCell>
                    <TableCell>
                      <Badge className={cn("border-0 text-[10px] capitalize shadow-none", statusTone[document.status])}>{t(document.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={document.status !== "ready" || downloadingId === document.id}
                        onClick={() => void download(document)}
                        aria-label={t("Download document")}
                        title={t("Download document")}
                      >
                        {downloadingId === document.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!workspace?.generatedDocuments.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-28 text-center text-[11px] text-[var(--md-subtle)]">{t("No documents have been generated yet.")}</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </Surface>
      </section>

      <CreateDocumentDialog
        open={createOpen}
        templates={workspace?.templates ?? []}
        initialTemplateCode={selectedTemplateCode}
        onOpenChange={setCreateOpen}
        onRendered={loadWorkspace}
        preview={preview}
      />
    </div>
  )
}
