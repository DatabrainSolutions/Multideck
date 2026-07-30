/**
 * Geometry for the dashboard area charts. Kept free of React so the chart can
 * rebuild a path inside an animation frame without touching the render tree.
 */

export type AreaChartPoint = {
  label: string
  value: number
  target?: number
}

export type ChartBox = {
  width: number
  height: number
  padTop: number
  padBottom: number
  padStart: number
  padEnd: number
}

export type ChartScale = {
  min: number
  max: number
}

/**
 * A domain with a little headroom above the data, sized so that every gridline
 * lands on a round number. The span is always an exact multiple of the step, so
 * the axis reads "0, 4, 8, 12" rather than "0, 3.8, 7.5, 11.3" — which is the
 * difference between a chart you can read and one you have to squint at.
 */
export function getChartScale(values: number[], zeroBased = true, divisions = 4): ChartScale {
  if (values.length === 0) return { min: 0, max: 1 }

  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const anchorZero = zeroBased && rawMin >= 0
  const integersOnly = values.every((value) => Number.isInteger(value))
  const span = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.08, 1)
  const looseMin = anchorZero ? 0 : rawMin - span * 0.16

  // Smallest round step that still covers the data across all divisions. Going
  // smallest-first matters: rounding the step up too eagerly leaves the curve
  // hugging the floor with half the panel empty.
  const step = niceStep((rawMax - looseMin) / divisions, integersOnly)
  const min = anchorZero ? 0 : Math.floor(looseMin / step) * step

  return { min, max: min + step * divisions }
}

/**
 * Round-number ladder. Counts of jobs or emails should never be labelled 2.5,
 * so integral data is held to integral steps.
 */
const stepLadder = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

function niceStep(rough: number, integersOnly: boolean) {
  if (rough <= 0) return 1

  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalised = rough / magnitude

  for (const candidate of stepLadder) {
    if (candidate < normalised) continue
    const step = candidate * magnitude
    if (integersOnly && !Number.isInteger(step)) continue
    return step
  }

  return 10 * magnitude
}

export function getGridValues(scale: ChartScale, count = 4) {
  const step = (scale.max - scale.min) / count
  return Array.from({ length: count + 1 }, (_, index) => scale.min + step * index)
}

export function projectX(index: number, total: number, box: ChartBox) {
  const plot = box.width - box.padStart - box.padEnd
  if (total <= 1) return box.padStart + plot / 2
  return box.padStart + (index / (total - 1)) * plot
}

export function projectY(value: number, scale: ChartScale, box: ChartBox) {
  const plot = box.height - box.padTop - box.padBottom
  const span = scale.max - scale.min || 1
  const ratio = (value - scale.min) / span
  return box.padTop + plot - ratio * plot
}

/**
 * Monotone cubic interpolation (Fritsch-Carlson). Plain Catmull-Rom overshoots
 * on spiky operational data, which reads as the line dipping below zero or
 * bulging past a peak. Monotone tangents cannot overshoot, so the curve stays
 * honest while still looking hand-drawn.
 */
export function buildSmoothPath(points: Array<readonly [number, number]>) {
  if (points.length === 0) return ""
  if (points.length === 1) return `M ${round(points[0][0])} ${round(points[0][1])}`
  if (points.length === 2) {
    return `M ${round(points[0][0])} ${round(points[0][1])} L ${round(points[1][0])} ${round(points[1][1])}`
  }

  const count = points.length
  const slopes: number[] = []
  const deltas: number[] = []

  for (let index = 0; index < count - 1; index += 1) {
    const dx = points[index + 1][0] - points[index][0]
    const dy = points[index + 1][1] - points[index][1]
    deltas.push(dx === 0 ? 0 : dy / dx)
  }

  slopes.push(deltas[0])
  for (let index = 1; index < count - 1; index += 1) {
    const previous = deltas[index - 1]
    const next = deltas[index]
    slopes.push(previous * next <= 0 ? 0 : (2 * previous * next) / (previous + next))
  }
  slopes.push(deltas[count - 2])

  let path = `M ${round(points[0][0])} ${round(points[0][1])}`

  for (let index = 0; index < count - 1; index += 1) {
    const [x0, y0] = points[index]
    const [x1, y1] = points[index + 1]
    const dx = (x1 - x0) / 3
    path += ` C ${round(x0 + dx)} ${round(y0 + slopes[index] * dx)} ${round(x1 - dx)} ${round(y1 - slopes[index + 1] * dx)} ${round(x1)} ${round(y1)}`
  }

  return path
}

export function closeAreaPath(linePath: string, box: ChartBox) {
  if (!linePath) return ""
  const baseline = round(box.height - box.padBottom)
  return `${linePath} L ${round(box.width - box.padEnd)} ${baseline} L ${round(box.padStart)} ${baseline} Z`
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

export function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

/**
 * Resamples a series to a target length so two frames of a morph always produce
 * the same number of path commands. Without this, switching between ranges of
 * different length would force the browser to rebuild the path from scratch and
 * the transition would jump.
 */
export function resample(values: number[], length: number) {
  if (values.length === 0) return Array.from({ length }, () => 0)
  if (values.length === length) return values.slice()

  return Array.from({ length }, (_, index) => {
    const position = (index / Math.max(length - 1, 1)) * (values.length - 1)
    const low = Math.floor(position)
    const high = Math.min(low + 1, values.length - 1)
    return lerp(values[low], values[high], position - low)
  })
}
