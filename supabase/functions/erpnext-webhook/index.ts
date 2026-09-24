import { adminClient } from "../_shared/backend.ts"
import { receiveErpNextWebhook } from "../_shared/erpnext-webhook-receipt.ts"

Deno.serve(request => receiveErpNextWebhook(request, {
  secret: Deno.env.get("ERPNEXT_WEBHOOK_SECRET"),
  record: raw => adminClient().rpc("multideck_erpnext_receive_webhook", { p_raw_payload: raw }),
}))
