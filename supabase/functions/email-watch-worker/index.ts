import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import { cleanString, InboxHttpError, normalizeEmail } from "../inbox-api/core.ts"
import { syncMailbox, type Actor } from "../inbox-api/runtime.ts"

type Row = Record<string, any>

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

function runtime() {
  const url = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
  if (!url || !serviceRoleKey) throw new Error("runtime_not_configured")
  return {
    admin: createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  }
}

async function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder()
  const leftDigest = await crypto.subtle.digest("SHA-256", encoder.encode(left))
  const rightDigest = await crypto.subtle.digest("SHA-256", encoder.encode(right))
  const leftBytes = new Uint8Array(leftDigest)
  const rightBytes = new Uint8Array(rightDigest)
  let difference = leftBytes.length ^ rightBytes.length
  const length = Math.max(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return difference === 0
}

function actorFromProfile(profile: Row): Actor {
  const displayName = [profile.User_Firstname, profile.User_Lastname]
    .map((value) => cleanString(value, 120))
    .filter(Boolean)
    .join(" ")
  const email = normalizeEmail(profile.User_Email) ?? ""
  return {
    userId: profile.User_ID,
    authUserId: profile.Auth_User_ID,
    companyId: profile.Company_ID,
    email,
    displayName: displayName || email || "Multideck user",
  }
}

function retryableSyncError(error: unknown) {
  if (!(error instanceof InboxHttpError)) return true
  return error.status === 429 || error.status >= 500
}

async function syncMailboxWithRetry(admin: any, actor: Actor, mailboxId: string, liveOnly: boolean) {
  const maximumAttempts = 3
  let lastError: unknown
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return { sync: await syncMailbox(admin, actor, mailboxId, { liveOnly }), attempts: attempt }
    } catch (error) {
      lastError = error
      if (attempt === maximumAttempts || !retryableSyncError(error)) throw error
      // A failed Supabase/provider request is often a short-lived connection or
      // rate-limit event. Retry only that mailbox; the next cron run remains the
      // wider safety net and no LLM work is involved.
      await new Promise((resolve) => setTimeout(resolve, attempt * 400))
    }
  }
  throw lastError
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ code: "method_not_allowed" }, 405)

  try {
    const { admin } = runtime()
    const body = await request.json().catch(() => ({}))
    const mode = body && typeof body === "object" && body.mode === "backfill" ? "backfill" : "live"
    const suppliedSecret = request.headers.get("x-multideck-email-watch-secret")?.trim() ?? ""
    const { data: expectedSecret, error: secretError } = await admin.rpc("Comm_GetEmailWatchWorkerSecret")
    if (
      secretError
      || typeof expectedSecret !== "string"
      || !suppliedSecret
      || !await constantTimeEqual(suppliedSecret, expectedSecret)
    ) {
      return json({ code: "worker_unauthorized" }, 401)
    }

    const { data: connectionRows, error: connectionsError } = await admin
      .from("Comm_ProviderConnections")
      .select("CommConn_UserID")
      .eq("CommConn_StatusCode", "active")
      .eq("CommConn_InboundEnabled", true)
      .eq("CommConn_IsDeleted", false)
    if (connectionsError) throw connectionsError

    const owners = new Set<string>()
    for (const row of connectionRows ?? []) {
      const userId = cleanString(row.CommConn_UserID, 80)
      if (userId) owners.add(userId)
    }

    const results: Array<Record<string, unknown>> = []
    for (const ownerUserId of owners) {
      const { data: profile, error: profileError } = await admin
        .from("cmp_Users")
        .select("User_ID,Auth_User_ID,Company_ID,User_Email,User_Firstname,User_Lastname")
        .eq("User_ID", ownerUserId)
        .not("Company_ID", "is", null)
        .limit(1)
        .maybeSingle()

      let successful = 0
      const failures: string[] = []
      const mailboxResults: Array<Record<string, unknown>> = []

      if (profileError || !profile) {
        failures.push("The watch owner is no longer linked to this workspace.")
      } else {
        const actor = actorFromProfile(profile)
        const { data: mailboxRows, error: mailboxError } = await admin.rpc(
          "_multideck_dexter_email_mailboxes",
          { p_user_id: actor.userId, p_company_id: actor.companyId },
        )

        if (mailboxError) {
          failures.push("Connected mailboxes could not be resolved.")
        } else if (!Array.isArray(mailboxRows) || mailboxRows.length === 0) {
          failures.push("No readable connected mailbox is available.")
        } else {
          // Mailboxes sharing one OAuth connection are deliberately processed
          // sequentially to avoid refresh-token races. Per-mailbox database
          // leases make overlapping cron invocations harmless.
          for (const mailbox of mailboxRows) {
            const mailboxId = cleanString(mailbox.mailbox_id, 80)
            if (!mailboxId) continue
            try {
              const { sync, attempts } = await syncMailboxWithRetry(admin, actor, mailboxId, mode === "live")
              successful += 1
              mailboxResults.push({ mailboxId, ok: true, synced: sync.synced, hasMore: sync.hasMore, attempts })
            } catch (error) {
              const message = error instanceof Error ? error.message : "Mailbox sync failed."
              failures.push(message)
              mailboxResults.push({
                mailboxId,
                ok: false,
                code: error instanceof InboxHttpError ? error.code : "mailbox_sync_failed",
              })
            }
          }
        }

        if (successful > 0) {
          const { error: reconcileError } = await admin.rpc("comm_reconcile_email_watch_messages", {
            p_user_id: actor.userId,
            p_company_id: actor.companyId,
            p_since: new Date(Date.now() - 15 * 60_000).toISOString(),
          })
          if (reconcileError) failures.push("Recent email reconciliation was delayed.")
        }
      }

      const checkedAt = new Date().toISOString()
      const healthStatus = failures.length === 0
        ? "healthy"
        : successful > 0 ? "degraded" : "error"
      const healthError = failures.length ? failures[0].slice(0, 1_000) : null
      const healthPatch: Record<string, unknown> = {
        AIDexterWatch_HealthStatusCode: healthStatus,
        AIDexterWatch_LastSourceCheckAt: checkedAt,
        AIDexterWatch_LastHealthError: healthError,
        AIDexterWatch_UpdatedAt: checkedAt,
      }
      if (successful > 0) healthPatch.AIDexterWatch_LastSuccessfulCheckAt = checkedAt

      const { error: healthErrorUpdate } = await admin
        .from("AI_DexterWatches")
        .update(healthPatch)
        .eq("AIDexterWatch_OwnerUserID", profile?.User_ID ?? ownerUserId)
        .eq("AIDexterWatch_CompanyID", profile?.Company_ID ?? "00000000-0000-0000-0000-000000000000")
        .eq("AIDexterWatch_CapabilityCode", "email")
        .eq("AIDexterWatch_StatusCode", "active")
      if (healthErrorUpdate) throw healthErrorUpdate

      results.push({
        ownerUserId,
        companyId: profile?.Company_ID ?? null,
        healthStatus,
        successfulMailboxes: successful,
        failedMailboxes: failures.length,
        mailboxes: mailboxResults,
      })
    }

    return json({ ok: true, mode, owners: results.length, results })
  } catch (error) {
    console.error("email-watch-worker failed", error instanceof Error ? error.message : "unknown")
    return json({ code: "worker_failed", message: "Email watch checks could not finish." }, 503)
  }
})
