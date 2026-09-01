import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertCircle, Camera, Check, FileImage, ImageUp, Pencil, RotateCcw, TicketCheck, Trash2, Upload, X } from "@/components/icons/hugeicons"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ImageLightbox, type ImageLightboxControls } from "@/components/multideck/image-lightbox"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import type { AuthUserSummary } from "@/lib/auth-user"
import { createSupportTicket, SupportTicketError, type CreateSupportTicketResponse, type SupportTicketImpact, type SupportTicketType } from "@/lib/support-ticket"
import { cn } from "@/lib/utils"

export const SUPPORT_TICKET_OPEN_EVENT = "multideck:open-support-ticket"
export function openSupportTicket() { window.dispatchEvent(new Event(SUPPORT_TICKET_OPEN_EVENT)) }

type Draft = { ticketType: SupportTicketType; impact: SupportTicketImpact; title: string; description: string; actualBehaviour: string; desiredOutcome: string }
type ValidatedField = "title" | "description" | "actualBehaviour" | "desiredOutcome"
type FieldErrors = Partial<Record<ValidatedField, string>>
type EditorTool = "crop" | "highlight"
const emptyDraft: Draft = { ticketType: "bug", impact: "slowed_down", title: "", description: "", actualBehaviour: "", desiredOutcome: "" }
const typeLabels: Record<SupportTicketType, string> = { bug: "Bug", feature_request: "Feature request", question: "Question", account_billing: "Account & billing", security_concern: "Security concern" }
const impactLabels: Record<SupportTicketImpact, string> = { blocked: "I’m blocked", slowed_down: "This is slowing me down", no_immediate_blocker: "No immediate blocker" }
const impactTones: Record<SupportTicketImpact, { background: string; ink: string; indicator: string }> = {
  blocked: { background: "--md-status-red-bg", ink: "--md-status-red-ink", indicator: "--md-red" },
  slowed_down: { background: "--md-status-amber-bg", ink: "--md-status-amber-ink", indicator: "--md-amber" },
  no_immediate_blocker: { background: "--md-status-green-bg", ink: "--md-status-green-ink", indicator: "--md-green" },
}
const ticketTypes = Object.keys(typeLabels) as SupportTicketType[]
const impactOptions: SupportTicketImpact[] = ["no_immediate_blocker", "slowed_down", "blocked"]
const draftStorageKey = "multideck.support-ticket.draft.v2"
const allowedAttachmentTypes = new Set(["image/png", "image/jpeg", "image/webp"])
const maximumAttachmentCount = 5
const maximumAttachmentBytes = 10 * 1024 * 1024
const maximumAttachmentTotalBytes = 25 * 1024 * 1024
const fieldIds: Record<ValidatedField, string> = {
  title: "support-ticket-title",
  description: "support-ticket-description",
  actualBehaviour: "support-ticket-actual",
  desiredOutcome: "support-ticket-outcome",
}

function readDraft() {
  try {
    const value = JSON.parse(window.localStorage.getItem(draftStorageKey) || "null") as (Partial<Draft> & { expectedBehaviour?: unknown }) | null
    if (!value) return emptyDraft
    const cleaned = { ...value }
    delete cleaned.expectedBehaviour
    return { ...emptyDraft, ...cleaned }
  } catch { return emptyDraft }
}
function browserName() { const source = navigator.userAgent; return source.includes("Edg/") ? "Microsoft Edge" : source.includes("Chrome/") ? "Chrome" : source.includes("Firefox/") ? "Firefox" : source.includes("Safari/") ? "Safari" : "Browser" }
function operatingSystem() { const source = navigator.userAgent; return source.includes("Mac OS") ? "macOS" : source.includes("Windows") ? "Windows" : source.includes("Android") ? "Android" : /iPhone|iPad/.test(source) ? "iOS" : "Other" }
function isDirty(draft: Draft, files: File[]) { return Boolean(draft.title || draft.description || draft.actualBehaviour || draft.desiredOutcome || files.length) }
function fileKey(file: File) { return `${file.name}-${file.size}-${file.lastModified}` }

function useAttachmentPreviewUrls(files: File[]) {
  const urlsRef = useRef(new Map<File, string>())
  const [urls, setUrls] = useState(new Map<File, string>())

  useEffect(() => {
    const nextUrls = new Map<File, string>()
    files.forEach((file) => nextUrls.set(file, urlsRef.current.get(file) ?? URL.createObjectURL(file)))
    urlsRef.current.forEach((url, file) => { if (!nextUrls.has(file)) URL.revokeObjectURL(url) })
    urlsRef.current = nextUrls
    setUrls(new Map(nextUrls))
  }, [files])

  useEffect(() => () => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    urlsRef.current.clear()
  }, [])

  return urls
}

function useCompactViewport() {
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 639px)").matches)
  useEffect(() => { const query = window.matchMedia("(max-width: 639px)"); const update = () => setCompact(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update) }, [])
  return compact
}

function ImpactPillSelector({ value, onChange, labels, ariaLabel }: { value: SupportTicketImpact; onChange: (value: SupportTicketImpact) => void; labels: Record<SupportTicketImpact, string>; ariaLabel: string }) {
  const shouldReduceMotion = useReducedMotion()

  function moveSelection(event: ReactKeyboardEvent<HTMLButtonElement>, current: SupportTicketImpact) {
    const isArrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    if (!isArrow && event.key !== "Home" && event.key !== "End") return
    event.preventDefault()
    const currentIndex = Math.max(impactOptions.indexOf(current), 0)
    const isRtl = window.getComputedStyle(event.currentTarget).direction === "rtl"
    const horizontalStep = event.key === "ArrowRight" ? (isRtl ? -1 : 1) : event.key === "ArrowLeft" ? (isRtl ? 1 : -1) : 0
    const verticalStep = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? impactOptions.length - 1
        : (currentIndex + horizontalStep + verticalStep + impactOptions.length) % impactOptions.length
    onChange(impactOptions[nextIndex])
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[nextIndex]?.focus()
  }

  return <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-2">
    {impactOptions.map((option) => {
      const selected = value === option
      const tone = impactTones[option]
      return <motion.button
        key={option}
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={selected ? 0 : -1}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
        onClick={() => onChange(option)}
        onKeyDown={(event) => moveSelection(event, option)}
        className={cn(
          "flex min-h-11 min-w-0 items-center gap-2 rounded-full bg-[var(--md-surface)] px-3 py-2 text-[12px] font-medium leading-4 text-[var(--md-text)] shadow-[var(--md-shadow-line)] outline-none transition-[background-color,color,box-shadow,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] motion-reduce:transition-none",
          selected && "hover:bg-[var(--impact-background)]",
        )}
        style={selected ? {
          "--impact-background": `var(${tone.background})`,
          backgroundColor: `var(${tone.background})`,
          color: `var(${tone.ink})`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(${tone.ink}) 18%, transparent), var(--md-shadow-line)`,
        } as CSSProperties : undefined}
      >
        <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
          <span className="size-2.5 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.36)]" style={{ backgroundColor: `var(${tone.indicator})` }} />
        </span>
        <span className="min-w-0 flex-1 text-center text-pretty">{labels[option]}</span>
        <span aria-hidden="true" className="relative grid size-4 shrink-0 place-items-center">
          <AnimatePresence initial={false}>
            {selected ? <motion.span
              key={`${option}-selected`}
              className="absolute inset-0 grid place-items-center"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.25, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.25, filter: "blur(4px)" }}
              transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }}
            ><Check className="size-4" /></motion.span> : null}
          </AnimatePresence>
        </span>
      </motion.button>
    })}
  </div>
}

export function ScreenshotCaptureEditor({ file, onChange, onCancel }: { file: File; onChange: (file: File) => void; onCancel: () => void }) {
  const { t } = useLanguage()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<EditorTool>("highlight")
  const [history, setHistory] = useState<string[]>([])
  const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const image = new Image(); const url = URL.createObjectURL(file)
    image.onload = () => { const scale = Math.min(1, 1600 / image.width, 1000 / image.height); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url); setHistory([]); setSelection(null) }
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  function point(event: ReactPointerEvent<HTMLCanvasElement>) { const canvas = event.currentTarget; const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height } }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) { event.currentTarget.setPointerCapture(event.pointerId); startRef.current = point(event); setSelection(null) }
  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) { if (!startRef.current) return; const next = point(event); setSelection({ x: Math.min(startRef.current.x, next.x), y: Math.min(startRef.current.y, next.y), width: Math.abs(next.x - startRef.current.x), height: Math.abs(next.y - startRef.current.y) }) }
  function pointerUp() { startRef.current = null }
  function keyboardSelect(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current; if (!canvas) return
    if ((event.key === "Enter" || event.key === " ") && !selection) { event.preventDefault(); setSelection({ x: canvas.width * 0.25, y: canvas.height * 0.25, width: canvas.width * 0.5, height: canvas.height * 0.5 }); return }
    if (event.key === "Escape" && selection) { event.preventDefault(); setSelection(null); return }
    if (!selection || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return
    event.preventDefault()
    const stepX = Math.max(2, canvas.width / 100), stepY = Math.max(2, canvas.height / 100)
    setSelection((current) => {
      if (!current) return current
      if (event.shiftKey) return {
        ...current,
        width: Math.max(4, Math.min(canvas.width - current.x, current.width + (event.key === "ArrowRight" ? stepX : event.key === "ArrowLeft" ? -stepX : 0))),
        height: Math.max(4, Math.min(canvas.height - current.y, current.height + (event.key === "ArrowDown" ? stepY : event.key === "ArrowUp" ? -stepY : 0))),
      }
      return {
        ...current,
        x: Math.max(0, Math.min(canvas.width - current.width, current.x + (event.key === "ArrowRight" ? stepX : event.key === "ArrowLeft" ? -stepX : 0))),
        y: Math.max(0, Math.min(canvas.height - current.height, current.y + (event.key === "ArrowDown" ? stepY : event.key === "ArrowUp" ? -stepY : 0))),
      }
    })
  }
  function snapshot() { const canvas = canvasRef.current; if (canvas) setHistory((current) => [...current.slice(-7), canvas.toDataURL("image/png")]) }
  function applySelection() {
    const canvas = canvasRef.current, region = selection; if (!canvas || !region || region.width < 4 || region.height < 4) return
    const context = canvas.getContext("2d"); if (!context) return; snapshot()
    if (tool === "crop") { const pixels = context.getImageData(region.x, region.y, region.width, region.height); canvas.width = Math.round(region.width); canvas.height = Math.round(region.height); canvas.getContext("2d")?.putImageData(pixels, 0, 0) }
    else { context.save(); context.strokeStyle = "#d14e4e"; context.lineWidth = Math.max(3, canvas.width / 400); context.fillStyle = "rgba(209,78,78,0.10)"; context.fillRect(region.x, region.y, region.width, region.height); context.strokeRect(region.x, region.y, region.width, region.height); context.restore() }
    setSelection(null)
  }
  function undo() { const source = history.at(-1), canvas = canvasRef.current; if (!source || !canvas) return; const image = new Image(); image.onload = () => { canvas.width = image.width; canvas.height = image.height; canvas.getContext("2d")?.drawImage(image, 0, 0); setHistory((current) => current.slice(0, -1)); setSelection(null) }; image.src = source }
  function reset() { const canvas = canvasRef.current; if (!canvas) return; const image = new Image(); const url = URL.createObjectURL(file); image.onload = () => { const scale = Math.min(1, 1600 / image.width, 1000 / image.height); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url); setHistory([]); setSelection(null) }; image.onerror = () => URL.revokeObjectURL(url); image.src = url }
  function useScreenshot() { const canvas = canvasRef.current; if (!canvas) return; canvas.toBlob((blob) => { if (blob) onChange(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png", lastModified: Date.now() })) }, "image/png", 0.92) }
  return <div className="grid gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-2 shadow-[var(--md-shadow-line)]">
    <p id="screenshot-editor-instructions" className="sr-only">{t("Press Enter to create a selection. Use Arrow keys to move it, Shift and Arrow keys to resize it, and Escape to clear it.")}</p>
    <div className="relative overflow-hidden rounded-[calc(var(--md-radius-xl)-8px)] bg-[var(--md-bg)] outline outline-1 outline-black/10 dark:outline-white/10"><canvas ref={canvasRef} tabIndex={0} role="img" aria-label={t("Screenshot editing canvas")} aria-describedby="screenshot-editor-instructions" className="block max-h-[46vh] w-full touch-none object-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a24)]" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onKeyDown={keyboardSelect} />{selection ? <span aria-hidden="true" className="pointer-events-none absolute border-2 border-[var(--md-red)] bg-[rgba(209,78,78,0.08)]" style={{ left: `${selection.x / (canvasRef.current?.width || 1) * 100}%`, top: `${selection.y / (canvasRef.current?.height || 1) * 100}%`, width: `${selection.width / (canvasRef.current?.width || 1) * 100}%`, height: `${selection.height / (canvasRef.current?.height || 1) * 100}%` }} /> : null}</div>
    <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] text-[var(--md-subtle)]">{t("Drag over the area to edit")}</span>{(["crop","highlight"] as EditorTool[]).map((value) => <Button key={value} type="button" size="sm" variant={tool === value ? "default" : "outline"} onClick={() => setTool(value)}>{t(value === "crop" ? "Crop" : "Highlight")}</Button>)}<Button type="button" size="sm" variant="outline" disabled={!selection} onClick={applySelection}>{t("Apply")}</Button><Button type="button" size="sm" variant="ghost" disabled={!history.length} onClick={undo}><RotateCcw className="size-3.5" />{t("Undo")}</Button><Button type="button" size="sm" variant="ghost" onClick={reset}>{t("Reset")}</Button><span className="min-w-0 flex-1" /><Button type="button" size="sm" variant="ghost" onClick={onCancel}>{t("Cancel")}</Button><Button type="button" size="sm" onClick={useScreenshot}><Check className="size-3.5" />{t("Use screenshot")}</Button></div>
  </div>
}

export function SupportTicketDialog({ currentUser }: { currentUser?: AuthUserSummary | null }) {
  const { t } = useLanguage()
  const compact = useCompactViewport()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(readDraft)
  const [files, setFiles] = useState<File[]>([])
  const [editingFile, setEditingFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [result, setResult] = useState<CreateSupportTicketResponse | null>(null)
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const idempotencyRef = useRef(`multideck-support-${crypto.randomUUID()}`)
  const attachmentPreviewUrls = useAttachmentPreviewUrls(files)
  const companyName = currentUser?.organisations[0]?.name ?? t("Your Multideck workspace")
  const reporterName = currentUser?.name ?? currentUser?.email ?? t("Signed-in user")

  useEffect(() => {
    const handle = () => {
      setResult(null)
      setError(null)
      setFieldErrors({})
      setProgress("")
      setCloseConfirmationOpen(false)
      setOpen(true)
    }
    window.addEventListener(SUPPORT_TICKET_OPEN_EVENT, handle)
    return () => window.removeEventListener(SUPPORT_TICKET_OPEN_EVENT, handle)
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => { if (isDirty(draft, [])) window.localStorage.setItem(draftStorageKey, JSON.stringify(draft)); else window.localStorage.removeItem(draftStorageKey) }, 250); return () => window.clearTimeout(timer) }, [draft])
  useEffect(() => { if (!open) return; const paste = (event: ClipboardEvent) => { const image = [...event.clipboardData?.files ?? []].find((file) => file.type.startsWith("image/")); if (image) { event.preventDefault(); addFiles([image]) } }; window.addEventListener("paste", paste); return () => window.removeEventListener("paste", paste) }, [open, files]) // eslint-disable-line react-hooks/exhaustive-deps

  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setError(null)
    setResult(null)
    if (key in fieldIds) setFieldErrors((current) => ({ ...current, [key]: undefined }))
  }
  function selectTicketType(ticketType: SupportTicketType) {
    if (ticketType === draft.ticketType) return
    if (ticketType !== "bug" && files.length && !window.confirm(t("Changing the ticket type will remove attached screenshots. Continue?"))) return
    setDraft((current) => ({
      ...current,
      ticketType,
      actualBehaviour: ticketType === "bug" ? current.actualBehaviour : "",
      desiredOutcome: ticketType === "feature_request" ? current.desiredOutcome : "",
    }))
    if (ticketType !== "bug") { setFiles([]); setEditingFile(null) }
    setFieldErrors({}); setError(null); setResult(null)
  }
  function closeTicketRequest() { setCloseConfirmationOpen(false); setOpen(false); setEditingFile(null) }
  function requestClose(next: boolean) {
    if (next) { setOpen(true); return }
    if (submitting) return
    if (isDirty(draft, files) && !result) { setCloseConfirmationOpen(true); return }
    closeTicketRequest()
  }
  function addFiles(next: File[]) {
    if (next.some((file) => !allowedAttachmentTypes.has(file.type))) { setError(t("Attach PNG, JPEG, or WebP images only.")); return }
    if (next.some((file) => file.size > maximumAttachmentBytes)) { setError(t("Each screenshot must be 10 MB or smaller.")); return }
    const combined = [...files, ...next].filter((file, index, all) => all.findIndex((candidate) => fileKey(candidate) === fileKey(file)) === index)
    if (combined.length > maximumAttachmentCount) { setError(t("Attach no more than five screenshots.")); return }
    if (combined.reduce((total, file) => total + file.size, 0) > maximumAttachmentTotalBytes) { setError(t("Screenshots must be 25 MB or smaller in total.")); return }
    setFiles(combined); setError(null)
  }
  function fileChange(event: ChangeEvent<HTMLInputElement>) { addFiles([...event.target.files ?? []]); event.target.value = "" }
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); addFiles([...event.dataTransfer.files]) }
  async function captureScreenshot() {
    if (!navigator.mediaDevices?.getDisplayMedia) { fileInputRef.current?.click(); return }
    setProgress(t("Choose the tab, window, or screen to capture")); setError(null)
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const video = document.createElement("video"); video.srcObject = stream; video.muted = true; await video.play()
      surfaceRef.current?.style.setProperty("visibility", "hidden"); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext("2d")?.drawImage(video, 0, 0)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.92)); if (!blob) throw new Error("Screenshot capture failed.")
      const file = new File([blob], `multideck-screenshot-${new Date().toISOString().replaceAll(":", "-")}.png`, { type: "image/png" }); setEditingFile(file)
    } catch (captureError) { setError(t(captureError instanceof DOMException && captureError.name === "NotAllowedError" ? "Screen capture was cancelled. You can paste or upload an image instead." : "The screenshot could not be captured. You can paste or upload an image instead.")) }
    finally { surfaceRef.current?.style.removeProperty("visibility"); stream?.getTracks().forEach((track) => track.stop()); setProgress("") }
  }
  function validate() {
    const next: FieldErrors = {}
    if (draft.title.trim().length < 4) next.title = t("Add a short summary so support can recognise the issue.")
    if (draft.description.trim().length < 10) next.description = t("Add a little more detail so the team can act on the first reply.")
    if (draft.ticketType === "bug" && draft.actualBehaviour.trim().length < 3) next.actualBehaviour = t("Describe what happened instead.")
    if (draft.ticketType === "feature_request" && draft.desiredOutcome.trim().length < 3) next.desiredOutcome = t("Describe the outcome you would like.")
    return next
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    const invalid = validate()
    const firstInvalidField = (Object.keys(fieldIds) as ValidatedField[]).find((field) => invalid[field])
    if (firstInvalidField) {
      setFieldErrors(invalid)
      setError(null)
      window.requestAnimationFrame(() => document.getElementById(fieldIds[firstInvalidField])?.focus())
      return
    }
    setFieldErrors({})
    setSubmitting(true); setError(null); setResult(null)
    try {
      const response = await createSupportTicket({ idempotencyKey: idempotencyRef.current, ticketType: draft.ticketType, impact: draft.impact, title: draft.title.trim(), description: draft.description.trim(), expectedBehaviour: null, actualBehaviour: draft.ticketType === "bug" ? draft.actualBehaviour.trim() || null : null, desiredOutcome: draft.ticketType === "feature_request" ? draft.desiredOutcome.trim() || null : null, attachments: draft.ticketType === "bug" ? files : [], context: { route: `${window.location.pathname}${window.location.search}`, appVersion: import.meta.env.VITE_APP_VERSION ?? "local", browser: browserName(), browserVersion: navigator.userAgent.match(/(?:Chrome|Firefox|Version|Edg)\/([\d.]+)/)?.[1] ?? "Unknown", operatingSystem: operatingSystem(), locale: navigator.language, viewport: `${window.innerWidth}×${window.innerHeight}` }, onProgress: (state) => setProgress(t(state === "creating" ? "Creating secure ticket" : state === "preparing_attachments" ? "Preparing screenshots" : state === "uploading" ? "Uploading screenshots" : "Confirming ticket")) })
      setResult(response); setDraft(emptyDraft); setFiles([]); window.localStorage.removeItem(draftStorageKey); idempotencyRef.current = `multideck-support-${crypto.randomUUID()}`
    } catch (submitError) { setError(submitError instanceof SupportTicketError ? t(submitError.message) : t("Support is temporarily unavailable. Your ticket details are still here; try again.")) }
    finally { setSubmitting(false); setProgress("") }
  }

  const renderForm = (imageLightbox: ImageLightboxControls) => <div className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-6 sm:pb-6">
    {result ? <div className="grid min-h-[420px] place-items-center text-center" role="status" aria-live="polite"><div className="max-w-md"><span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--md-status-green-bg)] text-[var(--md-status-green-ink)] shadow-[var(--md-shadow-line)]"><Check className="size-7" /></span><h3 className="mt-5 text-[22px] font-medium tracking-[-0.02em] text-[var(--md-ink)]">{t("Ticket {reference} submitted").replace("{reference}", result.ticket.ticketNumber)}</h3><p className="mt-2 text-[13px] leading-6 text-[var(--md-text)]">{t("We’ve received your ticket. The support team can now review the full context and will reply by email.")}</p><div className="mt-6 flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => requestClose(false)}>{t("Done")}</Button>{result.ticket.statusUrl ? <Button asChild><a href={result.ticket.statusUrl} target="_blank" rel="noreferrer">{t("View status")}</a></Button> : null}</div></div></div> : <form ref={formRef} onSubmit={submit} aria-busy={submitting || undefined} className="grid gap-5 pt-2">
      <div className="grid gap-2 min-[440px]:grid-cols-2"><ContextFact label={t("Company")} value={companyName} /><ContextFact label={t("Reporter")} value={reporterName} /></div>
      <fieldset><legend className="text-[12px] font-medium text-[var(--md-ink)]">{t("What can we help with?")}</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">{ticketTypes.map((type, index) => <button key={type} type="button" aria-pressed={draft.ticketType === type} onClick={() => selectTicketType(type)} className={cn("flex min-h-[72px] min-w-0 flex-col items-center justify-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-3 py-2.5 text-center text-[11.5px] font-medium leading-4 text-[var(--md-text)] shadow-[var(--md-shadow-line)] outline-none transition-[background-color,color,scale] hover:bg-[var(--md-hover)] active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] motion-reduce:transition-none motion-reduce:active:scale-100", index === ticketTypes.length - 1 && "col-span-2 sm:col-span-1", draft.ticketType === type && "bg-[var(--md-selected-bg)] text-[var(--md-selected-text)] ring-1 ring-[var(--md-accent-a20)]")}>{type === "security_concern" ? <AlertCircle className="mb-1 size-4 shrink-0" /> : type === "bug" ? <TicketCheck className="mb-1 size-4 shrink-0" /> : <FileImage className="mb-1 size-4 shrink-0" />}<span className="min-w-0 text-balance">{t(typeLabels[type])}</span></button>)}</div></fieldset>
      {draft.ticketType === "security_concern" ? <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-status-amber-bg)] px-3 py-2.5 text-[12px] leading-5 text-[var(--md-status-amber-ink)]"><strong>{t("Keep secrets out of the ticket.")}</strong> {t("Do not include passwords, API keys, access tokens, or recovery codes.")}</div> : null}
      <Field label={t("Summary")} htmlFor="support-ticket-title" error={fieldErrors.title}><Input id="support-ticket-title" value={draft.title} maxLength={180} dir="auto" aria-invalid={Boolean(fieldErrors.title) || undefined} aria-describedby={fieldErrors.title ? "support-ticket-title-error" : undefined} onChange={(event) => change("title", event.target.value)} placeholder={t("A short description of the issue")} /></Field>
      <Field label={t("Description")} htmlFor="support-ticket-description" error={fieldErrors.description}><Textarea id="support-ticket-description" value={draft.description} maxLength={12000} dir="auto" aria-invalid={Boolean(fieldErrors.description) || undefined} aria-describedby={fieldErrors.description ? "support-ticket-description-error" : undefined} onChange={(event) => change("description", event.target.value)} className="min-h-28" placeholder={t("Tell us what you were trying to do and anything the team should know.")} /></Field>
      <fieldset className="grid gap-1.5"><legend className="w-full px-4 py-1.5 text-center text-[12px] font-medium text-balance text-[var(--md-ink)]">{t("What is the impact to you?")}</legend><ImpactPillSelector value={draft.impact} onChange={(value) => change("impact", value)} ariaLabel={t("Customer impact")} labels={{ blocked: t(impactLabels.blocked), slowed_down: t(impactLabels.slowed_down), no_immediate_blocker: t(impactLabels.no_immediate_blocker) }} /></fieldset>
      {draft.ticketType === "bug" ? <Field label={t("What happened")} htmlFor="support-ticket-actual" error={fieldErrors.actualBehaviour}><Textarea id="support-ticket-actual" value={draft.actualBehaviour} dir="auto" aria-invalid={Boolean(fieldErrors.actualBehaviour) || undefined} aria-describedby={fieldErrors.actualBehaviour ? "support-ticket-actual-error" : undefined} onChange={(event) => change("actualBehaviour", event.target.value)} className="min-h-24" /></Field> : null}
      {draft.ticketType === "feature_request" ? <Field label={t("What outcome would you like?")} htmlFor="support-ticket-outcome" error={fieldErrors.desiredOutcome}><Textarea id="support-ticket-outcome" value={draft.desiredOutcome} dir="auto" aria-invalid={Boolean(fieldErrors.desiredOutcome) || undefined} aria-describedby={fieldErrors.desiredOutcome ? "support-ticket-outcome-error" : undefined} onChange={(event) => change("desiredOutcome", event.target.value)} className="min-h-24" /></Field> : null}
      {draft.ticketType === "bug" ? <fieldset className="grid gap-1.5">
        <legend className="text-[12px] font-medium text-[var(--md-ink)]">{t("Screenshot (optional)")}</legend>
        <div onDragOver={(event) => event.preventDefault()} onDrop={drop} className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-2 shadow-[var(--md-shadow-line)]">
          <p className="mb-2 text-[11px] leading-5 text-[var(--md-subtle)]">{t("Your browser will ask what to share. Multideck captures one frame and stops sharing immediately.")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void captureScreenshot()}><Camera className="size-3.5" />{t("Capture screenshot")}</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="size-3.5" />{t("Upload")}</Button>
            <span className="text-[11px] text-[var(--md-subtle)]">{t("You can also paste or drop an image here")}</span>
            <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={t("Upload screenshots")} onChange={fileChange} />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[var(--md-subtle)]">{t("Up to five PNG, JPEG, or WebP images; 10 MB each and 25 MB total.")}</p>
          {files.length ? <div className="mt-3 flex flex-wrap gap-3" role="list" aria-label={t("Attached screenshots")}>
            {files.map((file) => {
              const key = fileKey(file)
              return <SupportTicketAttachmentPreview
                key={key}
                file={file}
                previewUrl={attachmentPreviewUrls.get(file)}
                layoutId={imageLightbox.layoutIdFor(key)}
                thumbnailRef={(node) => imageLightbox.registerTrigger(key, node)}
                onOpen={() => imageLightbox.open(key)}
                onEdit={() => setEditingFile(file)}
                onRemove={() => setFiles((current) => current.filter((candidate) => candidate !== file))}
              />
            })}
          </div> : null}
        </div>
      </fieldset> : null}
      <details className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 py-2.5 shadow-[var(--md-shadow-line)]"><summary className="cursor-pointer text-[12px] font-medium text-[var(--md-ink)]">{t("What we’ll share")}</summary><p className="mt-2 text-[11px] leading-5 text-[var(--md-subtle)]">{t("This diagnostic context helps the support team investigate without another round of questions.")}</p><dl className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3"><ContextMini label={t("Current page")} value={`${window.location.pathname}${window.location.search}`} /><ContextMini label={t("App version")} value={import.meta.env.VITE_APP_VERSION ?? "local"} /><ContextMini label={t("Browser")} value={browserName()} /><ContextMini label={t("Operating system")} value={operatingSystem()} /><ContextMini label={t("Locale")} value={navigator.language} /><ContextMini label={t("Viewport")} value={`${window.innerWidth}×${window.innerHeight}`} /></dl></details>
      {error ? <p role="alert" className="flex items-start gap-2 text-[12px] leading-5 text-[var(--md-red)]"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</p> : <p role="status" aria-live="polite" className="text-[12px] text-[var(--md-subtle)]">{progress || t("Your draft text is saved on this device until the ticket is confirmed.")}</p>}
    </form>}
    {editingFile ? <div className="absolute inset-0 z-20 overflow-y-auto bg-[var(--md-surface)] p-3 sm:p-5"><ScreenshotCaptureEditor file={editingFile} onChange={(next) => { setFiles((current) => current.includes(editingFile) ? current.map((candidate) => candidate === editingFile ? next : candidate) : [...current, next]); setEditingFile(null) }} onCancel={() => setEditingFile(null)} /></div> : null}
  </div>{!result && !editingFile ? <footer className="sticky bottom-0 grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2 bg-[var(--md-surface-soft)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--md-stroke-top)] [&>button]:w-full sm:flex sm:flex-wrap sm:justify-end sm:px-6 sm:[&>button]:w-auto"><Button type="button" variant="ghost" disabled={submitting} onClick={() => requestClose(false)}>{t("Cancel")}</Button><Button type="button" disabled={submitting} onClick={() => formRef.current?.requestSubmit()}>{submitting ? <ImageUp className="size-3.5 animate-pulse motion-reduce:animate-none" /> : <TicketCheck className="size-3.5" />}{progress || t("Send ticket")}</Button></footer> : null}</div>

  const header = <><DialogHeader className="px-4 pe-14 pt-4 sm:px-6 sm:pe-16 sm:pt-5"><DialogTitle className="text-[18px] font-medium text-[var(--md-ink)]">{t("Submit a ticket")}</DialogTitle><DialogDescription className="max-w-[58ch] text-[12px] leading-5 text-[var(--md-text)]">{t("Give the support team enough context to act on the first reply.")}</DialogDescription></DialogHeader></>
  const sheetHeader = <SheetHeader className="px-4 pe-14 pb-2 pt-4"><SheetTitle className="text-[18px]">{t("Submit a ticket")}</SheetTitle><SheetDescription className="text-[12px] leading-5">{t("Give the support team enough context to act on the first reply.")}</SheetDescription></SheetHeader>
  const lightboxItems = files.flatMap((file) => {
    const src = attachmentPreviewUrls.get(file)
    return src ? [{ id: fileKey(file), src, alt: file.name }] : []
  })
  return <ImageLightbox
    items={lightboxItems}
    labels={{
      title: t("Screenshot preview"),
      close: t("Close screenshot preview"),
      previous: t("Previous screenshot"),
      next: t("Next screenshot"),
      position: (position, total) => t("Screenshot {position} of {total}").replace("{position}", String(position)).replace("{total}", String(total)),
      instructions: t("Use the Left and Right Arrow keys to move between screenshots."),
    }}
  >
    {(imageLightbox) => <>
      {compact ? <Sheet open={open} onOpenChange={requestClose}><SheetContent ref={surfaceRef} side="bottom" className="h-[min(94dvh,900px)] max-h-[calc(100dvh-env(safe-area-inset-top))] rounded-t-[var(--md-radius-2xl)] border-0 bg-[var(--md-surface)] p-0 shadow-[var(--md-shadow-lift)]" showCloseButton={!submitting} closeLabel={t("Close")}>{sheetHeader}{renderForm(imageLightbox)}</SheetContent></Sheet> : <Dialog open={open} onOpenChange={requestClose}><DialogContent ref={surfaceRef} className="h-[min(88dvh,820px)] gap-0 overflow-hidden rounded-[var(--md-radius-2xl)] border-0 bg-[var(--md-surface)] p-0 shadow-[var(--md-shadow-lift)] sm:max-w-[760px]" showCloseButton={!submitting} closeLabel={t("Close")}>{header}{renderForm(imageLightbox)}</DialogContent></Dialog>}
      <Dialog open={closeConfirmationOpen} onOpenChange={setCloseConfirmationOpen}>
        <DialogContent className="gap-0 overflow-hidden rounded-[var(--md-radius-2xl)] border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[440px]" closeLabel={t("Keep editing")}>
          <DialogHeader className="gap-2 px-5 pb-5 pe-14 pt-5 text-start sm:px-6 sm:pb-6 sm:pe-16 sm:pt-6">
            <DialogTitle className="text-[18px] leading-[1.25]">{t("Close this ticket request?")}</DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">{t("Your written draft will be here next time. Screenshots are kept only for this session.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="m-0 rounded-b-[var(--md-radius-2xl)] px-5 py-4 sm:px-6">
            <Button type="button" variant="ghost" onClick={closeTicketRequest}>{t("Close request")}</Button>
            <Button type="button" onClick={() => setCloseConfirmationOpen(false)}>{t("Keep editing")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>}
  </ImageLightbox>
}

function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode }) { return <label htmlFor={htmlFor} className="grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">{label}{children}{error ? <span id={`${htmlFor}-error`} className="text-[11px] font-normal leading-4 text-[var(--md-red)]">{error}</span> : null}</label> }
function ContextFact({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 py-2.5 shadow-[var(--md-shadow-line)]"><p className="text-[11px] text-[var(--md-subtle)]">{label}</p><p className="mt-0.5 break-words text-[12px] font-medium leading-4 text-[var(--md-ink)]" data-i18n-skip dir="auto">{value}</p></div> }
function ContextMini({ label, value }: { label: string; value: string }) { return <div><dt className="text-[var(--md-subtle)]">{label}</dt><dd className="mt-0.5 truncate text-[var(--md-text)]" data-i18n-skip dir="auto">{value}</dd></div> }

export function SupportTicketAttachmentPreview({ file, onOpen, onEdit, onRemove, previewUrl, layoutId, thumbnailRef }: {
  file: File
  onOpen: () => void
  onEdit: () => void
  onRemove: () => void
  previewUrl?: string
  layoutId?: string
  thumbnailRef?: (node: HTMLButtonElement | null) => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  useEffect(() => {
    if (previewUrl) {
      setObjectUrl(null)
      return
    }
    const nextObjectUrl = URL.createObjectURL(file)
    setObjectUrl(nextObjectUrl)
    return () => URL.revokeObjectURL(nextObjectUrl)
  }, [file, previewUrl])
  const url = previewUrl ?? objectUrl ?? ""
  const previewClassName = "size-full rounded-[var(--md-radius-lg)] object-cover"
  return <div role="listitem" className="grid w-20 gap-1.5">
    <motion.button
      ref={thumbnailRef}
      type="button"
      layoutId={layoutId}
      aria-label={`${t("Open screenshot preview")}: ${file.name}`}
      title={t("Open screenshot preview")}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
      transition={shouldReduceMotion ? { duration: 0 } : { layout: { type: "spring", duration: 0.28, bounce: 0 }, scale: { duration: 0.12 } }}
      onClick={onOpen}
      className="size-20 overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] outline-none ring-offset-2 ring-offset-[var(--md-surface-soft)] hover:ring-1 hover:ring-[var(--md-accent-a20)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]"
    >
      {url ? <img src={url} alt="" className={previewClassName} /> : <span aria-hidden="true" className={cn("block", previewClassName, "bg-[var(--md-surface-tint)]")} />}
    </motion.button>
    <div className="grid grid-cols-2 gap-1">
      <Button type="button" variant="ghost" size="icon-lg" aria-label={t("Edit screenshot")} title={t("Edit screenshot")} onClick={onEdit} className="rounded-[var(--md-radius-md)]"><Pencil className="size-3.5" /></Button>
      <Button type="button" variant="ghost" size="icon-lg" aria-label={t("Remove screenshot")} title={t("Remove screenshot")} onClick={onRemove} className="rounded-[var(--md-radius-md)] text-[var(--md-red)] hover:bg-[var(--md-status-red-bg)] hover:text-[var(--md-status-red-ink)]"><Trash2 className="size-3.5" /></Button>
    </div>
  </div>
}
