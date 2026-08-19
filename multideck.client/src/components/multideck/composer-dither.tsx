import { useCallback, useRef, useState, type PointerEvent, type ReactNode } from "react"
import { useReducedMotion } from "motion/react"
import { useTheme } from "next-themes"
import { useAccentBrandRamp } from "@/lib/accent-theme"
import { cn } from "@/lib/utils"
import { ResilientShaderSurface } from "@/components/multideck/resilient-shader-surface"
import ComposerDitherCanvas, { type ComposerDitherCanvasProps, type ComposerPointer } from "./composer-dither-canvas"

/**
 * Where the ripple starts, in 0-1 canvas space. The band's canvas overhangs
 * below the header, so y sits high in it: this is the role pill, not the middle.
 */
const pulseOrigin = { x: 0.085, y: 0.18 }

function DitherFallback({ baseColor, waveColor }: { baseColor: string; waveColor: string }) {
  return (
    <span
      className="block size-full"
      style={{
        backgroundColor: baseColor,
        backgroundImage: `radial-gradient(ellipse at 9% 18%, color-mix(in srgb, ${waveColor} 72%, transparent) 0%, transparent 44%), radial-gradient(${waveColor} 1px, transparent 1.1px)`,
        backgroundSize: "100% 100%, 4px 4px",
      }}
    />
  )
}

/**
 * The composer's header band: a dithered wave that swells under the cursor and
 * ripples out from the role pill when the role changes.
 *
 * The canvas is deliberately taller than the band and overhangs downward. The
 * shell clips it to its own rounded top corners and the prompt panel covers the
 * overhang, so the pattern reads as part of the box's shape rather than a strip
 * pasted across it — which is why this component must not clip its own overflow.
 *
 * Both interactions live inside the shader, so pointer movement costs no React
 * renders. All this wrapper contributes is the hover flag, which only gates the
 * shader's own easing and the band's resting opacity.
 */
export function ComposerDither({
  pulseToken = 0,
  className,
  contentClassName,
  children,
}: {
  pulseToken?: number
  className?: string
  contentClassName?: string
  children?: ReactNode
}) {
  const shouldReduceMotion = useReducedMotion()
  const { resolvedTheme } = useTheme()
  const brand = useAccentBrandRamp()
  const [hovered, setHovered] = useState(false)
  const bleedRef = useRef<HTMLSpanElement>(null)
  const pointerRef = useRef<ComposerPointer>({ x: 0.5, y: 0.5, inside: false })
  // Measured once on entry rather than per sample: a `getBoundingClientRect` on
  // every pointermove is a forced layout the shader does not need.
  const bandRectRef = useRef<DOMRect | null>(null)

  const isDark = resolvedTheme
    ? resolvedTheme === "dark"
    : typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  // The unlit half of the ramp matches the shell, so only the pattern reads. The
  // lit half has to cross the shell to be seen at all, and the scatter is sparse
  // — a stop that merely differs is not enough, it has to travel: a mid accent
  // against the light surface, a pale one against the dark.
  const baseColor = isDark ? "#131618" : "#edf0ef"
  const waveColor = isDark ? brand.lift : brand.glowCore

  const handleEnter = useCallback(() => {
    bandRectRef.current = bleedRef.current?.getBoundingClientRect() ?? null
    pointerRef.current.inside = true
    setHovered(true)
  }, [])

  const handleMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const rect = bandRectRef.current
    if (!rect || rect.width === 0 || rect.height === 0) return

    pointerRef.current.x = (event.clientX - rect.left) / rect.width
    pointerRef.current.y = (event.clientY - rect.top) / rect.height
    pointerRef.current.inside = true
  }, [])

  const handleLeave = useCallback(() => {
    pointerRef.current.inside = false
    setHovered(false)
  }, [])

  return (
    <div
      className={cn("md-composer-dither relative", className)}
      data-hovered={hovered ? "true" : undefined}
      onPointerEnter={handleEnter}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <span ref={bleedRef} aria-hidden="true" className="md-composer-dither__bleed pointer-events-none absolute inset-x-0 top-0 h-[180%]">
        <span className="md-composer-dither__canvas absolute inset-0">
          <ResilientShaderSurface
            name="Composer dither shader"
            fallback={<DitherFallback baseColor={baseColor} waveColor={waveColor} />}
          >
            {({ onReady }) => (
              <ComposerDitherCanvas
                baseColor={baseColor}
                waveColor={waveColor}
                hovered={hovered}
                pointer={pointerRef}
                pulseToken={pulseToken}
                pulseOrigin={pulseOrigin}
                animated={!shouldReduceMotion}
                onReady={onReady}
              />
            )}
          </ResilientShaderSurface>
        </span>
        <span className="md-composer-dither__veil absolute inset-0" />
      </span>
      <div className={cn("relative z-[2] flex h-full min-w-0 items-center gap-2", contentClassName)}>{children}</div>
    </div>
  )
}

export type { ComposerDitherCanvasProps }
