import { useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Plus, X } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type TagEntryFieldProps = {
  id?: string
  terms: string[]
  onTermsChange: (terms: string[]) => void
  maxTerms?: number
  maxTermLength?: number
  disabled?: boolean
  placeholder?: string
  inputLabel: string
  addLabel: string
  removeLabel: (term: string) => string
  duplicateMessage: string
  limitMessage: string
  className?: string
}

export function normalizeTagTerms(terms: string[], maxTerms = 100, maxTermLength = 80) {
  const seen = new Set<string>()
  return terms
    .map((term) => term.replace(/\s+/gu, " ").trim().slice(0, maxTermLength))
    .filter((term) => {
      const key = term.toLocaleLowerCase()
      if (!term || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, maxTerms)
}

/** A compact comma-or-Enter tag field for short controlled vocabularies. */
export function TagEntryField({
  id,
  terms,
  onTermsChange,
  maxTerms = 100,
  maxTermLength = 80,
  disabled = false,
  placeholder,
  inputLabel,
  addLabel,
  removeLabel,
  duplicateMessage,
  limitMessage,
  className,
}: TagEntryFieldProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [draft, setDraft] = useState("")
  const [status, setStatus] = useState("")

  function addTerms(candidates: string[]) {
    const normalisedCandidates = normalizeTagTerms(candidates, Math.max(maxTerms, candidates.length), maxTermLength)
    if (normalisedCandidates.length === 0) return false

    const existing = new Set(terms.map((term) => term.toLocaleLowerCase()))
    const additions = normalisedCandidates.filter((term) => !existing.has(term.toLocaleLowerCase()))
    if (additions.length === 0) {
      setStatus(duplicateMessage)
      return false
    }

    const available = Math.max(0, maxTerms - terms.length)
    if (available === 0) {
      setStatus(limitMessage)
      return false
    }

    const accepted = additions.slice(0, available)
    onTermsChange([...terms, ...accepted])
    setStatus(accepted.length < additions.length ? limitMessage : "")
    return true
  }

  function commitDraft() {
    const added = addTerms(draft.split(/[,\n]/u))
    if (added || !draft.trim()) setDraft("")
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key !== "Enter" && event.key !== ",") return
    event.preventDefault()
    commitDraft()
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text")
    if (!/[,\n]/u.test(pasted)) return
    event.preventDefault()
    const added = addTerms([draft, pasted].join(",").split(/[,\n]/u))
    if (added) setDraft("")
  }

  function removeTerm(term: string) {
    onTermsChange(terms.filter((candidate) => candidate !== term))
    setStatus("")
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="relative">
        <Input
          id={id}
          value={draft}
          disabled={disabled || terms.length >= maxTerms}
          maxLength={maxTermLength}
          aria-label={inputLabel}
          placeholder={placeholder}
          className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-field-bg)] ps-3 pe-11 text-[16px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow] hover:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] sm:text-[13px]"
          onChange={(event) => {
            setDraft(event.target.value)
            setStatus("")
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            if (draft.trim()) commitDraft()
          }}
        />
        <motion.span
          className="absolute inset-y-1 end-1"
          whileTap={shouldReduceMotion || !draft.trim() ? undefined : { scale: 0.92 }}
          transition={reduceMotion(shouldReduceMotion, mdMotion.micro)}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={disabled || !draft.trim() || terms.length >= maxTerms}
            aria-label={addLabel}
            className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-accent)] hover:bg-[var(--md-accent-a10)] disabled:opacity-35"
            onMouseDown={(event) => event.preventDefault()}
            onClick={commitDraft}
          >
            <Plus className="size-3.5" strokeWidth={1.7} aria-hidden="true" />
          </Button>
        </motion.span>
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {terms.length > 0 ? (
          <motion.ul
            layout
            key="tag-list"
            className="mt-2 flex flex-wrap gap-1.5"
            aria-label={inputLabel}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {terms.map((term) => (
                <motion.li
                  layout
                  key={term.toLocaleLowerCase()}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.78, y: 2 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.84, y: -1 }}
                  transition={reduceMotion(shouldReduceMotion, mdMotion.spring)}
                  className="inline-flex h-7 max-w-full items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent)] ps-2 text-[11.5px] font-medium text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)]"
                >
                  <span className="max-w-[260px] truncate" dir="auto">{term}</span>
                  <motion.button
                    type="button"
                    aria-label={removeLabel(term)}
                    disabled={disabled}
                    className="ms-1.5 grid h-full w-7 shrink-0 place-items-center border-s border-white/25 text-white/82 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/12 focus-visible:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.78 }}
                    transition={reduceMotion(shouldReduceMotion, mdMotion.micro)}
                    onClick={() => removeTerm(term)}
                  >
                    <X className="size-3" strokeWidth={1.8} aria-hidden="true" />
                  </motion.button>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        ) : null}
      </AnimatePresence>

      <p className="sr-only" role="status" aria-live="polite">{status}</p>
    </div>
  )
}
