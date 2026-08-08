import type { Transition } from "motion/react"

export const mdEase = [0.22, 1, 0.36, 1] as [number, number, number, number]
export const mdEaseOut = [0.16, 1, 0.3, 1] as [number, number, number, number]
export const mdEaseIn = [0.4, 0, 1, 1] as [number, number, number, number]

export const mdMotion = {
  micro: { duration: 0.16, ease: mdEase },
  fast: { duration: 0.2, ease: mdEase },
  smooth: { duration: 0.24, ease: mdEase },
  panel: { duration: 0.3, ease: mdEaseOut },
  page: { duration: 0.34, ease: mdEaseOut },
  spring: { type: "spring" as const, stiffness: 420, damping: 42, mass: 0.8 },
  layout: { duration: 0.22, ease: mdEase },
  // Content should arrive with a relaxed decelerating curve and leave quickly on
  // an accelerating one, so nothing lingers or feels like it snaps back.
  enter: { duration: 0.28, ease: mdEaseOut },
  exit: { duration: 0.16, ease: mdEaseIn },
  // A softer spring for count-ups and value ramps that should ease into place.
  rampSpring: { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.7 },
  // Digit rolls travel a fixed distance, so they can be quick and slightly
  // over-damped: the glyph must be readable the instant it stops.
  rollSpring: { type: "spring" as const, stiffness: 520, damping: 40, mass: 0.62 },
  // Chart morphs cover a lot of pixels. A long decelerating curve keeps the
  // sweep legible and avoids the whip that a stiff spring gives a wide path.
  morph: { duration: 0.52, ease: mdEaseOut },
  // The crosshair should feel magnetic as it snaps between data points.
  snap: { type: "spring" as const, stiffness: 620, damping: 44, mass: 0.5 },
}

/**
 * Stagger delays that tighten as the list grows. A flat cadence makes long lists
 * feel slow to settle; this front-loads the first few items and lets later ones
 * catch up, so the whole group lands quickly without feeling mechanical.
 */
export function staggerRamp(index: number, base = 0.048, decay = 3.2) {
  return base * decay * (1 - Math.exp(-index / decay))
}

/**
 * A shared element travelling between two layouts — a register row rising into a
 * detail header and back down again. Long enough to follow across the screen,
 * short enough that opening a record still feels immediate.
 */
export const sharedElementTransition = { duration: 0.38, ease: mdEase } as const

export function reduceMotion(shouldReduce: boolean, transition: Transition = mdMotion.fast): Transition {
  return shouldReduce ? { duration: 0 } : transition
}
