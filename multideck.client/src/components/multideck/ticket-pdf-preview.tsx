import { lazy, Suspense, useEffect, useState } from "react"
import type { TicketAttachment } from "@/lib/ticket-attachments"

const Viewer = lazy(() => import("./pdf-document-viewer-dialog").then(module => ({ default: module.PdfDocumentViewerDialog })))

export function TicketPdfPreview({ file, onClose }: { file: TicketAttachment; onClose: () => void }) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setBlob(null)
    setLoading(true)
    void fetch(file.signedUrl, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Preview unavailable")
        return response.blob()
      })
      .then(value => { if (!controller.signal.aborted) setBlob(value) })
      .catch(() => { /* The viewer provides the download fallback. */ })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [file.signedUrl])
  async function download() {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = file.originalName
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <Suspense fallback={<p role="status" className="text-xs text-[var(--md-text)]">Opening PDF preview…</p>}>
    <Viewer open onOpenChange={open => { if (!open) onClose() }} blob={blob} loading={loading} title={file.originalName} fileName={file.originalName} onDownload={download} />
  </Suspense>
}
