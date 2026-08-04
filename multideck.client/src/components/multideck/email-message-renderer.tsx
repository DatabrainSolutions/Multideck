import { useEffect, useMemo, useRef, useState } from "react"
import { useLanguage } from "@/i18n/language-provider"
import { getInlineAttachmentBlobUrl, type MailAttachment } from "@/lib/inbox-api"
import { cn } from "@/lib/utils"

/**
 * Renders one email body.
 *
 * Provider HTML is sanitised on the server and still treated as untrusted here.
 * It is never handed to `dangerouslySetInnerHTML`; it goes into a sandboxed
 * iframe whose own Content Security Policy blocks scripts, frames, forms and
 * every network request except secure remote images. Images load with the
 * message while the frame keeps a no-referrer policy.
 *
 * `allow-same-origin` is present so the parent can measure the document's height
 * and the body never gets a scrollbar of its own. Nothing can execute inside it:
 * the sandbox omits `allow-scripts` and the CSP sets `script-src 'none'`, so
 * same-origin access carries no privilege worth taking.
 */

const sandboxPermissions = "allow-same-origin allow-popups allow-popups-to-escape-sandbox"

function contentPolicy() {
  return [
    "default-src 'none'",
    "script-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "style-src 'unsafe-inline'",
    "img-src data: blob: https:",
  ].join("; ")
}

/**
 * Colour emoji fonts, named explicitly. Without them a stack that ends in a
 * generic family can resolve an emoji to a monochrome symbol glyph, which is why
 * mail arrived with hollow outlines where a sender wrote 🎉 or ✅.
 */
const emojiFonts = `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", emoji`

function frameStyles(theme: "light" | "dark") {
  const ink = "#0b1413"
  const text = "#4f5b58"
  const line = theme === "dark" ? "rgba(232,241,235,0.14)" : "rgba(11,20,19,0.12)"
  const link = "#0a7068"
  const quote = "rgba(11,20,19,0.14)"
  const darkAppearance = theme === "dark"
    ? `
    /* Email HTML commonly hard-codes black text and white surfaces. Invert the
       complete document in dark appearance so those authored pairs keep their
       contrast, then cancel the filter for media so photographs and logos keep
       their original colours. */
    body { filter: invert(1) hue-rotate(180deg); }
    img, picture, video { filter: invert(1) hue-rotate(180deg); }
    `
    : ""

  return `
    :root { color-scheme: ${theme}; }
    html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
    body {
      font-family: "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif, ${emojiFonts};
      font-size: 14px;
      line-height: 1.6;
      color: ${ink};
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    p, div, td, li, span { max-width: 100%; }
    p { margin: 0 0 12px; }
    a { color: ${link}; text-decoration-thickness: from-font; text-underline-offset: 2px; }
    /* Only the width is clamped. A sender's own height, and anything drawn
       around the image, is left alone: an inline logo, signature icon or emoji
       image must arrive at the size it was written at, without a frame the
       sender never asked for. */
    img { max-width: 100% !important; height: auto; }
    table { max-width: 100% !important; }
    /* Mail is laid out in tables, so cell rules would draw a grid over an entire
       newsletter. Only a table that asked for borders gets them. */
    table[border]:not([border="0"]) { border-collapse: collapse; }
    table[border]:not([border="0"]) > * > tr > td,
    table[border]:not([border="0"]) > * > tr > th,
    table[border]:not([border="0"]) > tr > td,
    table[border]:not([border="0"]) > tr > th {
      padding: 6px 10px;
      border: 1px solid ${line};
      text-align: start;
    }
    blockquote {
      margin: 12px 0;
      padding-inline-start: 12px;
      border-inline-start: 2px solid ${quote};
      color: ${text};
    }
    pre, code { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif, ${emojiFonts}; font-size: 12.5px; white-space: pre-wrap; }
    hr { border: 0; border-top: 1px solid ${line}; margin: 16px 0; }
    ${darkAppearance}
  `
}

function normalizeContentId(value: string) {
  let decoded = value
  try { decoded = decodeURIComponent(value) } catch { /* Keep the provider value. */ }
  return decoded.trim().replace(/^<|>$/g, "").toLowerCase()
}

function replaceInlineImageSources(html: string, sources: ReadonlyMap<string, string>) {
  if (!sources.size) return html
  return html.replace(/(\s+src\s*=\s*["'])cid:([^"']+)(["'])/gi, (match, start, rawContentId, end) => {
    const source = sources.get(normalizeContentId(String(rawContentId)))
    return source ? `${start}${source}${end}` : match
  })
}

function buildDocument({
  html,
  inlineImageSources,
  theme,
  direction,
  language,
}: {
  html: string
  inlineImageSources: ReadonlyMap<string, string>
  theme: "light" | "dark"
  direction: "ltr" | "rtl"
  language: string
}) {
  // Some newsletters explicitly mark every image as lazy. That is useful on a
  // website, but it makes an opened email look broken until the frame nears the
  // viewport. Preserve the sender's markup while making every secure image an
  // immediate load inside the already sandboxed document.
  const eagerHtml = replaceInlineImageSources(html, inlineImageSources).replace(/<img\b[^>]*>/gi, (tag) => {
    const withoutLoadingHints = tag
      .replace(/\s+loading\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s+fetchpriority\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")

    return withoutLoadingHints.replace(/\s*\/?>$/, (closing) =>
      ` loading="eager" fetchpriority="high"${closing.includes("/") ? " />" : ">"}`,
    )
  })

  return `<!doctype html>
<html lang="${language}" dir="${direction}">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${contentPolicy()}" />
<meta name="referrer" content="no-referrer" />
<base target="_blank" />
<style>${frameStyles(theme)}</style>
</head>
<body dir="auto">${eagerHtml}</body>
</html>`
}

function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  )

  useEffect(() => {
    const element = document.documentElement
    const observer = new MutationObserver(() => setIsDark(element.classList.contains("dark")))
    observer.observe(element, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return isDark
}

export function EmailMessageRenderer({
  sanitizedHtml,
  bodyText,
  inlineAttachments = [],
  className,
}: {
  /** Server-sanitised HTML. Rendered only inside the sandboxed frame. */
  sanitizedHtml: string | null
  /** The plain-text alternative, used whenever there is no sanitised HTML. */
  bodyText: string | null
  /** Inline attachments whose content IDs are referenced by `cid:` image URLs. */
  inlineAttachments?: MailAttachment[]
  className?: string
}) {
  const { direction, language, t } = useLanguage()
  const isDark = useIsDarkTheme()
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [frameHeight, setFrameHeight] = useState(0)
  const [inlineImageSources, setInlineImageSources] = useState<ReadonlyMap<string, string>>(() => new Map())

  const inlineImageKey = inlineAttachments
    .filter((attachment) => attachment.isInline && attachment.contentId)
    .map((attachment) => `${attachment.id}:${attachment.contentId}`)
    .join("|")

  useEffect(() => {
    let cancelled = false
    const opened: Array<{ url: string; revoke: () => void }> = []
    const candidates = inlineAttachments
      .filter((attachment) => attachment.isInline && attachment.contentId)
      .slice(0, 24)

    setInlineImageSources(new Map())
    if (!candidates.length) return

    void Promise.all(candidates.map(async (attachment) => {
      try {
        const result = await getInlineAttachmentBlobUrl(attachment.id)
        if (cancelled) {
          result.revoke()
          return null
        }
        opened.push(result)
        return [normalizeContentId(attachment.contentId ?? ""), result.url] as const
      } catch {
        // The message remains readable and keeps its alt text if an individual
        // provider image has expired or is blocked by the mailbox policy.
        return null
      }
    })).then((entries) => {
      if (!cancelled) setInlineImageSources(new Map(entries.filter((entry): entry is readonly [string, string] => entry !== null)))
    })

    return () => {
      cancelled = true
      opened.forEach((result) => result.revoke())
    }
    // The stable scalar key prevents a parent array identity change from
    // downloading the same private images again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineImageKey])

  useEffect(() => {
    setFrameHeight(0)
  }, [sanitizedHtml])

  const document_ = useMemo(
    () =>
      sanitizedHtml
        ? buildDocument({
            html: sanitizedHtml,
            inlineImageSources,
            theme: isDark ? "dark" : "light",
            direction,
            language,
          })
        : null,
    [direction, inlineImageSources, isDark, language, sanitizedHtml],
  )

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !document_) return

    let observer: ResizeObserver | null = null
    let cancelled = false

    const measure = () => {
      if (cancelled) return
      const body = frame.contentDocument?.body
      if (!body) return
      // Read in one go: scrollHeight already accounts for margins collapsed onto body.
      const next = Math.min(Math.max(body.scrollHeight, 24), 20_000)
      setFrameHeight((current) => (Math.abs(current - next) > 1 ? next : current))
    }

    const attach = () => {
      measure()
      const body = frame.contentDocument?.body
      if (!body || typeof ResizeObserver === "undefined") return
      observer = new ResizeObserver(measure)
      observer.observe(body)
    }

    frame.addEventListener("load", attach)
    if (frame.contentDocument?.readyState === "complete") attach()

    return () => {
      cancelled = true
      frame.removeEventListener("load", attach)
      observer?.disconnect()
    }
  }, [document_])

  if (!document_) {
    return (
      <div
        data-i18n-skip
        dir="auto"
        className={cn(
          "whitespace-pre-wrap text-[14px] leading-[1.6] text-[var(--md-ink)] [overflow-wrap:anywhere]",
          className,
        )}
      >
        {bodyText?.trim() ? bodyText : <span className="text-[var(--md-subtle)]">{t("This message has no body text.")}</span>}
      </div>
    )
  }

  return (
    <div className={cn("min-w-0", className)}>
      <iframe
        ref={frameRef}
        title={t("Message content")}
        sandbox={sandboxPermissions}
        srcDoc={document_}
        loading="eager"
        // The frame owns no scrolling: it is sized to its content so the thread
        // keeps one scroll axis and the reading position never gets trapped.
        scrolling="no"
        className="block w-full border-0 bg-transparent"
        style={{ height: frameHeight > 0 ? `${frameHeight}px` : "72px" }}
      />
    </div>
  )
}
