import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { ShaderErrorBoundary } from "@/components/multideck/shader-error-boundary"
import { cn } from "@/lib/utils"

export type ShaderLifecycleControls = {
  /** Reveal the GPU layer only after its first real frame is ready. */
  onReady: () => void
  /** Recreate the renderer after an asynchronous setup or render failure. */
  onFailure: (error?: unknown) => void
}

type ResilientShaderSurfaceProps = {
  children: (controls: ShaderLifecycleControls) => ReactNode
  fallback: ReactNode
  name: string
  className?: string
  technology?: "webgl" | "webgpu"
  maxRetries?: number
  maxRecoveryCycles?: number
  recoveryCooldownMs?: number
  readyTimeoutMs?: number
  rootMargin?: number
}

const hasPositiveBox = (element: HTMLElement | null) => {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const isNearViewport = (element: HTMLElement, margin: number) => {
  const rect = element.getBoundingClientRect()
  return rect.bottom >= -margin
    && rect.right >= -margin
    && rect.top <= window.innerHeight + margin
    && rect.left <= window.innerWidth + margin
}

const supportsTechnology = (technology: "webgl" | "webgpu") => {
  if (technology === "webgl") return true
  return typeof navigator !== "undefined" && "gpu" in navigator
}

const hasVisibleWebGpuPixels = (canvas: HTMLCanvasElement) => {
  try {
    const probe = document.createElement("canvas")
    probe.width = 12
    probe.height = 6
    const context = probe.getContext("2d", { willReadFrequently: true })
    if (!context) return false

    context.drawImage(canvas, 0, 0, probe.width, probe.height)
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 4) return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Owns the lifecycle around every decorative GPU surface in Multideck.
 *
 * The painted layer is permanent. The renderer is mounted only when its box is
 * non-zero and near the viewport, then cross-faded in after a confirmed frame.
 * A failed initialisation or lost WebGL context recreates the renderer twice;
 * after that the painted layer remains usable instead of exposing a blank box.
 */
export function ResilientShaderSurface({
  children,
  fallback,
  name,
  className,
  technology = "webgl",
  maxRetries = 2,
  maxRecoveryCycles = 1,
  recoveryCooldownMs = 1_600,
  readyTimeoutMs = 1_500,
  rootMargin = 320,
}: ResilientShaderSurfaceProps) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const gpuLayerRef = useRef<HTMLSpanElement>(null)
  const mountedRef = useRef(true)
  const generationRef = useRef(0)
  const retryCountRef = useRef(0)
  const recoveryCycleRef = useRef(0)
  const lastFailedGenerationRef = useRef(-1)
  const documentWasHiddenRef = useRef(
    typeof document !== "undefined" && document.visibilityState === "hidden",
  )
  const readyFrameRef = useRef<number | null>(null)
  const settleFrameRef = useRef<number | null>(null)

  const [hasSize, setHasSize] = useState(false)
  const [nearby, setNearby] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [retryCount, setRetryCount] = useState(0)
  const [ready, setReady] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  generationRef.current = generation

  const cancelReadyFrames = useCallback(() => {
    if (readyFrameRef.current !== null) cancelAnimationFrame(readyFrameRef.current)
    if (settleFrameRef.current !== null) cancelAnimationFrame(settleFrameRef.current)
    readyFrameRef.current = null
    settleFrameRef.current = null
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancelReadyFrames()
    }
  }, [cancelReadyFrames])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const measure = () => setHasSize(hasPositiveBox(root))
    measure()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure, { passive: true })
      return () => window.removeEventListener("resize", measure)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    if (typeof IntersectionObserver === "undefined") {
      setNearby(true)
      return
    }

    // IntersectionObserver reports asynchronously. Classify the initial box
    // synchronously so above-the-fold shaders do not miss the first paint while
    // the main thread is also restoring the authenticated workspace.
    setNearby(isNearViewport(root, rootMargin))

    const observer = new IntersectionObserver(
      ([entry]) => setNearby(entry?.isIntersecting ?? true),
      { rootMargin: `${rootMargin}px` },
    )
    observer.observe(root)
    return () => observer.disconnect()
  }, [rootMargin])

  const capabilityAvailable = supportsTechnology(technology)
  const shouldMount = hasSize && nearby && capabilityAvailable

  useEffect(() => {
    if (shouldMount) return
    cancelReadyFrames()
    retryCountRef.current = 0
    recoveryCycleRef.current = 0
    lastFailedGenerationRef.current = -1
    setRetryCount(0)
    setReady(false)
    setExhausted(false)
  }, [cancelReadyFrames, shouldMount])

  const retry = useCallback((failedGeneration: number, error?: unknown) => {
    if (!mountedRef.current || failedGeneration !== generationRef.current) return
    if (lastFailedGenerationRef.current === failedGeneration) return

    lastFailedGenerationRef.current = failedGeneration
    cancelReadyFrames()
    setReady(false)

    if (retryCountRef.current >= maxRetries) {
      setExhausted(true)
      if (import.meta.env.DEV) console.warn(`${name} retained its painted fallback after renderer recovery was exhausted.`, error)
      return
    }

    retryCountRef.current += 1
    setRetryCount(retryCountRef.current)
    setExhausted(false)
    setGeneration((current) => current + 1)
  }, [cancelReadyFrames, maxRetries, name])

  const markReady = useCallback((readyGeneration: number) => {
    if (!mountedRef.current || readyGeneration !== generationRef.current) return
    cancelReadyFrames()

    const confirmPaint = (remainingProbes: number) => {
      if (!mountedRef.current || readyGeneration !== generationRef.current) return
      const canvas = gpuLayerRef.current?.querySelector("canvas")
      const canvasIsPaintable = Boolean(
        canvas
        && canvas.width > 0
        && canvas.height > 0
        && hasPositiveBox(rootRef.current)
        && (technology !== "webgpu" || hasVisibleWebGpuPixels(canvas)),
      )

      if (canvasIsPaintable) {
        retryCountRef.current = 0
        recoveryCycleRef.current = 0
        lastFailedGenerationRef.current = -1
        setRetryCount(0)
        setExhausted(false)
        setReady(true)
        return
      }

      // The library can report its root frame before child effects have been
      // composited. Give that composition a few frames, but never accept the
      // fully transparent canvas produced by a WebGPU texture failure.
      if (remainingProbes > 0) {
        settleFrameRef.current = requestAnimationFrame(() => confirmPaint(remainingProbes - 1))
        return
      }

      retry(readyGeneration, new Error(`${name} reported ready without visible shader pixels.`))
    }

    // Two initial frames keep the synchronous paint in place until the renderer
    // has supplied a backing buffer and the browser has had a chance to compose.
    readyFrameRef.current = requestAnimationFrame(() => {
      settleFrameRef.current = requestAnimationFrame(() => {
        confirmPaint(4)
      })
    })
  }, [cancelReadyFrames, name, retry, technology])

  useEffect(() => {
    if (!shouldMount || !exhausted || recoveryCycleRef.current >= maxRecoveryCycles) return

    const timeout = window.setTimeout(() => {
      if (!mountedRef.current || !hasPositiveBox(rootRef.current)) return
      recoveryCycleRef.current += 1
      retryCountRef.current = 0
      lastFailedGenerationRef.current = -1
      setRetryCount(0)
      setReady(false)
      setExhausted(false)
      setGeneration((current) => current + 1)
    }, recoveryCooldownMs)

    return () => window.clearTimeout(timeout)
  }, [exhausted, maxRecoveryCycles, recoveryCooldownMs, shouldMount])

  useEffect(() => {
    if (!shouldMount) return

    const remountRenderer = () => {
      if (!mountedRef.current || document.visibilityState === "hidden") return
      retryCountRef.current = 0
      recoveryCycleRef.current = 0
      lastFailedGenerationRef.current = -1
      cancelReadyFrames()
      setRetryCount(0)
      setReady(false)
      setExhausted(false)
      setGeneration((current) => current + 1)
    }

    const handlePageHide = () => {
      documentWasHiddenRef.current = true
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      documentWasHiddenRef.current = false
      remountRenderer()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        documentWasHiddenRef.current = true
        return
      }

      // Browsers can preserve a correctly-sized canvas while discarding its GPU
      // backing store. Dimensions therefore do not prove that a shader survived
      // a suspended/background tab. Recreate it once after every real hidden to
      // visible transition and keep the painted fallback visible until the new
      // renderer has produced another confirmed frame.
      if (!documentWasHiddenRef.current) return
      documentWasHiddenRef.current = false
      remountRenderer()
    }

    window.addEventListener("pagehide", handlePageHide)
    window.addEventListener("pageshow", handlePageShow)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      window.removeEventListener("pagehide", handlePageHide)
      window.removeEventListener("pageshow", handlePageShow)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [cancelReadyFrames, shouldMount])

  useEffect(() => {
    if (!shouldMount || ready || exhausted) return
    const activeGeneration = generation
    const timeout = window.setTimeout(
      () => retry(activeGeneration, new Error(`${name} did not report a ready frame within ${readyTimeoutMs}ms.`)),
      readyTimeoutMs,
    )
    return () => window.clearTimeout(timeout)
  }, [exhausted, generation, name, ready, readyTimeoutMs, retry, shouldMount])

  useEffect(() => {
    const layer = gpuLayerRef.current
    if (!layer || !shouldMount) return

    const activeGeneration = generation
    const canvases = new Map<HTMLCanvasElement, { lost: EventListener; creationError: EventListener }>()

    const attach = (canvas: HTMLCanvasElement) => {
      if (canvases.has(canvas)) return

      const lost: EventListener = (event) => {
        if (canvas.dataset.mdShaderDisposing === "true") return
        event.preventDefault()
        retry(activeGeneration, new Error(`${name} lost its WebGL context.`))
      }
      const creationError: EventListener = () => {
        if (canvas.dataset.mdShaderDisposing === "true") return
        retry(activeGeneration, new Error(`${name} could not create a WebGL context.`))
      }

      canvas.addEventListener("webglcontextlost", lost)
      canvas.addEventListener("webglcontextcreationerror", creationError)
      canvases.set(canvas, { lost, creationError })
    }

    const scan = () => layer.querySelectorAll("canvas").forEach(attach)
    scan()

    const observer = new MutationObserver(scan)
    observer.observe(layer, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      canvases.forEach(({ lost, creationError }, canvas) => {
        canvas.removeEventListener("webglcontextlost", lost)
        canvas.removeEventListener("webglcontextcreationerror", creationError)
      })
    }
  }, [generation, name, retry, shouldMount])

  return (
    <span
      ref={rootRef}
      aria-hidden="true"
      className={cn("relative isolate block size-full overflow-hidden", className)}
      data-md-shader={name}
      data-shader-state={ready ? "ready" : exhausted || !capabilityAvailable ? "fallback" : shouldMount ? "starting" : "painted"}
      data-shader-retries={retryCount}
    >
      <span data-md-shader-fallback="" className="absolute inset-0 overflow-hidden">{fallback}</span>
      {shouldMount ? (
        <span
          ref={gpuLayerRef}
          className="pointer-events-none absolute inset-0 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ opacity: ready ? 1 : 0 }}
        >
          <ShaderErrorBoundary
            key={generation}
            name={name}
            onError={(error) => retry(generation, error)}
          >
            {children({
              onReady: () => markReady(generation),
              onFailure: (error) => retry(generation, error),
            })}
          </ShaderErrorBoundary>
        </span>
      ) : null}
    </span>
  )
}
