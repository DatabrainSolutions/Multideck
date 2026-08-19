import { useId, useMemo, useState } from "react"
import { FileImage, FileText, Grid2X2, List, X } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export type DocumentWorkspaceSource = "quote" | "customer" | "supplier" | "destination" | "routing"
export type DocumentWorkspaceSourceFilter = "all" | DocumentWorkspaceSource
export type DocumentWorkspaceView = "list" | "grid"
export type DocumentWorkspacePreviewKind = "pdf" | "image" | "document"
export type DocumentPreviewAccent = "teal" | "blue" | "green" | "amber" | "neutral"
export type DocumentPreviewSampleType = "invoice" | "packing-list" | "inspection" | "arrival" | "certificate" | "bill-of-lading" | "customs" | "delivery-order" | "release"

export type DocumentWorkspaceRelationship = {
  label: string
  reference?: string
}

export type DocumentWorkspacePreview = {
  kind: DocumentWorkspacePreviewKind
  mimeType?: string
  fileSize?: string
  pageCount?: number
  url?: string
  thumbnailUrl?: string
  reference?: string
  accent?: DocumentPreviewAccent
  sampleType?: DocumentPreviewSampleType
}

export type DocumentWorkspaceDocument = {
  id: string
  fileName: string
  description: string
  documentType: string
  uploadedAt: string
  lastModifiedAt: string
  source: DocumentWorkspaceSource
  relationship: DocumentWorkspaceRelationship
  preview: DocumentWorkspacePreview
}

export type DocumentWorkspaceProps = {
  documents: readonly DocumentWorkspaceDocument[]
  title?: string
  description?: string
  defaultView?: DocumentWorkspaceView
  defaultSource?: DocumentWorkspaceSourceFilter
  defaultSelectedDocumentId?: string | null
  selectedDocumentId?: string | null
  onSelectedDocumentChange?: (documentId: string | null, document: DocumentWorkspaceDocument | null) => void
  onViewChange?: (view: DocumentWorkspaceView) => void
  onSourceChange?: (source: DocumentWorkspaceSourceFilter) => void
  className?: string
}

const sourceFilters: readonly DocumentWorkspaceSourceFilter[] = [
  "all",
  "quote",
  "customer",
  "supplier",
  "destination",
  "routing",
]

const sourceLabels: Record<DocumentWorkspaceSourceFilter, string> = {
  all: "All",
  quote: "Quote",
  customer: "Customer",
  supplier: "Supplier",
  destination: "Destination",
  routing: "Routing",
}

export const documentWorkspaceSampleDocuments: readonly DocumentWorkspaceDocument[] = [
  {
    id: "doc-quote-19158",
    fileName: "Q-19158-freight-quotation.pdf",
    description: "Current customer quotation including ocean freight, collection, and destination charges.",
    documentType: "Quotation",
    uploadedAt: "2026-07-18T09:24:00Z",
    lastModifiedAt: "2026-07-21T14:08:00Z",
    source: "quote",
    relationship: { label: "Quote Q-19158", reference: "Q-19158" },
    preview: {
      kind: "pdf",
      mimeType: "application/pdf",
      fileSize: "428 KB",
      pageCount: 4,
      reference: "Q-19158",
      sampleType: "invoice",
      accent: "teal",
    },
  },
  {
    id: "doc-customer-credit",
    fileName: "northstar-credit-approval.pdf",
    description: "Approved customer credit terms and account limit for this quotation.",
    documentType: "Credit approval",
    uploadedAt: "2026-05-02T11:40:00Z",
    lastModifiedAt: "2026-06-14T15:32:00Z",
    source: "customer",
    relationship: { label: "Northstar Retail Ltd", reference: "CUS-00418" },
    preview: {
      kind: "pdf",
      mimeType: "application/pdf",
      fileSize: "216 KB",
      pageCount: 2,
      reference: "CUS-00418",
      sampleType: "certificate",
      accent: "blue",
    },
  },
  {
    id: "doc-supplier-tariff",
    fileName: "bluewater-july-tariff.xlsx",
    description: "Supplier tariff used for the current sea freight and documentation costs.",
    documentType: "Supplier tariff",
    uploadedAt: "2026-07-01T08:05:00Z",
    lastModifiedAt: "2026-07-17T16:18:00Z",
    source: "supplier",
    relationship: { label: "Bluewater Shipping", reference: "SUP-00127" },
    preview: {
      kind: "document",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileSize: "92 KB",
      reference: "SUP-00127",
      accent: "green",
    },
  },
  {
    id: "doc-destination-certificate",
    fileName: "uae-certificate-of-origin-guidance.pdf",
    description: "Destination guidance covering certificate of origin and invoice requirements.",
    documentType: "Destination guidance",
    uploadedAt: "2026-03-11T10:12:00Z",
    lastModifiedAt: "2026-07-09T13:46:00Z",
    source: "destination",
    relationship: { label: "Jebel Ali, United Arab Emirates", reference: "AEJEA" },
    preview: {
      kind: "pdf",
      mimeType: "application/pdf",
      fileSize: "1.2 MB",
      pageCount: 8,
      reference: "AEJEA",
      sampleType: "certificate",
      accent: "amber",
    },
  },
  {
    id: "doc-routing-release",
    fileName: "felixstowe-jebel-ali-routing-note.pdf",
    description: "Routing notes, cut-off guidance, and release instructions for the selected service.",
    documentType: "Routing note",
    uploadedAt: "2026-07-16T07:58:00Z",
    lastModifiedAt: "2026-07-20T12:22:00Z",
    source: "routing",
    relationship: { label: "Felixstowe to Jebel Ali", reference: "GBFXT-AEJEA" },
    preview: {
      kind: "pdf",
      mimeType: "application/pdf",
      fileSize: "684 KB",
      pageCount: 3,
      reference: "GBFXT-AEJEA",
      sampleType: "release",
      accent: "neutral",
    },
  },
] as const

type DocumentPreviewFaceItem = {
  name: string
  kind: "sample" | "pdf" | "image"
  reference?: string
  accent?: DocumentPreviewAccent
}

function toDocumentPreviewItem(document: DocumentWorkspaceDocument): DocumentPreviewFaceItem {
  return {
    name: document.fileName,
    kind: document.preview.kind === "document" ? "sample" : document.preview.kind,
    reference: document.preview.reference ?? document.relationship.reference,
    accent: document.preview.accent,
  }
}

function DocumentPreviewFace({ item, compact = false, className }: { item: DocumentPreviewFaceItem; compact?: boolean; className?: string }) {
  const Icon = item.kind === "image" ? FileImage : FileText

  return (
    <div className={cn("md-document-preview-face", compact && "md-document-preview-face--compact", className)} data-accent={item.accent ?? "teal"}>
      <div className="md-document-preview-face__masthead">
        <span className="md-document-preview-face__mark"><Icon className="size-3.5" strokeWidth={1.2} aria-hidden="true" /></span>
        <span className="md-document-preview-face__brand">MULTIDECK</span>
        <span className="md-document-preview-face__ref" data-i18n-skip dir="ltr">{item.reference ?? "DOCUMENT"}</span>
      </div>
      <p className="md-document-preview-face__title" data-i18n-skip dir="ltr">{item.name}</p>
      <div className="md-document-preview-face__lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

function getDocumentIcon(document: DocumentWorkspaceDocument) {
  return document.preview.kind === "image" ? FileImage : FileText
}

function DocumentPreviewCanvas({
  document,
  compact = false,
}: {
  document: DocumentWorkspaceDocument
  compact?: boolean
}) {
  const { t } = useLanguage()
  const previewLabel = `${t("Preview of")} ${document.fileName}`

  if (compact && document.preview.thumbnailUrl) {
    return (
      <img
        src={document.preview.thumbnailUrl}
        alt={previewLabel}
        className="size-full object-contain"
        data-i18n-skip
      />
    )
  }

  if (document.preview.kind === "image" && document.preview.url) {
    return (
      <img
        src={document.preview.url}
        alt={previewLabel}
        className="size-full object-contain"
        data-i18n-skip
      />
    )
  }

  if (document.preview.kind === "pdf" && document.preview.url) {
    return (
      <iframe
        src={`${document.preview.url}#toolbar=0&navpanes=0&view=FitH`}
        title={previewLabel}
        className="size-full bg-[var(--md-surface)]"
        tabIndex={compact ? -1 : 0}
      />
    )
  }

  return (
    <DocumentPreviewFace
      item={toDocumentPreviewItem(document)}
      compact={compact}
      className={cn(
        "w-full max-w-[440px] shadow-[0_16px_38px_rgba(42,52,50,0.12)]",
        compact ? "h-[78%] max-w-none" : "min-h-[300px]",
      )}
    />
  )
}

function DocumentSourceLabel({ document }: { document: DocumentWorkspaceDocument }) {
  const { t } = useLanguage()

  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">
        {document.relationship.label}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--md-subtle)]">
        <span>{t(sourceLabels[document.source])}</span>
        {document.relationship.reference ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate" data-i18n-skip dir="auto">{document.relationship.reference}</span>
          </>
        ) : null}
      </p>
    </div>
  )
}

function DocumentIdentity({ document }: { document: DocumentWorkspaceDocument }) {
  const Icon = getDocumentIcon(document)

  return (
    <div className="flex min-w-[180px] items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
        <Icon className="size-3.5" strokeWidth={1.35} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">
          {document.fileName}
        </span>
        {document.preview.fileSize ? (
          <span className="mt-0.5 block text-[10px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">
            {document.preview.fileSize}
          </span>
        ) : null}
      </span>
    </div>
  )
}

function DocumentList({
  documents,
  selectedDocumentId,
  onSelect,
}: {
  documents: readonly DocumentWorkspaceDocument[]
  selectedDocumentId: string | null
  onSelect: (document: DocumentWorkspaceDocument) => void
}) {
  const { language, t } = useLanguage()
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { day: "2-digit", month: "short", year: "numeric" }),
    [language],
  )

  function formatDate(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
  }

  const columns = useMemo<DataTableColumn<DocumentWorkspaceDocument>[]>(() => [
    { id: "file", label: "File name", kind: "long-text", width: 210, minWidth: 180, resizable: true, sortValue: (document) => document.fileName, cellTitle: (document) => document.fileName, cell: (document) => <DocumentIdentity document={document} /> },
    { id: "description", label: "Description", kind: "long-text", width: 210, minWidth: 160, resizable: true, sortValue: (document) => document.description, cellTitle: (document) => t(document.description), cellClassName: "whitespace-normal", cell: (document) => <p className="line-clamp-2 text-[11px] leading-4 text-[var(--md-text)]">{t(document.description)}</p> },
    { id: "source", label: "Source", kind: "attribute", width: 160, resizable: true, sortValue: (document) => document.relationship.label, cell: (document) => <DocumentSourceLabel document={document} /> },
    { id: "type", label: "Type", kind: "attribute", width: 110, sortValue: (document) => document.documentType, cell: (document) => <span className="text-[11px] text-[var(--md-text)]">{t(document.documentType)}</span> },
    { id: "uploaded", label: "Uploaded", kind: "date", width: 118, sortValue: (document) => document.uploadedAt, cell: (document) => <span className="text-[10.5px] tabular-nums text-[var(--md-text)]" data-i18n-skip dir="auto">{formatDate(document.uploadedAt)}</span> },
    { id: "modified", label: "Modified", kind: "date", width: 118, sortValue: (document) => document.lastModifiedAt, cell: (document) => <span className="text-[10.5px] tabular-nums text-[var(--md-text)]" data-i18n-skip dir="auto">{formatDate(document.lastModifiedAt)}</span> },
  ], [dateFormatter, t])

  return (
    <>
      <div className="hidden md:block">
        <DataTable ariaLabel="Documents" columnsButtonLabel="Manage document columns" columns={columns} rows={[...documents]} getRowKey={(document) => document.id} storageKey="document-workspace-list" selectedRowKey={selectedDocumentId} onRowClick={onSelect} rowAriaLabel={(document) => `Open ${document.fileName}`} minimumWidth={760} tableClassName="table-fixed" />
      </div>

      <ul className="divide-y divide-[var(--md-line)] md:hidden" aria-label={t("Documents")}>
        {documents.map((document) => {
          const isSelected = selectedDocumentId === document.id

          return (
            <li key={document.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(document)}
                className={cn(
                  "w-full px-3 py-3 text-start outline-none transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
                  isSelected ? "bg-[var(--md-selected-bg)]" : "hover:bg-[var(--md-hover)]",
                )}
              >
                <DocumentIdentity document={document} />
                <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-[var(--md-text)]">{t(document.description)}</p>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                  <DocumentSourceLabel document={document} />
                  <p className="text-end text-[10px] leading-4 text-[var(--md-subtle)]">
                    <span>{t("Modified")}</span>{" "}
                    <span data-i18n-skip dir="auto">{formatDate(document.lastModifiedAt)}</span>
                  </p>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function DocumentGrid({
  documents,
  selectedDocumentId,
  onSelect,
}: {
  documents: readonly DocumentWorkspaceDocument[]
  selectedDocumentId: string | null
  onSelect: (document: DocumentWorkspaceDocument) => void
}) {
  const { language, t } = useLanguage()
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { day: "2-digit", month: "short", year: "numeric" }),
    [language],
  )

  return (
    <ul className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("Document gallery")}>
      {documents.map((document) => {
        const Icon = getDocumentIcon(document)
        const isSelected = selectedDocumentId === document.id
        const modifiedAt = new Date(document.lastModifiedAt)
        const modifiedLabel = Number.isNaN(modifiedAt.getTime()) ? document.lastModifiedAt : dateFormatter.format(modifiedAt)

        return (
          <li key={document.id} className="min-w-0">
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(document)}
              className={cn(
                "group w-full min-w-0 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-2 text-start shadow-[var(--md-shadow-line)] outline-none transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-[var(--md-surface-soft)] hover:shadow-[var(--md-shadow-soft)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
                isSelected && "bg-[var(--md-green-card-selected)] shadow-[var(--md-shadow-green-card-selected)]",
              )}
            >
              <span className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-[var(--md-radius-md)] bg-[var(--md-report-preview-bg)] shadow-[var(--md-shadow-line)]">
                <DocumentPreviewCanvas document={document} compact />
                <span className="absolute start-2 top-2 grid size-7 place-items-center rounded-[var(--md-radius-sm)] bg-[color-mix(in_srgb,var(--md-surface)_90%,transparent)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)] backdrop-blur-md">
                  <Icon className="size-3.5" strokeWidth={1.35} aria-hidden="true" />
                </span>
              </span>
              <span className="block px-1 pb-1 pt-2.5">
                <span className="block truncate text-[12px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{document.fileName}</span>
                <span className="mt-1 block line-clamp-2 min-h-8 text-[10.5px] leading-4 text-[var(--md-text)]">{t(document.description)}</span>
                <span className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[var(--md-subtle)]">
                  <span className="truncate">{t(document.documentType)}</span>
                  <span className="shrink-0" data-i18n-skip dir="auto">{modifiedLabel}</span>
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function DocumentPreviewPanel({
  document,
  onClose,
}: {
  document: DocumentWorkspaceDocument
  onClose: () => void
}) {
  const { language, t } = useLanguage()
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { day: "2-digit", month: "short", year: "numeric" }),
    [language],
  )
  const uploadedAt = new Date(document.uploadedAt)
  const modifiedAt = new Date(document.lastModifiedAt)
  const uploadedLabel = Number.isNaN(uploadedAt.getTime()) ? document.uploadedAt : dateFormatter.format(uploadedAt)
  const modifiedLabel = Number.isNaN(modifiedAt.getTime()) ? document.lastModifiedAt : dateFormatter.format(modifiedAt)

  return (
    <Surface
      padding="xs"
      className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]"
      aria-label={`${t("Document preview")}: ${document.fileName}`}
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{document.fileName}</p>
          <p className="mt-0.5 text-[10.5px] text-[var(--md-subtle)]">{t(document.documentType)}</p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t("Close document preview")}
          onClick={onClose}
          className="rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]"
        >
          <X className="size-3.5" strokeWidth={1.4} />
        </Button>
      </div>

      <div className="grid min-h-[360px] place-items-center overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-report-preview-bg)] p-4 shadow-[var(--md-shadow-line)] lg:min-h-[460px]">
        <DocumentPreviewCanvas document={document} />
      </div>

      <div className="px-3 pb-3 pt-3">
        <p className="text-[11px] leading-4 text-[var(--md-text)]">{t(document.description)}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[10.5px]">
          <div>
            <dt className="text-[var(--md-subtle)]">{t("Source")}</dt>
            <dd className="mt-0.5 font-medium text-[var(--md-ink)]">{t(sourceLabels[document.source])}</dd>
          </div>
          <div>
            <dt className="text-[var(--md-subtle)]">{t("Related to")}</dt>
            <dd className="mt-0.5 truncate font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{document.relationship.label}</dd>
          </div>
          <div>
            <dt className="text-[var(--md-subtle)]">{t("Uploaded")}</dt>
            <dd className="mt-0.5 font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{uploadedLabel}</dd>
          </div>
          <div>
            <dt className="text-[var(--md-subtle)]">{t("Last modified")}</dt>
            <dd className="mt-0.5 font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{modifiedLabel}</dd>
          </div>
          {document.preview.fileSize ? (
            <div>
              <dt className="text-[var(--md-subtle)]">{t("File size")}</dt>
              <dd className="mt-0.5 font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{document.preview.fileSize}</dd>
            </div>
          ) : null}
          {document.preview.pageCount ? (
            <div>
              <dt className="text-[var(--md-subtle)]">{t("Pages")}</dt>
              <dd className="mt-0.5 font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{document.preview.pageCount}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </Surface>
  )
}

export function DocumentWorkspace({
  documents,
  title = "Documents",
  description = "Documents and guidance connected to this record.",
  defaultView = "list",
  defaultSource = "all",
  defaultSelectedDocumentId = null,
  selectedDocumentId: controlledSelectedDocumentId,
  onSelectedDocumentChange,
  onViewChange,
  onSourceChange,
  className,
}: DocumentWorkspaceProps) {
  const { direction, t } = useLanguage()
  const titleId = useId()
  const [view, setView] = useState<DocumentWorkspaceView>(defaultView)
  const [source, setSource] = useState<DocumentWorkspaceSourceFilter>(defaultSource)
  const [internalSelectedDocumentId, setInternalSelectedDocumentId] = useState<string | null>(defaultSelectedDocumentId)
  const selectedDocumentId = controlledSelectedDocumentId === undefined ? internalSelectedDocumentId : controlledSelectedDocumentId

  const filteredDocuments = useMemo(
    () => source === "all" ? documents : documents.filter((document) => document.source === source),
    [documents, source],
  )
  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  )

  function updateSelection(document: DocumentWorkspaceDocument | null) {
    if (controlledSelectedDocumentId === undefined) setInternalSelectedDocumentId(document?.id ?? null)
    onSelectedDocumentChange?.(document?.id ?? null, document)
  }

  function updateView(nextView: DocumentWorkspaceView) {
    setView(nextView)
    onViewChange?.(nextView)
  }

  function updateSource(nextSource: DocumentWorkspaceSourceFilter) {
    setSource(nextSource)
    onSourceChange?.(nextSource)
    if (selectedDocument && nextSource !== "all" && selectedDocument.source !== nextSource) updateSelection(null)
  }

  return (
    <section className={cn("min-w-0", className)} dir={direction} aria-labelledby={titleId}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[16px] font-medium text-[var(--md-ink)]">{t(title)}</h2>
          <p className="mt-1 max-w-[660px] text-[12px] leading-5 text-[var(--md-text)]">{t(description)}</p>
        </div>

        <div
          role="group"
          aria-label={t("Document view")}
          className="flex shrink-0 items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-1 shadow-[var(--md-shadow-line)]"
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={view === "list"}
            aria-label={t("List view")}
            onClick={() => updateView("list")}
            className={cn(
              "h-7 rounded-[var(--md-radius-md)] px-2 text-[11px] text-[var(--md-text)]",
              view === "list" && "bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-surface)]",
            )}
          >
            <List className="size-3.5" strokeWidth={1.4} />
            <span>{t("List")}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={view === "grid"}
            aria-label={t("Grid view")}
            onClick={() => updateView("grid")}
            className={cn(
              "h-7 rounded-[var(--md-radius-md)] px-2 text-[11px] text-[var(--md-text)]",
              view === "grid" && "bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-surface)]",
            )}
          >
            <Grid2X2 className="size-3.5" strokeWidth={1.4} />
            <span>{t("Grid")}</span>
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label={t("Filter documents by source") }>
        {sourceFilters.map((filter) => {
          const count = filter === "all" ? documents.length : documents.filter((document) => document.source === filter).length
          const isActive = source === filter

          return (
            <button
              key={filter}
              type="button"
              aria-pressed={isActive}
              onClick={() => updateSource(filter)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-[var(--md-radius-md)] px-2.5 text-[11px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] outline-none transition-[background-color,color,box-shadow] duration-200 hover:bg-[var(--md-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
                isActive ? "bg-[var(--md-selected-bg)] text-[var(--md-selected-text)]" : "bg-[var(--md-surface)]",
              )}
            >
              <span>{t(sourceLabels[filter])}</span>
              <span className="min-w-4 rounded-full bg-[var(--md-icon-well)] px-1 text-center text-[9.5px]" data-i18n-skip dir="ltr">{count}</span>
            </button>
          )
        })}
      </div>

      <div
        className={cn(
          "mt-3 grid min-w-0 gap-3 transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          selectedDocument && "lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)] xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.65fr)]",
        )}
      >
        <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
          {filteredDocuments.length > 0 ? (
            view === "list" ? (
              <DocumentList documents={filteredDocuments} selectedDocumentId={selectedDocumentId} onSelect={updateSelection} />
            ) : (
              <DocumentGrid documents={filteredDocuments} selectedDocumentId={selectedDocumentId} onSelect={updateSelection} />
            )
          ) : (
            <div className="grid min-h-[220px] place-items-center px-5 py-10 text-center">
              <div>
                <span className="mx-auto grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
                  <FileText className="size-4" strokeWidth={1.25} aria-hidden="true" />
                </span>
                <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t("No documents found")}</p>
                <p className="mt-1 text-[11px] text-[var(--md-text)]">{t("Choose another source to see related documents.")}</p>
              </div>
            </div>
          )}
        </Surface>

        {selectedDocument ? <DocumentPreviewPanel document={selectedDocument} onClose={() => updateSelection(null)} /> : null}
      </div>
    </section>
  )
}
