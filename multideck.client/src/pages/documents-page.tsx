import { defaultPaginationPageSize } from "@/lib/pagination"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  AiBrain,
  ArrowLeft,
  Copy,
  Download,
  FilePenLine,
  FilePlus2,
  FileText,
  FileUp,
  LoaderCircle,
  Mail,
  Paperclip,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { useLanguage } from "@/i18n/language-provider"
import {
  bootstrapDocumentStudioTemplate,
  getDocumentBuilderWorkspace,
  getGeneratedDocumentsPage,
  getDocumentStudioComponent,
  getDocumentStudioSession,
  getGeneratedDocumentDownload,
  renderDocument,
  renderDocumentStudioPreview,
  saveDocumentStudioTemplate,
  type DocumentBuilderWorkspace,
  type DocumentContentSectionCode,
  type DocumentOutputFormat,
  type DocumentStudioRequest,
  type DocumentStudioSession,
  type SaveDocumentStudioTemplateResponse,
  type DocumentTemplateSummary,
  type GeneratedDocumentSummary,
  type RenderDocumentResponse,
} from "@/lib/document-builder-api"
import { handGeneratedDocumentToDexter } from "@/lib/generated-document-handoff"
import {
  clearDocumentBuilderDraft,
  hasActiveDocumentBuilderDraft,
  loadDocumentBuilderDraft,
  markDocumentBuilderDraftActive,
  saveDocumentBuilderDraft,
  type DocumentBuilderDraft,
} from "@/lib/document-builder-draft"
import { releasePdfPageImages, renderPdfPageImages, type RenderedPdfPage } from "@/lib/customs-invoice-pdf-preview"
import { getSupabaseSession } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion } from "@/lib/motion"

type DocumentsPageProps = {
  navigate?: (path: string) => void
  initialWorkspace?: DocumentBuilderWorkspace
  preview?: boolean
}

type CreateDocumentWorkspaceProps = {
  templates: DocumentTemplateSummary[]
  canManageTemplates: boolean
  initialTemplateCode: string | null
  resumeActiveDraft: boolean
  onClose: () => void
  onRendered: () => Promise<void>
  preview: boolean
}

const statusTone: Record<GeneratedDocumentSummary["status"], "blue" | "amber" | "green" | "red"> = {
  queued: "blue",
  rendering: "amber",
  ready: "green",
  failed: "red",
}

const templatePreviewCache = new Map<string, RenderedPdfPage>()
const templatePreviewRequests = new Map<string, Promise<RenderedPdfPage | null>>()
const maxCachedTemplatePreviews = 24
let documentWorkspaceCache: DocumentBuilderWorkspace | null = null

function templatePreviewKey(template: DocumentTemplateSummary, document: GeneratedDocumentSummary | null) {
  return `${template.id}:${template.version}:${document?.id ?? "live"}`
}

function rememberTemplatePreview(key: string, page: RenderedPdfPage) {
  templatePreviewCache.set(key, page)
  while (templatePreviewCache.size > maxCachedTemplatePreviews) {
    const oldestKey = templatePreviewCache.keys().next().value
    if (typeof oldestKey !== "string") break
    const oldestPage = templatePreviewCache.get(oldestKey)
    if (oldestPage) releasePdfPageImages([oldestPage])
    templatePreviewCache.delete(oldestKey)
  }
}

async function renderTemplateThumbnail(blob: Blob, fileName: string) {
  const pages = await renderPdfPageImages(new File([blob], fileName, { type: "application/pdf" }), {
    maxPages: 1,
    targetWidth: 420,
  })
  const [page, ...unusedPages] = pages
  releasePdfPageImages(unusedPages)
  return page ?? null
}

function loadTemplatePreview(
  template: DocumentTemplateSummary,
  previewDocument: GeneratedDocumentSummary | null,
  previewJobNumber: string | null,
) {
  const key = templatePreviewKey(template, previewDocument)
  const cached = templatePreviewCache.get(key)
  if (cached) return Promise.resolve(cached)

  const pending = templatePreviewRequests.get(key)
  if (pending) return pending

  const previewRequest = (async () => {
    if (previewDocument) {
      try {
        const download = await getGeneratedDocumentDownload(previewDocument.id)
        const blob = await fetchSignedDocument(download.signedUrl)
        const page = await renderTemplateThumbnail(blob, download.fileName)
        if (page) {
          rememberTemplatePreview(key, page)
          return page
        }
      } catch {
        // A recently generated document is the fast path. If its signed link
        // is unavailable, fall through to a fresh template render.
      }
    }

    if (!previewJobNumber) return null
    const request: DocumentStudioRequest = {
      templateCode: template.code,
      jobNumber: previewJobNumber,
      contentSections: template.contentSections.map((section) => section.code),
    }
    const session = await getDocumentStudioSession(request)
    const response = await renderDocumentStudioPreview({ ...request, templateBase64: session.templateBase64, sampleData: {} })
    const page = await renderTemplateThumbnail(await response.blob(), `${template.id}.pdf`)
    if (page) rememberTemplatePreview(key, page)
    return page
  })().finally(() => templatePreviewRequests.delete(key))

  templatePreviewRequests.set(key, previewRequest)
  return previewRequest
}

function DocumentTemplatePreview({
  template,
  previewDocument,
  previewJobNumber,
}: {
  template: DocumentTemplateSummary
  previewDocument: GeneratedDocumentSummary | null
  previewJobNumber: string | null
}) {
  const { t } = useLanguage()
  const cacheKey = templatePreviewKey(template, previewDocument)
  const [page, setPage] = useState<RenderedPdfPage | null>(() => templatePreviewCache.get(cacheKey) ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPage(templatePreviewCache.get(cacheKey) ?? null)
    setFailed(false)

    if (!previewJobNumber) {
      setFailed(true)
      return undefined
    }

    void loadTemplatePreview(template, previewDocument, previewJobNumber)
      .then((loadedPage) => {
        if (cancelled) return
        if (loadedPage) setPage(loadedPage)
        else setFailed(true)
      })
      .catch((previewError) => {
        if (!cancelled && !(previewError instanceof DOMException && previewError.name === "AbortError")) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, previewDocument, previewJobNumber, template])

  if (page) {
    return <img src={page.url} alt="" decoding="async" fetchPriority="high" className="size-full object-cover object-top" />
  }

  return (
    <span className="grid size-full place-items-center bg-[var(--md-surface-tint)]">
      {failed
        ? <FileText className="size-5 text-[var(--md-subtle)]" strokeWidth={1.25} aria-hidden="true" />
        : <LoaderCircle className="size-4 animate-spin text-[var(--md-accent)] motion-reduce:animate-none" aria-label={t("Loading preview…")} />}
    </span>
  )
}

function previewJobNumber(document: GeneratedDocumentSummary | undefined) {
  if (!document) return null
  const separatorIndex = document.targetReference.indexOf("-")
  return separatorIndex >= 0 ? document.targetReference.slice(separatorIndex + 1) : document.targetReference
}

function currentPreviewDocument(template: DocumentTemplateSummary, documents: GeneratedDocumentSummary[]) {
  const matching = documents.find((document) => document.status === "ready" && document.templateCode === template.code)
  if (!matching) return null
  const documentCreatedAt = Date.parse(matching.createdAt)
  const templateUpdatedAt = Date.parse(template.updatedAt)
  return Number.isNaN(documentCreatedAt) || Number.isNaN(templateUpdatedAt) || documentCreatedAt >= templateUpdatedAt
    ? matching
    : null
}

async function startSignedDownload(url: string, fileName: string) {
  let downloadUrl = url
  let revokeDownloadUrl = false
  if (!url.startsWith("blob:")) {
    const response = await fetch(url, { credentials: "omit" })
    if (!response.ok) throw new Error("The generated document could not be downloaded.")
    downloadUrl = URL.createObjectURL(await response.blob())
    revokeDownloadUrl = true
  }

  const anchor = document.createElement("a")
  anchor.href = downloadUrl
  anchor.download = fileName
  anchor.rel = "noopener noreferrer"
  anchor.style.display = "none"
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  if (revokeDownloadUrl) window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
}

async function fetchSignedDocument(url: string) {
  const response = await fetch(url, { credentials: "omit" })
  if (!response.ok) throw new Error("The generated document could not be opened.")
  return response.blob()
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.rel = "noopener noreferrer"
  anchor.style.display = "none"
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function formatBytes(value: number | null) {
  if (value === null) return "—"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

type CarboneStudioElement = HTMLElement & {
  setConfig: (config: {
    mode: "embedded"
    origin: string
    version: string
    theme: string
    fetchOverride: (url: string, options?: RequestInit) => Promise<Response>
  }) => void
  setRenderOptions: (options: DocumentStudioSession["renderOptions"], forceRefreshPreview?: boolean) => void
  getRenderOptions: () => DocumentStudioSession["renderOptions"]
  openTemplateDataURI: (dataUri: string, attributes?: Record<string, unknown>) => void | Promise<void>
  reset: () => void
}

type CodeMirrorJsonEditorElement = Element & {
  cmView?: {
    view?: {
      state?: {
        doc?: { toString: () => string }
      }
    }
  }
}

let carboneStudioScriptPromise: Promise<void> | null = null

function loadCarboneStudioScript() {
  if (customElements.get("carbone-studio")) return Promise.resolve()
  if (carboneStudioScriptPromise) return carboneStudioScriptPromise

  carboneStudioScriptPromise = getDocumentStudioComponent().then((component) => new Promise<void>((resolve, reject) => {
    const componentUrl = URL.createObjectURL(component)
    const script = document.createElement("script")
    script.src = componentUrl
    script.type = "module"
    script.async = true
    script.addEventListener("load", () => {
      URL.revokeObjectURL(componentUrl)
      resolve()
    }, { once: true })
    script.addEventListener("error", () => {
      URL.revokeObjectURL(componentUrl)
      reject(new Error("carbone_studio_script_failed"))
    }, { once: true })
    document.head.append(script)
  })).catch((error) => {
    carboneStudioScriptPromise = null
    throw error
  })
  return carboneStudioScriptPromise
}

function base64FromDataUri(value: unknown) {
  if (typeof value !== "string") return null
  const separator = value.indexOf(",")
  const base64 = separator >= 0 ? value.slice(separator + 1) : value
  return /^[A-Za-z0-9+/]*={0,2}$/.test(base64) ? base64 : null
}

function templateBlobFromBase64(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
}

function readTemplateFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (file.size <= 0 || file.size > 15 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".docx")) {
      reject(new Error("Choose a Word template no larger than 15 MB."))
      return
    }
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      const result = reader.result
      const base64 = base64FromDataUri(result)
      if (!base64) {
        reject(new Error("The selected template could not be read."))
        return
      }
      try {
        const signature = atob(base64.slice(0, 8))
        if (!signature.startsWith("PK")) throw new Error("Choose a valid Word template.")
        resolve(base64)
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Choose a valid Word template."))
      }
    }, { once: true })
    reader.addEventListener("error", () => reject(reader.error ?? new Error("The selected template could not be read.")), { once: true })
    reader.readAsDataURL(file)
  })
}

function isJobNumber(value: string) {
  return /^[A-Z0-9][A-Z0-9._/-]{0,49}$/i.test(value)
}

function DocumentStudioWorkspace({
  session,
  request,
  templateBase64,
  sampleData,
  onDataChange,
  onError,
}: {
  session: DocumentStudioSession | null
  request: DocumentStudioRequest | null
  templateBase64: string | null
  sampleData: Record<string, unknown> | null
  onDataChange: (data: Record<string, unknown>) => void
  onError: (message: string | null) => void
}) {
  const { t } = useLanguage()
  const hostRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const onDataChangeRef = useRef(onDataChange)

  useEffect(() => {
    onDataChangeRef.current = onDataChange
  }, [onDataChange])

  useEffect(() => {
    if (!session || !request || !templateBase64 || !hostRef.current) return

    const activeSession = session
    const activeRequest = request
    const activeTemplateBase64 = templateBase64
    const activeSampleData = sampleData ?? activeSession.renderOptions.data
    let disposed = false
    let studio: CarboneStudioElement | null = null
    let activePreviewUrl: string | null = null
    let previewRequestId = 0
    let previewDebounceId: number | undefined
    let studioDataObserver: MutationObserver | null = null
    let studioDataMountObserver: MutationObserver | null = null
    let latestSampleData = activeSampleData
    let latestSampleJson = JSON.stringify(latestSampleData)

    async function startStudio() {
      setLoading(true)
      onError(null)
      try {
        await loadCarboneStudioScript()
        await customElements.whenDefined("carbone-studio")
        if (disposed || !hostRef.current) return

        studio = document.createElement("carbone-studio") as CarboneStudioElement
        studio.setAttribute("carbone-mode", "off")
        studio.setAttribute("aria-label", t("Carbone document studio"))
        studio.style.display = "block"
        studio.style.width = "100%"
        studio.style.height = "100%"
        hostRef.current.replaceChildren(studio)

        async function refreshPreview(nextTemplateBase64: string, sampleData: Record<string, unknown>) {
          const currentRequestId = ++previewRequestId
          latestSampleData = sampleData
          setPreviewLoading(true)
          try {
            const response = await renderDocumentStudioPreview({
              ...activeRequest,
              templateBase64: nextTemplateBase64,
              sampleData,
            })
            const bytes = await response.arrayBuffer()
            const contentType = response.headers.get("Content-Type") || "application/pdf"
            if (disposed || currentRequestId !== previewRequestId) return { bytes, contentType }

            if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl)
            activePreviewUrl = URL.createObjectURL(new Blob([bytes], { type: contentType }))
            setPreviewUrl(activePreviewUrl)
            onError(null)
            return { bytes, contentType }
          } catch (previewError) {
            if (!disposed && currentRequestId === previewRequestId) {
              onError(previewError instanceof Error ? previewError.message : t("The Studio preview could not be created."))
            }
            throw previewError
          } finally {
            if (!disposed && currentRequestId === previewRequestId) setPreviewLoading(false)
          }
        }

        const previews = new Map<string, { bytes: ArrayBuffer; contentType: string }>()
        const fetchOverride = async (url: string, options: RequestInit = {}) => {
          const requestUrl = new URL(url, "https://docserver.multideck.app")
          const method = (options.method || "GET").toUpperCase()
          const renderId = requestUrl.pathname.match(/\/render\/(multideck-[A-Za-z0-9-]+)$/)?.[1]

          if (method === "GET" && renderId) {
            const preview = previews.get(renderId)
            if (!preview) return new Response(JSON.stringify({ success: false, error: "Preview expired" }), { status: 404, headers: { "Content-Type": "application/json" } })
            return new Response(preview.bytes.slice(0), { status: 200, headers: { "Content-Type": preview.contentType, "Cache-Control": "no-store" } })
          }

          if (method !== "POST" || !requestUrl.pathname.endsWith("/render/template")) {
            return new Response(JSON.stringify({ success: false, error: "This Studio action is not available in Document Builder." }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            })
          }

          let nextTemplateBase64 = activeTemplateBase64
          let sampleData = activeSampleData
          if (typeof options.body === "string") {
            try {
              const body = JSON.parse(options.body) as { template?: unknown; data?: unknown }
              if (typeof body.template === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(body.template)) nextTemplateBase64 = body.template
              if (body.data && typeof body.data === "object" && !Array.isArray(body.data)) sampleData = body.data as Record<string, unknown>
            } catch {
              // The trusted template loaded for this session remains the fallback.
            }
          }

          onDataChangeRef.current(sampleData)
          const renderedPreview = await refreshPreview(nextTemplateBase64, sampleData)
          const localRenderId = `multideck-${crypto.randomUUID()}`
          previews.clear()
          previews.set(localRenderId, renderedPreview)
          return new Response(JSON.stringify({ success: true, data: { renderId: localRenderId } }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          })
        }

        studio.setConfig({
          mode: "embedded",
          origin: "https://docserver.multideck.app",
          version: "5",
          theme: `main {
            --primary: #0e7d74;
            --on-primary: #ffffff;
            --primary-container: #e7f3f1;
            --on-primary-container: #174b47;
            --secondary: #5d5d5d;
            --background: #fdfdfc;
            --on-background: #292929;
            --surface: #f5f6f5;
            --on-surface: #292929;
            --surface-container: #ffffff;
            --surface-container-high: #f2f4f3;
            --outline: #c8cecc;
          }
          main > c-design > c-flex > c-flex-panel:first-child {
            flex: 1 1 100% !important;
            min-width: 0;
            background: #fbfcfb;
          }
          main > c-design > c-flex > c-flex {
            display: none !important;
          }
          header nav {
            min-height: 44px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 12px;
          }
          button, input {
            border-radius: 6px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          `,
          fetchOverride,
        })
        studio.addEventListener("options:updated", ((event: CustomEvent<{ data?: unknown; options?: { data?: unknown } }>) => {
          const data = event.detail?.data ?? event.detail?.options?.data
          if (data && typeof data === "object" && !Array.isArray(data)) {
            schedulePreview(data as Record<string, unknown>)
          }
        }) as EventListener)

        function schedulePreview(data: Record<string, unknown>) {
          const nextSampleJson = JSON.stringify(data)
          if (nextSampleJson === latestSampleJson) return
          latestSampleJson = nextSampleJson
          latestSampleData = data
          onDataChangeRef.current(data)
          if (previewDebounceId) window.clearTimeout(previewDebounceId)
          previewDebounceId = window.setTimeout(() => {
            void refreshPreview(activeTemplateBase64, latestSampleData).catch(() => undefined)
          }, 450)
        }

        function readJsonEditorData() {
          const editor = studio?.shadowRoot?.querySelector('[role="textbox"][data-language="json"]') as CodeMirrorJsonEditorElement | null
          const documentText = editor?.cmView?.view?.state?.doc?.toString()
          if (!documentText) return null
          try {
            const data = JSON.parse(documentText) as unknown
            return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null
          } catch {
            // Keep the last valid preview visible while the operator is midway through a JSON edit.
            return null
          }
        }

        const readCurrentStudioData = () => {
          window.setTimeout(() => {
            if (disposed || !studio) return
            const data = readJsonEditorData()
              ?? (typeof studio.getRenderOptions === "function" ? studio.getRenderOptions()?.data : null)
            if (data && typeof data === "object" && !Array.isArray(data)) schedulePreview(data)
          }, 0)
        }
        // Input events are composed across the Studio shadow root. Listening on
        // the host keeps the JSON bridge active even when Carbone creates its
        // editor after the component has already been attached.
        studio.addEventListener("input", readCurrentStudioData, true)
        studio.addEventListener("change", readCurrentStudioData, true)
        studio.setRenderOptions({ ...activeSession.renderOptions, data: activeSampleData }, false)
        await studio.openTemplateDataURI(
          `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${activeTemplateBase64}`,
          { name: activeSession.templateName, comment: `${activeSession.jobReference} · v${activeSession.templateVersion}`, createdAt: Math.floor(Date.now() / 1000) },
        )
        const attachStudioDataObserver = () => {
          if (studioDataObserver || !studio?.shadowRoot) return Boolean(studioDataObserver)
          const studioDataEditor = studio.shadowRoot.querySelector('[role="textbox"][data-language="json"]')
          if (!studioDataEditor) return false
          studioDataObserver = new MutationObserver(readCurrentStudioData)
          studioDataObserver.observe(studioDataEditor, { characterData: true, childList: true, subtree: true })
          studioDataMountObserver?.disconnect()
          studioDataMountObserver = null
          return true
        }
        if (!attachStudioDataObserver() && studio.shadowRoot) {
          studioDataMountObserver = new MutationObserver(attachStudioDataObserver)
          studioDataMountObserver.observe(studio.shadowRoot, { attributes: true, childList: true, subtree: true })
        }
        await refreshPreview(activeTemplateBase64, activeSampleData)
      } catch (studioError) {
        if (!disposed) {
          onError(studioError instanceof Error && studioError.message !== "carbone_studio_script_failed"
            ? studioError.message
            : t("The Carbone Studio interface could not be loaded."))
        }
      } finally {
        if (!disposed) setLoading(false)
      }
    }

    const startTimer = window.setTimeout(() => void startStudio(), 0)
    return () => {
      disposed = true
      window.clearTimeout(startTimer)
      previewRequestId += 1
      studioDataObserver?.disconnect()
      studioDataMountObserver?.disconnect()
      if (previewDebounceId) window.clearTimeout(previewDebounceId)
      if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl)
      if (studio) {
        try {
          studio.reset()
        } catch {
          // Carbone can reject its clipboard cleanup when the tab is not focused.
        }
        try {
          studio.remove()
        } catch {
          // The browser still removes the custom element before reporting callback errors.
        }
      }
    }
  }, [onError, request, session, t, templateBase64])

  if (!session || !request) {
    return (
      <div className="grid h-full min-h-[440px] place-items-center p-8 text-center">
        <div className="max-w-sm">
          <span className="mx-auto grid size-11 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
            <FilePenLine className="size-5" strokeWidth={1.4} aria-hidden="true" />
          </span>
          <p className="mt-4 text-[13px] font-medium text-[var(--md-ink)]">{t("Your document workspace")}</p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--md-text)]">{t("Choose a template, data module and job to open the JSON data beside its live output.")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="md-document-editor__studio-layout h-full min-h-[520px]">
      {loading ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--md-surface)]/90" role="status">
          <div className="text-center">
            <LoaderCircle className="mx-auto size-5 animate-spin text-[var(--md-accent)]" aria-hidden="true" />
            <p className="mt-2 text-[11px] text-[var(--md-text)]">{t("Opening secure Studio…")}</p>
          </div>
        </div>
      ) : null}
      <div ref={hostRef} className="md-document-editor__template-host min-h-0 overflow-hidden" />
      <div className="md-document-editor__preview" aria-busy={previewLoading}>
        {previewLoading && previewUrl ? (
          <div className="absolute end-3 top-3 z-10 flex items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface)]/94 px-2.5 py-2 text-[10.5px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-soft)] backdrop-blur-md" role="status">
            <LoaderCircle className="size-3.5 animate-spin text-[var(--md-accent)] motion-reduce:animate-none" aria-hidden="true" />
            {t("Updating preview…")}
          </div>
        ) : null}
        {previewLoading && !previewUrl ? (
          <div className="grid h-full place-items-center p-8 text-center" role="status">
            <div>
              <LoaderCircle className="mx-auto size-5 animate-spin text-[var(--md-accent)] motion-reduce:animate-none" aria-hidden="true" />
              <p className="mt-2 text-[11px] text-[var(--md-text)]">{t("Preparing live preview…")}</p>
            </div>
          </div>
        ) : previewUrl ? (
          <iframe className="h-full w-full border-0 bg-[var(--md-bg-strong)]" src={previewUrl} title={t("Live document preview")} />
        ) : (
          <div className="grid h-full place-items-center p-8 text-center">
            <div className="max-w-xs">
              <FileText className="mx-auto size-5 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
              <p className="mt-3 text-[12px] font-medium text-[var(--md-ink)]">{t("Preview will appear here")}</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--md-text)]">{t("Load an authorised record to render the current JSON beside it.")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function QuickCreateDocumentWorkspace({
  templates,
  initialTemplateCode,
  onClose,
  onRendered,
  preview,
  navigate,
}: {
  templates: DocumentTemplateSummary[]
  initialTemplateCode: string | null
  onClose: () => void
  onRendered: () => Promise<void>
  preview: boolean
  navigate?: (path: string) => void
}) {
  const { t } = useLanguage()
  const jobInputRef = useRef<HTMLInputElement>(null)
  const [templateCode, setTemplateCode] = useState(initialTemplateCode ?? templates[0]?.code ?? "")
  const [jobNumber, setJobNumber] = useState("")
  const [outputFormat, setOutputFormat] = useState<DocumentOutputFormat>("pdf")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedDocument, setGeneratedDocument] = useState<(RenderDocumentResponse & { blob: Blob; previewUrl: string; jobNumber: string; templateName: string }) | null>(null)
  const [attachOpen, setAttachOpen] = useState(false)
  const selectedTemplate = templates.find((template) => template.code === templateCode)

  useEffect(() => {
    const template = templates.find((item) => item.code === initialTemplateCode) ?? templates[0]
    setTemplateCode(template?.code ?? "")
    setOutputFormat(template?.defaultOutputFormat ?? "pdf")
    setJobNumber("")
    setError(null)
  }, [initialTemplateCode, templates])

  useEffect(() => () => {
    if (generatedDocument) URL.revokeObjectURL(generatedDocument.previewUrl)
  }, [generatedDocument])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => jobInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  function chooseTemplate(nextCode: string) {
    const template = templates.find((item) => item.code === nextCode)
    setTemplateCode(nextCode)
    setOutputFormat(template?.defaultOutputFormat ?? "pdf")
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTemplate) {
      setError(t("Choose a document template."))
      return
    }
    if (!isJobNumber(jobNumber.trim())) {
      setError(t("Enter the job number to continue."))
      jobInputRef.current?.focus()
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      if (preview) {
        toast.success(t("Preview complete"), { description: t("No document was generated or sent to Carbone.") })
        onClose()
        return
      }
      const result = await renderDocument({
        templateCode: selectedTemplate.code,
        targetType: "Job_Header",
        jobNumber: jobNumber.trim(),
        outputFormat,
        contentSections: ["job", ...selectedTemplate.contentSections
          .filter((section) => section.defaultSelected && section.code !== "job")
          .map((section) => section.code)],
        reason: "Generated from the Multideck document creation flow",
      })
      const blob = await fetchSignedDocument(result.signedUrl)
      const previewUrl = URL.createObjectURL(blob)
      setGeneratedDocument({ ...result, blob, previewUrl, jobNumber: jobNumber.trim(), templateName: selectedTemplate.name })
      await onRendered()
      toast.success(t("Document ready"), { description: result.fileName })
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : t("The document could not be generated."))
    } finally {
      setSubmitting(false)
    }
  }

  async function emailDocument() {
    if (!generatedDocument) return
    const file = new File([generatedDocument.blob], generatedDocument.fileName, { type: generatedDocument.mimeType })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: generatedDocument.templateName, text: `${generatedDocument.templateName} · ${generatedDocument.jobNumber}` })
        return
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === "AbortError") return
      }
    }
    downloadBlob(generatedDocument.blob, generatedDocument.fileName)
    toast.info(t("Document downloaded for email"), { description: t("Attach the downloaded file in your email composer.") })
  }

  function askDexter() {
    if (!generatedDocument || !navigate) return
    handGeneratedDocumentToDexter(generatedDocument)
    navigate("/agent-dexter?generated-document=1")
  }

  if (generatedDocument) {
    return (
      <section className="md-document-editor" aria-labelledby="generated-document-title">
        <header className="md-document-editor__header flex-wrap gap-3">
          <div className="flex min-w-0 items-center gap-3"><Button type="button" variant="ghost" size="icon-lg" onClick={onClose} aria-label={t("Back to documents")} className="rounded-[var(--md-radius-lg)] text-[var(--md-text)]"><ArrowLeft className="size-4 rtl:-scale-x-100" strokeWidth={1.5} aria-hidden="true" /></Button><div className="min-w-0"><p className="text-[11px] font-medium text-[var(--md-accent)]">{t("Document ready")}</p><h1 id="generated-document-title" className="mt-0.5 truncate text-[18px] font-medium tracking-[-0.02em] text-[var(--md-ink)]" dir="auto">{generatedDocument.fileName}</h1></div></div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto" aria-label={t("Document actions")}><Button type="button" variant="outline" onClick={() => void emailDocument()} className="h-10 flex-1 rounded-[var(--md-radius-md)] sm:flex-none"><Mail className="size-4" aria-hidden="true" />{t("Email")}</Button><Button type="button" variant="outline" onClick={askDexter} disabled={!navigate} className="h-10 flex-1 rounded-[var(--md-radius-md)] sm:flex-none"><AiBrain className="size-4" aria-hidden="true" />{t("Ask Dexter")}</Button><Button type="button" variant="outline" onClick={() => downloadBlob(generatedDocument.blob, generatedDocument.fileName)} className="h-10 flex-1 rounded-[var(--md-radius-md)] sm:flex-none"><Download className="size-4" aria-hidden="true" />{t("Download")}</Button><Button type="button" onClick={() => setAttachOpen(true)} className="h-10 flex-1 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-white sm:flex-none"><Paperclip className="size-4" aria-hidden="true" />{t("Attach")}</Button></div>
        </header>
        <main className="grid min-h-0 flex-1 bg-[var(--md-bg)] lg:grid-cols-[minmax(0,1fr)_18rem]"><div className="min-h-[34rem] overflow-hidden bg-[color-mix(in_srgb,var(--md-ink),transparent_94%)] p-3 sm:p-5">{generatedDocument.mimeType === "application/pdf" ? <iframe src={generatedDocument.previewUrl} title={t("Generated document preview")} className="h-full min-h-[32rem] w-full rounded-[var(--md-radius-lg)] bg-white shadow-[var(--md-shadow-float)]" /> : <div className="grid h-full place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)]"><p>{t("Document ready to use")}</p></div>}</div><aside className="flex flex-col gap-5 bg-[var(--md-surface)] p-5 shadow-[var(--md-stroke-start)]"><div><p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--md-subtle)]">{t("Generated from")}</p><p className="mt-2 text-[13px] font-medium text-[var(--md-ink)]">{t(generatedDocument.templateName)}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Job")} <span dir="ltr">{generatedDocument.jobNumber}</span></p></div><div className="rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] p-4"><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Linked to this job")}</p><p className="mt-1 text-[11px] text-[var(--md-text)]">{t("Multideck saved the document with the job and its audit trail.")}</p></div><Button type="button" variant="ghost" onClick={() => setGeneratedDocument(null)} className="mt-auto justify-start"><FilePlus2 className="size-4" aria-hidden="true" />{t("Create another document")}</Button></aside></main>
        <Dialog open={attachOpen} onOpenChange={setAttachOpen}><DialogContent className="rounded-[var(--md-radius-xl)] sm:max-w-md"><DialogHeader><DialogTitle>{t("Attach document")}</DialogTitle><DialogDescription>{t("This document is already attached to its job. Additional destinations will appear here when they are supported securely.")}</DialogDescription></DialogHeader><div className="rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] p-4"><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Job")} <span dir="ltr">{generatedDocument.jobNumber}</span></p><p className="mt-1 text-[11px] text-[var(--md-text)]">{t("Attached automatically")}</p></div></DialogContent></Dialog>
      </section>
    )
  }

  return (
    <section className="md-document-editor" aria-labelledby="document-create-title">
      <header className="md-document-editor__header">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="ghost" size="icon-lg" onClick={onClose} aria-label={t("Back to documents")} title={t("Back to documents")} className="rounded-[var(--md-radius-lg)] text-[var(--md-text)]">
            <ArrowLeft className="size-4 rtl:-scale-x-100" strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--md-accent)]">{t("Document builder")}</p>
            <h1 id="document-create-title" className="mt-0.5 truncate text-[18px] font-medium leading-tight tracking-[-0.02em] text-[var(--md-ink)]">{t("Create a document")}</h1>
          </div>
        </div>
      </header>
      <main className="grid min-h-0 flex-1 place-items-start overflow-y-auto bg-[var(--md-bg)] px-4 py-8 sm:px-8">
        <form onSubmit={(event) => void submit(event)} className="w-full max-w-2xl">
          <div className="mb-6 max-w-xl">
            <h2 className="text-[24px] font-medium tracking-[-0.03em] text-[var(--md-ink)]">{t("Generate a document for a job")}</h2>
            <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{t("Choose a template, enter the job number and get the populated document. Template editing lives in Manage templates.")}</p>
          </div>
          <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
            <div className="grid gap-5 p-5 sm:p-6">
              <label className="text-[12px] font-medium text-[var(--md-ink)]">{t("Template")}<Select value={templateCode} onValueChange={chooseTemplate}><SelectTrigger className="mt-2 h-10 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]"><SelectValue /></SelectTrigger><SelectContent>{templates.map((template) => <SelectItem key={template.code} value={template.code}>{t(template.name)}</SelectItem>)}</SelectContent></Select></label>
              <label className="text-[12px] font-medium text-[var(--md-ink)]" htmlFor="document-job-number">{t("Job number")}<Input ref={jobInputRef} id="document-job-number" value={jobNumber} onChange={(event) => setJobNumber(event.target.value.toUpperCase())} placeholder={t("For example, JOB-24018")} autoComplete="off" className="mt-2 h-10 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]" /></label>
              <label className="text-[12px] font-medium text-[var(--md-ink)]">{t("Format")}<Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as DocumentOutputFormat)}><SelectTrigger className="mt-2 h-10 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]"><SelectValue /></SelectTrigger><SelectContent>{(selectedTemplate?.outputFormats ?? ["pdf"]).map((format) => <SelectItem key={format} value={format}>{format.toUpperCase()}</SelectItem>)}</SelectContent></Select></label>
            </div>
            <div className="flex flex-col gap-3 bg-[var(--md-surface-tint)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-[10.5px] leading-5 text-[var(--md-text)]">{t("Job data is checked and snapshotted for audit before rendering.")}</p>
              <Button type="submit" disabled={submitting || !selectedTemplate} className="h-10 shrink-0 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[12px] text-white">{submitting ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FilePlus2 className="size-3.5" strokeWidth={1.8} aria-hidden="true" />}{submitting ? t("Generating…") : t("Generate document")}</Button>
            </div>
          </Surface>
          {error ? <div role="alert" className="mt-3 flex gap-2 rounded-[var(--md-radius-md)] bg-[rgba(190,70,60,0.08)] p-3 text-[11px] text-[var(--md-red)]"><TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" /><span>{error}</span></div> : null}
        </form>
      </main>
    </section>
  )
}

function CreateDocumentWorkspace({
  templates,
  canManageTemplates,
  initialTemplateCode,
  resumeActiveDraft,
  onClose,
  onRendered,
  preview,
}: CreateDocumentWorkspaceProps) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const jobInputRef = useRef<HTMLInputElement>(null)
  const templateUploadRef = useRef<HTMLInputElement>(null)
  const sourceUploadRef = useRef<HTMLInputElement>(null)
  const [templateCode, setTemplateCode] = useState("")
  const [jobNumber, setJobNumber] = useState("")
  const [outputFormat, setOutputFormat] = useState<DocumentOutputFormat>("pdf")
  const [contentSections, setContentSections] = useState<DocumentContentSectionCode[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [studioSession, setStudioSession] = useState<DocumentStudioSession | null>(null)
  const [studioRequest, setStudioRequest] = useState<DocumentStudioRequest | null>(null)
  const [studioTemplateBase64, setStudioTemplateBase64] = useState<string | null>(null)
  const [studioData, setStudioData] = useState<Record<string, unknown> | null>(null)
  const [studioLoading, setStudioLoading] = useState(false)
  const [studioError, setStudioError] = useState<string | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [publishingSource, setPublishingSource] = useState(false)
  const [savedTemplate, setSavedTemplate] = useState<SaveDocumentStudioTemplateResponse | null>(null)
  const [draftUserId, setDraftUserId] = useState<string | null>(null)
  const latestDraftRef = useRef<{ userId: string; draft: DocumentBuilderDraft } | null>(null)
  const restoringDraftRef = useRef(!preview)

  useEffect(() => {
    const template = templates.find((item) => item.code === initialTemplateCode) ?? templates[0]
    setTemplateCode(template?.code ?? "")
    setOutputFormat(template?.defaultOutputFormat ?? "pdf")
    setContentSections(template?.contentSections.filter((section) => section.required || section.defaultSelected).map((section) => section.code) ?? [])
    setJobNumber("")
    setError(null)
    setStudioSession(null)
    setStudioRequest(null)
    setStudioTemplateBase64(null)
    setStudioData(null)
    setStudioError(null)
    setSavedTemplate(null)
  }, [initialTemplateCode, templates])

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => jobInputRef.current?.focus())
    return () => window.cancelAnimationFrame(focusFrame)
  }, [])

  useEffect(() => {
    if (preview) return
    let disposed = false

    async function restoreDraft() {
      try {
        const authSession = await getSupabaseSession()
        if (!authSession || disposed) return
        setDraftUserId(authSession.user.id)
        if (!hasActiveDocumentBuilderDraft()) return

        const draft = await loadDocumentBuilderDraft(authSession.user.id, initialTemplateCode ?? undefined)
        const template = templates.find((item) => item.code === draft?.templateCode)
        if (!draft
          || !template
          || (initialTemplateCode && draft.templateCode !== initialTemplateCode)
          || !isJobNumber(draft.jobNumber)
          || !draft.contentSections.includes("job")) return

        setTemplateCode(draft.templateCode)
        setJobNumber(draft.jobNumber)
        setOutputFormat(draft.outputFormat)
        setContentSections(draft.contentSections)
        setStudioTemplateBase64(draft.templateBase64)
        setStudioData(draft.sampleData)
        setSavedTemplate(draft.savedTemplate)

        if (resumeActiveDraft && draft.stage === "studio") {
          setStudioLoading(true)
          const request = {
            templateCode: draft.templateCode,
            jobNumber: draft.jobNumber,
            contentSections: draft.contentSections,
          } satisfies DocumentStudioRequest
          const restoredSession = await getDocumentStudioSession(request)
          if (disposed) return
          const restoredTemplateBase64 = draft.templateBase64 ?? restoredSession.templateBase64
          setStudioRequest(request)
          setStudioSession(restoredSession)
          setStudioTemplateBase64(restoredTemplateBase64)
          setStudioData(draft.sampleData ?? restoredSession.renderOptions.data)
          setSavedTemplate(draft.savedTemplate ?? (restoredTemplateBase64 === restoredSession.templateBase64
            && restoredSession.carboneTemplateId
            && restoredSession.carboneVersionId
            && restoredSession.multideckTemplateId
            ? {
                multideckTemplateId: restoredSession.multideckTemplateId,
                templateCode: draft.templateCode,
                carboneTemplateId: restoredSession.carboneTemplateId,
                carboneVersionId: restoredSession.carboneVersionId,
                multideckVersion: restoredSession.templateVersion,
                status: "published",
              }
            : null))
        }
      } catch (restoreError) {
        if (!disposed) setStudioError(restoreError instanceof Error ? restoreError.message : t("The document draft could not be restored."))
      } finally {
        restoringDraftRef.current = false
        if (!disposed) setStudioLoading(false)
      }
    }

    void restoreDraft()
    return () => {
      disposed = true
    }
  }, [initialTemplateCode, preview, resumeActiveDraft, t, templates])

  const draftSnapshot = useMemo<DocumentBuilderDraft | null>(() => {
    if (preview || !draftUserId || !templateCode || !isJobNumber(jobNumber.trim())) return null
    return {
      schemaVersion: 2,
      stage: studioSession && studioRequest ? "studio" : "context",
      templateCode,
      jobNumber: jobNumber.trim(),
      contentSections,
      outputFormat,
      templateBase64: studioTemplateBase64,
      sampleData: studioData,
      savedTemplate,
      updatedAt: new Date().toISOString(),
    }
  }, [contentSections, draftUserId, jobNumber, outputFormat, preview, savedTemplate, studioData, studioRequest, studioSession, studioTemplateBase64, templateCode])
  latestDraftRef.current = !restoringDraftRef.current && draftSnapshot && draftUserId
    ? { userId: draftUserId, draft: draftSnapshot }
    : null

  useEffect(() => {
    if (restoringDraftRef.current || !draftSnapshot || !draftUserId) return
    const timeoutId = window.setTimeout(() => {
      void saveDocumentBuilderDraft(draftUserId, draftSnapshot).catch(() => undefined)
    }, 250)
    return () => window.clearTimeout(timeoutId)
  }, [draftSnapshot, draftUserId])

  useEffect(() => {
    if (preview) return
    const flushLatestDraft = () => {
      const latest = latestDraftRef.current
      if (latest) void saveDocumentBuilderDraft(latest.userId, latest.draft).catch(() => undefined)
    }
    window.addEventListener("pagehide", flushLatestDraft)
    return () => {
      window.removeEventListener("pagehide", flushLatestDraft)
      flushLatestDraft()
    }
  }, [preview])

  const selectedTemplate = templates.find((template) => template.code === templateCode)
  const selectedModuleName = studioSession?.dataModuleName ?? (selectedTemplate?.targetType === "Job_Header" ? "Jobs" : "")

  function chooseTemplate(nextTemplateCode: string) {
    const template = templates.find((item) => item.code === nextTemplateCode)
    setTemplateCode(nextTemplateCode)
    setOutputFormat(template?.defaultOutputFormat ?? "pdf")
    setContentSections(template?.contentSections.filter((section) => section.required || section.defaultSelected).map((section) => section.code) ?? [])
    setError(null)
    clearStudio()
  }

  function clearStudio({ preserveTemplate = false }: { preserveTemplate?: boolean } = {}) {
    setStudioSession(null)
    setStudioRequest(null)
    if (!preserveTemplate) setStudioTemplateBase64(null)
    setStudioData(null)
    setStudioError(null)
    if (!preserveTemplate) setSavedTemplate(null)
  }

  function setSectionSelected(sectionCode: DocumentContentSectionCode, selected: boolean) {
    clearStudio({ preserveTemplate: true })
    setContentSections((current) => selected
      ? [...current, sectionCode]
      : current.filter((code) => code !== sectionCode))
  }

  async function openStudio() {
    if (!selectedTemplate) {
      setError(t("Choose a document template."))
      return
    }
    if (!isJobNumber(jobNumber.trim())) {
      setError(t("Enter a valid job number to open Studio."))
      jobInputRef.current?.focus()
      return
    }
    if (!contentSections.includes("job")) {
      setError(t("Job details must be included."))
      return
    }

    const request = {
      templateCode: selectedTemplate.code,
      jobNumber: jobNumber.trim(),
      contentSections,
    } satisfies DocumentStudioRequest

    setStudioLoading(true)
    setError(null)
    setStudioError(null)
    try {
      if (preview) {
        setStudioError(t("Secure Studio opens after the document service is deployed."))
        return
      }
      const session = await getDocumentStudioSession(request)
      const activeTemplateBase64 = studioTemplateBase64 ?? session.templateBase64
      const activeStudioData = studioData ?? session.renderOptions.data
      setStudioRequest(request)
      setStudioSession(session)
      setStudioTemplateBase64(activeTemplateBase64)
      setStudioData(activeStudioData)
      setSavedTemplate(savedTemplate ?? (activeTemplateBase64 === session.templateBase64 && session.carboneTemplateId && session.carboneVersionId && session.multideckTemplateId
        ? {
            multideckTemplateId: session.multideckTemplateId,
            templateCode: selectedTemplate.code,
            carboneTemplateId: session.carboneTemplateId,
            carboneVersionId: session.carboneVersionId,
            multideckVersion: session.templateVersion,
            status: "published",
          }
        : null))
    } catch (studioLoadError) {
      setStudioError(studioLoadError instanceof Error ? studioLoadError.message : t("The document studio could not be opened."))
    } finally {
      setStudioLoading(false)
    }
  }

  async function downloadTemplateForLocalEditing() {
    if (!selectedTemplate || !studioTemplateBase64) return
    const url = URL.createObjectURL(templateBlobFromBase64(studioTemplateBase64))
    await startSignedDownload(url, `${selectedTemplate.code.toLowerCase()}-template.docx`)
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.info(t("Template downloaded"), { description: t("Edit the Word file locally, then upload it here to refresh the preview.") })
  }

  async function uploadEditedTemplate(file: File | undefined) {
    if (!file) return
    setStudioError(null)
    try {
      const base64 = await readTemplateFile(file)
      setStudioTemplateBase64(base64)
      setSavedTemplate(null)
      toast.success(t("Edited template loaded"), { description: t("The live preview is updating with your current JSON data.") })
    } catch (uploadError) {
      setStudioError(uploadError instanceof Error ? uploadError.message : t("The edited template could not be loaded."))
    } finally {
      if (templateUploadRef.current) templateUploadRef.current.value = ""
    }
  }

  async function publishTemplateSource(file: File | undefined) {
    if (!file || !selectedTemplate || !canManageTemplates) return
    setPublishingSource(true)
    setStudioError(null)
    setError(null)
    try {
      const base64 = await readTemplateFile(file)
      const result = await bootstrapDocumentStudioTemplate(selectedTemplate.id, base64)
      setStudioTemplateBase64(base64)
      setSavedTemplate(result)
      await onRendered()
      toast.success(t("Template source published"), {
        description: t("The published template now uses this Word source."),
      })
    } catch (uploadError) {
      setStudioError(uploadError instanceof Error ? uploadError.message : t("The template source could not be published."))
    } finally {
      setPublishingSource(false)
      if (sourceUploadRef.current) sourceUploadRef.current.value = ""
    }
  }

  async function saveTemplateVersion() {
    if (!studioRequest || !studioTemplateBase64) return
    setSavingTemplate(true)
    setStudioError(null)
    try {
      const result = await saveDocumentStudioTemplate({ ...studioRequest, templateBase64: studioTemplateBase64 })
      setSavedTemplate(result)
      toast.success(t("Template version saved"), {
        description: result.status === "draft"
          ? t("The edited file is a draft. Publishing remains a separate approval.")
          : t("The existing published version now has its stable Carbone template ID."),
      })
    } catch (saveError) {
      setStudioError(saveError instanceof Error ? saveError.message : t("The template version could not be saved."))
    } finally {
      setSavingTemplate(false)
    }
  }

  async function copyTemplateId() {
    if (!savedTemplate?.carboneTemplateId) return
    await navigator.clipboard.writeText(savedTemplate.carboneTemplateId)
    toast.success(t("Template ID copied"))
  }

  async function submit() {
    if (!selectedTemplate) {
      setError(t("Choose a document template."))
      return
    }
    if (!isJobNumber(jobNumber.trim())) {
      setError(t("Enter the job number to continue."))
      jobInputRef.current?.focus()
      return
    }
    if (!contentSections.includes("job")) {
      setError(t("Job details must be included."))
      return
    }
    if (!preview && (!studioSession || !studioRequest || !studioTemplateBase64)) {
      setError(t("Open this job in Studio before creating the document."))
      return
    }
    setSubmitting(true)
    setError(null)

    try {
      if (preview) {
        toast.success(t("Preview complete"), { description: t("No document was generated or sent to Carbone.") })
        onClose()
        return
      }

      const result = await renderDocument({
        templateCode: selectedTemplate.code,
        targetType: "Job_Header",
        jobNumber: jobNumber.trim(),
        outputFormat,
        contentSections,
        reason: "Generated from the Multideck document workspace",
        studioTemplateBase64: studioTemplateBase64 ?? undefined,
      })
      await startSignedDownload(result.signedUrl, result.fileName)
      latestDraftRef.current = null
      if (draftUserId) await clearDocumentBuilderDraft(draftUserId).catch(() => undefined)
      await onRendered()
      toast.success(t("Document ready"), { description: result.fileName })
      onClose()
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : t("The document could not be generated."))
    } finally {
      setSubmitting(false)
    }
  }

  const studioReady = Boolean(studioSession && studioRequest)
  const contextError = error ?? studioError

  return (
    <section className="md-document-editor" aria-labelledby="document-editor-title">
      <header className="md-document-editor__header">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="ghost" size="icon-lg" onClick={onClose} aria-label={t("Back to documents")} title={t("Back to documents")} className="rounded-[var(--md-radius-lg)] text-[var(--md-text)]">
            <ArrowLeft className="size-4 rtl:-scale-x-100" strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--md-accent)]">{t("Document builder")}</p>
            <h1 id="document-editor-title" className="mt-0.5 truncate text-[18px] font-medium leading-tight tracking-[-0.02em] text-[var(--md-ink)]">{t("Create a document")}</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge className={cn("hidden h-7 border-0 px-2.5 text-[11px] font-medium shadow-none sm:inline-flex", studioReady ? "bg-[var(--md-accent-a10)] text-[var(--md-accent)]" : "bg-[var(--md-surface-tint)] text-[var(--md-subtle)]")}>
            {studioLoading ? t("Checking job access…") : savedTemplate ? `${t("Template ID")} ${savedTemplate.carboneTemplateId}` : studioReady ? t("JSON and preview ready") : t("Choose document context")}
          </Badge>
          {studioReady ? (
            <>
              <Button type="button" variant="ghost" onClick={() => clearStudio({ preserveTemplate: true })} className="hidden h-9 rounded-[var(--md-radius-md)] px-2.5 text-[11px] lg:inline-flex">
                {t("Change source")}
              </Button>
              <Button type="button" variant="ghost" size="icon-lg" onClick={downloadTemplateForLocalEditing} aria-label={t("Download template to edit locally")} title={t("Download template to edit locally")} className="rounded-[var(--md-radius-md)]">
                <Download className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
              </Button>
              <input
                ref={templateUploadRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                onChange={(event) => void uploadEditedTemplate(event.target.files?.[0])}
                tabIndex={-1}
                aria-hidden="true"
              />
              <Button type="button" variant="ghost" size="icon-lg" onClick={() => templateUploadRef.current?.click()} aria-label={t("Upload edited Word template and refresh preview")} title={t("Upload edited Word template and refresh preview")} className="rounded-[var(--md-radius-md)]">
                <FileUp className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
              </Button>
              {canManageTemplates ? (
                <Button type="button" variant="ghost" onClick={() => void saveTemplateVersion()} disabled={savingTemplate} className="h-9 rounded-[var(--md-radius-md)] px-2.5 text-[11px]">
                  {savingTemplate ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="size-3.5" strokeWidth={1.6} aria-hidden="true" />}
                  <span className="hidden xl:inline">{savingTemplate ? t("Saving…") : t("Save template")}</span>
                </Button>
              ) : null}
              {savedTemplate ? (
                <Button type="button" variant="ghost" size="icon-lg" onClick={() => void copyTemplateId()} aria-label={t("Copy Carbone template ID")} title={t("Copy Carbone template ID")} className="rounded-[var(--md-radius-md)]">
                  <Copy className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
                </Button>
              ) : null}
            </>
          ) : null}
          {studioReady ? (
            <Button type="button" onClick={() => void submit()} disabled={submitting} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3.5 text-[12px] text-white shadow-[0_8px_20px_var(--md-accent-a14)]">
              {submitting ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FilePlus2 className="size-3.5" strokeWidth={1.8} aria-hidden="true" />}
              <span className="hidden sm:inline">{submitting ? t("Preparing document…") : t("Create and download")}</span>
            </Button>
          ) : null}
        </div>
      </header>

      {studioReady ? (
      <div className="md-document-editor__workspace" data-studio-ready="true">
        <section className="md-document-editor__stage" data-ready={studioReady} aria-labelledby="document-studio-title">
          <div className="md-document-editor__stage-header">
            <div className="min-w-0 px-4 py-3.5">
              <h2 id="document-studio-title" className="truncate text-[13px] font-medium text-[var(--md-ink)]">{t("Data (JSON)")}</h2>
              <p className="mt-0.5 truncate text-[11px] text-[var(--md-subtle)]">{studioSession ? `${selectedModuleName} · ${studioSession.jobReference}` : t("Authorised module data appears here")}</p>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <h2 className="truncate text-[13px] font-medium text-[var(--md-ink)]">{t("Live preview")}</h2>
                <p className="mt-0.5 truncate text-[11px] text-[var(--md-subtle)]">{studioSession ? studioSession.templateName : t("Rendered from the current JSON and Word template")}</p>
              </div>
              <Badge className="hidden border-0 bg-[var(--md-accent-a10)] text-[10px] text-[var(--md-accent)] shadow-none xl:inline-flex">
              <ShieldCheck className="size-3" aria-hidden="true" />
              {t("Protected connection")}
              </Badge>
            </div>
          </div>
          <div className="md-document-editor__canvas">
            <motion.span
              aria-hidden="true"
              className="md-document-editor__document-edge"
              initial={false}
              animate={{ opacity: studioReady ? 1 : 0.2, scaleY: studioReady ? 1 : 0.36 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
            />
            {studioError ? (
              <div role="alert" className="absolute inset-x-3 top-3 z-20 flex items-start gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] p-3 text-[11px] text-[var(--md-red)] shadow-[var(--md-shadow-soft)]">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>{studioError}</span>
              </div>
            ) : null}
            <DocumentStudioWorkspace
              session={studioSession}
              request={studioRequest}
              templateBase64={studioTemplateBase64}
              sampleData={studioData}
              onDataChange={setStudioData}
              onError={setStudioError}
            />
          </div>
          <div className="sr-only" role="status" aria-live="polite">
            {studioLoading ? t("Opening secure Studio…") : studioSession ? t("Carbone Studio is ready.") : ""}
          </div>
        </section>
      </div>
      ) : (
        <main data-document-context-step className="min-h-0 flex-1 overflow-y-auto bg-[var(--md-bg-strong)] px-4 py-8 sm:px-6 sm:py-10">
          <form
            className="mx-auto w-full max-w-[660px]"
            onSubmit={(event) => {
              event.preventDefault()
              void openStudio()
            }}
            aria-labelledby="document-context-title"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
                <FileText className="size-4.5" strokeWidth={1.4} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[var(--md-accent)]">{selectedTemplate ? `${t(selectedTemplate.name)} · v${selectedTemplate.version}` : t("Document source")}</p>
                <h2 id="document-context-title" className="mt-1 text-[18px] font-medium tracking-[-0.02em] text-[var(--md-ink)]">{t("Choose document context")}</h2>
                <p className="mt-1 max-w-xl text-[12px] leading-5 text-[var(--md-text)]">{t("Confirm the authorised job before opening this saved template.")}</p>
                <p className="mt-0.5 max-w-xl text-[11px] leading-5 text-[var(--md-subtle)]">{t("Your previous choices are prefilled so you can check or change them safely.")}</p>
              </div>
            </div>

            <Surface padding="none" className="mt-6 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)]">
              <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                <label className="block sm:col-span-2">
                  <span className="text-[12px] font-medium text-[var(--md-ink)]">{t("Template")}</span>
                  <Select value={templateCode} onValueChange={chooseTemplate}>
                    <SelectTrigger className="mt-2 h-10 w-full rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]">
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
                  <span className="flex items-center justify-between gap-3 text-[12px] font-medium text-[var(--md-ink)]">
                    {t("Data module")}
                    <span className="text-[10px] font-normal text-[var(--md-subtle)]">{t("Assigned by template")}</span>
                  </span>
                  <Select value="job" disabled>
                    <SelectTrigger aria-describedby="document-module-help" className="mt-2 h-10 w-full rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]">
                      <SelectValue placeholder={t("Choose a data module")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="job">{t("Jobs")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <span id="document-module-help" className="mt-1.5 block text-[10.5px] leading-[1.45] text-[var(--md-subtle)]">{t("Jobs is the only data module currently supported for document templates.")}</span>
                </label>

                <label className="block">
                  <span className="text-[12px] font-medium text-[var(--md-ink)]">{t("Job number")}</span>
                  <Input
                    ref={jobInputRef}
                    value={jobNumber}
                    onChange={(event) => {
                      clearStudio({ preserveTemplate: true })
                      setError(null)
                      setJobNumber(event.target.value.toUpperCase().replace(/[^A-Z0-9._/-]/g, "").slice(0, 50))
                    }}
                    placeholder="e.g. JE22481"
                    inputMode="text"
                    autoComplete="off"
                    dir="ltr"
                    aria-invalid={Boolean(error && !isJobNumber(jobNumber.trim()))}
                    aria-describedby="document-job-help"
                    className="mt-2 h-10 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-base tabular-nums shadow-[var(--md-shadow-line)] sm:text-[13px]"
                    data-i18n-skip
                  />
                  <span id="document-job-help" className="mt-1.5 block text-[10.5px] leading-[1.45] text-[var(--md-subtle)]">{t("The job must belong to one of your authorised offices.")}</span>
                </label>

                <label className="block sm:col-span-2 sm:max-w-[calc(50%-10px)]">
                  <span className="text-[12px] font-medium text-[var(--md-ink)]">{t("File format")}</span>
                  <Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as DocumentOutputFormat)}>
                    <SelectTrigger className="mt-2 h-10 w-full rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(selectedTemplate?.outputFormats ?? ["pdf"]).map((format) => (
                        <SelectItem key={format} value={format}>{format.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <details className="group px-5 pb-5 sm:px-6 sm:pb-6">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-ink)] hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]">
                  <span>{t("Information to include")}</span>
                  <span className="text-[10.5px] font-normal tabular-nums text-[var(--md-subtle)]">{contentSections.length} {t("selected")}</span>
                </summary>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {(selectedTemplate?.contentSections ?? []).map((section) => {
                    const checked = contentSections.includes(section.code)
                    const controlId = `document-section-${section.code}`
                    return (
                      <label
                        key={section.code}
                        htmlFor={controlId}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[var(--md-radius-md)] px-2.5 py-2 text-start transition-[background-color,box-shadow,transform] duration-200 focus-within:ring-[3px] focus-within:ring-[var(--md-accent-a14)] active:scale-[0.99] motion-reduce:transform-none",
                          checked ? "bg-[var(--md-selected-bg)] shadow-[var(--md-shadow-line)]" : "hover:bg-[var(--md-hover)]",
                          section.required && "cursor-default",
                        )}
                      >
                        <Checkbox
                          id={controlId}
                          checked={checked}
                          disabled={section.required}
                          onCheckedChange={(value) => setSectionSelected(section.code, value === true)}
                          className="mt-0.5 size-4.5"
                        />
                        <span className="min-w-0 text-[11px] leading-[1.45] text-[var(--md-text)]">
                          <span className="font-medium text-[var(--md-ink)]">{t(section.label)}</span>
                          {section.required ? <span className="ms-1.5 text-[9.5px] text-[var(--md-subtle)]">{t("Required")}</span> : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </details>

              <div className="flex flex-col gap-3 bg-[var(--md-surface-tint)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex min-w-0 gap-2.5 text-[10.5px] leading-[1.5] text-[var(--md-text)]">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" />
                  <p>{t("The exact source data is snapshotted for audit before the document is rendered.")}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  {canManageTemplates ? (
                    <>
                      <input
                        ref={sourceUploadRef}
                        type="file"
                        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="sr-only"
                        onChange={(event) => void publishTemplateSource(event.target.files?.[0])}
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={publishingSource || !selectedTemplate}
                        onClick={() => sourceUploadRef.current?.click()}
                        className="h-10 rounded-[var(--md-radius-md)] px-3.5 text-[12px]"
                      >
                        {publishingSource ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileUp className="size-3.5" strokeWidth={1.6} aria-hidden="true" />}
                        {publishingSource ? t("Publishing source…") : t("Upload Word source")}
                      </Button>
                    </>
                  ) : null}
                  <Button type="submit" disabled={studioLoading || publishingSource} className="h-10 shrink-0 rounded-[var(--md-radius-md)] bg-[var(--md-ink)] px-4 text-[12px] text-[var(--md-surface)] hover:bg-[var(--md-ink)]/90">
                    {studioLoading ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FilePenLine className="size-3.5" strokeWidth={1.8} aria-hidden="true" />}
                    {studioLoading ? t("Checking job access…") : t("Continue to JSON and preview")}
                  </Button>
                </div>
              </div>
            </Surface>

            <AnimatePresence initial={false}>
              {contextError ? (
                <motion.div
                  key="document-context-error"
                  role="alert"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
                  className="mt-3 flex gap-2 rounded-[var(--md-radius-md)] bg-[rgba(190,70,60,0.08)] p-3 text-[11px] leading-[1.45] text-[var(--md-red)]"
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>{contextError}</span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </form>
        </main>
      )}
    </section>
  )
}

export function DocumentsPage({ navigate, initialWorkspace, preview = false }: DocumentsPageProps) {
  const { language, t } = useLanguage()
  const [workspace, setWorkspace] = useState<DocumentBuilderWorkspace | null>(initialWorkspace ?? documentWorkspaceCache)
  const [loading, setLoading] = useState(!initialWorkspace && !documentWorkspaceCache)
  const [error, setError] = useState<string | null>(null)
  const [documentOffset, setDocumentOffset] = useState(0)
  const [documentPageSize, setDocumentPageSize] = useState(defaultPaginationPageSize)
  const [documentQuery, setDocumentQuery] = useState("")
  const [debouncedDocumentQuery, setDebouncedDocumentQuery] = useState("")
  const [documentSort, setDocumentSort] = useState<{ id: string; direction: "asc" | "desc" } | null>({ id: "created", direction: "desc" })
  const [documentPageLoading, setDocumentPageLoading] = useState(false)
  const [documentPageError, setDocumentPageError] = useState<string | null>(null)
  const documentRequestIdRef = useRef(0)
  const lastDocumentPageKeyRef = useRef<string | null>(initialWorkspace ? `0|${defaultPaginationPageSize}||created:desc` : null)
  // Entering Documents is always an overview. A retained local draft is only
  // considered after the operator explicitly starts document creation.
  const [createOpen, setCreateOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(() => window.location.pathname === "/documents/templates")
  const [resumeActiveDraft, setResumeActiveDraft] = useState(false)
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [previewDocument, setPreviewDocument] = useState<GeneratedDocumentSummary | null>(null)
  const [previewDocumentUrl, setPreviewDocumentUrl] = useState<string | null>(null)
  const [previewDocumentLoading, setPreviewDocumentLoading] = useState(false)
  const [previewDocumentError, setPreviewDocumentError] = useState<string | null>(null)
  const createTriggerTemplateRef = useRef<string | null>(null)
  const previewRequestIdRef = useRef(0)

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    [language],
  )

  async function loadWorkspace() {
    setLoading(true)
    setError(null)
    try {
      const nextWorkspace = await getDocumentBuilderWorkspace({
        offset: documentOffset,
        limit: documentPageSize,
        search: debouncedDocumentQuery,
        sort: documentSort ?? { id: "created", direction: "desc" },
      })
      lastDocumentPageKeyRef.current = `${documentOffset}|${documentPageSize}|${debouncedDocumentQuery}|${documentSort?.id ?? "created"}:${documentSort?.direction ?? "desc"}`
      documentWorkspaceCache = nextWorkspace
      setWorkspace(nextWorkspace)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("The document workspace could not be loaded."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!initialWorkspace) void loadWorkspace()
  }, [initialWorkspace])

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedDocumentQuery(documentQuery.trim()), 250)
    return () => window.clearTimeout(timeout)
  }, [documentQuery])

  useEffect(() => setDocumentOffset(0), [debouncedDocumentQuery, documentSort])

  useEffect(() => {
    if (!workspace) return
    const key = `${documentOffset}|${documentPageSize}|${debouncedDocumentQuery}|${documentSort?.id ?? "created"}:${documentSort?.direction ?? "desc"}`
    if (lastDocumentPageKeyRef.current === key) return
    lastDocumentPageKeyRef.current = key
    const requestId = documentRequestIdRef.current + 1
    documentRequestIdRef.current = requestId
    setDocumentPageLoading(true)
    setDocumentPageError(null)
    void getGeneratedDocumentsPage({
      offset: documentOffset,
      limit: documentPageSize,
      search: debouncedDocumentQuery,
      sort: documentSort ?? { id: "created", direction: "desc" },
    }).then((page) => {
      if (documentRequestIdRef.current !== requestId) return
      setWorkspace((current) => current ? {
        ...current,
        generatedDocuments: page.rows,
        generatedDocumentTotal: page.total,
        generatedDocumentOffset: page.offset,
        generatedDocumentLimit: page.limit,
      } : current)
    }).catch((pageError) => {
      if (documentRequestIdRef.current !== requestId) return
      setDocumentPageError(pageError instanceof Error ? pageError.message : t("Document history could not be loaded."))
    }).finally(() => {
      if (documentRequestIdRef.current === requestId) setDocumentPageLoading(false)
    })
  }, [debouncedDocumentQuery, documentOffset, documentPageSize, documentSort, t, workspace?.permissions.canGenerate])

  useEffect(() => () => {
    if (previewDocumentUrl) URL.revokeObjectURL(previewDocumentUrl)
  }, [previewDocumentUrl])

  function openCreate(templateCode: string | null = null) {
    createTriggerTemplateRef.current = templateCode
    setSelectedTemplateCode(templateCode)
    setResumeActiveDraft(false)
    markDocumentBuilderDraftActive(true)
    setCreateOpen(true)
  }

  function closeCreate() {
    setCreateOpen(false)
    setResumeActiveDraft(false)
    window.requestAnimationFrame(() => {
      const selector = createTriggerTemplateRef.current
        ? `[data-document-template-code="${CSS.escape(createTriggerTemplateRef.current)}"]`
        : "[data-document-create-trigger]"
      document.querySelector<HTMLElement>(selector)?.focus()
    })
  }

  function openManage() {
    setManageOpen(true)
    navigate?.("/documents/templates")
  }

  function closeManage() {
    setManageOpen(false)
    navigate?.("/documents")
  }

  async function download(document: GeneratedDocumentSummary) {
    if (preview) {
      toast.info(t("Preview only"), { description: t("Secure downloads are enabled after the service is deployed.") })
      return
    }

    setDownloadingId(document.id)
    try {
      const result = await getGeneratedDocumentDownload(document.id)
      await startSignedDownload(result.signedUrl, result.fileName)
    } catch (downloadError) {
      toast.error(t("Download unavailable"), {
        description: downloadError instanceof Error ? downloadError.message : t("A secure download link could not be created."),
      })
    } finally {
      setDownloadingId(null)
    }
  }

  function closeDocumentPreview() {
    previewRequestIdRef.current += 1
    setPreviewDocument(null)
    setPreviewDocumentLoading(false)
    setPreviewDocumentError(null)
    setPreviewDocumentUrl(null)
  }

  async function openDocumentPreview(document: GeneratedDocumentSummary) {
    if (document.status !== "ready") return

    const requestId = previewRequestIdRef.current + 1
    previewRequestIdRef.current = requestId
    setPreviewDocument(document)
    setPreviewDocumentLoading(true)
    setPreviewDocumentError(null)
    setPreviewDocumentUrl(null)

    if (preview) {
      setPreviewDocumentLoading(false)
      setPreviewDocumentError(t("Secure previews are enabled after the service is deployed."))
      return
    }

    try {
      const result = await getGeneratedDocumentDownload(document.id)
      const blob = await fetchSignedDocument(result.signedUrl)
      if (previewRequestIdRef.current !== requestId) return
      setPreviewDocumentUrl(URL.createObjectURL(blob))
    } catch (previewError) {
      if (previewRequestIdRef.current !== requestId) return
      setPreviewDocumentError(previewError instanceof Error ? previewError.message : t("The document preview could not be opened."))
    } finally {
      if (previewRequestIdRef.current === requestId) setPreviewDocumentLoading(false)
    }
  }

  const publishedTemplates = workspace?.templates.filter((template) => template.status === "published") ?? []
  const generatedDocuments = workspace?.generatedDocuments ?? []
  const generatedDocumentTotal = workspace?.generatedDocumentTotal ?? generatedDocuments.length
  const generatedDocumentColumns = useMemo<DataTableColumn<GeneratedDocumentSummary>[]>(() => [
    { id: "document", label: "Document", kind: "long-text", width: 280, minWidth: 210, resizable: true, sortValue: (document) => document.fileName, cellTitle: (document) => document.fileName, cell: (document) => <div className="min-w-0"><p className="truncate text-[11.5px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{document.fileName}</p><p className="mt-0.5 text-[10px] text-[var(--md-subtle)]"><span>{t(document.templateName)}</span> · <span data-i18n-skip>{formatBytes(document.fileSizeBytes)}</span></p></div> },
    { id: "job", label: "Job", kind: "text", width: 140, sortValue: (document) => document.targetReference, cell: (document) => <span className="text-[11px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{document.targetReference}</span> },
    { id: "customer", label: "Customer", kind: "long-text", width: 190, resizable: true, sortValue: (document) => document.customerName ?? "", cellTitle: (document) => document.customerName ?? undefined, cell: (document) => <span className="block truncate text-[11px] text-[var(--md-text)]" data-i18n-skip dir="auto">{document.customerName ?? "—"}</span> },
    { id: "created", label: "Created", kind: "date", width: 150, sortValue: (document) => document.createdAt, cell: (document) => <span className="tabular-nums text-[10.5px] text-[var(--md-text)]" data-i18n-skip>{dateFormatter.format(new Date(document.createdAt))}</span> },
    { id: "status", label: "Status", kind: "status", width: 112, sortValue: (document) => document.status, cell: (document) => <StatusPill kind="status" tone={statusTone[document.status]} className="capitalize">{t(document.status)}</StatusPill> },
    { id: "actions", label: "Actions", kind: "actions", width: 64, canHide: false, canPin: false, cell: (document) => <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" disabled={document.status !== "ready" || downloadingId === document.id} onClick={(event) => { event.stopPropagation(); void download(document) }} aria-label={t("Download document")} className="opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100">{downloadingId === document.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}</Button></TooltipTrigger><TooltipContent>{t("Download document")}</TooltipContent></Tooltip> },
  ], [dateFormatter, downloadingId, t])

  if (manageOpen && workspace) {
    return (
      <CreateDocumentWorkspace
        templates={publishedTemplates}
        canManageTemplates={workspace.permissions.canManageTemplates}
        initialTemplateCode={selectedTemplateCode}
        resumeActiveDraft={false}
        onClose={closeManage}
        onRendered={loadWorkspace}
        preview={preview}
      />
    )
  }

  if (createOpen && workspace) {
    return (
      <QuickCreateDocumentWorkspace
        templates={workspace.templates.filter((template) => template.status === "published")}
        initialTemplateCode={selectedTemplateCode}
        onClose={closeCreate}
        onRendered={loadWorkspace}
        preview={preview}
        navigate={navigate}
      />
    )
  }

  return (
    <div
      className="md-page md-page-sections h-full min-h-0 overflow-y-auto overscroll-contain px-[var(--md-page-pad)] pb-[var(--md-page-bottom-pad)] pt-[var(--md-workspace-pad-y)] md-scrollbar max-lg:pt-20"
      data-document-page-scroll
      dir="inherit"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--md-accent)]">{t("Documents")}</p>
          <h1 className="mt-1 text-[24px] font-medium tracking-[-0.03em] text-[var(--md-ink)]">{t("Create the right document in seconds")}</h1>
          <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">
            {t("Choose a template and a job. Multideck takes care of the data, audit trail and secure delivery.")}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => openCreate()}
          data-document-create-trigger
          disabled={!workspace?.permissions.canGenerate || publishedTemplates.length === 0}
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

      <section className="md-section-stack">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-medium text-[var(--md-ink)]">{t("Templates")}</h2>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Choose a template to create a customer document.")}</p>
          </div>
          {workspace?.permissions.canManageTemplates && navigate ? (
            <Button type="button" variant="ghost" onClick={openManage} className="text-[12px]">
              {t("Manage templates")}
            </Button>
          ) : null}
        </div>

        {loading && !workspace ? (
          <Surface tone="soft" className="grid min-h-36 place-items-center">
            <LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" aria-label={t("Loading templates")} />
          </Surface>
        ) : publishedTemplates.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {publishedTemplates.map((template) => {
              const previewDocument = currentPreviewDocument(template, workspace?.generatedDocuments ?? [])
              const jobSource = previewDocument
                ?? workspace?.generatedDocuments.find((document) => document.status === "ready" && document.templateCode === template.code)
                ?? workspace?.generatedDocuments.find((document) => document.status === "ready")
              return (
              <button
                key={template.id}
                type="button"
                onClick={() => openCreate(template.code)}
                data-document-template-code={template.code}
                disabled={!workspace?.permissions.canGenerate || template.status !== "published"}
                aria-label={`${t("Use template")}: ${t(template.name)}`}
                className="group min-w-0 text-start outline-none disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className="block aspect-[210/297] overflow-hidden rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5 group-hover:shadow-[var(--md-shadow-soft)] group-focus-visible:ring-[3px] group-focus-visible:ring-[var(--md-accent-a14)] group-active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none" aria-hidden="true">
                  <DocumentTemplatePreview
                    template={template}
                    previewDocument={previewDocument}
                    previewJobNumber={previewJobNumber(jobSource)}
                  />
                </span>
                <span className="mt-2.5 block min-w-0 text-center">
                  <span className="relative inline-block pb-1 text-[13px] font-medium leading-5 text-[var(--md-ink)]">
                    {t(template.name)}
                    <svg aria-hidden="true" className="absolute inset-x-0 -bottom-0.5 h-1 w-full overflow-visible" viewBox="0 0 100 4" preserveAspectRatio="none">
                      <path
                        d="M1 2.4 C24 1.4 72 1.6 99 2"
                        pathLength="1"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                        className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:[stroke-dashoffset:0] group-focus-visible:[stroke-dashoffset:0] motion-reduce:transition-none"
                      />
                    </svg>
                  </span>
                </span>
              </button>
              )
            })}
          </div>
        ) : (
          <Surface tone="soft" className="py-10 text-center">
            <FileText className="mx-auto size-5 text-[var(--md-subtle)]" aria-hidden="true" />
            <p className="mt-3 text-[12px] font-medium text-[var(--md-ink)]">{t("No templates yet")}</p>
            <p className="mt-1 text-[11px] text-[var(--md-text)]">{t("Add the first template to make document creation available.")}</p>
          </Surface>
        )}
      </section>

      <section className="md-section-stack">
        <div>
          <h2 className="text-[17px] font-medium text-[var(--md-ink)]">{t("Recent documents")}</h2>
          <p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Every file is private and downloaded through a short-lived secure link.")}</p>
        </div>
        {documentPageError ? <Surface role="alert" tone="soft" className="mb-3 flex items-center justify-between gap-3 border-s-2 border-[var(--md-red)]"><p className="text-[11px] text-[var(--md-text)]">{documentPageError}</p><Button type="button" variant="ghost" onClick={() => { lastDocumentPageKeyRef.current = null; setDocumentSort((current) => current ? { ...current } : { id: "created", direction: "desc" }) }}>{t("Try again")}</Button></Surface> : null}
        <DataTable
          ariaLabel="Recent documents"
          columnsButtonLabel="Manage document columns"
          columns={generatedDocumentColumns}
          rows={generatedDocuments}
          getRowKey={(document) => document.id}
          storageKey="generated-documents"
          minimumWidth={760}
          onRowClick={(document) => void openDocumentPreview(document)}
          isRowInteractive={(document) => document.status === "ready"}
          rowAriaLabel={(document) => `Preview document: ${document.fileName}`}
          rowClassName="group/row"
          serverSorting={{ value: documentSort, onChange: (next) => setDocumentSort(next ?? { id: "created", direction: "desc" }) }}
          pagination={{ offset: documentOffset, limit: documentPageSize, total: generatedDocumentTotal, loading: documentPageLoading, onOffsetChange: setDocumentOffset, onLimitChange: setDocumentPageSize, error: Boolean(documentPageError) }}
          toolbarSearch={<label className="relative min-w-0 sm:w-[240px]"><span className="sr-only">{t("Search documents")}</span><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" aria-hidden="true" /><Input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} className="h-8 ps-9 text-base sm:text-[12px]" placeholder={t("Document, job or customer…")} /></label>}
          emptyState={<p className="text-[11px] text-[var(--md-subtle)]">{documentPageLoading ? t("Loading documents…") : debouncedDocumentQuery ? t("No documents match this search.") : t("No documents have been generated yet.")}</p>}
        />
      </section>

      <Dialog open={Boolean(previewDocument)} onOpenChange={(open) => { if (!open) closeDocumentPreview() }}>
        <DialogContent
          className="h-[min(90dvh,920px)] w-[min(1120px,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-0 shadow-[var(--md-shadow-lift)] sm:max-w-none"
          dir="inherit"
        >
          <DialogHeader className="shrink-0 ps-5 pe-14 py-4 text-start shadow-[var(--md-stroke-bottom)]">
            <DialogTitle className="truncate text-[15px]" data-i18n-skip dir="auto">{previewDocument?.fileName}</DialogTitle>
            <DialogDescription className="truncate text-[11px]">
              {previewDocument ? <><span>{t(previewDocument.templateName)}</span> · <span>{t("Job")}</span> <span data-i18n-skip dir="auto">{previewDocument.targetReference}</span> · <span data-i18n-skip>{formatBytes(previewDocument.fileSizeBytes)}</span></> : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 place-items-center bg-[var(--md-report-preview-bg)] p-3 sm:p-5">
            {previewDocumentLoading ? <LoaderCircle className="size-5 animate-spin text-[var(--md-accent)] motion-reduce:animate-none" aria-label={t("Loading preview…")} /> : null}
            {previewDocumentError ? <p className="max-w-md text-center text-[12px] text-[var(--md-text)]">{previewDocumentError}</p> : null}
            {!previewDocumentLoading && !previewDocumentError && previewDocumentUrl && previewDocument?.mimeType === "application/pdf" ? (
              <iframe src={previewDocumentUrl} title={t("Document preview")} className="h-full min-h-[480px] w-full rounded-[var(--md-radius-lg)] bg-white shadow-[var(--md-shadow-float)]" />
            ) : null}
            {!previewDocumentLoading && !previewDocumentError && previewDocumentUrl && previewDocument?.mimeType !== "application/pdf" ? (
              <p className="text-[12px] text-[var(--md-text)]">{t("Preview is available for PDF documents.")}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 justify-end px-5 py-3 shadow-[var(--md-stroke-top)]">
            <Button
              type="button"
              variant="ghost"
              disabled={!previewDocument || previewDocument.status !== "ready" || downloadingId === previewDocument.id}
              onClick={() => { if (previewDocument) void download(previewDocument) }}
              className="h-9 rounded-[var(--md-radius-md)] px-3 text-[11px]"
            >
              {previewDocument && downloadingId === previewDocument.id ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Download className="size-3.5" />}
              {t("Download document")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
