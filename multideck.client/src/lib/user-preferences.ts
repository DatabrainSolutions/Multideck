import { useEffect, useState } from "react"

export type ClockDisplayMode = "digital" | "analogue"

export const clockDisplayLabels = ["Digital", "Analogue"] as const

const clockDisplayStorageKey = "multideck.clockDisplayMode"
const clockDisplayEventName = "multideck:clock-display-mode"
const aiAgentNameStorageKey = "multideck.aiAgentName"
const aiAgentNameEventName = "multideck:ai-agent-name"
const defaultAiAgentName = "Dexter"

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

function normalizeAiAgentName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : defaultAiAgentName
}

export function readAiAgentName() {
  if (typeof window === "undefined") return defaultAiAgentName

  return normalizeAiAgentName(window.localStorage.getItem(aiAgentNameStorageKey))
}

export function writeAiAgentName(name: string) {
  if (typeof window === "undefined") return

  const nextName = normalizeAiAgentName(name)
  window.localStorage.setItem(aiAgentNameStorageKey, nextName)
  window.dispatchEvent(new CustomEvent(aiAgentNameEventName, { detail: nextName }))
}

export function resetAiAgentName() {
  if (typeof window === "undefined") return

  window.localStorage.removeItem(aiAgentNameStorageKey)
  window.dispatchEvent(new CustomEvent(aiAgentNameEventName, { detail: defaultAiAgentName }))
}

export function useAiAgentName() {
  const [name, setName] = useState(readAiAgentName)

  useEffect(() => {
    function handleCustomEvent(event: Event) {
      setName(normalizeAiAgentName((event as CustomEvent<string>).detail))
    }

    function handleStorageEvent(event: StorageEvent) {
      if (event.key === aiAgentNameStorageKey) setName(readAiAgentName())
    }

    window.addEventListener(aiAgentNameEventName, handleCustomEvent)
    window.addEventListener("storage", handleStorageEvent)

    return () => {
      window.removeEventListener(aiAgentNameEventName, handleCustomEvent)
      window.removeEventListener("storage", handleStorageEvent)
    }
  }, [])

  return name
}
