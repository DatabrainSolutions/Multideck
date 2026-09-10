/** Page-local controls share the app's single recorder and transcription service. */
export const dictationCommandEvent = "multideck:dictation-command"

export type InlineDictationState = {
  phase: "idle" | "requesting" | "transcribing" | "polishing" | "complete" | "allowance" | "error"
  level: number
  message: string | null
}

export type InlineDictationRequest = {
  target: HTMLElement
  onState: (state: InlineDictationState) => void
}

export type DictationCommand = { action: "start"; request: InlineDictationRequest }
  | { action: "stop" | "cancel"; target: HTMLElement }

export function requestDictation(command: DictationCommand) {
  window.dispatchEvent(new CustomEvent<DictationCommand>(dictationCommandEvent, { detail: command }))
}
