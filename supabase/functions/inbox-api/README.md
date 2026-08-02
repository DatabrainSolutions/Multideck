# Inbox API Edge Function

`inbox-api` is Multideck Inbox's tenant-local application boundary. The browser calls this Supabase Edge Function directly; the .NET API is not involved.

## Security boundary

- Supabase verifies the JWT (`verify_jwt = true`) and the function independently resolves it with `auth.getUser()`.
- The auth subject must map to an active `cmp_Users` workspace profile.
- Every route enforces the relevant `Email.*` role permission and mailbox ACL. Shared send requires `CanSend` plus `CanSendAs`.
- The service-role client is created only inside the Edge runtime. Browser roles retain no access to communication tables.
- OAuth bundles remain in Supabase Vault. Only `supabase-vault:<uuid>` references are stored in ordinary tables; tokens are never returned.
- CORS accepts exact configured tenant origins plus `localhost:3000` and `127.0.0.1:3000` for local development. There is no wildcard.

## Browser contract

Base path: `/functions/v1/inbox-api`

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/providers` | Configured Gmail/Outlook providers |
| GET | `/connections` | Current user's connections |
| POST | `/connections/:provider/authorize` | Delegate OAuth start to `email-oauth` |
| DELETE | `/connections/:id` | Revoke local access and remove the Vault bundle |
| POST | `/connections/:id/shared-mailboxes` | Validate and add an Outlook shared mailbox |
| GET | `/mailboxes` | Personal/shared/group mailboxes and unread counts |
| POST | `/mailboxes/:id/sync` | On-demand provider sync |
| GET | `/threads` | Cursor-paged folder/search list |
| GET | `/threads/:id` | Sanitised rendered thread detail |
| PATCH | `/threads/:id/read-state` | Read/star/archive state |
| POST | `/threads/:id/summary` | Dexter summary |
| POST/PATCH/DELETE | `/drafts[/:id]` | Local Multideck drafts |
| POST | `/send` | Compose/reply/reply-all/forward; requires `Idempotency-Key` |
| GET | `/attachments/:id` | Short-lived provider attachment download |

Calls require both the Supabase session bearer and the project's browser-safe publishable/anon key. Provider OAuth is completed by `email-oauth`; this function never handles callback tokens in the browser.

## Provider behaviour

- Gmail initial sync explicitly includes Spam and Trash, then advances with Gmail history IDs.
- Outlook keeps independent delta cursors for Inbox, Sent Items, Drafts, Junk Email, and Deleted Items. Shared mailboxes use delegated `/users/:address` endpoints.
- Folder membership is persisted in `Comm_MailFolders` / `Comm_MessageFolders`; provider Deleted Items remain readable records rather than being confused with Multideck soft deletion.
- A send first creates an idempotent `sending` claim. A retry with the same user-scoped key returns the existing receipt. An ambiguous network result is not automatically resent.

## Required secrets

In addition to Supabase-provided runtime variables, this function uses the same per-tenant provider secrets as `email-oauth`:

- `EMAIL_ALLOWED_REDIRECT_ORIGINS`, `EMAIL_CANONICAL_APP_ORIGIN`
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`
- `OPENAI_API_KEY` (or the existing `OPEN_API_KEY`) for Dexter summaries
- optional `INBOX_LUNA_MODEL` (default `gpt-5.6-luna`)

## Verification

```sh
npx --yes deno check functions/inbox-api/index.ts
npx --yes deno test functions/inbox-api/core_test.ts
node --test tests/inbox-api-contract.test.mjs
```

Run these from `multideck.server`. Live provider verification additionally requires deploying the function and signing in through the real `/inbox` route.
