import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, ChevronUp, Columns3, FileImage, FilePlus2, FileText, Layers3, List as ListIcon, Plus, Search, Settings2, StickyNote, Trash2, Upload } from "lucide-react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { DocumentViewer, PaperTrayStack, type PaperTray, type TrayDocument, type TrayShipmentProgress } from "@/components/multideck/paper-tray"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createInitialPaperTrays } from "@/data/paper-tray-data"
import { bookings } from "@/data/multideck-data"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { useKanbanPointerDrag } from "@/lib/kanban-drag"

const maximumTrayCount = 5
const paperTrayViewModes = ["Tray", "List", "Kanban"] as const
type PaperTrayViewMode = (typeof paperTrayViewModes)[number]
type DocumentTypeFilter = "all" | "pdf" | "image"

const paperTrayColorOptions = [
  { value: "#0e7d74", label: "Teal" },
  { value: "#4d6f91", label: "Blue" },
  { value: "#b77934", label: "Amber" },
  { value: "#5f7f68", label: "Green" },
  { value: "#7d667f", label: "Plum" },
] as const

const bookingById = new Map(bookings.map((booking) => [booking.id, booking]))

function getDocumentShipment(item: TrayDocument): TrayShipmentProgress | null {
  if (!item.bookingId) return null
  const booking = bookingById.get(item.bookingId)
  if (!booking) return null

  return {
    id: booking.id,
    route: booking.route,
    status: booking.status,
    progress: booking.progress,
    eta: booking.eta,
    etaTime: booking.time,
    tone: booking.tone,
  }
}

function createId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isSupportedFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return file.type === "application/pdf" || file.type.startsWith("image/") || lowerName.endsWith(".pdf") || /\.(png|jpe?g|gif|webp|avif)$/i.test(lowerName)
}

function toTrayDocument(file: File): TrayDocument {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  return {
    id: createId("document"),
    name: file.name,
    kind: isPdf ? "pdf" : "image",
    mimeType: file.type || (isPdf ? "application/pdf" : "image/*"),
    sizeLabel: formatFileSize(file.size),
    addedAt: "Just now",
    reference: file.name.replace(/\.[^/.]+$/, "").slice(0, 28),
    url: URL.createObjectURL(file),
    accent: isPdf ? "teal" : "blue",
  }
}

function isImageDocument(item: TrayDocument) {
  return item.kind === "image" || item.mimeType.startsWith("image/") || item.sampleType === "inspection"
}

function PaperTrayNoteDialog({
  item,
  draft,
  onDraftChange,
  onOpenChange,
  onSave,
}: {
  item: TrayDocument | null
  draft: string
  onDraftChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  const { t } = useLanguage()

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="md-paper-note-dialog border-0 p-0 shadow-[var(--md-shadow-lift)] sm:max-w-[440px]">
        <div className="md-paper-note-dialog__sheet">
          <DialogHeader>
            <div className="md-paper-note-dialog__eyebrow">
              <StickyNote aria-hidden="true" strokeWidth={1.2} />
              <span>{t("Paper Tray note")}</span>
            </div>
            <DialogTitle className="truncate text-[16px] font-medium" data-i18n-skip dir="ltr">
              {item?.name}
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-5 text-[var(--md-text)]">
              {t("This note stays with this Paper Tray item and is not linked to a booking or shipment.")}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            autoFocus
            value={draft}
            aria-label={t("Note")}
            placeholder={t("Add a quick note...")}
            className="md-paper-note-dialog__textarea"
            onChange={(event) => onDraftChange(event.target.value)}
          />

          <DialogFooter className="mt-4 flex-row justify-end gap-2 sm:space-x-0">
            <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] px-3 text-[12px]" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="button" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-ink)] px-4 text-[12px] text-[var(--md-surface)] hover:bg-[var(--md-ink)]/90" onClick={onSave}>
              {t("Save note")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TrayManagerDialog({
  open,
  trays,
  onOpenChange,
  onRename,
  onColorChange,
  onAdd,
  onMove,
  onRemove,
}: {
  open: boolean
  trays: PaperTray[]
  onOpenChange: (open: boolean) => void
  onRename: (trayId: string, name: string) => void
  onColorChange: (trayId: string, color: string) => void
  onAdd: () => void
  onMove: (trayId: string, direction: -1 | 1) => void
  onRemove: (trayId: string, destinationTrayId?: string) => void
}) {
  const { t } = useLanguage()
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null)
  const removableTray = trays.find((tray) => tray.id === pendingRemovalId)
  const removalDestinations = trays.filter((tray) => tray.id !== pendingRemovalId)
  const [removalDestinationId, setRemovalDestinationId] = useState("")

  useEffect(() => {
    if (!pendingRemovalId) return
    setRemovalDestinationId(removalDestinations[0]?.id ?? "")
  }, [pendingRemovalId, removalDestinations])

  function requestRemove(tray: PaperTray) {
    if (tray.documents.length === 0) {
      onRemove(tray.id)
      return
    }
    setPendingRemovalId(tray.id)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setPendingRemovalId(null)
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-32px)] overflow-y-auto rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-sidebar-bg)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[560px]">
        <DialogHeader className="px-5 pt-5 sm:px-6 sm:pt-6">
          <DialogTitle className="text-[18px] font-medium">{t("Manage trays")}</DialogTitle>
          <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">
            {t("Rename, recolour, reorder, or add up to five trays. Each colour follows the tray across every view.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 px-5 sm:px-6">
          {trays.map((tray, index) => (
            <motion.div
              layout
              key={tray.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-3 shadow-[var(--md-shadow-line)]"
            >
              <div className="min-w-0">
                <Input
                  value={tray.name}
                  aria-label={t("Tray name")}
                  className="h-9 w-full rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-3 text-[13px] font-medium shadow-[var(--md-shadow-line)]"
                  onChange={(event) => onRename(tray.id, event.target.value)}
                  onBlur={(event) => {
                    if (!event.target.value.trim()) onRename(tray.id, "Untitled tray")
                  }}
                />
                <div className="mt-1.5 flex items-center justify-between gap-3 px-1">
                  <p className="text-[11px] text-[var(--md-subtle)]">{tray.documents.length} {t(tray.documents.length === 1 ? "document" : "documents")}</p>
                  <div className="md-paper-tray-colour-picker" role="group" aria-label={`${t("Shelf colour")} ${t(tray.name)}`}>
                    {paperTrayColorOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-label={`${t("Set shelf colour to")} ${t(option.label)}`}
                        aria-pressed={(tray.color ?? paperTrayColorOptions[0].value) === option.value}
                        title={t(option.label)}
                        style={{ backgroundColor: option.value }}
                        onClick={() => onColorChange(tray.id, option.value)}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("Move tray up")}
                  disabled={index === 0}
                  className="rounded-[var(--md-radius-md)] text-[var(--md-text)] hover:bg-[var(--md-hover)]"
                  onClick={() => onMove(tray.id, -1)}
                >
                  <ChevronUp strokeWidth={1.2} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("Move tray down")}
                  disabled={index === trays.length - 1}
                  className="rounded-[var(--md-radius-md)] text-[var(--md-text)] hover:bg-[var(--md-hover)]"
                  onClick={() => onMove(tray.id, 1)}
                >
                  <ChevronDown strokeWidth={1.2} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${t("Remove")} ${tray.name}`}
                  disabled={trays.length === 1}
                  className="rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[rgba(209,78,78,0.08)] hover:text-[var(--md-red)]"
                  onClick={() => requestRemove(tray)}
                >
                  <Trash2 strokeWidth={1.2} />
                </Button>
              </div>
            </motion.div>
          ))}

          <Button
            type="button"
            variant="ghost"
            disabled={trays.length >= maximumTrayCount}
            className="mt-1 h-10 justify-start rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)]"
            onClick={onAdd}
          >
            <Plus data-icon="inline-start" strokeWidth={1.2} />
            {trays.length >= maximumTrayCount ? t("Maximum of five trays reached") : t("Add another tray")}
          </Button>
        </div>

        {removableTray ? (
          <div className="mx-5 rounded-[var(--md-radius-lg)] bg-[rgba(221,138,43,0.1)] p-4 shadow-[inset_0_0_0_1px_rgba(221,138,43,0.16)] sm:mx-6">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Move documents before removing this tray")}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">
              {removableTray.documents.length} {t("documents will be moved to the tray you choose.")}
            </p>
            <Select value={removalDestinationId} onValueChange={setRemovalDestinationId}>
              <SelectTrigger className="mt-3 h-9 w-full rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-3 text-[12px] shadow-[var(--md-shadow-line)]">
                <SelectValue placeholder={t("Choose destination tray")} />
              </SelectTrigger>
              <SelectContent className="rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
                {removalDestinations.map((tray) => <SelectItem key={tray.id} value={tray.id}>{t(tray.name)}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] px-3 text-[12px]" onClick={() => setPendingRemovalId(null)}>
                {t("Cancel")}
              </Button>
              <Button
                type="button"
                className="h-8 rounded-[var(--md-radius-md)] bg-[var(--md-red)] px-3 text-[12px] text-white hover:bg-[var(--md-red)]/90"
                disabled={!removalDestinationId}
                onClick={() => {
                  onRemove(removableTray.id, removalDestinationId)
                  setPendingRemovalId(null)
                }}
              >
                {t("Move and remove")}
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter className="px-5 pb-5 sm:px-6 sm:pb-6">
          <Button type="button" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[12px] text-[var(--md-accent-ink)] hover:bg-[var(--md-accent)]/90" onClick={() => onOpenChange(false)}>
            {t("Done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PaperTrayListView({
  trays,
  query,
  trayFilter,
  typeFilter,
  onQueryChange,
  onTrayFilterChange,
  onTypeFilterChange,
  onSelectDocument,
  onEditNote,
}: {
  trays: PaperTray[]
  query: string
  trayFilter: string
  typeFilter: DocumentTypeFilter
  onQueryChange: (value: string) => void
  onTrayFilterChange: (value: string) => void
  onTypeFilterChange: (value: DocumentTypeFilter) => void
  onSelectDocument: (document: TrayDocument, trayId: string) => void
  onEditNote: (document: TrayDocument) => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const documents = useMemo(
    () => trays.flatMap((tray) => tray.documents.map((document) => ({ document, tray }))).filter(({ document, tray }) => {
      const matchesTray = trayFilter === "all" || tray.id === trayFilter
      const documentType = isImageDocument(document) ? "image" : "pdf"
      const matchesType = typeFilter === "all" || typeFilter === documentType
      const searchable = `${document.name} ${document.reference ?? ""} ${document.customer ?? ""} ${document.note ?? ""} ${tray.name}`.toLocaleLowerCase()
      return matchesTray && matchesType && (!normalizedQuery || searchable.includes(normalizedQuery))
    }),
    [normalizedQuery, trayFilter, trays, typeFilter],
  )
  const filtersActive = Boolean(normalizedQuery) || trayFilter !== "all" || typeFilter !== "all"

  return (
    <div className="md-paper-list-view">
      <div className="md-paper-list-view__filters">
        <label className="md-paper-list-view__search">
          <Search className="size-3.5" strokeWidth={1.25} aria-hidden="true" />
          <Input
            value={query}
            aria-label={t("Search documents")}
            placeholder={t("Search name, reference, or customer")}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>

        <Select value={trayFilter} onValueChange={onTrayFilterChange}>
          <SelectTrigger aria-label={t("Filter by tray")} className="md-paper-list-view__select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
            <SelectItem value="all">{t("All trays")}</SelectItem>
            {trays.map((tray) => <SelectItem key={tray.id} value={tray.id}>{t(tray.name)}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(value) => onTypeFilterChange(value as DocumentTypeFilter)}>
          <SelectTrigger aria-label={t("Filter by document type")} className="md-paper-list-view__select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
            <SelectItem value="all">{t("All types")}</SelectItem>
            <SelectItem value="pdf">{t("PDF documents")}</SelectItem>
            <SelectItem value="image">{t("Images")}</SelectItem>
          </SelectContent>
        </Select>

        {filtersActive ? (
          <button
            type="button"
            className="md-paper-list-view__clear"
            onClick={() => {
              onQueryChange("")
              onTrayFilterChange("all")
              onTypeFilterChange("all")
            }}
          >
            {t("Clear filters")}
          </button>
        ) : null}
      </div>

      <div className="md-paper-list-view__summary">
        <strong>{documents.length}</strong>
        <span>{t(documents.length === 1 ? "document" : "documents")}</span>
      </div>

      <div className="md-paper-list-view__table">
        <div className="md-paper-list-view__head" aria-hidden="true">
          <span>{t("Document")}</span>
          <span>{t("Tray")}</span>
          <span>{t("Customer")}</span>
          <span>{t("Type")}</span>
          <span>{t("Added")}</span>
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {documents.map(({ document, tray }, index) => {
            const imageDocument = isImageDocument(document)
            const Icon = imageDocument ? FileImage : FileText
            return (
              <motion.div
                layout
                layoutId={`paper-document-${document.id}`}
                key={document.id}
                className="md-paper-list-view__row"
                style={{ "--md-tray-color": tray.color ?? "#0e7d74" } as CSSProperties}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, delay: Math.min(index * 0.018, 0.12), ease: [0.22, 1, 0.36, 1] }}
              >
                <button
                  type="button"
                  className="md-paper-list-view__open"
                  aria-label={`${t("Open")} ${document.name}`}
                  onClick={() => onSelectDocument(document, tray.id)}
                >
                  <span className="md-paper-list-view__document">
                    <span className="md-paper-list-view__icon"><Icon strokeWidth={1.2} /></span>
                    <span className="min-w-0">
                      <strong data-i18n-skip dir="ltr">{document.name}</strong>
                      <small data-i18n-skip dir="ltr">{document.reference}</small>
                    </span>
                  </span>
                  <span className="md-paper-list-view__tray">{t(tray.name)}</span>
                  <span data-i18n-skip>{document.customer ?? "—"}</span>
                  <span>{t(imageDocument ? "Image" : "PDF")}</span>
                  <span>{t(document.addedAt)}</span>
                </button>
                <button
                  type="button"
                  className="md-paper-note-button"
                  data-has-note={document.note?.trim() ? "true" : undefined}
                  aria-label={`${t(document.note?.trim() ? "Edit note for" : "Add note for")} ${document.name}`}
                  title={t(document.note?.trim() ? "View or edit note" : "Add note")}
                  onClick={() => onEditNote(document)}
                >
                  <StickyNote strokeWidth={1.2} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {documents.length === 0 ? (
          <div className="md-paper-list-view__empty">
            <Search className="size-5" strokeWidth={1.2} />
            <strong>{t("No documents match these filters")}</strong>
            <span>{t("Try a different search or clear the filters.")}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PaperTrayKanbanView({
  trays,
  onSelectDocument,
  onMoveDocument,
  onEditNote,
}: {
  trays: PaperTray[]
  onSelectDocument: (document: TrayDocument, trayId: string) => void
  onMoveDocument: (documentId: string, sourceTrayId: string, destinationTrayId: string, orderedTrays?: PaperTray[]) => void
  onEditNote: (document: TrayDocument) => void
}) {
  const { t } = useLanguage()
  const columns = trays.map((tray) => ({ id: tray.id, tasks: tray.documents }))
  const kanban = useKanbanPointerDrag({
    columns,
    getId: (document) => document.id,
    onCommit: ({ cardId, columnId, columns: committedColumns }) => {
      const sourceTrayId = trays.find((tray) => tray.documents.some((document) => document.id === cardId))?.id
      if (!sourceTrayId) return
      const orderedTrays = trays.map((tray) => ({
        ...tray,
        documents: committedColumns.find((column) => column.id === tray.id)?.tasks ?? tray.documents,
      }))
      onMoveDocument(cardId, sourceTrayId, columnId, orderedTrays)
    },
    formatKeyboardAnnouncement: (document, columnId) => `${document.name} ${t("moved to")} ${t(trays.find((tray) => tray.id === columnId)?.name ?? columnId)}`,
  })

  return (
    <div className="md-paper-kanban-view">
      <div ref={kanban.boardRef} className="md-paper-kanban-view__board" style={{ "--md-paper-kanban-columns": trays.length } as CSSProperties}>
        {kanban.previewColumns.map((column, trayIndex) => {
          const tray = trays.find((candidate) => candidate.id === column.id)
          if (!tray) return null
          return (
          <section
            key={tray.id}
            className="md-kanban-column md-paper-kanban-column"
            data-column-id={tray.id}
            style={{ "--md-tray-color": tray.color ?? "#0e7d74" } as CSSProperties}
            data-drop-target={kanban.activeCardId && kanban.activeColumnId === tray.id ? "true" : undefined}
          >
            <header className="md-paper-kanban-column__header">
              <div>
                <span className="md-paper-kanban-column__index" data-i18n-skip>{String(trayIndex + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <h2>{t(tray.name)}</h2>
                  <p>{column.tasks.length} {t(column.tasks.length === 1 ? "document" : "documents")}</p>
                </div>
              </div>
              <span className="md-paper-kanban-column__count" data-i18n-skip>{column.tasks.length}</span>
            </header>

            <div data-kanban-list className="md-paper-kanban-column__documents">
                {column.tasks.map((document) => {
                  const imageDocument = isImageDocument(document)
                  const Icon = imageDocument ? FileImage : FileText
                  return (
                    <div
                      key={document.id}
                      data-kanban-card={document.id}
                      data-task-id={document.id}
                      data-kanban-dragging={kanban.activeCardId === document.id ? "true" : undefined}
                      className="md-kanban-card md-paper-kanban-card-shell"
                      onPointerDown={(event) => {
                        if ((event.target as HTMLElement).closest("[data-paper-note-button]")) return
                        kanban.handlePointerDown(event, document.id)
                      }}
                    >
                      <button
                        type="button"
                        className="md-kanban-card__primary md-paper-kanban-card"
                        aria-grabbed={kanban.activeCardId === document.id}
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
                        onClick={() => {
                          if (!kanban.isClickSuppressed()) onSelectDocument(document, tray.id)
                        }}
                        onKeyDown={(event) => kanban.handleKeyDown(event, document.id)}
                      >
                        <span className="md-paper-kanban-card__topline">
                          <span className="md-paper-kanban-card__icon"><Icon strokeWidth={1.2} /></span>
                          <span>{t(imageDocument ? "Image" : "PDF")}</span>
                          <small data-i18n-skip dir="ltr">{document.reference}</small>
                        </span>
                        <strong data-i18n-skip dir="ltr">{document.name}</strong>
                        <span className="md-paper-kanban-card__customer" data-i18n-skip>{document.customer ?? t("No customer")}</span>
                        <span className="md-paper-kanban-card__added">{t(document.addedAt)}</span>
                      </button>
                      <button
                        type="button"
                        className="md-paper-note-button md-paper-note-button--kanban"
                        data-paper-note-button
                        data-has-note={document.note?.trim() ? "true" : undefined}
                        aria-label={`${t(document.note?.trim() ? "Edit note for" : "Add note for")} ${document.name}`}
                        title={t(document.note?.trim() ? "View or edit note" : "Add note")}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => onEditNote(document)}
                      >
                        <StickyNote strokeWidth={1.2} />
                      </button>
                    </div>
                  )
                })}

              {column.tasks.length === 0 ? (
                <div className="md-kanban-empty md-paper-kanban-column__empty">
                  <Upload className="size-4" strokeWidth={1.2} />
                  <span>{t("Drop documents here")}</span>
                </div>
              ) : null}
            </div>
          </section>
          )
        })}
      </div>
      <p className="sr-only" aria-live="polite">{kanban.keyboardAnnouncement}</p>
      {kanban.activeTask && kanban.overlayStyle ? createPortal(
        <div className="md-kanban-drag-preview" style={kanban.overlayStyle}>
          <div className="md-kanban-drag-preview-card md-paper-kanban-card-shell">
            {(() => {
              const imageDocument = isImageDocument(kanban.activeTask)
              const Icon = imageDocument ? FileImage : FileText
              return (
                <div className="md-paper-kanban-card">
                  <span className="md-paper-kanban-card__topline">
                    <span className="md-paper-kanban-card__icon"><Icon strokeWidth={1.2} /></span>
                    <span>{t(imageDocument ? "Image" : "PDF")}</span>
                    <small data-i18n-skip dir="ltr">{kanban.activeTask.reference}</small>
                  </span>
                  <strong data-i18n-skip dir="ltr">{kanban.activeTask.name}</strong>
                  <span className="md-paper-kanban-card__customer" data-i18n-skip>{kanban.activeTask.customer ?? t("No customer")}</span>
                  <span className="md-paper-kanban-card__added">{t(kanban.activeTask.addedAt)}</span>
                </div>
              )
            })()}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

export function PaperTrayPage() {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const globalUploadRef = useRef<HTMLInputElement>(null)
  const uploadedUrlsRef = useRef(new Set<string>())
  const [trays, setTrays] = useState<PaperTray[]>(createInitialPaperTrays)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [selectedTrayId, setSelectedTrayId] = useState<string | null>(null)
  const [mobileTrayId, setMobileTrayId] = useState("incoming")
  const [managerOpen, setManagerOpen] = useState(false)
  const [viewMode, setViewMode] = useState<PaperTrayViewMode>("Tray")
  const [listQuery, setListQuery] = useState("")
  const [listTrayFilter, setListTrayFilter] = useState("all")
  const [listTypeFilter, setListTypeFilter] = useState<DocumentTypeFilter>("all")
  const [noteDocumentId, setNoteDocumentId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState("")

  const selectedDocument = useMemo(
    () => trays.flatMap((tray) => tray.documents).find((item) => item.id === selectedDocumentId) ?? null,
    [selectedDocumentId, trays],
  )
  const documentCount = trays.reduce((total, tray) => total + tray.documents.length, 0)
  const noteDocument = useMemo(
    () => trays.flatMap((tray) => tray.documents).find((item) => item.id === noteDocumentId) ?? null,
    [noteDocumentId, trays],
  )

  useEffect(() => {
    const urls = uploadedUrlsRef.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  useEffect(() => {
    if (listTrayFilter !== "all" && !trays.some((tray) => tray.id === listTrayFilter)) setListTrayFilter("all")
  }, [listTrayFilter, trays])

  function openDocument(item: TrayDocument, trayId: string) {
    setSelectedDocumentId(item.id)
    setSelectedTrayId(trayId)
  }

  function openNote(item: TrayDocument) {
    setNoteDocumentId(item.id)
    setNoteDraft(item.note ?? "")
  }

  function saveNote() {
    if (!noteDocumentId) return
    const note = noteDraft.trim()
    setTrays((current) => current.map((tray) => ({
      ...tray,
      documents: tray.documents.map((document) => document.id === noteDocumentId ? { ...document, note } : document),
    })))
    setNoteDocumentId(null)
    setNoteDraft("")
    toast.success(t(note ? "Note saved" : "Note removed"))
  }

  function addFiles(trayId: string, files: File[]) {
    const supportedFiles = files.filter(isSupportedFile)
    const unsupportedCount = files.length - supportedFiles.length

    if (unsupportedCount > 0) {
      toast.error(t("Some files were not added"), { description: t("Paper Tray currently supports PDF and image files.") })
    }
    if (supportedFiles.length === 0) return

    const newDocuments = supportedFiles.map(toTrayDocument)
    newDocuments.forEach((item) => item.url && uploadedUrlsRef.current.add(item.url))
    setTrays((current) => current.map((tray) => tray.id === trayId ? { ...tray, documents: [...tray.documents, ...newDocuments] } : tray))
    toast.success(t("Documents added"), {
      description: `${supportedFiles.length} ${t(supportedFiles.length === 1 ? "file is now in" : "files are now in")} ${t(trays.find((tray) => tray.id === trayId)?.name ?? "Incoming")}.`,
    })
  }

  function moveDocument(documentId: string, sourceTrayId: string, destinationTrayId: string, orderedTrays?: PaperTray[]) {
    const movingDocument = trays.flatMap((tray) => tray.documents).find((item) => item.id === documentId)
    if (!movingDocument) return

    if (orderedTrays) {
      setTrays(orderedTrays)
    } else {
      if (sourceTrayId === destinationTrayId) return
      setTrays((current) => {
        const withoutDocument = current.map((tray) => tray.id === sourceTrayId
          ? { ...tray, documents: tray.documents.filter((item) => item.id !== documentId) }
          : tray)
        return withoutDocument.map((tray) => tray.id === destinationTrayId
          ? { ...tray, documents: [...tray.documents, movingDocument] }
          : tray)
      })
    }

    if (selectedDocumentId === documentId) setSelectedTrayId(destinationTrayId)
    toast.success(t("Document moved"), { description: `${movingDocument.name} ${t("is now in")} ${t(trays.find((tray) => tray.id === destinationTrayId)?.name ?? "tray")}.` })
  }

  function removeDocument(documentId: string) {
    const item = trays.flatMap((tray) => tray.documents).find((document) => document.id === documentId)
    if (item?.url) {
      URL.revokeObjectURL(item.url)
      uploadedUrlsRef.current.delete(item.url)
    }
    setTrays((current) => current.map((tray) => ({ ...tray, documents: tray.documents.filter((document) => document.id !== documentId) })))
    setSelectedDocumentId(null)
    setSelectedTrayId(null)
    toast.success(t("Document removed"), { description: item?.name })
  }

  function downloadDocument(item: TrayDocument) {
    const isTemporary = !item.url
    const url = item.url ?? URL.createObjectURL(new Blob([
      `${item.name}\n${item.reference ?? ""}\n${item.customer ?? ""}\n\nMultideck paper tray demo document.`,
    ], { type: "text/plain" }))
    const anchor = window.document.createElement("a")
    anchor.href = url
    anchor.download = item.url ? item.name : item.name.replace(/\.pdf$/i, ".txt")
    anchor.click()
    if (isTemporary) window.setTimeout(() => URL.revokeObjectURL(url), 0)
    toast.success(t("Download started"), { description: item.name })
  }

  function addTray() {
    setTrays((current) => {
      if (current.length >= maximumTrayCount) return current
      const trayNumber = current.length + 1
      return [...current, {
        id: createId("tray"),
        name: `Tray ${trayNumber}`,
        color: paperTrayColorOptions[current.length % paperTrayColorOptions.length].value,
        documents: [],
      }]
    })
  }

  function renameTray(trayId: string, name: string) {
    setTrays((current) => current.map((tray) => tray.id === trayId ? { ...tray, name } : tray))
  }

  function changeTrayColor(trayId: string, color: string) {
    setTrays((current) => current.map((tray) => tray.id === trayId ? { ...tray, color } : tray))
  }

  function reorderTray(trayId: string, direction: -1 | 1) {
    setTrays((current) => {
      const index = current.findIndex((tray) => tray.id === trayId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      const [tray] = next.splice(index, 1)
      next.splice(nextIndex, 0, tray)
      return next
    })
  }

  function removeTray(trayId: string, destinationTrayId?: string) {
    setTrays((current) => {
      if (current.length === 1) return current
      const trayToRemove = current.find((tray) => tray.id === trayId)
      if (!trayToRemove) return current
      const remaining = current.filter((tray) => tray.id !== trayId)
      if (!destinationTrayId || trayToRemove.documents.length === 0) return remaining
      return remaining.map((tray) => tray.id === destinationTrayId ? { ...tray, documents: [...tray.documents, ...trayToRemove.documents] } : tray)
    })
    if (mobileTrayId === trayId) setMobileTrayId(destinationTrayId ?? trays.find((tray) => tray.id !== trayId)?.id ?? "")
    if (selectedTrayId === trayId) setSelectedTrayId(destinationTrayId ?? null)
    toast.success(t("Tray removed"))
  }

  return (
    <LayoutGroup id="paper-tray-workspace">
      <section className="md-paper-tray-page md-page md-page-stack">
        <motion.header
          className="md-paper-tray-page__header"
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--md-accent)]">
              <Layers3 className="size-3.5" strokeWidth={1.2} />
              <span>{t("Document workspace")}</span>
            </div>
            <h1 className="mt-2 text-[24px] font-medium leading-tight text-[var(--md-ink)]">{t("Paper Tray")}</h1>
            <p className="mt-1 max-w-[620px] text-[13px] leading-5 text-[var(--md-text)]">
              {t("Sort, inspect, and move working documents across clear shelves.")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--md-subtle)]">
              <span>{trays.length} {t("trays")}</span><span aria-hidden="true">·</span><span>{documentCount} {t("documents")}</span><span aria-hidden="true">·</span><span>{t("Session only")}</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-3.5 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:scale-[1.01] hover:bg-[var(--md-hover)]"
              onClick={() => setManagerOpen(true)}
            >
              <Settings2 data-icon="inline-start" strokeWidth={1.2} />
              {t("Manage trays")}
            </Button>
            <Button
              type="button"
              className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3.5 text-[12px] font-medium text-[var(--md-accent-ink)] shadow-[0_10px_24px_var(--md-accent-a18)] hover:scale-[1.01] hover:bg-[var(--md-accent)]/92"
              onClick={() => globalUploadRef.current?.click()}
            >
              <FilePlus2 data-icon="inline-start" strokeWidth={1.2} />
              {t("Add documents")}
            </Button>
            <input
              ref={globalUploadRef}
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                if (files.length > 0) addFiles(mobileTrayId || trays[0].id, files)
                event.target.value = ""
              }}
            />
          </div>
        </motion.header>

        <div className="md-paper-tray-page__modebar">
          <SegmentedControl
            options={paperTrayViewModes}
            value={viewMode}
            onChange={setViewMode}
            ariaLabel={t("Document view")}
            className="md-paper-view-toggle"
            renderOption={(mode) => {
              const Icon = mode === "Tray" ? Layers3 : mode === "List" ? ListIcon : Columns3
              return <><Icon className="size-3.5" strokeWidth={1.25} /><span>{t(mode)}</span></>
            }}
          />
        </div>

        <motion.div
          className="md-paper-tray-page__stage"
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.42, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={viewMode}
              className="md-paper-tray-page__view"
              data-view={viewMode.toLocaleLowerCase()}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -5, filter: "blur(2px)" }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              {viewMode === "Tray" ? (
                <>
                  <PaperTrayStack
                    trays={trays}
                    selectedDocumentId={selectedDocumentId}
                    mobileTrayId={mobileTrayId}
                    onMobileTrayChange={setMobileTrayId}
                    onSelectDocument={openDocument}
                    onFilesAdded={addFiles}
                    onMoveDocument={moveDocument}
                    getShipmentForDocument={getDocumentShipment}
                  />
                  <div className="md-paper-tray-page__stage-footer">
                    <span><strong>{t("Incoming")}</strong> {t("is the default destination for desktop uploads.")}</span>
                    <span>{t("Drag documents between trays or use Move in the reader.")}</span>
                  </div>
                </>
              ) : null}

              {viewMode === "List" ? (
                <PaperTrayListView
                  trays={trays}
                  query={listQuery}
                  trayFilter={listTrayFilter}
                  typeFilter={listTypeFilter}
                  onQueryChange={setListQuery}
                  onTrayFilterChange={setListTrayFilter}
                  onTypeFilterChange={setListTypeFilter}
                  onSelectDocument={openDocument}
                  onEditNote={openNote}
                />
              ) : null}

              {viewMode === "Kanban" ? (
                <PaperTrayKanbanView
                  trays={trays}
                  onSelectDocument={openDocument}
                  onMoveDocument={moveDocument}
                  onEditNote={openNote}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </section>

      <TrayManagerDialog
        open={managerOpen}
        trays={trays}
        onOpenChange={setManagerOpen}
        onRename={renameTray}
        onColorChange={changeTrayColor}
        onAdd={addTray}
        onMove={reorderTray}
        onRemove={removeTray}
      />

      <PaperTrayNoteDialog
        item={noteDocument}
        draft={noteDraft}
        onDraftChange={setNoteDraft}
        onOpenChange={(open) => {
          if (!open) {
            setNoteDocumentId(null)
            setNoteDraft("")
          }
        }}
        onSave={saveNote}
      />

      <DocumentViewer
        item={selectedDocument}
        trays={trays}
        currentTrayId={selectedTrayId}
        onClose={() => {
          setSelectedDocumentId(null)
          setSelectedTrayId(null)
        }}
        onMove={(destinationTrayId) => {
          if (selectedDocument && selectedTrayId) moveDocument(selectedDocument.id, selectedTrayId, destinationTrayId)
        }}
        onRemove={() => selectedDocument && removeDocument(selectedDocument.id)}
        onDownload={() => selectedDocument && downloadDocument(selectedDocument)}
      />
    </LayoutGroup>
  )
}
