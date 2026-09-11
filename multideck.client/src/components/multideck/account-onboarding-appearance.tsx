import { useState, type CSSProperties } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Check, ChevronDown, Moon, Sun, Sparkles } from "@/components/icons/hugeicons"
import { accentPresets, buildAccentRamp, type AccentPresetId } from "@/lib/accent-theme"
import { useLanguage } from "@/i18n/language-provider"
import "@/dexter-transfer.css"
import { mdMotion } from "@/lib/motion"

export function AccountOnboardingAppearance({ accent, theme, onAccent, onTheme }: { accent: AccentPresetId; theme: "light" | "dark"; onAccent: (id: AccentPresetId) => void; onTheme: (theme: "light" | "dark") => void }) {
  const { t } = useLanguage()
  const reduced = Boolean(useReducedMotion())
  const [expanded, setExpanded] = useState(false)
  const choices = expanded ? accentPresets : accentPresets.slice(0, 8)
  return <div className="md-onboarding-appearance">
    <div className="md-onboarding-theme-options" role="group" aria-label={t("Display theme")}>
      {(["light", "dark"] as const).map((mode) => <motion.button type="button" key={mode} aria-pressed={theme === mode} onClick={() => onTheme(mode)} whileTap={reduced ? undefined : { scale: 0.98 }} transition={mdMotion.spring} className={theme === mode ? "is-selected" : ""}>
        <span className={`md-onboarding-theme-mini is-${mode}`} aria-hidden="true"><i /><span><i /><i /><i /></span></span>
        <span>{mode === "light" ? <Sun className="size-4" /> : <Moon className="size-4" />}{t(mode === "light" ? "Light" : "Dark")}{theme === mode ? <Check className="ms-auto size-3.5" /> : null}</span>
      </motion.button>)}
    </div>
    <div className="md-onboarding-colour-heading"><span>{t("A colour that feels like you")}</span><span>{t("Just for your account")}</span></div>
    <div className="md-onboarding-colour-options" role="group" aria-label={t("Accent colour")}>
      {choices.map((preset) => {
        const ramp = buildAccentRamp(preset.id)
        const colour = ramp[theme]
        const style = { "--choice-accent": colour.accent, "--choice-ink": colour.accentInk, "--choice-tint": colour.selectedBg, "--choice-text": colour.selectedText, "--choice-shader": `linear-gradient(115deg, ${ramp.brand.shader.join(", ")})`, "--md-bloom-a": ramp.brand.shader[0], "--md-bloom-b": ramp.brand.shader[1], "--md-bloom-c": ramp.brand.shader[2] } as CSSProperties
        return <motion.button type="button" style={style} key={preset.id} className={`md-onboarding-colour-card is-${theme}${accent === preset.id ? " is-selected" : ""}`} onClick={() => onAccent(preset.id)} whileTap={reduced ? undefined : { scale: 0.98 }} transition={mdMotion.spring} aria-pressed={accent === preset.id} aria-label={t(preset.label)}>
          <span className="md-onboarding-colour-label">{t(preset.label)}<span className="md-onboarding-colour-check">{accent === preset.id ? <Check className="size-3" /> : null}</span></span>
          {/* The app's painted bloom gives a faithful still preview without a GPU renderer per colour. */}
          <span className="md-onboarding-colour-sample" aria-hidden="true"><span className="md-onboarding-mini-dexter"><span className="md-onboarding-mini-shader md-bloom-fallback"><span className="md-bloom-fallback__glow" /><span className="md-bloom-fallback__rays" /></span><Sparkles className="relative z-10 size-3" /><span className="relative z-10">Dexter</span></span><span className="md-onboarding-mini-status">{t("Selected")}</span><span className="md-onboarding-mini-toggle"><i /></span></span>
        </motion.button>
      })}
    </div>
    <button type="button" aria-expanded={expanded} className="md-onboarding-see-more" onClick={() => setExpanded(!expanded)}>{t(expanded ? "See fewer colours" : "See more colours")}<ChevronDown className={`size-3.5 ${expanded ? "rotate-180" : ""}`} /></button>
  </div>
}
