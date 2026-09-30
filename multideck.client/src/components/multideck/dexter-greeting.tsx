import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
import { mdEaseOut } from "@/lib/motion"

/**
 * The line that opens a Dexter prompt box. Set flush with the composer's start
 * edge rather than centred, so the greeting, the writing and the tray below it
 * share one left margin and read as a single object.
 *
 * It arrives in two beats: the greeting resolves out of a blur, and the
 * standfirst follows once the eye has landed.
 */
export function DexterGreeting({
  title,
  standfirst,
  className,
}: {
  title: string
  standfirst?: string
  className?: string
}) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const rise = (delay: number) => shouldReduceMotion
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 8, filter: "blur(6px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        transition: { duration: 0.52, ease: mdEaseOut, delay },
      }

  return (
    <div className={cn("ps-1.5 text-start", className)}>
      <motion.h1
        className="text-[24px] font-medium leading-tight tracking-[-0.01em] text-[var(--md-ink)] sm:text-[28px]"
        style={{ textWrap: "balance" }}
        {...rise(0)}
      >
        {title}
      </motion.h1>
      {standfirst ? (
        <motion.p
          className="mt-1.5 text-[14.5px] leading-[1.5] text-[var(--md-text)]"
          style={{ textWrap: "pretty" }}
          {...rise(0.1)}
        >
          {standfirst}
        </motion.p>
      ) : null}
    </div>
  )
}
