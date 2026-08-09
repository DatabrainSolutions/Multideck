"use client"

import * as React from "react"
import { Check } from "@/components/icons/hugeicons"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { useInvalidFeedback } from "@/components/ui/use-invalid-feedback"

function Checkbox({
  className,
  invalidFeedbackMotion = true,
  "aria-invalid": ariaInvalid,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  invalidFeedbackMotion?: boolean
}) {
  const invalidFeedback = useInvalidFeedback(ariaInvalid, invalidFeedbackMotion)

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-invalid-feedback={invalidFeedback}
      aria-invalid={ariaInvalid}
      className={cn(
        "premium-stroke-soft peer grid size-5 shrink-0 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] text-[var(--md-accent-ink)] outline-none transition-[background-color,border-color,box-shadow,opacity,transform] duration-200 hover:bg-[var(--md-hover)] active:scale-[0.96] motion-reduce:active:scale-100 focus-visible:ring-3 focus-visible:ring-[var(--md-accent-a18)] aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[state=checked]:bg-[var(--md-accent)] data-[state=checked]:shadow-[0_0_0_3px_var(--md-accent-a12)] disabled:cursor-not-allowed disabled:opacity-50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator">
        <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
