# Standalone import live estimates

Standalone import editors request a server preview 650 ms after calculation inputs change. One preview feeds all item panels and the declaration overview. A newer input immediately hides previous amounts and shows Calculating; superseded responses cannot replace it. Missing inputs show Needs information. Transport failures expose Retry estimate; they are never retried automatically for unchanged inputs.

`POST /declarations/:id/calculations/preview` uses the same authenticated declaration draft/write authorisation as saved calculations, rejects job-related and export declarations, bounds the input body, resolves invoice headers on the server, and invokes the existing deterministic calculation service. The preview function has no database client. It does not save the draft, append audit history, populate declared tax, call an LLM or submit customs data. Existing editor draft autosave continues independently.

The calculation input projection includes invoice headers, goods items, adjustments, calculation setup and the header fields consumed by the engine. Notes and contact details are excluded. Updates to calculation dependencies must update this projection too.

Explicit Save draft records a fresh server calculation after the draft is saved. An unavailable calculation does not undo the successful draft save and is reported separately. Preview responses are never accepted as audit evidence. The existing audit RPC still checks the saved snapshot for concurrent edits. Save estimate for override is a secondary intentional save boundary; overrides remain tied to a current immutable calculation ID. No audit records are written on ordinary preview changes.

## Dexter and Watching for you exception

Unsaved browser previews are deliberately unsupported in Dexter chat and Watching for you: there is no persistent record or domain event to read/watch. Dexter must say it cannot inspect or watch the live editor preview and ask the operator to save the draft. The existing approved calculation action, calculation read domain and deterministic calculationEvent watch cover the persisted result at Save draft. No new periodic or LLM-driven watch is added. Preview cannot be selected by an approved calculation action.

This change is local implementation. The preview endpoint must be deployed alongside the client before a hosted client can use it.
