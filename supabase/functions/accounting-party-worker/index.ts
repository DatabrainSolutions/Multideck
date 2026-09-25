import { adminClient } from "../_shared/backend.ts";
import { processAccountingParties } from "../_shared/accounting-party-sync.ts";

import { processErpNextInbound } from "../_shared/erpnext-inbound.ts";
import { processErpNextCatchup } from "../_shared/erpnext-catchup.ts";
import { processChargeLifecycle, processChargeRecognition, processCostFinalisations } from "../_shared/cost-accrual-worker.ts";

async function sameSecret(left: string, right: string) {
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  return a.reduce(
    (difference, byte, index) => difference | (byte ^ b[index]),
    0,
  ) === 0;
}
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const admin = adminClient();
  const supplied = request.headers.get("x-multideck-accounting-secret") || "";
  const { data: expected, error } = await admin.rpc(
    "multideck_accounting_worker_secret",
  );
  if (
    error || typeof expected !== "string" || !expected || !supplied ||
    !(await sameSecret(supplied, expected))
  ) return new Response(null, { status: 401 });
  try {
    const settings = await admin.from("ACCI_PartyWorkerSettings").select(
      "enabled,endpoint",
    ).eq("singleton", true).maybeSingle();
    const intended = `${
      Deno.env.get("SUPABASE_URL")
    }/functions/v1/accounting-party-worker`;
    if (
      settings.error || !settings.data?.enabled ||
      settings.data.endpoint !== intended
    ) return new Response(null, { status: 409 });
    const catchup = await admin.rpc("multideck_accounting_party_catchup");
    if (catchup.error) throw new Error("Catch-up failed");
    const parties = await processAccountingParties(admin);
    // A provider listing outage must not hold signed inbound receipts or native
    // accrual work hostage. The checkpoint remains unchanged for the next run.
    let catchupFinance: Record<string, unknown>[] | { status: string } = { status: "disabled" };
    let catchupFailed = false;
    if (Deno.env.get("ERPNEXT_CATCHUP_ENABLED") === "true") {
      try {
        catchupFinance = await processErpNextCatchup(admin);
      } catch {
        catchupFailed = true;
        catchupFinance = { status: "retry_pending" };
      }
    }
    const incoming = await processErpNextInbound(admin);
    const chargeRecognition = await processChargeRecognition(admin);
    const costFinalisations = await processCostFinalisations(admin);
    const chargeLifecycle = await processChargeLifecycle(admin);
    return Response.json({ parties, catchupFinance, incoming, chargeRecognition, costFinalisations, chargeLifecycle }, { status: catchupFailed ? 503 : 200 });
  } catch {
    // No provider payloads or secrets in responses; unfinished jobs retain leases
    // and can be recovered safely after expiry.
    return Response.json({ code: "account_sync_worker_failed" }, {
      status: 503,
    });
  }
});
