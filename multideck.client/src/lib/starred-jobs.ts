import { useCallback, useEffect, useState } from "react"
import { setLiveJobStarred } from "@/lib/application-data-api"

/**
 * Which jobs an operator wants kept in front of them on Home.
 *
 * Bookings already carry a favourite flag, and that stays the truth. What this
 * holds is the operator's optimistic change while the authenticated database
 * write completes. Overrides are scoped per signed-in user, so a shared machine
 * never shows one person's pinned work to the next.
 */
type StarOverrides = Record<string, boolean>

const storagePrefix = "multideck.starredJobs"
const changedEvent = "multideck:starred-jobs-changed"

function storageKey(userId: string | null | undefined) {
  return `${storagePrefix}:${userId ?? "anonymous"}`
}

function readOverrides(userId: string | null | undefined): StarOverrides {
  if (typeof window === "undefined") return {}

  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "{}") as unknown
    if (!value || typeof value !== "object" || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([, starred]) => typeof starred === "boolean"),
    ) as StarOverrides
  } catch {
    return {}
  }
}

function writeOverrides(userId: string | null | undefined, overrides: StarOverrides) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(overrides))
  } catch {
    // The star still applies for this session; only the memory of it is lost.
  }
  window.dispatchEvent(new CustomEvent(changedEvent))
}

/**
 * Kept in step across every panel that shows a star, and across tabs, so
 * starring a job in one window never leaves another window disagreeing.
 */
export function useStarredJobs(userId: string | null | undefined) {
  const [overrides, setOverrides] = useState<StarOverrides>(() => readOverrides(userId))

  useEffect(() => {
    const sync = () => setOverrides(readOverrides(userId))
    sync()
    window.addEventListener(changedEvent, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(changedEvent, sync)
      window.removeEventListener("storage", sync)
    }
  }, [userId])

  const isStarred = useCallback(
    (id: string, saved: boolean) => overrides[id] ?? saved,
    [overrides],
  )

  const toggleStar = useCallback(async (id: string, saved: boolean) => {
    const next = { ...readOverrides(userId) }
    const starred = next[id] ?? saved
    if (!starred === saved) delete next[id]
    else next[id] = !starred
    writeOverrides(userId, next)
    setOverrides(next)
    try {
      await setLiveJobStarred(id, !starred)
    } catch (error) {
      const rollback = { ...readOverrides(userId) }
      if (starred === saved) delete rollback[id]
      else rollback[id] = starred
      writeOverrides(userId, rollback)
      setOverrides(rollback)
      throw error
    }
  }, [userId])

  return { isStarred, toggleStar }
}
