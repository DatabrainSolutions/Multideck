import { useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import "./code-slots.css"

/** React Bits CodeSlots, adapted to native editing and Multideck's security tokens.
 * Keep rejected codes editable; only the verifier may report success.
 */
export function CodeSlots({ value, onChange, onComplete, status = "idle", disabled = false, id, describedBy, ariaLabel = "Authenticator code", autoFocus = false }: {
  value: string
  onChange: (code: string) => void
  onComplete?: (code: string) => void
  status?: "idle" | "error" | "success"
  disabled?: boolean
  id?: string
  describedBy?: string
  ariaLabel?: string
  autoFocus?: boolean
}) {
  const reduce = useReducedMotion()
  const input = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [position, setPosition] = useState(value.length)
  const locked = disabled || status === "success"
  return (
    <div className="code-slots" data-status={status} data-disabled={disabled || undefined} dir="ltr">
      <input
        ref={input}
        id={id}
        className="code-slots__input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        disabled={disabled}
        readOnly={status === "success"}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-invalid={status === "error" || undefined}
        aria-describedby={describedBy}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSelect={(event) => setPosition(event.currentTarget.selectionStart ?? value.length)}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, "").slice(0, 6)
          onChange(next)
          setPosition(Math.min(event.target.selectionStart ?? next.length, 6))
          if (next.length === 6 && next !== value) onComplete?.(next)
        }}
        onPaste={(event) => {
          const next = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
          if (!next || locked) return
          event.preventDefault()
          onChange(next)
          setPosition(next.length)
          if (next.length === 6 && next !== value) onComplete?.(next)
        }}
      />
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} className="code-slots__slot" data-active={focused && !locked && index === Math.min(position, 5) || undefined} aria-hidden="true"
          onPointerDown={(event) => {
            if (locked) return
            event.preventDefault()
            input.current?.focus()
            const next = Math.min(index, value.length)
            input.current?.setSelectionRange(next, Math.min(next + 1, value.length))
            setPosition(next)
          }}>
          <motion.span className="code-slots__fill" initial={false} animate={{ scale: value[index] ? 1 : 0 }} transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0.2, delay: index * 0.02 }} />
          <motion.span className="code-slots__digit" initial={false} animate={{ opacity: value[index] ? 1 : 0, y: value[index] || reduce ? 0 : 8 }} transition={{ duration: reduce ? 0 : 0.2 }}>{value[index]}</motion.span>
        </span>
      ))}
      {status === "success" ? <motion.span className="code-slots__success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.2 }}><HugeiconsIcon icon={Tick02Icon} size={26} aria-hidden="true" /><span className="sr-only">Code accepted</span></motion.span> : null}
    </div>
  )
}
