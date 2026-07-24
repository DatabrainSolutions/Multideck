export const mdEase = [0.22, 1, 0.36, 1] as [number, number, number, number]
export const mdEaseOut = [0.16, 1, 0.3, 1] as [number, number, number, number]

export const mdMotion = {
  micro: { duration: 0.16, ease: mdEase },
  fast: { duration: 0.2, ease: mdEase },
  smooth: { duration: 0.24, ease: mdEase },
  panel: { duration: 0.3, ease: mdEaseOut },
  page: { duration: 0.34, ease: mdEaseOut },
  spring: { type: "spring" as const, stiffness: 420, damping: 42, mass: 0.8 },
  layout: { duration: 0.22, ease: mdEase },
}

export function reduceMotion(shouldReduce: boolean, transition: Transition = mdMotion.fast): Transition {
  return shouldReduce ? { duration: 0 } : transition
}
import type { Transition } from "motion/react"
