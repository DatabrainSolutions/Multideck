import { lazy, memo, Suspense, type ComponentProps, type CSSProperties, type ReactNode } from "react"
import { AiBrain, type LucideIcon } from "@/components/icons/hugeicons"
import "@/dexter-transfer.css"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { useAccentShaderRamp, type ShaderStops } from "@/lib/accent-theme"
import { useAiAgentName } from "@/lib/user-preferences"
import { cn } from "@/lib/utils"
import type { BloomCanvasProps } from "./spectral-bloom-canvas"

const SpectralBloomCanvas = lazy(() => import("./spectral-bloom-canvas"))

type DexterActionPillProps = Omit<ComponentProps<typeof Button>, "children"> & {
  icon?: LucideIcon
  iconElement?: ReactNode
  iconClassName?: string
  iconOnly?: boolean
  label?: string
}

function BloomFallback({ stops }: { stops: ShaderStops }) {
  const [colorA, colorB, colorC] = stops
  return (
    <span
      className="block size-full"
      style={{
        background: `radial-gradient(circle at 82% 86%, ${colorA}, transparent 58%), linear-gradient(135deg, ${colorB}, ${colorC})`,
      }}
    />
  )
}

function Bloom(props: BloomCanvasProps) {
  return (
    <Suspense fallback={<BloomFallback stops={props.stops} />}>
      <SpectralBloomCanvas {...props} />
    </Suspense>
  )
}

/**
 * The live bloom: subscribes to the accent store so it follows an accent change.
 *
 * Kept separate from `Bloom` on purpose. A caller that supplies its own `stops` —
 * the accent picker's ten previews — must not subscribe, or every one of them
 * would re-render on all ~28 frames of a cross-fade to redraw colours that never
 * changed. Hooks cannot be called conditionally, so the split is the fix.
 */
export const SpectralBloomShader = memo(function SpectralBloomShader({
  tone = "button",
  shape = "compact",
}: {
  tone?: "button" | "brand"
  shape?: "compact" | "composer"
}) {
  const stops = useAccentShaderRamp(tone)
  return <Bloom tone={tone} shape={shape} stops={stops} />
})

/** A fixed ramp, for previewing an accent other than the active one. */
export const StaticBloomShader = memo(function StaticBloomShader({ tone, stops }: BloomCanvasProps) {
  return <Bloom tone={tone} stops={stops} animated={false} />
})

function SlotLabel({ label, direction }: { label: string; direction: "ltr" | "rtl" }) {
  return (
    <span aria-hidden="true" data-i18n-skip dir={direction} className="md-dexter-pill__slot relative z-10">
      {Array.from(label).map((character, index) => {
        const glyph = character === " " ? "\u00a0" : character

        return (
          <span
            key={`${character}-${index}`}
            className="md-dexter-pill__slot-character"
            style={{ "--md-dexter-character-index": index } as CSSProperties}
          >
            <span className="md-dexter-pill__slot-glyph md-dexter-pill__slot-glyph--initial">{glyph}</span>
            <span className="md-dexter-pill__slot-glyph md-dexter-pill__slot-glyph--next">{glyph}</span>
          </span>
        )
      })}
    </span>
  )
}

export function DexterActionPill({
  icon: Icon = AiBrain,
  iconElement,
  iconClassName,
  iconOnly = false,
  label,
  className,
  type = "button",
  variant = "ghost",
  ...props
}: DexterActionPillProps) {
  const aiAgentName = useAiAgentName()
  const { direction, t } = useLanguage()
  const resolvedLabel = label ?? t(`Ask ${aiAgentName}`)

  return (
    <Button
      {...props}
      type={type}
      variant={variant}
      aria-label={props["aria-label"] ?? resolvedLabel}
      data-icon-only={iconOnly || undefined}
      className={cn(
        "md-dexter-pill relative h-10 min-w-[132px] overflow-hidden rounded-[var(--md-radius-lg)] px-3.5 text-[13px] font-medium text-white hover:text-white focus-visible:text-white focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)]",
        className,
      )}
    >
      <span className="md-dexter-pill__shader" aria-hidden="true">
        <SpectralBloomShader />
      </span>
      <span className="md-dexter-pill__contrast" aria-hidden="true" />
      {iconElement ?? <Icon className={cn("relative z-10 size-3.5 shrink-0", iconClassName)} strokeWidth={1.25} />}
      {iconOnly ? null : <SlotLabel label={resolvedLabel} direction={direction} />}
    </Button>
  )
}
