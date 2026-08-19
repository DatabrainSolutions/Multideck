/* eslint-disable react/no-unknown-property */
import { memo, useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

/**
 * The dithered wave behind the Dexter composer's header.
 *
 * A hand-written shader rather than a shader-library graph because the two
 * interactions the band needs — a swell that follows the cursor, and a ring that
 * leaves the role pill when the role changes — are a few lines of GLSL each and
 * cost nothing per frame. Driving them from React state would mean re-rendering
 * a canvas sixty times a second to move a single float.
 *
 * Everything happens in one pass. The reference implementation ran the Bayer
 * dither as a post-processing effect over a render target, which meant an extra
 * full-screen target every frame, a resample of the pattern it had just drawn,
 * and two more dependencies in the bundle. Generating the field per dither cell
 * instead gives the identical result — the cell grid is exactly what the post
 * pass was quantising to — with one draw and no target.
 */

/**
 * Live pointer position in 0-1 canvas space, y down from the top edge.
 *
 * Passed as a ref, not as props: the band tracks the cursor every frame, and a
 * prop would mean a React render per pointer sample to move one float.
 */
export type ComposerPointer = { x: number; y: number; inside: boolean }

export type ComposerDitherCanvasProps = {
  /** Unlit half of the ramp. Matches the shell so only the pattern reads. */
  baseColor: string
  /** Lit half of the ramp — an accent-derived stop. */
  waveColor: string
  /** Raised while the pointer is inside the band. */
  hovered?: boolean
  /** Shared cursor position, written by the band and read on every frame. */
  pointer?: RefObject<ComposerPointer>
  /**
   * Bumped once per role change. A token rather than a boolean so two picks in a
   * row restart the ripple instead of being swallowed as "already true".
   */
  pulseToken?: number
  /** Where the ripple starts, in 0-1 canvas space: under the role pill. */
  pulseOrigin?: { x: number; y: number }
  /** Off for previews and reduced motion: the same pattern with no motion. */
  animated?: boolean
  /** Quantisation steps. Fewer steps, heavier dither. */
  colorNum?: number
  /** Side of one dither cell, in device pixels. */
  pixelSize?: number
  waveSpeed?: number
  waveFrequency?: number
  waveAmplitude?: number
  /** Multiplies the sample coordinates: higher is a finer, denser grain. */
  patternScale?: number
  /** Cuts the bottom off the wave, so the field scatters instead of washing. */
  waveBias?: number
  /** Radius of the cursor's influence, in aspect-corrected canvas units. */
  mouseRadius?: number
  onReady?: () => void
}

const vertexShader = /* glsl */ `
precision highp float;
void main() {
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
precision highp float;

uniform vec2 resolution;
uniform float time;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform float patternScale;
uniform float waveBias;
uniform float colorNum;
uniform float pixelSize;
uniform vec3 baseColor;
uniform vec3 waveColor;
uniform vec2 mouseUv;
uniform float mouseStrength;
uniform float mouseRadius;
uniform vec2 pulseCenter;
uniform float pulseTime;

vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fadeXY = fade(Pf.xy);
  vec2 nX = mix(vec2(n00, n01), vec2(n10, n11), fadeXY.x);
  return 2.3 * mix(nX.x, nX.y, fadeXY.y);
}

const int OCTAVES = 4;
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  for (int i = 0; i < OCTAVES; i++) {
    value += amp * abs(cnoise(p));
    p *= waveFrequency;
    amp *= waveAmplitude;
  }
  return value;
}

float wave(vec2 p) {
  vec2 drift = p - time * waveSpeed;
  return fbm(p + fbm(drift));
}

/*
 * A 0-1 point in DOM orientation (y down from the top edge) to the
 * aspect-corrected, y-up space distances are measured in. The pattern is sampled
 * from this space scaled up; the cursor and the ripple are measured in it
 * unscaled, so mouseRadius stays a plain fraction of the band's height however
 * fine the grain is set.
 */
vec2 toField(vec2 point) {
  vec2 field = (point - 0.5) * vec2(1.0, -1.0);
  field.x *= resolution.x / resolution.y;
  return field;
}

const float bayerMatrix8x8[64] = float[64](
  0.0/64.0, 48.0/64.0, 12.0/64.0, 60.0/64.0,  3.0/64.0, 51.0/64.0, 15.0/64.0, 63.0/64.0,
  32.0/64.0,16.0/64.0, 44.0/64.0, 28.0/64.0, 35.0/64.0,19.0/64.0, 47.0/64.0, 31.0/64.0,
  8.0/64.0, 56.0/64.0,  4.0/64.0, 52.0/64.0, 11.0/64.0,59.0/64.0,  7.0/64.0, 55.0/64.0,
  40.0/64.0,24.0/64.0, 36.0/64.0, 20.0/64.0, 43.0/64.0,27.0/64.0, 39.0/64.0, 23.0/64.0,
  2.0/64.0, 50.0/64.0, 14.0/64.0, 62.0/64.0,  1.0/64.0,49.0/64.0, 13.0/64.0, 61.0/64.0,
  34.0/64.0,18.0/64.0, 46.0/64.0, 30.0/64.0, 33.0/64.0,17.0/64.0, 45.0/64.0, 29.0/64.0,
  10.0/64.0,58.0/64.0,  6.0/64.0, 54.0/64.0,  9.0/64.0,57.0/64.0,  5.0/64.0, 53.0/64.0,
  42.0/64.0,26.0/64.0, 38.0/64.0, 22.0/64.0, 41.0/64.0,25.0/64.0, 37.0/64.0, 21.0/64.0
);

void main() {
  float cell = max(pixelSize, 1.0);
  vec2 cellIndex = floor(gl_FragCoord.xy / cell);
  // Sampled at the cell's centre so the whole cell shares one value: this is the
  // pixelation the reference got by resampling its render target.
  vec2 field = toField((cellIndex + 0.5) * cell / resolution);

  float f = wave(field * patternScale);

  // The cursor swells the wave rather than denting it: on a light shell a dark
  // well reads as a smudge, whereas more pattern reads as attention.
  if (mouseStrength > 0.001) {
    float falloff = 1.0 - smoothstep(0.0, mouseRadius, length(field - toField(mouseUv)));
    f += 0.42 * falloff * falloff * mouseStrength;
  }

  // One ring per role change, leaving the pill and fading as it widens.
  if (pulseTime >= 0.0) {
    float dist = length(field - toField(pulseCenter));
    float ring = exp(-pow((dist - pulseTime * 3.1) * 5.5, 2.0));
    f += ring * exp(-pulseTime * 2.6) * 1.2;
  }

  // The bias is what makes the field read as scattered dots rather than a wash.
  f = clamp((f - waveBias) / max(1.0 - waveBias, 0.001), 0.0, 1.0);

  // Colour is applied after quantisation, so an unlit cell lands exactly on the
  // shell colour instead of being dithered towards it — otherwise the band's
  // empty areas speckle against a surface they are meant to be identical to.
  int bx = int(mod(cellIndex.x, 8.0));
  int by = int(mod(cellIndex.y, 8.0));
  float steps = max(colorNum - 1.0, 1.0);
  float threshold = bayerMatrix8x8[by * 8 + bx] - 0.25;
  float quantised = floor((f + threshold / steps) * steps + 0.5) / steps;

  gl_FragColor = vec4(mix(baseColor, waveColor, quantised), 1.0);
}
`

/** How fast the cursor's influence fades in and out, per second. */
const mouseAttack = 5.2
const mouseRelease = 3.4

/** Seconds after which the ring has left the band and decayed below one step. */
const pulseLifetime = 1.2

type DitheredWavesProps = Required<Omit<ComposerDitherCanvasProps, "pulseOrigin" | "pointer" | "onReady">> & {
  pulseOrigin: { x: number; y: number }
  pointer?: RefObject<ComposerPointer>
  onReady?: () => void
}

function DitheredWaves({
  baseColor,
  waveColor,
  hovered,
  pointer,
  pulseToken,
  pulseOrigin,
  animated,
  colorNum,
  pixelSize,
  waveSpeed,
  waveFrequency,
  waveAmplitude,
  patternScale,
  waveBias,
  mouseRadius,
  onReady,
}: DitheredWavesProps) {
  const { size, gl, viewport } = useThree()
  // Wall-clock start of the current ripple, or null between ripples.
  const pulseStartRef = useRef<number | null>(null)
  const seenTokenRef = useRef(pulseToken)
  const readyRef = useRef(false)

  // Seeded from the first measurement rather than left to the resize effect. The
  // Canvas only mounts children once it has measured, so the real size is
  // already known here — and a wrong resolution on frame one is visible, because
  // a throttled tab may not draw a second frame for some time.
  const uniforms = useRef({
    time: new THREE.Uniform(0),
    resolution: new THREE.Uniform(
      new THREE.Vector2(
        Math.max(1, Math.floor(size.width * gl.getPixelRatio())),
        Math.max(1, Math.floor(size.height * gl.getPixelRatio())),
      ),
    ),
    waveSpeed: new THREE.Uniform(waveSpeed),
    waveFrequency: new THREE.Uniform(waveFrequency),
    waveAmplitude: new THREE.Uniform(waveAmplitude),
    patternScale: new THREE.Uniform(patternScale),
    waveBias: new THREE.Uniform(waveBias),
    colorNum: new THREE.Uniform(colorNum),
    pixelSize: new THREE.Uniform(pixelSize),
    // Read through `setStyle` so a CSS hex is treated as sRGB and converted into
    // the renderer's working space; assigning the channels raw would treat them
    // as linear and come out washed.
    baseColor: new THREE.Uniform(new THREE.Color().setStyle(baseColor)),
    waveColor: new THREE.Uniform(new THREE.Color().setStyle(waveColor)),
    mouseUv: new THREE.Uniform(new THREE.Vector2(0.5, 0.5)),
    mouseStrength: new THREE.Uniform(0),
    mouseRadius: new THREE.Uniform(mouseRadius),
    pulseCenter: new THREE.Uniform(new THREE.Vector2(pulseOrigin.x, pulseOrigin.y)),
    pulseTime: new THREE.Uniform(-1),
  }).current

  useLayoutEffect(() => {
    const dpr = gl.getPixelRatio()
    uniforms.resolution.value.set(
      Math.max(1, Math.floor(size.width * dpr)),
      Math.max(1, Math.floor(size.height * dpr)),
    )
  }, [size, gl, uniforms])

  useEffect(() => {
    uniforms.baseColor.value.setStyle(baseColor)
    uniforms.waveColor.value.setStyle(waveColor)
  }, [baseColor, waveColor, uniforms])

  useEffect(() => {
    uniforms.waveSpeed.value = waveSpeed
    uniforms.waveFrequency.value = waveFrequency
    uniforms.waveAmplitude.value = waveAmplitude
    uniforms.patternScale.value = patternScale
    uniforms.waveBias.value = waveBias
    uniforms.colorNum.value = colorNum
    uniforms.pixelSize.value = pixelSize
    uniforms.mouseRadius.value = mouseRadius
  }, [waveSpeed, waveFrequency, waveAmplitude, patternScale, waveBias, colorNum, pixelSize, mouseRadius, uniforms])

  useEffect(() => {
    uniforms.pulseCenter.value.set(pulseOrigin.x, pulseOrigin.y)
  }, [pulseOrigin.x, pulseOrigin.y, uniforms])

  useFrame(({ clock }, delta) => {
    if (!readyRef.current) {
      readyRef.current = true
      onReady?.()
    }

    if (animated) uniforms.time.value = clock.getElapsedTime()

    // Eased rather than switched, and eased faster in than out, so the swell
    // arrives with the cursor and coasts away behind it.
    const cursor = pointer?.current
    const target = animated && hovered && cursor?.inside ? 1 : 0
    const rate = target > uniforms.mouseStrength.value ? mouseAttack : mouseRelease
    uniforms.mouseStrength.value += (target - uniforms.mouseStrength.value) * Math.min(1, delta * rate)
    if (cursor) uniforms.mouseUv.value.set(cursor.x, cursor.y)

    if (seenTokenRef.current !== pulseToken) {
      seenTokenRef.current = pulseToken
      pulseStartRef.current = animated ? clock.getElapsedTime() : null
    }

    if (pulseStartRef.current === null) {
      uniforms.pulseTime.value = -1
      return
    }

    const elapsed = clock.getElapsedTime() - pulseStartRef.current
    if (elapsed > pulseLifetime) {
      pulseStartRef.current = null
      uniforms.pulseTime.value = -1
    } else {
      uniforms.pulseTime.value = elapsed
    }
  })

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} />
    </mesh>
  )
}

const ComposerDitherCanvas = memo(function ComposerDitherCanvas({
  baseColor,
  waveColor,
  hovered = false,
  pointer,
  pulseToken = 0,
  pulseOrigin = { x: 0.085, y: 0.18 },
  animated = true,
  // The tuned preset for this band. Changing any of these changes the texture's
  // character, so they are defaults on the component rather than call-site
  // arguments repeated at every mount.
  colorNum = 4,
  pixelSize = 2,
  waveSpeed = 0.05,
  waveFrequency = 3,
  waveAmplitude = 0.3,
  patternScale = 1.5,
  waveBias = 0.44,
  mouseRadius = 0.3,
  onReady,
}: ComposerDitherCanvasProps) {
  return (
    <Canvas
      className="size-full"
      camera={{ position: [0, 0, 6] }}
      // The pattern is a dither: rendering it above 1x and letting the browser
      // downsample would blur the very grid that makes it read as one.
      dpr={1}
      frameloop={animated ? "always" : "demand"}
      gl={{ antialias: false, alpha: false, powerPreference: "low-power" }}
    >
      <DitheredWaves
        baseColor={baseColor}
        waveColor={waveColor}
        hovered={hovered}
        pointer={pointer}
        pulseToken={pulseToken}
        pulseOrigin={pulseOrigin}
        animated={animated}
        colorNum={colorNum}
        pixelSize={pixelSize}
        waveSpeed={waveSpeed}
        waveFrequency={waveFrequency}
        waveAmplitude={waveAmplitude}
        patternScale={patternScale}
        waveBias={waveBias}
        mouseRadius={mouseRadius}
        onReady={onReady}
      />
    </Canvas>
  )
})

export default ComposerDitherCanvas
