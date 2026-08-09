import { useEffect, useMemo, useState } from "react"
import { ChevronUp, Download, Eye, FileText, Loader2, Mail, MessageCircle } from "@/components/icons/hugeicons"
import { toast } from "sonner"

import gmailLogo from "@/assets/integrations/gmail.svg"
import outlookLogo from "@/assets/integrations/outlook.png"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import type { DexterEmailAttachment } from "@/lib/dexter-api"
import { getAttachmentBlobUrl } from "@/lib/inbox-api"

type PreviewKind = "image" | "pdf" | "text" | null

function previewKind(mimeType: string): PreviewKind {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType === "application/pdf") return "pdf"
  if (mimeType === "text/plain" || mimeType === "text/csv") return "text"
  return null
}

function formatBytes(value: number, locale: string) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const unit = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  const amount = value / 1024 ** unit
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(amount)} ${units[unit]}`
}

type AttachmentLoader = (attachmentId: string) => Promise<{ url: string; revoke: () => void }>

export function DexterEmailAttachmentCard({
  attachment,
  loadAttachment = getAttachmentBlobUrl,
  variant = "default",
  onAskDexter,
}: {
  attachment: DexterEmailAttachment
  loadAttachment?: AttachmentLoader
  variant?: "default" | "watch"
  onAskDexter?: (attachment: DexterEmailAttachment) => void
}) {
  const { language, t } = useLanguage()
  const kind = useMemo(() => previewKind(attachment.mimeType), [attachment.mimeType])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [previewRevoke, setPreviewRevoke] = useState<(() => void) | null>(null)
  const [busyAction, setBusyAction] = useState<"view" | "download" | null>(null)
  const providerLogo = attachment.provider === "gmail" ? gmailLogo : outlookLogo
  const unavailable = Boolean(attachment.limitation)

  useEffect(() => () => previewRevoke?.(), [previewRevoke])

  async function view() {
    if (!kind || busyAction) return
    if (previewUrl) {
      previewRevoke?.()
      setPreviewUrl(null)
      setPreviewText(null)
      setPreviewRevoke(null)
      return
    }

    setBusyAction("view")
    try {
      const opened = await loadAttachment(attachment.id)
      setPreviewUrl(opened.url)
      setPreviewRevoke(() => opened.revoke)
      if (kind === "text") {
        const response = await fetch(opened.url)
        setPreviewText((await response.text()).slice(0, 200_000))
      }
    } catch {
      toast.error(t("This attachment could not be opened."))
    } finally {
      setBusyAction(null)
    }
  }

  async function download() {
    if (busyAction) return
    setBusyAction("download")
    let opened: { url: string; revoke: () => void } | null = null
    try {
      opened = await loadAttachment(attachment.id)
      const link = document.createElement("a")
      link.href = opened.url
      link.download = attachment.fileName || "attachment"
      link.rel = "noopener noreferrer"
      link.hidden = true
      document.body.append(link)
      link.click()
      link.remove()
    } catch {
      toast.error(t("This attachment could not be downloaded."))
    } finally {
      if (opened) window.setTimeout(opened.revoke, 60_000)
      setBusyAction(null)
    }
  }

  return (
    <section className={variant === "watch"
      ? "w-full min-w-0 overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]"
      : "max-w-[560px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]"}>
      <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-3 p-3">
        <span className="relative grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
          <FileText className="size-[18px]" strokeWidth={1.35} aria-hidden="true" />
          <img
            src={providerLogo}
            alt=""
            aria-hidden="true"
            className="absolute -bottom-1 -end-1 size-[17px] rounded-[5px] bg-[var(--md-surface)] p-[2px] shadow-[var(--md-shadow-line)]"
          />
        </span>
        <span className="min-w-0">
          <bdi dir="auto" data-i18n-skip className="block truncate text-[13px] font-medium text-[var(--md-ink)]" title={attachment.fileName}>
            {attachment.fileName}
          </bdi>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--md-subtle)]">
            <span data-i18n-skip dir="ltr" className="shrink-0 tabular-nums">{formatBytes(attachment.sizeBytes, language)}</span>
            <span aria-hidden="true">·</span>
            <bdi dir="auto" data-i18n-skip className="truncate">{attachment.subject || t("Email attachment")}</bdi>
          </span>
        </span>
        <span className="col-span-2 flex min-w-0 flex-wrap items-center justify-end gap-1">
          {kind && !unavailable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px]"
              onClick={() => void view()}
              aria-expanded={previewUrl !== null}
            >
              {busyAction === "view" ? (
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
              ) : previewUrl ? (
                <ChevronUp className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Eye className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              )}
              {t(previewUrl ? "Close" : "View")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px]"
            onClick={() => void download()}
            disabled={unavailable}
          >
            {busyAction === "download" ? (
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Download className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            )}
            {t("Download")}
          </Button>
          {onAskDexter && !unavailable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px] text-[var(--md-accent)]"
              onClick={() => onAskDexter(attachment)}
            >
              <MessageCircle className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              {t("Ask Dexter")}
            </Button>
          ) : null}
        </span>
      </div>

      {attachment.limitation ? (
        <p role="status" className="border-t border-[var(--md-line)] px-3 py-2 text-[11.5px] leading-5 text-[var(--md-amber)]">
          {t(attachment.limitation)}
        </p>
      ) : null}

      {previewUrl ? (
        <div className="border-t border-[var(--md-line)] bg-[var(--md-surface)] p-2">
          {kind === "image" ? (
            <img src={previewUrl} alt={attachment.fileName} className="mx-auto max-h-[520px] max-w-full rounded-[var(--md-radius-lg)] object-contain" />
          ) : kind === "pdf" ? (
            <iframe
              src={previewUrl}
              title={`${t("Preview")} ${attachment.fileName}`}
              className="h-[min(62vh,620px)] w-full rounded-[var(--md-radius-lg)] border-0 bg-white"
            />
          ) : (
            <pre data-i18n-skip dir="auto" className="md-scrollbar max-h-[420px] overflow-auto whitespace-pre-wrap rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 text-[12px] leading-5 text-[var(--md-ink)]">
              {previewText ?? t("Loading preview…")}
            </pre>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-[var(--md-line)] px-3 py-2 text-[11px] text-[var(--md-subtle)]">
        <span className="inline-flex items-center gap-1.5">
          <Mail className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
          {t(attachment.provider === "gmail" ? "From Gmail" : "From Outlook")}
        </span>
        {attachment.sourceUrl ? (
          <a href={attachment.sourceUrl} className="font-medium text-[var(--md-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)]">
            {t("Open email")}
          </a>
        ) : null}
      </div>
    </section>
  )
}
