# Twilio Sync screening collector

`twilio_sync.ts` is a read-only, tenant-portable fallback collector for the
Jenkar attended-screening state stored in Twilio Sync Documents. It does not
change Twilio routing, mutate Sync, place calls, or persist anything itself.

## Provider contract

Twilio documents the current Document REST shape as `sid`, `unique_name`,
`revision`, `data`, `date_created`, `date_updated`, and `date_expires`. The list
operation is:

```text
GET https://sync.twilio.com/v1/Services/{ServiceSid}/Documents
```

The default page size is 50 and the documented maximum is 100. Pagination is
provided in `meta.next_page_url`. See Twilio's official
[Document resource](https://www.twilio.com/docs/sync/api/document-resource) and
[Sync REST authentication](https://www.twilio.com/docs/sync/api).

Important provider limits:

- A Document is a current JSON snapshot of at most 16 KiB. Twilio explicitly
  says that Document modification history is not maintained; each modification
  only receives a new `revision`.
- Revisions are opaque strings and must not be compared as numbers. The
  collector uses `date_updated`, then `sid`, then `revision` only to establish a
  deterministic total ordering. A bounded two-minute replay overlap protects
  against different Documents sharing one provider timestamp bucket; stable
  event IDs make those replays idempotent.
- A Document with a TTL is automatically deleted approximately after expiry.
  `date_expires` can be present briefly after the nominal expiry, so the
  collector does not discard an otherwise readable expired snapshot. See
  [Sync object TTL](https://www.twilio.com/docs/sync/objects-ttl).
- The list API has no documented updated-since filter. The collector therefore
  reads every bounded page, sorts locally, and only then applies its checkpoint.
- Twilio recommends API-key Basic authentication for production. The adapter
  accepts `apiKeySid` + `apiKeySecret`, with `accountSid` + `authToken` as a
  compatibility fallback. Credentials are never included in returned errors.
- Sync Service webhooks are optional. A Service can have a `webhook_url`; the
  `webhooks_from_rest_enabled` setting controls REST-originated mutations and
  defaults to false. Official webhook Document events are `document_created`,
  `document_updated`, and `document_removed`; their form fields include
  `EventType`, `ServiceSid`, `DocumentSid`, `DocumentUniqueName`,
  `DocumentRevision`, and `DocumentData` (except removal). Those events do not
  include a provider event timestamp. The webhook adapter therefore uses a valid
  custom `data.updatedAt`/`data.createdAt` value when present and otherwise
  stores its own receipt time with
  `source_timestamp_basis =
  webhook_received_at`; it never labels receipt time
  as provider time. Twilio signs the exact webhook URL plus all form fields with
  `X-Twilio-Signature` using the account Auth Token. See
  [Sync webhooks](https://www.twilio.com/docs/sync/webhooks) and the
  [Service resource](https://www.twilio.com/docs/sync/api/service), plus
  [Twilio webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security).

Polling cannot reconstruct an intermediate revision that is overwritten before
the poll. It is consequently a safe current-state and recovery source, not an
event-history claim. Full transition capture needs an authenticated direct event
from the routing function or an explicitly configured Sync Service webhook. The
source-level `/webhooks/twilio/sync` receiver implements the latter boundary;
Twilio configuration is still a separate, explicit provider change.

## Normalized ingestion contract

`normalizeTwilioSyncDocument` accepts the official REST Document shape and only
recognises a Jenkar session when a UUID is available from `data.id`,
`data.screeningId`, `unique_name`, or the suffix of
`data.conferenceName = jenkar-screening-{uuid}`. Unrelated Sync Documents are
ignored.

It emits zero or more envelopes already shaped for the existing
`POST /phone-calls/webhooks/jenkar/screening` handler. One envelope is emitted
for each real provider leg whose Call SID exists:

| Sync `data` field    | Screening envelope field                                      |
| -------------------- | ------------------------------------------------------------- |
| `id` / `screeningId` | `screening_id`                                                |
| `conferenceSid`      | `conference_sid`                                              |
| `conferenceName`     | `conference_name`                                             |
| `callerCallSid`      | caller `call_sid`                                             |
| `agentCallSid`       | receptionist `call_sid`                                       |
| `staffCallSid`       | employee `call_sid`                                           |
| `callerNumber`       | caller `from_number`                                          |
| `screeningStartedAt` | employee `started_at`                                         |
| `answeredAt`         | employee `answered_at`                                        |
| `providerStatus`     | employee `call_status` and `provider_status`                  |
| `providerCode`       | `provider_code`                                               |
| `status`             | `screening_status`                                            |
| `outcome`            | `screening_outcome`, and `outcome` on the employee leg        |
| `completedAt`        | `ended_at` only when that specific leg is known to have ended |

The stable delivery key is:

```text
twilio-sync:{screeningId}:{documentSid}:{revision-or-update-key}:{role}:{callSid}
```

The envelope also retains `source_document_sid`, `source_revision`,
`source_updated_at`, and `partial_fields`. Missing Call SIDs never produce
synthetic legs. Provider Call and Conference SIDs are format-validated before
use. Transfer acceptance ends the receptionist leg but is not treated as the end
of the caller/employee conversation.

Twilio Sync contains no transcript. Every normalized event states
`transcript_scope = no_transcript_in_twilio_sync` and
`includes_employee_transcript = false`.

`completedAt` is mutable custom session state. The adapter therefore prefers
immutable custom `screeningCompletedAt`, `transferAcceptedAt`, and
`callCompletedAt` values (including their snake-case aliases). When those are
absent, legacy `completedAt` is used only while the current state makes its
meaning attributable. A later `caller_disconnected` update can overwrite it with
overall call end; the adapter then reports `transfer_accepted_at_not_retained`
rather than inventing acceptance. The same rule prevents a final caller
timestamp being assigned to a staff leg that ended at an earlier
declined/no-answer transition.

## Collector and checkpoint rules

The collector:

1. Validates Twilio SIDs and permits HTTPS only.
2. Uses bounded pages/documents and fails closed if a result exceeds either
   bound; it never advances a cursor over unseen pages.
3. Retries safe GETs for network failures, HTTP 408, 429, and 5xx, respecting a
   bounded `Retry-After` delay.
4. Rejects a pagination URL outside the configured Twilio origin and exact
   Service Documents path so Basic credentials cannot be forwarded elsewhere.
5. De-duplicates repeated `{document sid, revision}` rows and emits snapshots in
   ascending checkpoint order. Conflicting bodies for one SID/revision fail
   closed rather than choosing one silently.
6. Returns `proposedCheckpoint`; it does not persist it.
7. Rejects malformed list envelopes and repeated pagination URLs rather than
   treating a truncated provider response as an empty successful poll.

The integration must commit `proposedCheckpoint` only after every event from
every returned snapshot has completed the existing idempotent ingestion path. If
any event fails, retain the prior cursor and replay. The database uniqueness
boundary on `(company, provider, external event id)` makes that replay safe.
`checkpointBlocked` is true when a recognised session lacks a reliable provider
update timestamp, provider revision, or ingestible Call SID; in that case the
proposed cursor does not advance. `replayedSnapshots` reports overlap records
that were intentionally offered again.

## Deployed integration seam

The deployed Edge Function implements a scheduled, worker-authenticated path:

1. Acquire a short database lease for `{company, twilio, sync service sid}` and
   read a durable JSON checkpoint: `{ updatedAt, documentSid, revision }`.
2. Call `collectTwilioSyncDocuments` with tenant secrets:
   `TWILIO_SYNC_SERVICE_SID` plus either
   `TWILIO_API_KEY_SID`/`TWILIO_API_KEY_SECRET` (preferred) or
   `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`.
3. For each snapshot in order, process its events in their emitted order
   (caller, receptionist, employee) through the same logic currently owned by
   `handleJenkarScreening`. Prefer extracting that handler's payload processor
   instead of making the Edge Function call itself over HTTP.
4. Commit `proposedCheckpoint` and release the lease only after all ingestion
   events finish successfully. On retryable failure, retain the old checkpoint,
   record the bounded error, and let the next schedule replay.
5. Schedule at 30-60 seconds for the current short-lived screening state. A
   successful poll proves current-state collection, not capture of every
   overwritten Sync revision.

The live Development project has the durable cursor table and a Vault-backed
minute schedule. A separate bounded `POST /webhooks/jenkar/sync-snapshot` seam
also accepts one worker-authenticated raw Document, normalises it with this same
adapter, and uses the ordinary idempotent ingestion processor. The live Twilio
routing function does not yet call that direct seam, so polling remains the
active path.

## Sync Service webhook seam (source complete, not configured live)

`POST /phone-calls/webhooks/twilio/sync` accepts the official form-encoded Sync
Service webhook contract. It:

1. Bounds the whole encoded request to 64 KiB and the decoded `DocumentData`
   object to Twilio's documented 16 KiB Document limit.
2. Validates `X-Twilio-Signature` with `TWILIO_AUTH_TOKEN` against the exact
   request URL and every form parameter before parsing provider content.
3. Requires the exact configured `TWILIO_SYNC_SERVICE_SID` (and the configured
   `TWILIO_ACCOUNT_SID` when present).
4. Accepts `document_created` and `document_updated`; other authenticated Sync
   event types are acknowledged and ignored without persistence.
5. Uses `DocumentSid + DocumentRevision` in every stable normalized delivery
   key, so Twilio retries are duplicate-safe while distinct intermediate
   revisions remain distinct.
6. Reuses `normalizeTwilioSyncDocument` and ordinary Jenkar screening ingestion;
   retryable persistence failures remain in the existing durable retry flow.

To activate it later, configure the existing Sync Service webhook URL to the
tenant Edge Function route and enable `webhooks_from_rest_enabled` if the
screening Functions write Documents through the REST API. That provider change
must be backed up and verified independently; this repository change does not
perform it.

## Local verification

```sh
npx --yes deno test supabase/functions/phone-calls/twilio_sync_test.ts
```

The tests use invented provider identifiers and never contact Twilio.
