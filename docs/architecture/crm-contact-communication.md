# Contact communication

Communication details, a preferred channel and marketing consent belong to an individual contact. Company and lead pages expose that person's editor; their previous company/lead consent controls and company marketing summary are removed. Legacy database fields remain intact for compatibility and are not copied to people or written by the company editor.

ContactPreferencesPopover uses the existing Customers API, version checks, write permissions, consent evidence and transactional email history. Exact contact reads and writes can also resolve an organisation-less primary contact through the existing reachable-lead predicate. A contact with an organisation must still satisfy that organisation's access policy; a lead cannot bypass it. Company and contact registers retain their current scope. The access migration and Customers function must be released together.

ContactEmailAction opens the actual DexterEmailComposeCard in a centred, focus-trapped dialog above a dimmed background. Direct operator composition uses Inbox mailbox authorisation, validated recipients, auditing and idempotency. The same key survives closing/reopening. Drafts are held in session storage for up to 24 hours, scoped to the authenticated user, origin and email; sign-out clears mounted drafts. These are local drafts, not provider drafts. The refinement endpoint accepts new-message wording without a Dexter message ID, under the same authenticated actor, Email.Read and Email.AIRead checks; it cannot send, read a thread, change recipients or assert delivery. Sending remains an explicit operator action.

These are Multideck-owned internal surfaces. The email dialog scales in over 250 ms and a quieter 150 ms close, with reduced-motion overrides. Company consent is never inferred to mean consent from any employee. Ordinary one-to-one correspondence does not assert marketing permission.

## Dexter and Watching for you

Existing company-contact reads and deterministic account watch signals remain unchanged. Contact profile editing was already a structured-form-only capability. Lead-only contacts now have a structured editor, but Dexter's contact domain still requires a company relationship and the customer watch adapter targets an organisation. Those lead-only reads/writes/preference watches are explicitly unsupported until a contact-targeted domain/watch lifecycle is introduced. The domain description states this limitation so chat directs operators to Contact preferences instead of guessing. Email refinement is ephemeral wording assistance and creates no watchable record; delivery continues to use the existing Inbox events and personal mailbox boundaries.

## Release verification

Run the contact-access PostgreSQL regression and the standard data-access suite before release. Verify the intended tenant and its access boundary before and after applying the migration. No live migration or function deployment is implied by a local build.

Local verification on 11 September 2026: the client build and final TypeScript check passed; the data-access regression suite passed (23 PostgreSQL checks and 10 contracts), and all six focused refinement checks passed. Chrome checks covered the centred dialog at desktop and 390 px width, empty-message validation, draft close/reopen retention, nested Escape behaviour, and company-contact preference save/reopen. The demo contact's preferred channel was restored afterwards; marketing consent was unchanged. No email was sent. Older broad CRM source-contract assertions still have unrelated mismatches against the current register implementation.

The migration and Customers/refinement functions have not been deployed. The connected backend still rejects exact reads of lead-only contacts, and standalone pencil refinement requires the updated endpoint. Existing organisation-linked contact preference persistence was verified against the connected development backend.
