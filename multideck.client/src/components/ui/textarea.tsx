import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "premium-stroke-soft flex field-sizing-content min-h-16 w-full rounded-lg bg-[var(--md-field-bg)] px-2.5 py-2 text-base transition-[background-color,border-color,box-shadow,color,opacity] outline-none placeholder:text-muted-foreground hover:bg-[var(--md-field-bg-hover)] focus-visible:border-ring focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
