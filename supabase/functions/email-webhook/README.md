# Email Provider Webhook Edge Function

This function verifies provider notifications and enqueues small sync hints in `Comm_InboundEvents`. It does not fetch or persist email bodies. The durable inbox worker uses the event to run Gmail history or Microsoft Graph delta synchronization later.

## Provider endpoints

- Gmail Pub/Sub push: `/functions/v1/email-webhook?provider=gmail`
- Microsoft Graph notifications: `/functions/v1/email-webhook?provider=outlook`

Microsoft's `validationToken` handshake is echoed as plain text. Subsequent Microsoft notifications must match an active subscription, tenant, resource, mailbox connection, and Vault-backed `clientState` secret.

Gmail pushes must carry a Google-signed OIDC bearer token for the configured push service account and audience. The Pub/Sub subscription name, connected mailbox address, provider connection, and active database subscription must all match.

## Required function secrets

- `GMAIL_PUBSUB_PUSH_AUDIENCE`: exact Gmail webhook URL used as the Pub/Sub push audience.
- `GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT`: exact service-account email configured on the push subscription.
- `GMAIL_PUBSUB_SUBSCRIPTION`: exact Pub/Sub subscription resource name.

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Microsoft `clientState` values are resolved from tenant Supabase Vault through the service-role-only secret RPC.

The function depends on the `20260731223000_inbox_provider_foundation.sql` migration for subscription resolution, Vault access, and idempotent inbound enqueueing.
