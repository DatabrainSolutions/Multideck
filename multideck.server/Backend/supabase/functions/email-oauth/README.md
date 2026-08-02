# Email OAuth Edge Function

This function is the single tenant-local OAuth boundary for Gmail and Outlook mailbox access. It is separate from Supabase Auth identity linking: it grants Multideck permission to read and send mailbox data for an already authenticated, approved workspace user.

## HTTP contract

Start a connection with the current Supabase access token:

```http
POST /functions/v1/email-oauth
Authorization: Bearer <supabase-access-token>
Content-Type: application/json

{
  "action": "authorize",
  "provider": "gmail",
  "returnOrigin": "https://company.multideck.app",
  "returnPath": "/inbox"
}
```

The response contains `authorizationUrl`, `provider`, and `expiresAt`. The browser navigates to that URL. Google or Microsoft returns to the fixed callback URL on the same function:

```text
GET /functions/v1/email-oauth?code=...&state=...
```

The callback never returns tokens to the browser. It redirects to the signed, allowlisted tenant origin with a non-sensitive success or failure code.

Consumed PKCE verifiers are deleted on every callback exit path. Expired, abandoned, and consumed state is also purged once per day by the tenant-local Inbox provider subscription worker.

## Required function secrets

- `EMAIL_ALLOWED_REDIRECT_ORIGINS`: exact comma-separated origins; no wildcards.
- `EMAIL_CANONICAL_APP_ORIGIN`: the permanent tenant origin.
- `EMAIL_OAUTH_CALLBACK_URL`: the exact deployed `email-oauth` function URL registered with both providers.
- `EMAIL_OAUTH_STATE_SIGNING_SECRET`: at least 32 characters.
- `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`.
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_TENANT_ID`.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Provider and signing secrets must be configured separately in every tenant project.

## Security boundary

PKCE verifiers and provider token bundles are stored in the tenant project's Supabase Vault through service-role-only RPCs. Ordinary tables receive only opaque `supabase-vault:<uuid>` references. If Vault or any required RPC is unavailable, the flow fails closed.

The function depends on the `20260731223000_inbox_provider_foundation.sql` migration for one-time OAuth state, Vault, and connection-completion RPCs.
