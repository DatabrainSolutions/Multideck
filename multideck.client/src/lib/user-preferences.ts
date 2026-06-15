import { useEffect, useState } from "react"

export type ClockDisplayMode = "digital" | "analogue"

export const clockDisplayLabels = ["Digital", "Analogue"] as const

const clockDisplayStorageKey = "multideck.clockDisplayMode"
const clockDisplayEventName = "multideck:clock-display-mode"

function isClockDisplayMode(value: unknown): value is ClockDisplayMode {
  return value === "digital" || value === "analogue"
}

export function readClockDisplayMode(): ClockDisplayMode {
  if (typeof window === "undefined") return "digital"

  const stored = window.localStorage.getItem(clockDisplayStorageKey)
  return isClockDisplayMode(stored) ? stored : "digital"
}

export function writeClockDisplayMode(mode: ClockDisplayMode) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(clockDisplayStorageKey, mode)
  window.dispatchEvent(new CustomEvent(clockDisplayEventName, { detail: mode }))
}

export function clockDisplayModeFromLabel(label: string): ClockDisplayMode {
  return label.toLowerCase() === "analogue" ? "analogue" : "digital"
}

export function clockDisplayLabelFromMode(mode: ClockDisplayMode) {
  return mode === "analogue" ? "Analogue" : "Digital"
}

export function useClockDisplayMode() {
  const [mode, setMode] = useState<ClockDisplayMode>(readClockDisplayMode)

  useEffect(() => {
    function handleCustomEvent(event: Event) {
      const nextMode = (event as CustomEvent<ClockDisplayMode>).detail
      if (isClockDisplayMode(nextMode)) setMode(nextMode)
    }

    function handleStorageEvent(event: StorageEvent) {
      if (event.key === clockDisplayStorageKey) setMode(readClockDisplayMode())
    }

    window.addEventListener(clockDisplayEventName, handleCustomEvent)
    window.addEventListener("storage", handleStorageEvent)

    return () => {
      window.removeEventListener(clockDisplayEventName, handleCustomEvent)
      window.removeEventListener("storage", handleStorageEvent)
    }
  }, [])

  return mode
}
