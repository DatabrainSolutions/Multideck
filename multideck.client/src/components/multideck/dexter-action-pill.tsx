import { memo, type ComponentProps, type CSSProperties } from "react"
import { Sparkles, type LucideIcon } from "lucide-react"
import { useReducedMotion } from "motion/react"
import { ColorWheel, Halftone, Shader, SunBurst } from "shaders/react"
import "@/dexter-transfer.css"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { useAiAgentName } from "@/lib/user-preferences"
import { cn } from "@/lib/utils"

type DexterActionPillProps = Omit<ComponentProps<typeof Button>, "children"> & {
  icon?: LucideIcon
  iconOnly?: boolean
  label?: string
}

export const SpectralBloomShader = memo(function SpectralBloomShader({ tone = "button" }: { tone?: "button" | "brand" }) {
  const reduceMotion = useReducedMotion()
  const isBrandMark = tone === "brand"

  return (
    <Shader disableTelemetry className="size-full" style={{ width: "100%", height: "100%" }}>
      <SunBurst
        id="idmpcwxhawsfhikefj9"
        background="#00000000"
        center={{ x: 0.94, y: 1.04 }}
        color="#ffffff"
        feather={2.5}
        radius={2.35}
        rayCount={8}
        softness={0.92}
        speed={reduceMotion ? 0 : isBrandMark ? 0.24 : 0.16}
        visible={false}
      />
      <ColorWheel
        angle={{
          mode: "loop",
          type: "auto-animate",
          speed: reduceMotion ? 0 : isBrandMark ? 0.4 : 0.32,
          outputMax: 180,
          outputMin: -180,
        }}
        colorA={isBrandMark ? "#007763" : "#003d2f"}
        colorB={isBrandMark ? "#3bc2a5" : "#00705a"}
        colorC={isBrandMark ? "#06251f" : "#050807"}
        colorSpace="oklab"
        mode="custom"
        scale={{
          type: "map",
          source: "idmpcwxhawsfhikefj9",
          channel: "alpha",
          inputMax: 1,
          inputMin: 0,
          outputMax: 10,
          outputMin: 0.1,
        }}
      />
      <Halftone frequency={125} misprint={0.0055} opacity={isBrandMark ? 0.025 : 0.05} style="cmyk" />
    </Shader>
  )
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
  icon: Icon = Sparkles,
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
        "md-dexter-pill relative h-10 min-w-[132px] overflow-hidden rounded-[var(--md-radius-lg)] px-3.5 text-[13px] font-medium text-white hover:text-white focus-visible:text-white focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.2)]",
        className,
      )}
    >
      <span className="md-dexter-pill__shader" aria-hidden="true">
        <SpectralBloomShader />
      </span>
      <span className="md-dexter-pill__contrast" aria-hidden="true" />
      <Icon className="relative z-10 size-3.5 shrink-0" strokeWidth={1.25} />
      {iconOnly ? null : <SlotLabel label={resolvedLabel} direction={direction} />}
    </Button>
  )
}
