import { useCallback, useRef, useState, useSyncExternalStore } from "react"
import { Vibration, type TextInput } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"

// Zebra-style handhelds type scans as keystrokes followed by Enter. The on-screen keyboard is
// hidden by default so it does not cover the task; operators can switch it on to type a code.
const keyboardPreferenceKey = "multideck.mobile.soft-keyboard.v1"
let softKeyboard = false
const listeners = new Set<() => void>()

void AsyncStorage.getItem(keyboardPreferenceKey).then((stored) => {
  if (stored === null) return
  softKeyboard = stored === "on"
  listeners.forEach((listener) => listener())
}).catch(() => undefined)

export function useSoftKeyboard(): [boolean, () => void] {
  const enabled = useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => softKeyboard)
  const toggle = useCallback(() => {
    softKeyboard = !softKeyboard
    listeners.forEach((listener) => listener())
    void AsyncStorage.setItem(keyboardPreferenceKey, softKeyboard ? "on" : "off").catch(() => undefined)
  }, [])
  return [enabled, toggle]
}

export function scanFeedback(result: "ok" | "error") {
  Vibration.vibrate(result === "ok" ? 35 : [0, 90, 70, 90])
}

export type ScanStatus = "idle" | "checking" | "matched" | "warning" | "mismatch"
export type ScanResolution<T> = { ok: true; value: T; note?: string; warning?: boolean } | { ok: false; message: string }

/**
 * One scan in a physical workflow: holds the scanned text, resolves it once the scanner submits,
 * and gives the operator an immediate matched or mismatch signal before anything is posted.
 */
export function useScanStep<T>(resolve: (scan: string) => Promise<ScanResolution<T>> | ScanResolution<T>) {
  const [value, setValue] = useState("")
  const [status, setStatus] = useState<ScanStatus>("idle")
  const [result, setResult] = useState<T | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const ref = useRef<TextInput>(null)
  const attempt = useRef(0)

  const change = useCallback((next: string) => {
    attempt.current += 1
    setValue(next); setStatus("idle"); setResult(null); setMessage(null)
  }, [])

  const reset = useCallback(() => change(""), [change])

  const submit = useCallback(async (scan = value): Promise<T | null> => {
    const text = scan.trim()
    if (!text) return null
    const current = ++attempt.current
    setStatus("checking"); setMessage(null)
    let resolution: ScanResolution<T>
    try {
      resolution = await resolve(text)
    } catch (error) {
      resolution = { ok: false, message: error instanceof Error ? error.message : "The scan could not be checked. Try again." }
    }
    if (current !== attempt.current) return null
    if (resolution.ok) {
      setResult(resolution.value); setStatus(resolution.warning ? "warning" : "matched"); setMessage(resolution.note ?? null)
      scanFeedback(resolution.warning ? "error" : "ok")
      return resolution.value
    }
    setResult(null); setStatus("mismatch"); setMessage(resolution.message)
    scanFeedback("error")
    return null
  }, [resolve, value])

  const focus = useCallback(() => { setTimeout(() => ref.current?.focus(), 60) }, [])

  return { value, status, result, message, ref, change, submit, reset, focus, setValue }
}
