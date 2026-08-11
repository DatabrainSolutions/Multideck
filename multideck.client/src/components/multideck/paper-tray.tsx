import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  ChevronDown,
  ChevronUp,
  Download,
  Expand,
  FileImage,
  FileText,
  FolderInput,
  Image as ImageIcon,
  Maximize2,
  Plus,
  Ship,
  Trash2,
  Upload,
  X,
} from "@/components/icons/hugeicons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type PaperDocumentKind = "sample" | "pdf" | "image"
export type PaperDocumentAccent = "teal" | "blue" | "green" | "amber" | "neutral"

export type TrayDocument = {
  id: string
  name: string
  kind: PaperDocumentKind
  mimeType: string
  sizeLabel: string
  addedAt: string
  customer?: string
  reference?: string
  note?: string
  bookingId?: string
  url?: string
  sampleType?: "invoice" | "packing-list" | "inspection" | "arrival" | "certificate" | "bill-of-lading" | "customs" | "delivery-order" | "release"
  accent?: PaperDocumentAccent
}

export type TrayShipmentProgress = {
  id: string
  route: string
  status: string
  progress: number
  eta: string
  etaTime?: string
  tone: "green" | "amber" | "red" | "blue" | "teal" | "neutral"
}

export type PaperTray = {
  id: string
  name: string
  color?: string
  documents: TrayDocument[]
}

type PaperTrayStackProps = {
  trays: PaperTray[]
  selectedDocumentId?: string | null
  mobileTrayId?: string
  className?: string
  onMobileTrayChange?: (trayId: string) => void
  onSelectDocument: (document: TrayDocument, trayId: string) => void
  onFilesAdded?: (trayId: string, files: File[]) => void
  onMoveDocument?: (documentId: string, sourceTrayId: string, destinationTrayId: string) => void
  getShipmentForDocument?: (document: TrayDocument) => TrayShipmentProgress | null
}

type DraggedDocument = {
  documentId: string
  sourceTrayId: string
}

const documentDragType = "application/x-multideck-paper-document"
const shipmentStages = ["Booked", "Departed", "In transit", "Customs", "Delivered"] as const

function DocumentTypeIcon({ item }: { item: TrayDocument }) {
  const Icon = item.kind === "image" || item.sampleType === "inspection" ? FileImage : FileText
  return <Icon className="size-3.5" strokeWidth={1.2} />
}

function TrayShipmentProgressBar({ shipment }: { shipment: TrayShipmentProgress }) {
  const { t } = useLanguage()
  const currentStage = Math.min(shipmentStages.length - 1, Math.floor(shipment.progress / 20))

  return (
    <motion.div
      className="md-paper-shipment-progress"
      data-tone={shipment.tone}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      aria-label={`${t("Live shipment progress")} ${shipment.id}: ${shipment.progress}%, ${t("ETA")} ${shipment.eta} ${shipment.etaTime ?? ""}`}
    >
      <div className="md-paper-shipment-progress__identity">
        <span className="md-paper-shipment-progress__live"><i />{t("Live")}</span>
        <Ship aria-hidden="true" strokeWidth={1.2} />
        <span data-i18n-skip dir="ltr">{shipment.id}</span>
        <span className="md-paper-shipment-progress__route" data-i18n-skip dir="auto">{shipment.route}</span>
      </div>
      <div className="md-paper-shipment-progress__journey">
        <div className="md-paper-shipment-progress__journey-header">
          <strong>{t(shipment.status)}</strong>
          <span data-i18n-skip dir="ltr">{shipment.progress}%</span>
        </div>
        <div className="md-paper-shipment-progress__rail" role="progressbar" aria-label={t(shipment.status)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={shipment.progress}>
          {shipmentStages.map((stage, index) => (
            <span key={stage} data-state={index < currentStage ? "done" : index === currentStage ? "current" : "todo"} title={t(stage)} />
          ))}
        </div>
      </div>
      <div className="md-paper-shipment-progress__eta">
        <span>{t("ETA")}</span>
        <strong data-i18n-skip dir="ltr">{shipment.eta}{shipment.etaTime ? ` · ${shipment.etaTime}` : ""}</strong>
      </div>
    </motion.div>
  )
}

export function PaperDocumentFace({ item, compact = false, className }: { item: TrayDocument; compact?: boolean; className?: string }) {
  return (
    <div className={cn("md-paper-document-face", compact && "md-paper-document-face--compact", className)} data-accent={item.accent ?? "teal"}>
      <div className="md-paper-document-face__masthead">
        <span className="md-paper-document-face__mark"><DocumentTypeIcon item={item} /></span>
        <span className="md-paper-document-face__brand">MULTIDECK</span>
        <span className="md-paper-document-face__ref" data-i18n-skip dir="ltr">{item.reference ?? "DOCUMENT"}</span>
      </div>
      <p className="md-paper-document-face__title" data-i18n-skip dir="ltr">{item.name}</p>
      <div className="md-paper-document-face__lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

function parseDraggedDocument(event: DragEvent<HTMLElement>): DraggedDocument | null {
  const value = event.dataTransfer.getData(documentDragType)
  if (!value) return null

  try {
    return JSON.parse(value) as DraggedDocument
  } catch {
    return null
  }
}

const wheelPositions: Record<number, { y: number; height: number; scale: number; opacity: number; blur: number }> = {
  [-2]: { y: -122, height: 28, scale: 0.92, opacity: 0.5, blur: 0.8 },
  [-1]: { y: -88, height: 30, scale: 0.97, opacity: 0.78, blur: 0.25 },
  0: { y: -52, height: 108, scale: 1, opacity: 1, blur: 0 },
  1: { y: 62, height: 30, scale: 0.97, opacity: 0.78, blur: 0.25 },
  2: { y: 98, height: 28, scale: 0.92, opacity: 0.5, blur: 0.8 },
}

function MiniDocumentPreview({ item }: { item: TrayDocument }) {
  if (item.kind === "image" && item.url) {
    return <img src={item.url} alt="" className="md-paper-wheel-preview__image" data-i18n-skip />
  }

  if (item.kind === "pdf" && item.url) {
    return (
      <iframe
        title={`${item.name} mini preview`}
        src={`${item.url}#toolbar=0&navpanes=0&view=FitH`}
        className="md-paper-wheel-preview__pdf"
        tabIndex={-1}
        aria-hidden="true"
        data-i18n-skip
      />
    )
  }

  if (item.sampleType === "inspection") {
    return (
      <div className="md-paper-wheel-preview__inspection">
        <span className="md-paper-wheel-preview__container" aria-hidden="true" />
        <span className="md-paper-wheel-preview__seal" aria-hidden="true" />
        <ImageIcon className="size-4" strokeWidth={1.1} />
      </div>
    )
  }

  return (
    <div className="md-paper-wheel-preview__page" aria-hidden="true">
      <div className="md-paper-wheel-preview__page-head">
        <span>M</span>
        <i />
        <i />
      </div>
      <div className="md-paper-wheel-preview__page-facts">
        <span />
        <span />
        <span />
      </div>
      <div className="md-paper-wheel-preview__page-table">
        <span /><span /><span />
        <span /><span /><span />
      </div>
    </div>
  )
}

function TrayFileButton({
  trayId,
  className,
  onFilesAdded,
}: {
  trayId: string
  className?: string
  onFilesAdded: (trayId: string, files: File[]) => void
}) {
  const { t } = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <button type="button" aria-label={t("Add document to this tray")} className={className} onClick={() => inputRef.current?.click()}>
        <Plus className="size-3.5" strokeWidth={1.3} />
        <span>{t("Add document to this tray")}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/*"
        className="sr-only"
        aria-label={t("Add document to this tray")}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          if (files.length > 0) onFilesAdded(trayId, files)
          event.target.value = ""
        }}
      />
    </>
  )
}

function PaperShelfDocumentWheel({
  tray,
  selectedDocumentId,
  sharedLayoutEnabled = true,
  onSelectDocument,
  onMoveDocument,
  getShipmentForDocument,
}: {
  tray: PaperTray
  selectedDocumentId?: string | null
  sharedLayoutEnabled?: boolean
  onSelectDocument: (document: TrayDocument, trayId: string) => void
  onMoveDocument?: (documentId: string, sourceTrayId: string, destinationTrayId: string) => void
  getShipmentForDocument?: (document: TrayDocument) => TrayShipmentProgress | null
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [activeIndex, setActiveIndex] = useState(() => Math.min(2, Math.max(tray.documents.length - 1, 0)))
  const lastWheelAtRef = useRef(0)
  const touchStartYRef = useRef<number | null>(null)
  const wheelInteractionRef = useRef<HTMLDivElement>(null)
  const activeIndexRef = useRef(activeIndex)

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(tray.documents.length - 1, 0)))
  }, [tray.documents.length])

  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    if (!selectedDocumentId) return
    const selectedIndex = tray.documents.findIndex((document) => document.id === selectedDocumentId)
    if (selectedIndex < 0) return
    activeIndexRef.current = selectedIndex
    setActiveIndex(selectedIndex)
  }, [selectedDocumentId, tray.documents])

  useEffect(() => {
    const element = wheelInteractionRef.current
    if (!element) return undefined

    function captureShelfWheel(event: globalThis.WheelEvent) {
      if (event.deltaY === 0) return
      event.preventDefault()
      event.stopPropagation()
      if (Math.abs(event.deltaY) < 2) return
      if (tray.documents.length < 2) return

      const now = Date.now()
      if (now - lastWheelAtRef.current < 170) return
      const direction = event.deltaY > 0 ? 1 : -1
      const nextIndex = Math.max(0, Math.min(activeIndexRef.current + direction, tray.documents.length - 1))
      if (nextIndex === activeIndexRef.current) return
      lastWheelAtRef.current = now
      activeIndexRef.current = nextIndex
      setActiveIndex(nextIndex)
    }

    element.addEventListener("wheel", captureShelfWheel, { passive: false, capture: true })
    return () => element.removeEventListener("wheel", captureShelfWheel, { capture: true })
  }, [tray.documents.length])

  const activeDocument = tray.documents[activeIndex]
  const activeShipment = activeDocument ? getShipmentForDocument?.(activeDocument) ?? null : null
  const canMoveUp = activeIndex > 0
  const canMoveDown = activeIndex < tray.documents.length - 1

  function moveFocus(direction: -1 | 1) {
    setActiveIndex((current) => {
      const next = Math.max(0, Math.min(current + direction, tray.documents.length - 1))
      activeIndexRef.current = next
      return next
    })
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault()
      moveFocus(-1)
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      moveFocus(1)
    }
    if (event.key === "Enter" && activeDocument) {
      event.preventDefault()
      onSelectDocument(activeDocument, tray.id)
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") touchStartYRef.current = event.clientY
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || touchStartYRef.current === null) return
    const distance = touchStartYRef.current - event.clientY
    touchStartYRef.current = null
    if (Math.abs(distance) > 24) moveFocus(distance > 0 ? 1 : -1)
  }

  if (!activeDocument) {
    return (
      <div className="md-paper-tray-empty">
        <Upload className="size-4" strokeWidth={1.2} />
        <span>{t("Drop documents here")}</span>
      </div>
    )
  }

  return (
    <div ref={wheelInteractionRef} className="md-paper-wheel-wrap" data-has-shipment={activeShipment ? "true" : undefined}>
      <div className="md-paper-shipment-progress-slot" aria-live="polite">
        <AnimatePresence mode="wait">
          {activeShipment ? <TrayShipmentProgressBar key={activeShipment.id} shipment={activeShipment} /> : null}
        </AnimatePresence>
      </div>
      <div
        className="md-paper-wheel"
        role="listbox"
        aria-label={`${t(tray.name)} ${t("document wheel")}`}
        aria-activedescendant={`paper-wheel-${tray.id}-${activeDocument.id}`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <AnimatePresence initial={false}>
          {tray.documents.map((item, documentIndex) => {
            const offset = documentIndex - activeIndex
            const position = wheelPositions[offset]
            if (!position) return null
            const isActive = offset === 0
            const isSelected = item.id === selectedDocumentId

            return (
              <motion.div
                id={`paper-wheel-${tray.id}-${item.id}`}
                key={item.id}
                role="option"
                aria-selected={isActive}
                aria-label={isActive ? `${item.name}, ${t("preview selected")}` : `${item.name}, ${t("select preview")}`}
                className={cn("md-paper-wheel-item", isActive && "md-paper-wheel-item--active")}
                data-selected={isSelected ? "true" : undefined}
                data-document-name={item.name}
                draggable
                initial={shouldReduceMotion ? false : { opacity: 0, y: offset < 0 ? -132 : 112, scale: 0.9 }}
                animate={{
                  y: position.y,
                  height: position.height,
                  scale: position.scale,
                  opacity: position.opacity,
                  filter: `blur(${position.blur}px)`,
                  zIndex: 30 - Math.abs(offset),
                }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: offset < 0 ? -138 : 118, scale: 0.9 }}
                transition={reduceMotion(Boolean(shouldReduceMotion), { duration: 0.26, ease: [0.22, 1, 0.36, 1] })}
                onClick={() => isActive ? onSelectDocument(item, tray.id) : setActiveIndex(documentIndex)}
                onDragStartCapture={(event: DragEvent<HTMLDivElement>) => {
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData(documentDragType, JSON.stringify({ documentId: item.id, sourceTrayId: tray.id }))
                  event.dataTransfer.setData("text/plain", item.name)
                }}
              >
                {isActive ? (
                  <motion.div
                    layoutId={sharedLayoutEnabled ? `paper-document-${item.id}` : undefined}
                    className="md-paper-wheel-preview"
                    transition={reduceMotion(Boolean(shouldReduceMotion), { duration: 0.46, ease: [0.16, 1, 0.3, 1] })}
                  >
                    <div className="md-paper-wheel-preview__header">
                      <span className="md-paper-wheel-preview__icon"><DocumentTypeIcon item={item} /></span>
                      <strong data-i18n-skip dir="ltr">{item.name}</strong>
                      <span data-i18n-skip dir="ltr">{item.reference}</span>
                    </div>
                    <MiniDocumentPreview item={item} />
                    <span className="md-paper-wheel-preview__open">{t("Open full document")}</span>
                  </motion.div>
                ) : (
                  <PaperDocumentFace item={item} compact />
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
        <span className="md-paper-wheel__focus-line md-paper-wheel__focus-line--top" aria-hidden="true" />
        <span className="md-paper-wheel__focus-line md-paper-wheel__focus-line--bottom" aria-hidden="true" />
      </div>

      <div className="md-paper-wheel-controls">
        <button type="button" aria-label={t("Previous document")} disabled={!canMoveUp} onClick={() => moveFocus(-1)}>
          <ChevronUp strokeWidth={1.25} />
        </button>
        <span data-i18n-skip>{activeIndex + 1} / {tray.documents.length}</span>
        <button type="button" aria-label={t("Next document")} disabled={!canMoveDown} onClick={() => moveFocus(1)}>
          <ChevronDown strokeWidth={1.25} />
        </button>
      </div>
      <span className="sr-only">{onMoveDocument ? t("Documents can also be dragged between shelves") : null}</span>
    </div>
  )
}

function ExpandedPaperTray({
  tray,
  onClose,
  onSelectDocument,
  onFilesAdded,
}: {
  tray: PaperTray
  onClose: () => void
  onSelectDocument: (document: TrayDocument, trayId: string) => void
  onFilesAdded?: (trayId: string, files: File[]) => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = window.document.activeElement as HTMLElement | null
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus())

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
      if (event.key !== "Tab") return

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && window.document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && window.document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("keydown", handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [onClose])

  return (
    <motion.div
      className="md-paper-full-tray-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduceMotion(Boolean(shouldReduceMotion), { duration: 0.24, ease: [0.16, 1, 0.3, 1] })}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${t("Full tray")}: ${t(tray.name)}`}
        className="md-paper-full-tray"
        style={{ "--md-tray-color": tray.color ?? "#0e7d74" } as CSSProperties}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
        transition={reduceMotion(Boolean(shouldReduceMotion), { duration: 0.18, ease: [0.22, 1, 0.36, 1] })}
      >
        <header className="md-paper-full-tray__header">
          <div className="min-w-0">
            <span>{t("Full tray")}</span>
            <h2>{t(tray.name)}</h2>
            <p>{tray.documents.length} {t(tray.documents.length === 1 ? "document" : "documents")}</p>
          </div>
          <div className="md-paper-full-tray__header-actions">
            {onFilesAdded ? (
              <TrayFileButton trayId={tray.id} className="md-paper-full-tray__add" onFilesAdded={onFilesAdded} />
            ) : null}
            <button ref={closeRef} type="button" className="md-paper-full-tray__close" aria-label={t("Close full tray")} onClick={onClose}>
              <X strokeWidth={1.25} />
            </button>
          </div>
        </header>

        {tray.documents.length > 0 ? (
          <div className="md-paper-full-tray__grid">
            {tray.documents.map((item, index) => (
              <motion.button
                key={item.id}
                type="button"
                className="md-paper-full-tray__document"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16, delay: Math.min(index * 0.012, 0.06), ease: [0.22, 1, 0.36, 1] }}
                onClick={() => onSelectDocument(item, tray.id)}
              >
                <div className="md-paper-full-tray__preview">
                  <MiniDocumentPreview item={item} />
                </div>
                <div className="md-paper-full-tray__document-copy">
                  <strong data-i18n-skip dir="ltr">{item.name}</strong>
                  <span data-i18n-skip dir="ltr">{item.reference}</span>
                  <p data-i18n-skip>{item.customer}</p>
                </div>
                <span className="md-paper-full-tray__open">{t("Open")}</span>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="md-paper-full-tray__empty">
            <Upload className="size-5" strokeWidth={1.2} />
            <strong>{t("This tray is empty")}</strong>
            <span>{t("Add a PDF or image to start this tray.")}</span>
          </div>
        )}
      </motion.section>
    </motion.div>
  )
}

export function PaperTrayStack({
  trays,
  selectedDocumentId,
  mobileTrayId = trays[0]?.id,
  className,
  onMobileTrayChange,
  onSelectDocument,
  onFilesAdded,
  onMoveDocument,
  getShipmentForDocument,
}: PaperTrayStackProps) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [expandedTrayId, setExpandedTrayId] = useState<string | null>(null)
  const expandedTray = trays.find((tray) => tray.id === expandedTrayId) ?? null

  function handleDrop(event: DragEvent<HTMLElement>, trayId: string) {
    event.preventDefault()
    setDropTargetId(null)

    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) {
      onFilesAdded?.(trayId, files)
      return
    }

    const dragged = parseDraggedDocument(event)
    if (dragged && dragged.sourceTrayId !== trayId) {
      onMoveDocument?.(dragged.documentId, dragged.sourceTrayId, trayId)
    }
  }

  return (
    <div className={cn("md-paper-tray-component", className)}>
      <div className="md-paper-tray-mobile-switcher" aria-label={t("Choose tray")}>
        {trays.map((tray) => (
          <button
            key={tray.id}
            type="button"
            aria-pressed={mobileTrayId === tray.id}
            onClick={() => onMobileTrayChange?.(tray.id)}
          >
            <span>{t(tray.name)}</span>
            <span>{tray.documents.length}</span>
          </button>
        ))}
      </div>

      <motion.div
        className="md-paper-tray-shell"
        data-reading={selectedDocumentId ? "true" : undefined}
        style={{ "--md-paper-tray-count": trays.length } as CSSProperties}
        animate={shouldReduceMotion ? undefined : selectedDocumentId ? { scale: 0.975, y: 5 } : { scale: 1, y: 0 }}
        transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.layout)}
      >
        <div className="md-paper-tray-slots">
          {trays.map((tray, trayIndex) => {
            const isDropTarget = dropTargetId === tray.id
            const isMobileActive = tray.id === mobileTrayId

            return (
              <motion.section
                layout
                key={tray.id}
                className="md-paper-tray-slot"
                style={{ "--md-tray-color": tray.color ?? "#0e7d74" } as CSSProperties}
                data-drop-target={isDropTarget ? "true" : undefined}
                data-mobile-active={isMobileActive ? "true" : "false"}
                aria-label={`${t(tray.name)}, ${tray.documents.length} ${t("documents")}`}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setDropTargetId(tray.id)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = event.dataTransfer.files.length > 0 ? "copy" : "move"
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetId(null)
                }}
                onDrop={(event) => handleDrop(event, tray.id)}
              >
                <div className="md-paper-tray-slot__header">
                  <div className="min-w-0">
                    <p>{t(tray.name)}</p>
                    <span>{tray.documents.length} {t(tray.documents.length === 1 ? "document" : "documents")}</span>
                  </div>
                </div>

                <motion.div layoutId={`paper-tray-${tray.id}`} className="md-paper-tray-slot__well">
                  <PaperShelfDocumentWheel
                    tray={tray}
                    selectedDocumentId={selectedDocumentId}
                    sharedLayoutEnabled={!expandedTray}
                    onSelectDocument={onSelectDocument}
                    onMoveDocument={onMoveDocument}
                    getShipmentForDocument={getShipmentForDocument}
                  />

                  <span className="md-paper-tray-slot__shelf" aria-hidden="true" />
                  <span className="md-paper-tray-slot__lip" aria-hidden="true" />
                </motion.div>

                <div className="md-paper-tray-slot__actions">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label={t("See full tray")} onClick={() => setExpandedTrayId(tray.id)}>
                        <Expand className="size-3.5" strokeWidth={1.25} />
                        <span>{t("See full tray")}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">{t("See full tray")}</TooltipContent>
                  </Tooltip>
                  {onFilesAdded ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span><TrayFileButton trayId={tray.id} className="md-paper-tray-slot__add-document" onFilesAdded={onFilesAdded} /></span>
                      </TooltipTrigger>
                      <TooltipContent side="left">{t("Add document to this tray")}</TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>

                <AnimatePresence>
                  {isDropTarget ? (
                    <motion.div
                      className="md-paper-tray-drop-label"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                    >
                      <FolderInput className="size-4" strokeWidth={1.2} />
                      <span>{t("Place in this tray")}</span>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <span className="sr-only">{t("Tray")} {trayIndex + 1}</span>
              </motion.section>
            )
          })}
        </div>

      </motion.div>

      <AnimatePresence>
        {expandedTray ? (
          <ExpandedPaperTray
            key={expandedTray.id}
            tray={expandedTray}
            onClose={() => setExpandedTrayId(null)}
            onSelectDocument={(document, trayId) => {
              setExpandedTrayId(null)
              onSelectDocument(document, trayId)
            }}
            onFilesAdded={onFilesAdded}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function SampleDocumentContent({ item }: { item: TrayDocument }) {
  if (item.sampleType === "inspection") {
    return (
      <div className="md-paper-sample md-paper-sample--inspection">
        <div className="md-paper-sample__photo">
          <span className="md-paper-sample__container" aria-hidden="true" />
          <span className="md-paper-sample__seal" aria-hidden="true" />
          <ImageIcon className="size-5" strokeWidth={1.1} />
        </div>
        <div className="md-paper-sample__photo-copy">
          <p>Container seal inspection</p>
          <span data-i18n-skip dir="ltr">{item.reference}</span>
        </div>
      </div>
    )
  }

  const titleByType: Partial<Record<NonNullable<TrayDocument["sampleType"]>, string>> = {
    invoice: "Commercial invoice",
    "packing-list": "Packing list",
    arrival: "Arrival notice",
    certificate: "Certificate of origin",
    "bill-of-lading": "Bill of lading",
    customs: "Customs entry",
    "delivery-order": "Delivery order",
    release: "Customs clearance release",
  }

  return (
    <article className="md-paper-sample">
      <header className="md-paper-sample__header">
        <div>
          <span className="md-paper-sample__logo-mark">M</span>
          <span className="md-paper-sample__logo-copy">MULTIDECK</span>
        </div>
        <div className="text-end">
          <p>{titleByType[item.sampleType ?? "invoice"] ?? "Freight document"}</p>
          <span data-i18n-skip dir="ltr">{item.reference}</span>
        </div>
      </header>
      <div className="md-paper-sample__recipient">
        <span>Customer</span>
        <strong data-i18n-skip>{item.customer}</strong>
      </div>
      <div className="md-paper-sample__facts">
        <div><span>Booking</span><strong data-i18n-skip dir="ltr">MD-22455</strong></div>
        <div><span>Origin</span><strong>Shanghai, CN</strong></div>
        <div><span>Destination</span><strong>Felixstowe, GB</strong></div>
      </div>
      <div className="md-paper-sample__table">
        <div className="md-paper-sample__table-head"><span>Description</span><span>Quantity</span><span>Weight</span><span>Value</span></div>
        <div><span>Garment cartons</span><span>184</span><span>3,420 kg</span><span>£42,860</span></div>
        <div><span>Accessories</span><span>36</span><span>680 kg</span><span>£8,240</span></div>
        <div><span>Packaging materials</span><span>12</span><span>92 kg</span><span>£1,180</span></div>
      </div>
      <div className="md-paper-sample__totals">
        <span>Total declared value</span>
        <strong>£52,280.00</strong>
      </div>
      <footer className="md-paper-sample__footer">
        <span>Prepared in Multideck</span>
        <span data-i18n-skip dir="ltr">northwind-fwd.com</span>
      </footer>
    </article>
  )
}

type DocumentViewerProps = {
  item: TrayDocument | null
  trays: PaperTray[]
  currentTrayId?: string | null
  onClose: () => void
  onMove: (destinationTrayId: string) => void
  onRemove: () => void
  onDownload: () => void
}

export function DocumentViewer({ item, trays, currentTrayId, onClose, onMove, onRemove, onDownload }: DocumentViewerProps) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const rootRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false)

  useEffect(() => {
    if (!item) return undefined
    previousFocusRef.current = window.document.activeElement as HTMLElement | null
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus())

    function handleFullscreenChange() {
      setIsFullscreen(window.document.fullscreenElement === rootRef.current)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (window.document.fullscreenElement) {
        void window.document.exitFullscreen()
        return
      }
      if (fallbackFullscreen) {
        setFallbackFullscreen(false)
        return
      }
      onClose()
    }

    window.document.addEventListener("fullscreenchange", handleFullscreenChange)
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.cancelAnimationFrame(frame)
      window.document.removeEventListener("fullscreenchange", handleFullscreenChange)
      window.removeEventListener("keydown", handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [fallbackFullscreen, item, onClose])

  async function toggleFullscreen() {
    if (window.document.fullscreenElement) {
      await window.document.exitFullscreen()
      return
    }

    if (rootRef.current?.requestFullscreen) {
      try {
        await rootRef.current.requestFullscreen()
        return
      } catch {
        setFallbackFullscreen(true)
        return
      }
    }

    setFallbackFullscreen((value) => !value)
  }

  return (
    <AnimatePresence>
      {item ? (
        <motion.div
          className="md-document-viewer-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion(Boolean(shouldReduceMotion), { duration: 0.28, ease: [0.16, 1, 0.3, 1] })}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          <motion.section
            layoutId={`paper-document-${item.id}`}
            ref={rootRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${t("Document preview")}: ${item.name}`}
            className="md-document-viewer"
            data-fullscreen={isFullscreen || fallbackFullscreen ? "true" : undefined}
            initial={shouldReduceMotion ? false : { opacity: 0.92 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0.92 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), { duration: 0.46, ease: [0.16, 1, 0.3, 1] })}
          >
            <motion.header
              className="md-document-viewer__toolbar"
              initial={shouldReduceMotion ? false : { opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.24, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="md-document-viewer__identity">
                <span className="md-document-viewer__icon"><DocumentTypeIcon item={item} /></span>
                <div className="min-w-0">
                  <h2 data-i18n-skip dir="ltr">{item.name}</h2>
                  <p><span data-i18n-skip dir="ltr">{item.reference}</span> · {item.sizeLabel} · {t(item.addedAt)}</p>
                </div>
              </div>

              <div className="md-document-viewer__actions">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label={t("Download document")} onClick={onDownload}>
                      <Download strokeWidth={1.25} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("Download")}</TooltipContent>
                </Tooltip>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" className="hidden px-3 sm:inline-flex">
                      <FolderInput data-icon="inline-start" strokeWidth={1.2} />
                      {t("Move")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[220px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] p-1.5 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                    <DropdownMenuLabel className="px-2 py-1.5 text-[11px] text-[var(--md-subtle)]">{t("Move to tray")}</DropdownMenuLabel>
                    {trays.map((tray) => (
                      <DropdownMenuItem
                        key={tray.id}
                        disabled={tray.id === currentTrayId}
                        className="h-9 rounded-[var(--md-radius-md)] px-2 text-[12px] focus:bg-[var(--md-hover)]"
                        onSelect={() => onMove(tray.id)}
                      >
                        <span className="size-2 rounded-full bg-[var(--md-accent)]/55" />
                        {t(tray.name)}
                        <span className="ms-auto text-[11px] text-[var(--md-subtle)]">{tray.documents.length}</span>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator className="bg-[var(--md-line)]" />
                    <DropdownMenuItem variant="destructive" className="h-9 rounded-[var(--md-radius-md)] px-2 text-[12px]" onSelect={onRemove}>
                      <Trash2 strokeWidth={1.2} />
                      {t("Remove document")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label={t("Show full screen")} onClick={() => void toggleFullscreen()}>
                      {isFullscreen || fallbackFullscreen ? <Expand strokeWidth={1.25} /> : <Maximize2 strokeWidth={1.25} />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isFullscreen || fallbackFullscreen ? t("Exit full screen") : t("Full screen")}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button ref={closeRef} type="button" variant="ghost" size="icon" aria-label={t("Close document")} onClick={onClose}>
                      <X strokeWidth={1.25} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("Close")}</TooltipContent>
                </Tooltip>
              </div>
            </motion.header>

            <motion.div
              className="md-document-viewer__canvas"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.992 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.996 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.28, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              {item.kind === "image" && item.url ? (
                <img src={item.url} alt={item.name} className="md-document-viewer__image" data-i18n-skip />
              ) : item.kind === "pdf" && item.url ? (
                <iframe
                  title={item.name}
                  src={`${item.url}#toolbar=0&navpanes=0&view=FitH`}
                  className="md-document-viewer__pdf"
                  data-i18n-skip
                />
              ) : (
                <SampleDocumentContent item={item} />
              )}
            </motion.div>

            <motion.footer
              className="md-document-viewer__footer"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <span>{t("Previewing from")}</span>
              <strong>{t(trays.find((tray) => tray.id === currentTrayId)?.name ?? "Paper tray")}</strong>
              <span className="ms-auto">{t("Press Esc to return")}</span>
            </motion.footer>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
