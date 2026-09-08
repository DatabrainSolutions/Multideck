# Notification hardening — 7 September 2026

## Scope and behaviour

The operator notification feed resolves explicit same-workspace links and legacy Inbox/CRM record references. Inbox suggestions open the correct review or History item, including navigation while Inbox is already mounted. Informational notifications without a destination display their full text instead of silently doing nothing.

The feed now loads 20 records initially and allows older records to be loaded. Unread and total counts cover all undismissed records, not just the visible page. Feed ordering uses creation time and ID. Refreshes happen on subscription recovery, window focus, network recovery and once per minute while visible. Every control shares the same store and subscription.

Loading, empty and refresh-error states are distinct. Failed receipt changes roll back immediately, even if the recovery read also fails. Concurrent receipt writes are blocked until the current request finishes. Account changes discard stale reads and writes. Individual writes must return the modified row to count as successful.

The panel scrolls within the viewport. Read/unread and clear actions have a visible keyboard/touch menu in addition to the context menu. The bell remains available in the mobile drawer and collapsed sidebar. Opening a destination closes the mobile drawer.

Email dispatch now checks preference errors, respects the document-parse opt-in default, requires trusted automatic dispatch, uses a stable provider idempotency key, skips recorded provider acceptances and rejects cross-workspace action links. Receipt metadata describes provider acceptance, not recipient delivery. The existing `delivered` response field is retained for API compatibility. Provider deduplication lasts [24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys); this change does not add a durable email retry queue or a delivery/bounce webhook.

## Permissions and Dexter

`20260907183422_notification_state_permissions.sql` removes table-wide privileges from browser roles, retaining SELECT and UPDATE on receipt-state columns only. Existing recipient RLS remains in force. Partial indexes support the feed and unread count.

This is a personal notification transport and receipt-state hardening change, not a new operational capability. Dexter watch producers and deterministic evaluation are unchanged. No new Dexter send, replay or receipt-mutation tool is exposed: automated email replay remains service-only, and personal receipt controls remain in the notification UI. Existing watch notification links remain supported.

## Verification and release status

- Read-only inspection confirmed the connected App backend is `aqtwypsuijxlnvtxpuxe`, notifications are in the realtime publication, legacy Inbox/CRM links are missing, and authenticated table-wide grants currently exist.
- All 33 focused tests pass. Executable store tests cover accurate counts, coalescing, rollback when offline, concurrent writes, retries, and late responses across accounts.
- An isolated PostgreSQL test applies the migration and existing recipient policies: owners can update receipt state; other users, unknown identities and anonymous clients cannot read/write it; clients cannot forge content, change recipients, insert, delete or truncate.
- Email handler tests use simulated database/provider responses. No emails were sent during verification.
- Authenticated Chrome at localhost:3000 verified keyboard mark-unread, reload persistence, click-to-read and the exact suggestion destination. At 375 × 812 the panel measures 339 pixels wide, remains inside the viewport, and destination selection closes the drawer. No browser errors were observed in that journey. A controlled offline check retained the notification list with a visible error and recovered automatically when connectivity returned. The collapsed desktop sidebar also retains the bell. Temporary viewport and network overrides were restored.
- Production client build passed. The broader lifecycle-notes contract suite has two pre-existing failures against unchanged note-composer styling/markup; notification-focused checks pass.

Deployed to the development App on 7 September 2026, without committing:

- Frontend: `dpl_2XLxnsesuxGRmUF8dcbEj4rxahBE`, served at `https://dev.multideck.app` and the existing dev branch alias. Live HTML and entry JavaScript hashes match the uploaded build; the bundle contains the intended App backend URL.
- Supabase App project: `aqtwypsuijxlnvtxpuxe`. Applied migration version `20260907183422` (`notification_state_permissions`); verified SELECT-only table privileges and exactly four receipt-state UPDATE column grants for authenticated users.
- `send-notification-email`: active version 74; verified an unauthenticated dispatch returns 401. Existing `APP_URL` was verified to match `https://dev.multideck.app` without exposing credentials.
- Release snapshot used the previously deployed App source (`2ef8927a7e5a242c6b920d2cbd129e8e27314be8`) plus only the nine notification implementation/migration files. Other uncommitted work was excluded. No Git commit was created.

The hosted Chrome check reached the sign-in screen, so a new authenticated click-through on the deployed hostname remains unverified. The authenticated local journey and live build identity were verified separately.

No notification emails were sent during release verification. Provider acceptance and recipient delivery still require a separately authorised recipient test. Other App tenants and the root production site were not changed.
