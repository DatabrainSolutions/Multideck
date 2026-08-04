import { useReducedMotion } from "motion/react"
import { ConcentricSpin, FilmGrain, Plasma, Shader } from "shaders/react"
import { useAccentBrandRamp } from "@/lib/accent-theme"

export default function CrmDetailOverviewShaderCanvas() {
  const reduceMotion = useReducedMotion()
  // The plasma's lit stop follows the accent; `colorA` stays a fixed cool
  // highlight because it is what stops the panel reading as a single flat hue.
  const { glowCore } = useAccentBrandRamp()

  return (
    <Shader disableTelemetry className="size-full" style={{ width: "100%", height: "100%" }}>
      <Plasma
        balance={35}
        colorA="#8bbef0"
        colorB="#06030a"
        colorSpace="oklab"
        contrast={0.7}
        density={0.6}
        intensity={2}
        speed={reduceMotion ? 0 : 1.2}
        stops={[
          { color: glowCore, position: 0 },
          { color: "#06030a", position: 1 },
        ]}
        warp={0.45}
      />
      <ConcentricSpin
        center={{ x: 0.5, y: 1 }}
        intensity={60}
        rings={5}
        smoothness={0.06}
        speed={reduceMotion ? 0 : 0.1}
        speedRandomness={reduceMotion ? 0 : 1}
      />
      <FilmGrain strength={0.05} />
    </Shader>
  )
}
