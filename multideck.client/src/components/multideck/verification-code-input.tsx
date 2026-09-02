import { useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const boxSizes = {
  md: "size-11 rounded-[10px] text-[19px]",
  lg: "size-[74px] rounded-[14px] text-[34px]",
} as const

/**
 * The one-time code field shared by sign-in and by public booking verification.
 *
 * Focus travels on its own: typing advances, backspace retreats, arrows move,
 * and a pasted or autofilled code fills every box at once. Completion is
 * reported once per code so a parent that re-renders while submitting cannot
 * fire the same verification twice.
 */
export function VerificationCodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  size = "md",
  disabled = false,
  invalid = false,
  describedBy,
  firstBoxId,
  autoFocus = false,
  className,
  boxClassName,
}: {
  value: string
  onChange: (value: string) => void
  /** Fired once the last box is filled, a beat after the digit lands. */
  onComplete?: (value: string) => void | Promise<void>
  length?: number
  size?: keyof typeof boxSizes
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  /** Id for the first box, so an error message can send focus back to it. */
  firstBoxId?: string
  autoFocus?: boolean
  className?: string
  boxClassName?: string
}) {
  const boxes = useRef<Array<HTMLInputElement | null>>([])
  const completedCode = useRef<string | null>(null)
  const completeRef = useRef(onComplete)
  completeRef.current = onComplete
  const digits = Array.from({ length }, (_, index) => value[index] ?? "")

  useEffect(() => {
    if (value.length !== length) { completedCode.current = null; return }
    if (completedCode.current === value) return
    completedCode.current = value
    const timer = window.setTimeout(() => void completeRef.current?.(value), 220)
    return () => window.clearTimeout(timer)
  }, [length, value])

  function focusBox(index: number) {
    boxes.current[Math.max(0, Math.min(index, length - 1))]?.focus()
  }

  function write(index: number, entry: string) {
    const typed = entry.replace(/\D/g, "")
    if (!typed) return
    const next = (value.slice(0, index) + typed + value.slice(index + typed.length)).replace(/\D/g, "").slice(0, length)
    onChange(next)
    focusBox(index + typed.length)
  }

  function keyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault()
      if (digits[index]) { onChange(value.slice(0, index) + value.slice(index + 1)); return }
      onChange(value.slice(0, Math.max(0, index - 1)) + value.slice(index))
      focusBox(index - 1)
      return
    }
    if (event.key === "ArrowLeft") { event.preventDefault(); focusBox(index - 1) }
    if (event.key === "ArrowRight") { event.preventDefault(); focusBox(index + 1) }
  }

  return (
    <div className={cn("flex gap-2.5", className)} dir="ltr" role="group" aria-label="Verification code" aria-describedby={describedBy}>
      {digits.map((digit, index) => (
        <Input
          // The boxes are positional, so the index is the only stable identity.
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          ref={(element) => { boxes.current[index] = element }}
          id={index === 0 ? firstBoxId : undefined}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          invalidFeedbackMotion={index === 0}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          onChange={(event) => write(index, event.target.value)}
          onKeyDown={(event) => keyDown(index, event)}
          onFocus={(event) => event.target.select()}
          onPaste={(event) => { event.preventDefault(); write(0, event.clipboardData.getData("text")) }}
          className={cn(
            // A code field is the whole task on the screen it appears on, so the box in
            // hand is marked on plain focus too, not only on keyboard focus.
            "bg-[var(--brand-field,var(--md-field-bg))] p-0 text-center font-medium tabular-nums text-[var(--brand-ink,var(--md-ink))] hover:bg-[var(--brand-field-hover,var(--md-field-bg-hover))] focus:border-[var(--brand-a48,var(--md-accent-a48))] focus:bg-[var(--brand-field-hover,var(--md-field-bg-hover))] focus:ring-3 focus:ring-[var(--brand-a20,var(--md-accent-a20))] focus-visible:border-[var(--brand-a48,var(--md-accent-a48))] focus-visible:bg-[var(--brand-field-hover,var(--md-field-bg-hover))] focus-visible:ring-[var(--brand-a20,var(--md-accent-a20))]",
            boxSizes[size],
            boxClassName,
          )}
        />
      ))}
    </div>
  )
}
