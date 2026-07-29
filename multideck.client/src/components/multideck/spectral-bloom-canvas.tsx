import { memo, useId } from "react"
import { useReducedMotion } from "motion/react"
import { ColorWheel, Halftone, Shader, SunBurst } from "shaders/react"
import type { ShaderStops } from "@/lib/accent-theme"

export type BloomCanvasProps = {
  tone?: "button" | "brand"
  stops: ShaderStops
  /** Off for previews: a static bloom shows the same colours with no render loop. */
  animated?: boolean
}

const SpectralBloomCanvas = memo(function SpectralBloomCanvas({
  tone = "button",
  stops,
  animated = true,
}: BloomCanvasProps) {
  const reduceMotion = useReducedMotion()
  const isBrandMark = tone === "brand"
  const [colorA, colorB, colorC] = stops
  const isStill = Boolean(reduceMotion) || !animated
  // The sunburst is addressed by id from the colour wheel's scale map. Each
  // mounted canvas needs its own key or several previews collapse onto one ramp.
  const burstId = `md-bloom-${useId().replace(/[^a-zA-Z0-9]/g, "")}`

  return (
    <Shader disableTelemetry className="size-full" style={{ width: "100%", height: "100%" }}>
      <SunBurst
        id={burstId}
        background="#00000000"
        center={{ x: 0.94, y: 1.04 }}
        color="#ffffff"
        feather={2.5}
        radius={2.35}
        rayCount={8}
        softness={0.92}
        speed={isStill ? 0 : isBrandMark ? 0.24 : 0.16}
        visible={false}
      />
      <ColorWheel
        angle={{
          mode: "loop",
          type: "auto-animate",
          speed: isStill ? 0 : isBrandMark ? 0.4 : 0.32,
          outputMax: 180,
          outputMin: -180,
        }}
        colorA={colorA}
        colorB={colorB}
        colorC={colorC}
        colorSpace="oklab"
        mode="custom"
        scale={{
          type: "map",
          source: burstId,
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

export default SpectralBloomCanvas
