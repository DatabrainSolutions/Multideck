import { useEffect, useMemo, useState } from "react"
import { previewCustomsDeclaration, type CustomsCalculationPreview } from "@/lib/icustoms-api"
import { customsPreviewInput, createLiveCalculationRequest } from "@/lib/customs-live-calculation"
import { calculationPreflight } from "../../../supabase/functions/_shared/customs-calculation-draft.mts"
import { ukCustomsDate } from "../../../supabase/functions/_shared/customs-calculation-date.mts"
import type { StandaloneExportDraft } from "@/lib/customs-declaration"

export type LiveCustomsCalculation = CustomsCalculationPreview & { status: "calculating" | "ready" | "needs-information" | "error"; error: string; retry: () => void }

/** One declaration preview shared by every expanded item and the overview. */
export function useCustomsLiveCalculation(declarationId: string | undefined, draft: StandaloneExportDraft, enabled: boolean): LiveCustomsCalculation | undefined {
  const [today, setToday] = useState(ukCustomsDate)
  const [attempt, setAttempt] = useState(0)
  const [saved, setSaved] = useState<{ key: string; value?: CustomsCalculationPreview; error?: string }>()
  const input = JSON.stringify(customsPreviewInput(draft as unknown as Record<string, unknown>))
  const key = `${declarationId}:${today}:${attempt}:${input}`
  const runner = useMemo(() => createLiveCalculationRequest((value, signal) => previewCustomsDeclaration(declarationId!, value, signal)), [declarationId])
  useEffect(() => {
    const refresh = () => setToday(ukCustomsDate())
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener("focus", refresh)
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh) }
  }, [])
  const preflight = calculationPreflight(JSON.parse(input))
  useEffect(() => {
    if (!enabled || !declarationId) return
    const value = JSON.parse(input)
    if (calculationPreflight(value).length) return
    const timer = window.setTimeout(() => {
      void runner.run(value, result => setSaved({ key, value: result }), error => setSaved({ key, error: error instanceof Error && /route not found/i.test(error.message) ? "Live estimates are temporarily unavailable. Try again shortly." : error instanceof Error ? error.message : "Estimate unavailable. Try again." }))
    }, 650)
    return () => { window.clearTimeout(timer); runner.cancel() }
  }, [enabled, declarationId, input, key, runner])
  if (!enabled) return undefined
  const current = saved?.key === key ? saved : undefined
  const value = current?.value
  return {
    result: value?.result ?? null,
    issues: preflight.length ? preflight : value?.issues ?? [],
    status: preflight.length || value && (!value.result || value.result.lines.some(line => line.status === "needs-information")) ? "needs-information" : current?.error ? "error" : value ? "ready" : "calculating",
    error: current?.error ?? "",
    retry: () => setAttempt(value => value + 1),
  }
}
