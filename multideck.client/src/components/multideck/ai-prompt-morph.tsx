import { type FormEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { SentIcon as SendHorizontalIcon } from "@hugeicons/core-free-icons"
import { AiEditing, LoaderCircle, X } from "@/components/icons/hugeicons"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { cn } from "@/lib/utils"

type AiPromptMorphProps = {
  id: string
  open: boolean
  value: string
  busy?: boolean
  busyLabel?: string | null
  placeholder: string
  triggerLabel: string
  showTriggerLabel?: boolean
  inputLabel: string
  closeLabel: string
  submitLabel: string
  submitDisabled?: boolean
  maxLength?: number
  containEscape?: boolean
  className?: string
  onOpenChange: (open: boolean) => void
  onValueChange: (value: string) => void
  onSubmit: () => void
}

export function AiPromptMorph({
  id,
  open,
  value,
  busy = false,
  busyLabel,
  placeholder,
  triggerLabel,
  showTriggerLabel = false,
  inputLabel,
  closeLabel,
  submitLabel,
  submitDisabled = false,
  maxLength = 2_000,
  containEscape = false,
  className,
  onOpenChange,
  onValueChange,
  onSubmit,
}: AiPromptMorphProps) {
  const shouldReduceMotion = useReducedMotion()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || submitDisabled) return
    onSubmit()
  }

  return (
    <div className={cn("pointer-events-none relative h-10 w-full max-w-[520px]", className)}>
      <button
        type="button"
        disabled={busy}
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? closeLabel : triggerLabel}
        title={open ? closeLabel : triggerLabel}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "pointer-events-auto absolute inset-y-0 end-0 z-10 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--md-surface-tint)] text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.96] disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100",
          showTriggerLabel && !open ? "w-[116px]" : "w-10",
        )}
      >
        <AnimatePresence initial={false} mode="wait">
          {open ? (
            <motion.span key="close" initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.86 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.1 }}>
              <X className="size-4" strokeWidth={1.6} aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span key="trigger" className="inline-flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.1 }}>
              <AiEditing className="size-4" strokeWidth={1.4} aria-hidden="true" />
              {showTriggerLabel ? <span>{triggerLabel.split(" · ")[0]}</span> : null}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.form
            key="ai-prompt"
            id={id}
            data-wizard-escape-contained={containEscape ? "true" : undefined}
            className={cn(
              "pointer-events-auto absolute inset-y-0 start-0 flex h-10 min-w-0 items-center gap-1.5 rounded-full bg-[var(--md-surface-tint)] px-2 shadow-[var(--md-shadow-line)] focus-within:ring-[3px] focus-within:ring-[var(--md-accent-a14)]",
              "end-12",
            )}
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            onSubmit={submit}
            onKeyDownCapture={(event) => {
              if (event.key !== "Escape" || busy) return
              event.preventDefault()
              event.stopPropagation()
              event.nativeEvent.stopImmediatePropagation()
              onOpenChange(false)
            }}
          >
            <AiEditing className="ms-1 size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
            {busy && busyLabel ? (
              <span className="min-w-0 flex-1 truncate text-[13px] font-normal text-[var(--md-text)]" role="status" aria-live="polite">{busyLabel}</span>
            ) : (
              <input
                value={value}
                onChange={(event) => onValueChange(event.target.value.slice(0, maxLength))}
                disabled={busy}
                aria-label={inputLabel}
                placeholder={placeholder}
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-normal text-[var(--md-ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--md-text)_70%,transparent)] disabled:opacity-70 sm:text-[13px]"
              />
            )}
            <DexterActionPill
              type="submit"
              disabled={busy || submitDisabled}
              iconElement={busy
                ? <LoaderCircle className="relative z-10 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : <HugeiconsIcon aria-hidden="true" className="relative z-10 size-3.5 shrink-0" icon={SendHorizontalIcon} strokeWidth={1.25} />}
              iconOnly
              label={submitLabel}
              className="size-8 min-w-0 shrink-0 rounded-full p-0"
            />
          </motion.form>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
