import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

/** Coalesce edits, serialize writes and flush pending work when leaving a tab. */
export function useSettingsAutosave<T>(value: T, dirty: boolean, save: (value: T) => Promise<void>) {
  const saveRef = useRef(save)
  saveRef.current = save
  const pending = useRef<{ value: T; save: (value: T) => Promise<void>; revision: number } | null>(null)
  const running = useRef(false)
  const revision = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState("Changes save automatically")
  const flush = useRef(async () => {})
  flush.current = async () => {
    if (timer.current) clearTimeout(timer.current)
    if (running.current) return
    running.current = true
    while (pending.current) {
      const next = pending.current
      pending.current = null
      setStatus("Saving changes…")
      try {
        await next.save(next.value)
        setStatus("All changes saved")
      } catch (error) {
        setStatus("Changes not saved. Try again.")
        toast.error("Changes could not be saved", {
          description: error instanceof Error ? error.message : "Please try again.",
          action: { label: "Try again", onClick: () => {
            if (revision.current !== next.revision) return
            pending.current ??= next
            void flush.current()
          } },
        })
      }
    }
    running.current = false
  }
  const key = JSON.stringify(value)
  useEffect(() => {
    if (!dirty && !pending.current && !running.current) return
    revision.current += 1
    pending.current = { value, save: saveRef.current, revision: revision.current }
    setStatus("Waiting to save…")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush.current(), 600)
    // Only edits schedule writes; changing callback identity must not retry failures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dirty])
  useEffect(() => {
    const protectPendingChanges = (event: BeforeUnloadEvent) => {
      if (!pending.current && !running.current) return
      void flush.current()
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", protectPendingChanges)
    return () => {
      window.removeEventListener("beforeunload", protectPendingChanges)
      void flush.current()
    }
  }, [])
  return status
}
