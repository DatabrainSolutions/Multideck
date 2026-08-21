import type { DexterUploadedDocument } from "@/lib/dexter-api"
import type { DexterAccessMode, DexterSpecialistId } from "@/components/multideck/agent-dexter-components"
import type { DexterMentionSnapshot } from "@/data/dexter-mentions"
import type { DexterModelId } from "@/data/dexter-models"

/**
 * A prompt written on Home, carried into the Dexter workspace intact.
 *
 * Home renders the real composer, so the operator can pick a specialist, a
 * model, an access mode, @ records and upload files before they ever reach
 * Dexter. All of that has to survive the route change or the send would quietly
 * drop half of what they set up. The full-access grant is issued against a
 * client session id, so both travel together: without the same session id the
 * grant Dexter receives would not be one it can honour.
 */
export type DexterHomeHandoff = {
  prompt: string
  specialistId: DexterSpecialistId
  modelId: DexterModelId
  accessMode: DexterAccessMode
  fullAccessGrantId: string | null
  clientSessionId: string
  mentions: DexterMentionSnapshot[]
  uploadedDocuments: DexterUploadedDocument[]
}

const handoffKey = "multideck.dexterHomeHandoff"

function isHandoff(value: unknown): value is DexterHomeHandoff {
  if (!value || typeof value !== "object") return false
  const handoff = value as Partial<DexterHomeHandoff>
  return typeof handoff.prompt === "string"
    && handoff.prompt.trim().length > 0
    && typeof handoff.clientSessionId === "string"
    && Array.isArray(handoff.mentions)
    && Array.isArray(handoff.uploadedDocuments)
}

export function rememberDexterHomeHandoff(handoff: DexterHomeHandoff) {
  if (typeof window === "undefined" || !handoff.prompt.trim()) return

  try {
    window.sessionStorage.setItem(handoffKey, JSON.stringify(handoff))
  } catch {
    // Dexter still opens; the operator retypes the prompt rather than losing
    // the workspace.
  }
}

/**
 * Read without consuming. Dexter checks this while it is still deciding which
 * layout to mount, and a pending prompt means it must open on the conversation
 * rather than showing one frame of the landing screen first.
 */
export function peekDexterHomeHandoff(): DexterHomeHandoff | null {
  if (typeof window === "undefined") return null

  try {
    const value = JSON.parse(window.sessionStorage.getItem(handoffKey) ?? "null") as unknown
    return isHandoff(value) ? value : null
  } catch {
    return null
  }
}

export function takeDexterHomeHandoff(): DexterHomeHandoff | null {
  const handoff = peekDexterHomeHandoff()
  if (handoff) {
    try {
      window.sessionStorage.removeItem(handoffKey)
    } catch {
      // Reading it once is what matters; a storage failure here only risks the
      // same prompt being offered again after a refresh.
    }
  }
  return handoff
}
