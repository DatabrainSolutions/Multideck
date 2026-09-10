import { useEffect, useRef } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, Check } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"

// A bounded burst. Deterministic trajectories avoid changing particles on render.
const confetti = Array.from({ length: 44 }, (_, index) => {
  const side = index % 2 ? 1 : -1
  return { x: side * (55 + (index * 47) % 300), rise: -90 - (index * 29) % 175, fall: 140 + (index * 37) % 280, rotation: side * (120 + (index * 31) % 400), delay: (index % 5) * 0.025 }
})

export function AccountOnboardingCelebration({ firstName, preview, onContinue }: { firstName: string; preview: boolean; onContinue: () => void }) {
  const { t } = useLanguage()
  const reduced = Boolean(useReducedMotion())
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => { title.current?.focus({ preventScroll: true }) }, [])

  return <div className="md-onboarding-celebration">
    {!reduced ? <div className="md-onboarding-confetti" aria-hidden="true">{confetti.map((particle, index) => <motion.i key={index} style={{ background: `color-mix(in srgb,var(--md-accent) ${45 + index % 4 * 15}%,${index % 3 === 0 ? "var(--md-accent-deep)" : "white"})`, borderRadius: index % 3 ? "2px" : "50%" }} initial={{ x: 0, y: 0, rotate: 0, opacity: 0 }} animate={{ x: [0, particle.x * 0.72, particle.x], y: [0, particle.rise, particle.fall], rotate: [0, particle.rotation * 0.5, particle.rotation], opacity: [0, 1, 1, 0] }} transition={{ duration: 1.8, delay: particle.delay, times: [0, 0.38, 1], ease: [0.22, 1, 0.36, 1], opacity: { duration: 1.8, delay: particle.delay, times: [0, 0.05, 0.65, 1] } }} />)}</div> : null}
    <motion.span className="md-onboarding-success-mark" initial={reduced ? false : { scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={reduceMotion(reduced, mdMotion.spring)}><Check className="size-7" /></motion.span>
    <h1 ref={title} tabIndex={-1}>{t(firstName ? `You’re all set, ${firstName}.` : "You’re all set.")}</h1>
    <p>{t(preview ? "That’s the welcome. Your profile is just as you left it." : "Your space is ready. Let’s make lighter work of your day.")}</p>
    <Button className="md-onboarding-continue" onClick={onContinue}>{t(preview ? "Back to profile" : "Open my workspace")}<ArrowRight className="size-4" /></Button>
  </div>
}
