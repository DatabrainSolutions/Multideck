## Dexter Capability Parity Rule

Dexter is a product interface to Multideck, not a separate feature that is updated only occasionally. Whenever backend functionality, data, integrations, permissions, or workflows are added or changed, update both **Dexter chat** and **Watching for you** in the same body of work.

For every new or changed backend capability:

1. Add or update Dexter's tenant-safe read support so chat can inspect the new records through an explicit data domain, query function, or capability adapter. Return source identifiers and evidence metadata where accuracy matters.
2. Add allowlisted Dexter write actions when users should be able to change the new data. Reuse the backend's real validation and permission boundary, show the proposed change clearly, require approval by default, and audit the result. Never give Dexter generic table or SQL write access.
3. Add a **Watching for you** event adapter when a meaningful record change could matter to an operator. Watches must react to real database, webhook, provider, or domain events; they must not repeatedly poll an LLM for updates.
4. Keep runtime watch evaluation deterministic and inexpensive. The LLM may translate the user's natural-language request into a validated rule when the watch is created, but ordinary change detection must use stored rules and event signals without additional LLM calls.
5. Update Dexter's capability registry, prompts, mention/search metadata, notification routing, and English descriptions so chat and watch mode accurately describe what is now supported.
6. Apply the same tenant, user, role, provider-mailbox, RLS, and permission boundaries used by the underlying product. A Dexter read, write, or watch must never broaden access.
7. Test the real lifecycle: chat can read the new data; any write is allowlisted, approval-safe, and audited; a watch can be created; a matching change fires once; a non-matching change does not; pause/resume works; and another user or tenant cannot see or trigger the watch.

Do not silently leave a new backend feature unavailable to Dexter. If exposing it would be unsafe, misleading, too costly, or technically unsupported, document that exception in the change and make Dexter return a clear unsupported response rather than guessing or claiming access.
