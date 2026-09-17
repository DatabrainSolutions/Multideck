# Signature team details

The admin library opens `/admin/email-signatures/team` through **Team details**. It uses the existing Multideck DataTable with search, department filtering, column controls, inline fields, assignments and personal-customisation policy. Personal **My details** opens Profile Settings.

Each signature field resolves from the current linked profile or staff/company/office record unless an admin override exists. Null resets an override; an explicitly saved empty string hides a field. Profile updates therefore remain live without changing a saved override. The email field affects the signature contact link, never mailbox identity or send permission. Missing email overrides retain the actual sending mailbox address in composer previews and sending.

The profile source RPC reads only selected name/contact metadata joined through company-linked active staff. It is executable only by the service role behind the existing active-user and permission-checked Inbox API. Admin writes recheck `Email.Signatures.Manage`, company and target status in the database, lock the target row, enforce expected revisions and atomically record an audit event. No Auth or staff profile is written by an override. Existing non-empty signature phone/mobile values are migrated into explicit overrides.

Cells save on blur or Enter; Escape cancels. Errors keep typed input. A failed write refreshes the server revision before an explicit retry. Reset restores the profile link. Refresh/focus reloads current source values. Legacy signature-profile writes return an explicit moved-workflow error rather than silently saving unused values.

## Dexter exception

The existing signature domain exposes templates and permitted assignments, not private employee profile fields. Reading, writing and watching team contact overrides are explicitly unsupported in this change: exposing them through the template domain would imply profile visibility it does not grant. Dexter's prompt directs signature managers to the dedicated team page and employees to Profile Settings; it must not claim that it has inspected or changed those fields. Existing publication/assignment watches remain unchanged. Override changes are audited deterministically, without LLM polling.

## Activation boundary

Implemented locally in a side conversation. Apply `20260911170000_signature_team_details.sql` after the original signature migrations, then deploy the changed `inbox-api/signatures.ts` dependency to Inbox, Dexter, quote workflow and email watch worker together. Include the updated Dexter prompt, then publish the client. No remote migration or deployment was performed here; the new team endpoint will not be available until activation.

Validation covers the production client build, the full PostgreSQL access regression suite and the signature backend tests. The PostgreSQL fixture includes live profile reads, profile updates under a retained override, reset, stale revision, operator denial, inactive target, foreign-company denial and direct-browser RPC denial. Connected browser editing remains to be checked after activation.
