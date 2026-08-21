import { useEffect, useRef } from "react"
import { Color, Mesh, Program, Renderer, Triangle } from "ogl"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useTheme } from "@/lib/theme-provider"
import { useAccentBrandRamp, type ShaderStops } from "@/lib/accent-theme"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion } from "@/lib/motion"
import {
  ResilientShaderSurface,
  type ShaderLifecycleControls,
} from "@/components/multideck/resilient-shader-surface"

const vertexShader = `#version 300 es
in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragmentShader = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;
uniform float uLightSurface;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439
  );
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
    permute(i.y + vec3(0.0, i1.y, 1.0))
      + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
    0.5 - vec3(
      dot(x0, x0),
      dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)
    ),
    0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) { \
  int index = 0; \
  for (int i = 0; i < 2; i++) { \
    ColorStop currentColor = colors[i]; \
    bool isInBetween = currentColor.position <= factor; \
    index = int(mix(float(index), float(i), float(isInBetween))); \
  } \
  ColorStop currentColor = colors[index]; \
  ColorStop nextColor = colors[index + 1]; \
  float range = nextColor.position - currentColor.position; \
  float lerpFactor = (factor - currentColor.position) / range; \
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  // Two broad bands are enough to create depth. Keeping both frequencies below
  // 1.5 prevents the background turning into a row of busy ripples.
  float primaryWave = snoise(vec2(uv.x * 1.25 + uTime * 0.16, uTime * 0.28));
  float depthWave = snoise(vec2(uv.x * 0.72 - uTime * 0.09, uTime * 0.19 + 8.4));
  float height = (primaryWave * 0.72 + depthWave * 0.28) * 0.5 * uAmplitude;
  height = exp(height);

  // WebGL's y origin is at the bottom. Weighting 1.0 - uv.y makes the light
  // emerge from the lower edge instead of hanging down from the top.
  height = ((1.0 - uv.y) * 2.0 - height + 0.2);
  float intensity = 0.6 * height;
  float midPoint = 0.20;
  float waveAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);
  // Keep a restrained floor of colour across the whole lower edge. Without it,
  // a deep stop can visually disappear into dark mode at one corner.
  float baseGlow = pow(max(1.0 - uv.y, 0.0), 1.45) * 0.34;
  float auroraAlpha = max(waveAlpha, baseGlow);
  float depthLight = 0.82 + smoothstep(-0.65, 0.72, primaryWave - depthWave) * 0.34;
  vec3 auroraColor = max(intensity, baseGlow * 0.72) * rampColor * depthLight;
  // A dark aurora needs the intensity multiplication to emerge from the page.
  // On a light workspace it turns even pale colour stops into grey, so keep the
  // ramp's intended luminosity and let alpha provide the ambient depth instead.
  vec3 lightSurfaceColor = mix(rampColor, vec3(1.0), 0.56);
  auroraColor = mix(auroraColor, lightSurfaceColor, uLightSurface);

  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}
`

function toGlColors(stops: ShaderStops) {
  return stops.map((hex) => {
    const color = new Color(hex)
    return [color.r, color.g, color.b]
  })
}

export type AuroraBackgroundProps = {
  colorStops: ShaderStops
  amplitude?: number
  blend?: number
  speed?: number
  lightSurface?: boolean
  className?: string
}

function AuroraCanvas({
  colorStops,
  amplitude = 0.72,
  blend = 0.72,
  speed = 0.34,
  lightSurface = false,
  onReady,
  onFailure,
}: Omit<AuroraBackgroundProps, "className"> & ShaderLifecycleControls) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const propsRef = useRef({ colorStops, amplitude, blend, speed, lightSurface })
  const lifecycleRef = useRef({ onReady, onFailure })
  const shouldReduceMotion = Boolean(useReducedMotion())

  propsRef.current = { colorStops, amplitude, blend, speed, lightSurface }
  lifecycleRef.current = { onReady, onFailure }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: Renderer | null = null
    try {
      renderer = new Renderer({
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio, 1.5),
      })
    } catch (error) {
      lifecycleRef.current.onFailure(error)
      return
    }
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.canvas.style.width = "100%"
    gl.canvas.style.height = "100%"
    gl.canvas.style.display = "block"

    const geometry = new Triangle(gl)
    if (geometry.attributes.uv) delete geometry.attributes.uv

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: amplitude },
        uColorStops: { value: toGlColors(colorStops) },
        uResolution: { value: [1, 1] },
        uBlend: { value: blend },
        uLightSurface: { value: lightSurface ? 1 : 0 },
      },
    })
    const mesh = new Mesh(gl, { geometry, program })
    container.appendChild(gl.canvas)

    const resize = () => {
      const width = Math.max(container.clientWidth, 1)
      const height = Math.max(container.clientHeight, 1)
      renderer.setSize(width, height)
      program.uniforms.uResolution.value = [width, height]
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    let frame = 0
    let visible = true
    const render = (time = 0) => {
      const current = propsRef.current
      program.uniforms.uTime.value = shouldReduceMotion ? 1.8 : time * 0.00045 * current.speed
      program.uniforms.uAmplitude.value = current.amplitude
      program.uniforms.uBlend.value = current.blend
      program.uniforms.uLightSurface.value = current.lightSurface ? 1 : 0
      program.uniforms.uColorStops.value = toGlColors(current.colorStops)
      try {
        renderer.render({ scene: mesh })
      } catch (error) {
        lifecycleRef.current.onFailure(error)
        return
      }
      if (!ready) {
        ready = true
        lifecycleRef.current.onReady()
      }
      if (!shouldReduceMotion && visible) frame = requestAnimationFrame(render)
    }

    const intersectionObserver = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
          const nextVisible = entry?.isIntersecting ?? true
          if (nextVisible === visible) return
          visible = nextVisible
          cancelAnimationFrame(frame)
          if (visible) frame = requestAnimationFrame(render)
        })
    intersectionObserver?.observe(container)
    let ready = false
    render()

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersectionObserver?.disconnect()
      if (gl.canvas.parentNode === container) container.removeChild(gl.canvas)
      gl.canvas.dataset.mdShaderDisposing = "true"
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    }
  }, [shouldReduceMotion])

  return <span ref={containerRef} className="block size-full" />
}

export function AuroraBackground({ className, ...props }: AuroraBackgroundProps) {
  const { colorStops } = props

  return (
    <ResilientShaderSurface
      name="Watch mode aurora shader"
      className={cn("pointer-events-none absolute inset-0 z-0", className)}
      fallback={(
        <span
          className="block size-full"
          style={{
            background: `radial-gradient(ellipse at 16% 112%, color-mix(in srgb, ${colorStops[1]} 86%, transparent) 0%, transparent 58%), radial-gradient(ellipse at 82% 104%, color-mix(in srgb, ${colorStops[2]} 78%, transparent) 0%, transparent 55%), linear-gradient(155deg, ${colorStops[0]}, color-mix(in srgb, ${colorStops[1]} 54%, ${colorStops[2]}))`,
          }}
        />
      )}
    >
      {(lifecycle) => <AuroraCanvas {...props} {...lifecycle} />}
    </ResilientShaderSurface>
  )
}

export function WatchModeAurora({ active, className }: { active: boolean; className?: string }) {
  const { resolvedTheme } = useTheme()
  const accentRamp = useAccentBrandRamp()
  const isDark = resolvedTheme
    ? resolvedTheme === "dark"
    : typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  // Keep Watch mode tonal: dark mode retains its richer, lower-edge glow while
  // light mode uses a pale accent ramp that belongs on the white workspace.
  const colorStops: ShaderStops = isDark
    ? [accentRamp.glowCore, accentRamp.abyss, accentRamp.glowBright]
    : accentRamp.watchLight
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <AnimatePresence initial={false}>
      {active ? (
        <motion.div
          key="watch-mode-aurora"
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: isDark ? 0.48 : 0.36 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion(shouldReduceMotion, mdMotion.smooth)}
        >
          <AuroraBackground
            colorStops={colorStops}
            amplitude={0.82}
            blend={0.68}
            speed={0.56}
            lightSurface={!isDark}
            className="[mask-image:linear-gradient(to_top,black_0%,rgba(0,0,0,0.9)_48%,transparent_90%)]"
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
