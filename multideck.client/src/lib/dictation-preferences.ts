const microphoneStorageKey = "multideck.dictation.microphone"
const microphonePreferenceEvent = "multideck:dictation-microphone"

export const systemDefaultMicrophone = "default"

export function readPreferredMicrophone() {
  if (typeof window === "undefined") return systemDefaultMicrophone
  return window.localStorage.getItem(microphoneStorageKey)?.trim() || systemDefaultMicrophone
}

export function savePreferredMicrophone(deviceId: string) {
  if (typeof window === "undefined") return
  const next = deviceId.trim() || systemDefaultMicrophone
  window.localStorage.setItem(microphoneStorageKey, next)
  window.dispatchEvent(new CustomEvent(microphonePreferenceEvent, { detail: next }))
}

export function subscribePreferredMicrophone(listener: (deviceId: string) => void) {
  const sync = () => listener(readPreferredMicrophone())
  window.addEventListener(microphonePreferenceEvent, sync)
  window.addEventListener("storage", sync)
  return () => {
    window.removeEventListener(microphonePreferenceEvent, sync)
    window.removeEventListener("storage", sync)
  }
}
