# Dexter personal email style

Dexter can learn a compact, private writing profile from eligible sent mail after the operator explicitly opts in. This capability changes how Dexter phrases email drafts only. It does not change ordinary answers, operational reasoning, evidence, permissions or autonomy.

## Data and consent boundary

- The profile is owned by one authenticated operator inside one physically isolated tenant project.
- Source messages are read only by the privileged profile generator. Browser roles can load and edit the derived profile but cannot call the source sampler or read its audit table.
- A sample contains at most 40 eligible messages from the previous 12 months. Personal mail needs matching user ownership; shared or group mail also needs immutable individual authorship evidence.
- Automated mail, quoted thread content, footers, trivial replies and redacted or deleted messages are excluded.
- The generator uses `store: false` and saves only structured guidance capped at 2,400 characters. Raw bodies and copied examples are never stored in the profile or content-free audit events.
- Disconnecting mailbox access immediately removes that mailbox from future source selection. Reset deletes the derived profile and stops refreshes.

## Dexter and Inbox boundary

`load_operator_email_style` is exposed to Agent Dexter only for an explicit email draft, reply or rewrite. The profile is tone guidance: current thread facts, workspace evidence and direct operator instructions always win.

`prepare_email_draft` returns structured compose metadata plus the operator's requested provider action: `create_draft` or `send`. Recipients, mailbox identities and reply context must come from the selected email, an explicitly attached record or direct operator input; unknown values remain empty. The inline composer reuses the Inbox mailbox permission checks, recipient resolution, idempotent provider-draft and send endpoints, and provider receipts.

In **Approve** mode, the inline composer is the approval surface. The operator can ask Dexter to revise the wording, then explicitly selects **Create draft** or **Send email**. In **Full access**, Dexter performs that same allowlisted action immediately through the signed-in operator's Inbox boundary. Gmail and Outlook therefore share one permission, idempotency and audit path; Dexter never receives provider tokens or service-role credentials. A request that does not explicitly say to send defaults to creating a provider draft.

Creating a provider draft is separate from the local keystroke autosave. Autosave protects the editable Dexter copy without creating provider clutter; only the explicit action creates one Gmail or Outlook draft. Full-access execution is interactive and request-bound, never scheduled.

Sent provider messages stay immutable. When an operator clicks a sent composer, Dexter creates a tenant-scoped draft revision and edits that copy in place. This revision is part of the existing compose workflow, not a new operational domain event, so it does not create a Watching for you signal.

Inline draft refinement uses the dedicated `dexter-email-refine` Edge Function. It reuses the authenticated draft-update RPC as the tenant, owner and editability boundary, treats draft text as untrusted input, and returns revised plain text to the existing mounted composer. It never sends email and does not add a new conversation response. Selection refinements replace only the chosen range; the surrounding body remains byte-for-byte unchanged. This direct, operator-invoked edit is not a background event and deliberately has no Watching for you adapter or idle LLM loop.

Provider draft creation and sending also do not add a dedicated watch adapter. They are immediate operator-requested actions with an inline confirmed or failed result, while ordinary mailbox sync and existing email watch events remain the source for later inbound replies and provider changes. No idle LLM polling is introduced.

## Refresh and Watching for you

An opted-in profile becomes due monthly. The tenant worker refreshes it only after at least 10 new eligible messages; a failed refresh preserves the last good profile.

Writing-profile consent, edits, refreshes and resets are private preference changes, not operational events. They deliberately do not create **Watching for you** signals or notifications. The scheduled refresh is maintenance for an already approved preference, not a watch rule, and it does not run an idle LLM polling loop.

## Deployment controls

The Edge Function is inactive unless the tenant-local `dexter_personal_email_style` release flag is enabled. `DEXTER_WRITING_PROFILE_ENABLED=true` is retained only as an emergency deployment override. The monthly caller also needs the Vault-backed `dexter_writing_profile_worker_secret`. Enable the release flag and worker endpoint only after the migration and function are deployed and authenticated Gmail and Outlook journeys have been verified in the internal tenant.
