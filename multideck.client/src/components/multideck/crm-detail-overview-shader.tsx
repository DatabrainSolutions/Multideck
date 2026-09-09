import { ResilientShaderSurface } from "@/components/multideck/resilient-shader-surface"
import CrmDetailOverviewShaderCanvas from "./lead-company-overview-shader"

/** A permanent painted base prevents a blank hero while WebGPU loads or recovers. */
export function CrmDetailOverviewShader() {
  return (
    <ResilientShaderSurface
      name="CRM overview shader"
      technology="webgpu"
      maxRetries={1}
      fallback={(
        <span className="md-crm-shader-fallback block size-full">
          <span className="md-crm-shader-fallback__plasma" />
          <span className="md-crm-shader-fallback__rings" />
        </span>
      )}
    >
      {({ onReady }) => <CrmDetailOverviewShaderCanvas onReady={onReady} />}
    </ResilientShaderSurface>
  )
}
