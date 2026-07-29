"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "premium-stroke-soft peer grid size-5 shrink-0 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] text-[var(--md-accent-ink)] outline-none transition-[background-color,box-shadow,opacity,transform] duration-200 hover:bg-[var(--md-hover)] active:scale-[0.96] motion-reduce:active:scale-100 focus-visible:ring-3 focus-visible:ring-[var(--md-accent-a18)] data-[state=checked]:bg-[var(--md-accent)] data-[state=checked]:shadow-[0_0_0_3px_var(--md-accent-a12)] disabled:cursor-not-allowed disabled:opacity-50",
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
