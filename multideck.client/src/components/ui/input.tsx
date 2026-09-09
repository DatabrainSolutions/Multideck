import * as React from "react"

import { cn } from "@/lib/utils"
import { moveTabToAdjacentField } from "@/components/ui/field-tab-navigation"
import { useInvalidFeedback } from "@/components/ui/use-invalid-feedback"

type InputProps = React.ComponentProps<"input"> & {
  invalidFeedbackMotion?: boolean
}

function Input({
  className,
  type,
  invalidFeedbackMotion = true,
  "aria-invalid": ariaInvalid,
  onKeyDown,
  ...props
}: InputProps) {
  const invalidFeedback = useInvalidFeedback(ariaInvalid, invalidFeedbackMotion)

  return (
    <input
      type={type}
      data-slot="input"
      data-invalid-feedback={invalidFeedback}
      aria-invalid={ariaInvalid}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        moveTabToAdjacentField(event)
      }}
      className={cn(
        "premium-stroke-soft h-8 w-full min-w-0 rounded-lg bg-[var(--md-field-bg)] px-2.5 py-1 text-base transition-[background-color,border-color,box-shadow,color,opacity] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:bg-[var(--md-field-bg-hover)] focus-visible:border-ring focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
