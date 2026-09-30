import { useEffect, useLayoutEffect, useRef } from "react"
import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"
import type { AuthUserSummary } from "@/lib/auth-user"
import {
  measuredUsage,
  usageHeartbeatMs,
  usageModuleForRoute,
  type CommercialFlow,
} from "./workspace-usage-model"
import { workspaceStorageKey } from "./workspace-environment"

let actorId: string | null = null
let queue: Promise<unknown> = Promise.resolve()
let queued = 0
function send(event: Record<string, unknown>) {
  const expectedActor = actorId
  if (!expectedActor || queued >= 32) return
  queued += 1
  // Sequential delivery preserves workflow order. No offline retries or content are retained.
  queue = queue
    .catch(() => {})
    .then(async () => {
      if (actorId !== expectedActor) return
      const session = await getSupabaseSession()
      if (
        !session?.access_token ||
        session.user.id !== expectedActor ||
        actorId !== expectedActor
      )
        return
      await edgeFetch("admin-dashboard", "/telemetry", session.access_token, {
        method: "POST",
        body: JSON.stringify({ id: crypto.randomUUID(), ...event }),
        keepalive: true,
      })
    })
    .catch(() => {
      /* Analytics failure never blocks the operator's actual workflow. */
    })
    .finally(() => {
      queued -= 1
    })
}

export function useWorkspaceUsage(
  user: AuthUserSummary | null,
  route: string,
  enabled: boolean,
) {
  const module = useRef(usageModuleForRoute(route))
  const flushRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    flushRef.current?.()
    module.current = usageModuleForRoute(route)
  }, [route])
  useLayoutEffect(() => {
    actorId = enabled && user?.actorType === "internal" ? user.id : null
    return () => {
      actorId = null
    }
  }, [enabled, user?.id, user?.actorType])
  useEffect(() => {
    if (!actorId) return
    const timeActor = actorId
    let start = Date.now(),
      interaction = start
    let foreground =
      document.visibilityState === "visible" && document.hasFocus()
    const flush = () => {
      const end = Date.now()
      for (const interval of measuredUsage(
        start,
        end,
        interaction,
        foreground && actorId === timeActor,
      ))
        send({
          kind: "time",
          module: module.current,
          state: interval.state,
          from: new Date(interval.from).toISOString(),
          to: new Date(interval.to).toISOString(),
        })
      start = end
    }
    const activity = () => {
      if (Date.now() - interaction >= 5 * 60_000) flush()
      interaction = Date.now()
    }
    // Throttle scroll/pointer movement: activity is a timestamp, never an input value.
    let lastMove = 0
    const movement = () => {
      if (Date.now() - lastMove > 10_000) {
        lastMove = Date.now()
        activity()
      }
    }
    const focus = () => {
      flush()
      foreground = document.visibilityState === "visible" && document.hasFocus()
      if (foreground) interaction = Date.now()
    }
    flushRef.current = flush
    const timer = window.setInterval(flush, usageHeartbeatMs)
    window.addEventListener("pointerdown", activity, { passive: true })
    window.addEventListener("keydown", activity)
    window.addEventListener("pointermove", movement, { passive: true })
    window.addEventListener("scroll", movement, {
      passive: true,
      capture: true,
    })
    window.addEventListener("focus", focus)
    window.addEventListener("blur", focus)
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", focus)
    return () => {
      flush()
      flushRef.current = null
      window.clearInterval(timer)
      window.removeEventListener("pointerdown", activity)
      window.removeEventListener("keydown", activity)
      window.removeEventListener("pointermove", movement)
      window.removeEventListener("scroll", movement, true)
      window.removeEventListener("focus", focus)
      window.removeEventListener("blur", focus)
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", focus)
    }
  }, [enabled, user?.id, user?.actorType])
}

const attemptKey = (flow: CommercialFlow, recordId: string) =>
  workspaceStorageKey(
    `multideck.analytics.attempt:${actorId}:${flow}:${recordId}`,
  )
function storedAttempt(flow: CommercialFlow, recordId?: string) {
  if (!actorId || !recordId) return null
  try {
    const value = JSON.parse(
      sessionStorage.getItem(attemptKey(flow, recordId)) ?? "null",
    )
    return value?.id && Date.now() - value.started < 90 * 86_400_000
      ? (value as { id: string; done: boolean; started: number })
      : null
  } catch {
    return null
  }
}
export function hasCommercialAttempt(
  flow: CommercialFlow,
  recordId?: string | null,
) {
  return Boolean(storedAttempt(flow, recordId ?? undefined))
}

export function useCommercialWorkflow(
  flow: CommercialFlow,
  enabled: boolean,
  recordId?: string,
) {
  const attempt = useRef<{ id: string; done: boolean; started: number } | null>(
    null,
  )
  const boundRecord = useRef(recordId)
  useEffect(() => {
    if (enabled) {
      // StrictMode replays the effect; the same attempt is safe to replay at the server.
      attempt.current ??= storedAttempt(flow, recordId) ?? {
        id: crypto.randomUUID(),
        done: false,
        started: Date.now(),
      }
      send({
        kind: "flow",
        flowId: attempt.current.id,
        flow,
        state: "started",
        step: "opened",
      })
    } else attempt.current = null
  }, [enabled, flow, recordId])
  const event = (state: string, step: string, recordId?: string) => {
    if (!attempt.current || attempt.current.done) return
    send({
      kind: "flow",
      flowId: attempt.current.id,
      flow,
      state,
      step,
      recordId,
    })
    if (state === "completed" || state === "cancelled") {
      attempt.current.done = true
      const savedId = recordId ?? boundRecord.current
      if (savedId) {
        try {
          sessionStorage.removeItem(attemptKey(flow, savedId))
        } catch {
          /* Optional recovery storage. */
        }
      }
    }
  }
  return {
    step: (step: "details" | "cargo" | "pricing" | "review") =>
      event("step", step),
    failed: () => event("validation_failed", "review"),
    complete: (id: string) =>
      event(
        "completed",
        flow === "quote_send"
          ? "submitted"
          : flow === "lead_convert"
            ? "converted"
            : "saved",
        id,
      ),
    cancel: () => event("cancelled", "opened"),
    bind: (id: string) => {
      boundRecord.current = id
      if (attempt.current && actorId) {
        try {
          sessionStorage.setItem(
            attemptKey(flow, id),
            JSON.stringify(attempt.current),
          )
        } catch {
          /* Continue this visit without recovery. */
        }
      }
    },
  }
}
