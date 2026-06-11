import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type AIEdgeGlowIntensity = "active" | "subtle"
type AIEdgeGlowVariant = "surface" | "screen"

export function AIEdgeGlow({
  active = true,
  intensity = "active",
  variant = "surface",
  className,
  contentClassName,
  children,
}: {
  active?: boolean
  intensity?: AIEdgeGlowIntensity
  variant?: AIEdgeGlowVariant
  className?: string
  contentClassName?: string
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        "md-ai-edge-glow",
        active && "md-ai-edge-glow--active",
        intensity === "subtle" && "md-ai-edge-glow--subtle",
        variant === "screen" && "md-ai-edge-glow--screen",
        className,
      )}
      data-active={active ? "true" : "false"}
    >
      <span className="md-ai-edge-glow__wash" aria-hidden />
      <span className="md-ai-edge-glow__signal" aria-hidden />
      <span className="md-ai-edge-glow__frame" aria-hidden />
      <div className={cn("relative z-10 h-full w-full", contentClassName)}>{children}</div>
    </div>
  )
}
