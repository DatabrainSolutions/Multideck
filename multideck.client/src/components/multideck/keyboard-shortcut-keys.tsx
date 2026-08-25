import { useMemo } from "react"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { useLanguage } from "@/i18n/language-provider"
import { bindingTokens, type ShortcutBinding } from "@/lib/keyboard-shortcut-binding"
import { usePlatformShortcutLabels, useShortcutBinding } from "@/lib/keyboard-shortcuts"
import { cn } from "@/lib/utils"

/**
 * Draws a binding as keycaps.
 *
 * Always left-to-right: "⌘ then K" describes a physical keyboard,
 * and a keyboard does not mirror. The word between the steps is the only part
 * that translates, which is why it sits outside the `data-i18n-skip` group.
 */
export function ShortcutKeys({
  binding,
  className,
  keyClassName,
  emptyLabel = "Not set",
}: {
  binding: ShortcutBinding | null
  className?: string
  keyClassName?: string
  emptyLabel?: string
}) {
  const platform = usePlatformShortcutLabels()
  const steps = useMemo(() => bindingTokens(binding, platform), [binding, platform])

  if (steps.length === 0) {
    return <span className={cn("text-[12px] text-[var(--md-subtle)]", className)}>{emptyLabel}</span>
  }

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {steps.map((tokens, stepIndex) => (
        <span key={stepIndex} className="inline-flex items-center gap-1.5">
          {stepIndex > 0 ? <span className="text-[11px] text-[var(--md-subtle)]">then</span> : null}
          <KbdGroup dir="ltr" data-i18n-skip>
            {tokens.map((token, tokenIndex) => (
              <Kbd
                key={`${token}-${tokenIndex}`}
                className={cn(
                  "h-[22px] min-w-[22px] rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-1.5 text-[11.5px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
                  keyClassName,
                )}
              >
                {token}
              </Kbd>
            ))}
          </KbdGroup>
        </span>
      ))}
    </span>
  )
}

/** The same keycaps, resolved from a shortcut id, for hints beside a control. */
export function ShortcutHint({
  shortcutId,
  className,
  keyClassName,
}: {
  shortcutId: string
  className?: string
  keyClassName?: string
}) {
  const binding = useShortcutBinding(shortcutId)
  const { t } = useLanguage()
  if (!binding) return null

  return <ShortcutKeys binding={binding} className={className} keyClassName={keyClassName} emptyLabel={t("Not set")} />
}
