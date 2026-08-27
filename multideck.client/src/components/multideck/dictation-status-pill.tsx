import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition } from "motion/react"
import { useLanguage } from "@/i18n/language-provider"
import { mdEase, mdMotion, reduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type DictationStatusPhase = "transcribing" | "polishing" | "complete" | "error"

const figmaMinimumWidths: Record<DictationStatusPhase, number> = {
  transcribing: 181,
  polishing: 134,
  complete: 149,
  error: 149,
}

const waveOffsets = [-9, -4.5, 0, 4.5, 9]
const waveScales = [0.48, 0.72, 1, 0.72, 0.48]
const shapeIds = ["outer-start", "inner-start", "centre", "inner-end", "outer-end"] as const

function shapeTarget(
  index: number,
  phase: DictationStatusPhase,
  level: number,
  shouldReduceMotion: boolean,
): TargetAndTransition {
  if (phase === "transcribing") {
    const height = Math.max(4, Math.min(19, (8 + level * 13) * waveScales[index]))
    return {
      width: 2,
      height,
      x: waveOffsets[index] - 1,
      y: -height / 2,
      opacity: 1,
      rotate: 0,
      scale: 1,
      transition: shouldReduceMotion ? { duration: 0 } : { duration: 0.1, ease: mdEase },
    }
  }

  if (phase === "polishing") {
    if (index < 1 || index > 3) {
      return {
        width: 2,
        height: 2,
        x: 0,
        y: -1,
        opacity: 0,
        rotate: 0,
        scale: 0,
        transition: reduceMotion(shouldReduceMotion, mdMotion.micro),
      }
    }
    const dotIndex = index - 1
    return {
      width: 3,
      height: 3,
      x: (dotIndex - 1) * 5 - 1.5,
      y: shouldReduceMotion ? -1.5 : [-1.5, -4.5, -1.5],
      opacity: 1,
      rotate: 0,
      scale: shouldReduceMotion ? 1 : [1, 1.05, 1],
      transition: shouldReduceMotion
        ? { duration: 0 }
        : { duration: 0.78, repeat: Number.POSITIVE_INFINITY, ease: mdEase, delay: dotIndex * 0.04 },
    }
  }

  if (phase === "error") {
    if (index === 1 || index === 2) {
      return {
        width: 9,
        height: 2,
        x: -4.5,
        y: -1,
        opacity: 1,
        rotate: index === 1 ? 45 : -45,
        scale: 1,
        transition: reduceMotion(shouldReduceMotion, mdMotion.spring),
      }
    }
    return {
      width: 2,
      height: 2,
      x: 0,
      y: -1,
      opacity: 0,
      rotate: 0,
      scale: 0,
      transition: reduceMotion(shouldReduceMotion, mdMotion.micro),
    }
  }

  if (index === 1) {
    return {
      width: 6.5,
      height: 2,
      x: -6,
      y: 0.25,
      opacity: 1,
      rotate: 45,
      scale: 1,
      transition: reduceMotion(shouldReduceMotion, mdMotion.spring),
    }
  }
  if (index === 2) {
    return {
      width: 10.5,
      height: 2,
      x: -1.4,
      y: -2,
      opacity: 1,
      rotate: -45,
      scale: 1,
      transition: reduceMotion(shouldReduceMotion, mdMotion.spring),
    }
  }
  return {
    width: 2,
    height: 2,
    x: 0,
    y: -1,
    opacity: 0,
    rotate: 0,
    scale: 0,
    transition: reduceMotion(shouldReduceMotion, mdMotion.micro),
  }
}

/** Figma-matched dictation feedback whose bars, dots and tick share one identity. */
export function DictationStatusPill({
  phase,
  level = 0.45,
  message,
  className,
}: {
  phase: DictationStatusPhase
  level?: number
  message?: string | null
  className?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const boundedLevel = Math.min(Math.max(level, 0), 1)
  const label = phase === "error"
    ? message || t("Transcription failed")
    : phase === "transcribing"
    ? t("Transcribing")
    : phase === "polishing"
      ? t("Polishing")
      : t("Complete")

  return (
    <motion.div
      layout="size"
      layoutDependency={phase}
      data-state={phase}
      className={cn("md-dictation-status-pill", className)}
      style={{ minWidth: figmaMinimumWidths[phase] }}
      transition={reduceMotion(shouldReduceMotion, mdMotion.spring)}
      role={phase === "error" ? "alert" : "status"}
      aria-live={phase === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          layout="position"
          key={phase}
          className="md-dictation-status-pill__label"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
          transition={reduceMotion(shouldReduceMotion, mdMotion.micro)}
        >
          {label}
        </motion.span>
      </AnimatePresence>

      <span className="md-dictation-status-pill__indicator" aria-hidden="true">
        {shapeIds.map((shapeId, index) => (
          <motion.span
            // Stable shape identities are intentional: each physical stroke morphs into
            // a dot and then a segment of the tick instead of being replaced.
            key={shapeId}
            className="md-dictation-status-pill__shape"
            initial={false}
            animate={shapeTarget(index, phase, boundedLevel, shouldReduceMotion)}
          />
        ))}
      </span>
    </motion.div>
  )
}
