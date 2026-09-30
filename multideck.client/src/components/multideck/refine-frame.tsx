// Adapted from React Bits RefineFrame (JavaScript + CSS variant). The reserved
// frame and sweep are visible before an image exists; once it loads, the image
// resolves from coarse mosaic to full detail. No image data is read from canvas.
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { AlertTriangle, Check, Loader2, RefreshCw } from "@/components/icons/hugeicons"
import "./refine-frame.css"

export type RefineFrameStatus = "queued" | "generating" | "refining" | "complete" | "error"
const targets: Record<Exclude<RefineFrameStatus, "error">, number> = { queued: 0, generating: 0.5, refining: 0.875, complete: 1 }
const levels = [48, 32, 20, 12, 8, 5, 3, 2, 1]
const labels: Record<RefineFrameStatus, string> = {
  queued: "Image queued", generating: "Creating image", refining: "Finishing image", complete: "Image ready", error: "Image couldn't be made",
}
type FrameState = { progress: number; raf: number; last: number; key: string; width: number; height: number; canvases: HTMLCanvasElement[] }

function build(state: FrameState, canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
  const key = `${image.currentSrc}|${width}x${height}`
  if (state.key === key) return
  state.key = key; state.width = width; state.height = height
  canvas.width = width; canvas.height = height
  const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const sourceWidth = width / cover; const sourceHeight = height / cover
  const sourceX = (image.naturalWidth - sourceWidth) / 2; const sourceY = (image.naturalHeight - sourceHeight) / 2
  state.canvases = levels.map((block) => {
    const full = document.createElement("canvas")
    full.width = width; full.height = height
    const context = full.getContext("2d")
    if (!context) return full
    if (block === 1) {
      context.imageSmoothingQuality = "high"
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)
    } else {
      const small = document.createElement("canvas")
      const pixel = Math.max(2, Math.round(block * ratio))
      small.width = Math.max(1, Math.round(width / pixel)); small.height = Math.max(1, Math.round(height / pixel))
      const smallContext = small.getContext("2d")
      if (smallContext) {
        smallContext.imageSmoothingQuality = "high"
        smallContext.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, small.width, small.height)
      }
      context.imageSmoothingEnabled = false
      context.drawImage(small, 0, 0, width, height)
    }
    return full
  })
}

export function RefineFrame({ status, src, alt = "", onRetry, className = "", aspectRatio = "21 / 9", hideAfter = 1200 }: {
  status: RefineFrameStatus
  src: string | null
  alt?: string
  onRetry?: () => void
  className?: string
  aspectRatio?: string
  hideAfter?: number
}) {
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = useRef<FrameState>({ progress: 0, raf: 0, last: 0, key: "", width: 0, height: 0, canvases: [] })
  const live = useRef({ status, reduced: false })
  live.current.status = status
  const [mosaic, setMosaic] = useState(false)
  const [resolved, setResolved] = useState(false)
  const [chip, setChip] = useState(true)

  useEffect(() => {
    setChip(true)
    if (status !== "complete" || hideAfter === 0) return
    const timer = window.setTimeout(() => setChip(false), hideAfter)
    return () => window.clearTimeout(timer)
  }, [status, hideAfter])

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => { live.current.reduced = query.matches }
    sync(); query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !src) { setMosaic(false); setResolved(false); return }
    const simulation = state.current
    let stopped = false
    const tick = (now: number) => {
      if (stopped || !image.naturalWidth) { simulation.raf = 0; return }
      try { build(simulation, canvas, image) } catch { setMosaic(false); simulation.raf = 0; return }
      const target = live.current.status === "error" ? simulation.progress : targets[live.current.status]
      const elapsed = Math.min(0.05, simulation.last ? (now - simulation.last) / 1000 : 0.016)
      simulation.last = now
      simulation.progress = live.current.reduced ? target : Math.min(target, simulation.progress + elapsed / (levels.length * 0.32))
      const context = canvas.getContext("2d")
      if (context && simulation.canvases.length) {
        const position = simulation.progress * (levels.length - 1)
        const index = Math.min(levels.length - 1, Math.floor(position))
        const fraction = position - index
        context.clearRect(0, 0, simulation.width, simulation.height)
        context.globalAlpha = 1
        context.drawImage(simulation.canvases[index], 0, 0)
        if (index < levels.length - 1 && fraction > 0) {
          // A narrow travelling front reveals the next resolution level.
          const edge = 28 * Math.min(2, window.devicePixelRatio || 1)
          const front = fraction * (simulation.height + edge) - edge / 2
          const top = Math.max(0, Math.floor(front - edge / 2))
          if (top > 0) context.drawImage(simulation.canvases[index + 1], 0, 0, simulation.width, top, 0, 0, simulation.width, top)
          const strip = edge / 14
          for (let indexStrip = 0; indexStrip < 14; indexStrip += 1) {
            const y = front - edge / 2 + indexStrip * strip
            const start = Math.max(0, y)
            const height = Math.min(simulation.height, y + strip) - start
            if (height <= 0) continue
            const shade = 1 - (indexStrip + 0.5) / 14
            context.globalAlpha = shade * shade * (3 - 2 * shade)
            context.drawImage(simulation.canvases[index + 1], 0, start, simulation.width, height, 0, start, simulation.width, height)
          }
          context.globalAlpha = 1
        }
      }
      if (simulation.progress >= 1) setResolved(true)
      if (simulation.progress < target - 0.0005) simulation.raf = requestAnimationFrame(tick)
      else { simulation.raf = 0; simulation.last = 0 }
    }
    const wake = () => { if (!simulation.raf) simulation.raf = requestAnimationFrame(tick) }
    const start = () => { if (!stopped) { setMosaic(true); wake() } }
    if (image.complete && image.naturalWidth) start()
    else image.addEventListener("load", start)
    const observer = new ResizeObserver(() => { simulation.key = ""; wake() })
    observer.observe(canvas)
    wake()
    return () => { stopped = true; image.removeEventListener("load", start); observer.disconnect(); cancelAnimationFrame(simulation.raf); simulation.raf = 0 }
  }, [src, status])

  const working = status === "queued" || status === "generating" || status === "refining"
  return (
    <div className={`refine-frame ${className}`} data-status={status} data-mosaic={mosaic || undefined} data-resolved={resolved || undefined}
      data-working={working || undefined} aria-busy={working || undefined} style={{ "--rf-aspect": aspectRatio } as CSSProperties}>
      <div className="refine-frame__media" aria-hidden="true">
        {src ? <img ref={imageRef} className="refine-frame__print" src={src} alt={alt} crossOrigin="anonymous" /> : null}
        <canvas ref={canvasRef} className="refine-frame__mosaic" />
      </div>
      <div className="refine-frame__sweep" aria-hidden="true" />
      {chip ? <span className="refine-frame__chip" aria-hidden="true">
        {status === "complete" ? <Check className="size-3.5" strokeWidth={2} /> : status === "error" ? <AlertTriangle className="size-3.5" strokeWidth={1.7} /> : <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.7} />}
        {labels[status]}
      </span> : null}
      {status === "error" && onRetry ? <button type="button" className="refine-frame__retry" onClick={onRetry}><RefreshCw className="size-3.5" strokeWidth={1.7} />Retry image</button> : null}
      <span className="sr-only" role="status">{labels[status]}</span>
    </div>
  )
}
