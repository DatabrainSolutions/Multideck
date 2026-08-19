import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
const bloom = await read("../src/components/multideck/dexter-action-pill.tsx")
const bloomCanvas = await read("../src/components/multideck/spectral-bloom-canvas.tsx")
const dither = await read("../src/components/multideck/composer-dither.tsx")
const ditherCanvas = await read("../src/components/multideck/composer-dither-canvas.tsx")
const crmShader = await read("../src/components/multideck/crm-detail-overview-shader.tsx")
const crmShaderCanvas = await read("../src/components/multideck/lead-company-overview-shader.tsx")
const aurora = await read("../src/components/multideck/aurora-background.tsx")
const boundary = await read("../src/components/multideck/shader-error-boundary.tsx")
const resilient = await read("../src/components/multideck/resilient-shader-surface.tsx")
const sidebar = await read("../src/components/multideck/app-sidebar.tsx")
const crmLead = await read("../src/components/multideck/crm-components.tsx")
const crmAccount = await read("../src/pages/crm-account-detail-page.tsx")
const crmContact = await read("../src/pages/crm-contact-detail-page.tsx")

test("every shader paints synchronously through the shared resilient surface", () => {
  assert.match(bloom, /import SpectralBloomCanvas/)
  assert.match(bloom, /<ResilientShaderSurface[\s\S]*fallback=\{<BloomFallback stops=\{props\.stops\} \/>\}[\s\S]*<SpectralBloomCanvas/)
  assert.doesNotMatch(bloom, /lazy\(\(\) => import\("\.\/spectral-bloom-canvas"\)\)/)
  assert.match(dither, /import ComposerDitherCanvas/)
  assert.match(dither, /<ResilientShaderSurface[\s\S]*fallback=\{<DitherFallback baseColor=\{baseColor\} waveColor=\{waveColor\} \/>\}[\s\S]*<ComposerDitherCanvas/)
  assert.match(dither, /md-composer-dither__bleed[^\n]*h-\[180%\]/)
  assert.doesNotMatch(dither, /lazy\(\(\) => import\("\.\/composer-dither-canvas"\)\)/)
  assert.match(crmShader, /import CrmDetailOverviewShaderCanvas/)
  assert.match(crmShader, /<ResilientShaderSurface[\s\S]*technology="webgpu"[\s\S]*md-crm-shader-fallback[\s\S]*<CrmDetailOverviewShaderCanvas/)
  assert.doesNotMatch(crmShader, /lazy\(\(\) => import\("\.\/lead-company-overview-shader"\)\)/)
  assert.match(boundary, /getDerivedStateFromError/)
  assert.match(boundary, /this\.props\.onError\?\.\(error\)/)
  assert.match(boundary, /this\.state\.failed \? this\.props\.fallback \?\? null/)
})

test("GPU paint is revealed only after a real non-zero ready frame", () => {
  assert.match(resilient, /data-shader-state=\{ready \? "ready"/)
  assert.match(resilient, /canvas\.width > 0/)
  assert.match(resilient, /hasVisibleWebGpuPixels\(canvas\)/)
  assert.match(resilient, /getImageData\(0, 0, probe\.width, probe\.height\)/)
  assert.match(resilient, /reported ready without visible shader pixels/)
  assert.match(resilient, /style=\{\{ opacity: ready \? 1 : 0 \}\}/)
  assert.match(bloomCanvas, /<Shader disableTelemetry onReady=\{onReady\}/)
  assert.match(crmShaderCanvas, /<Shader disableTelemetry onReady=\{onReady\}/)
  assert.match(ditherCanvas, /useFrame[\s\S]*onReady\?\.\(\)/)
})

test("failed starts and lost contexts recreate the renderer with a bounded retry budget", () => {
  assert.match(resilient, /maxRetries = 2/)
  assert.match(resilient, /readyTimeoutMs = 1_500/)
  assert.match(resilient, /setGeneration\(\(current\) => current \+ 1\)/)
  assert.match(resilient, /webglcontextlost/)
  assert.match(resilient, /webglcontextcreationerror/)
  assert.match(resilient, /retained its painted fallback after renderer recovery was exhausted/)
  assert.match(resilient, /maxRecoveryCycles = 1/)
  assert.match(resilient, /recoveryCooldownMs = 1_600/)
  assert.match(resilient, /window\.addEventListener\("pageshow"/)
  assert.match(resilient, /window\.addEventListener\("pagehide"/)
  assert.match(resilient, /documentWasHiddenRef/)
  assert.match(resilient, /if \(!documentWasHiddenRef\.current\) return/)
  assert.doesNotMatch(resilient, /canvasIsPaintable = Boolean\(canvas && canvas\.width > 0 && canvas\.height > 0\)/)
})

test("off-screen and zero-sized shader trees stay unmounted", () => {
  assert.match(resilient, /new ResizeObserver/)
  assert.match(resilient, /new IntersectionObserver/)
  assert.match(resilient, /setNearby\(isNearViewport\(root, rootMargin\)\)/)
  assert.match(resilient, /const shouldMount = hasSize && nearby && capabilityAvailable/)
  assert.match(resilient, /\{shouldMount \? \(/)
})

test("WebGPU surfaces fail closed to a textured synchronous paint", () => {
  assert.match(bloom, /technology="webgpu"[\s\S]*maxRetries=\{1\}/)
  assert.match(crmShader, /technology="webgpu"[\s\S]*maxRetries=\{1\}/)
  assert.match(resilient, /supportsTechnology\(technology\)/)
  assert.match(resilient, /data-md-shader-fallback/)
  assert.match(bloom, /md-bloom-fallback__glow/)
  assert.match(bloom, /md-bloom-fallback__rays/)
  assert.match(crmShader, /md-crm-shader-fallback__plasma/)
  assert.match(crmShader, /md-crm-shader-fallback__rings/)
})

test("the permanent bloom path covers the sidebar and all shared Dexter shader surfaces", () => {
  assert.match(sidebar, /<SpectralBloomShader \/>/)
  assert.match(sidebar, /md-dexter-pill__shader/)
  assert.match(bloom, /export const SpectralBloomShader/)
  assert.match(bloom, /export const StaticBloomShader/)
})

test("all CRM overview variants use the same resilient eager shader wrapper", () => {
  for (const source of [crmLead, crmAccount, crmContact]) {
    assert.match(source, /import \{ CrmDetailOverviewShader \}/)
    assert.match(source, /<CrmDetailOverviewShader \/>/)
    assert.doesNotMatch(source, /lazy\(\(\) => import\([^\n]*lead-company-overview-shader/)
  }
})

test("the custom aurora survives missing or lost WebGL contexts", () => {
  assert.match(aurora, /<ResilientShaderSurface/)
  assert.match(aurora, /try \{[\s\S]*renderer = new Renderer/)
  assert.match(aurora, /lifecycleRef\.current\.onFailure\(error\)/)
  assert.match(aurora, /lifecycleRef\.current\.onReady\(\)/)
  assert.match(aurora, /fallback=\{\([\s\S]*background: `radial-gradient/)
})
