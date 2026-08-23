# ElevenLabs conversation reconciliation

`elevenlabs_reconcile.ts` is a read-only recovery adapter for the explicitly
configured Jenkar ElevenLabs agent. It exists because a post-call webhook can be
missed or a conversation can remain `processing` after the initial delivery
attempt. It discovers IDs only through an exact `agent_id` filter; it is not a
workspace-wide crawler and it does not change an ElevenLabs agent or webhook.

## Official provider surface

The adapter uses the official list and full-conversation operations:

```text
GET https://api.elevenlabs.io/v1/convai/conversations
    ?agent_id={configured_agent_id}
    &call_start_after_unix={overlapped_checkpoint}
    &call_start_before_unix={frozen_run_start}
    &page_size=100
```

```text
GET https://api.elevenlabs.io/v1/convai/conversations/{conversation_id}?format=json
```

The list endpoint documents the exact agent and call-start filters plus cursor
pagination. The detail endpoint documents `conversation_id`, `status`,
`metadata`, `transcript`, `analysis`, and `conversation_initiation_client_data`.
The metadata example includes `start_time_unix_secs` and `call_duration_secs`.
See
[List conversations](https://elevenlabs.io/docs/api-reference/conversations/list/)
and
[Get conversation details](https://elevenlabs.io/docs/api-reference/conversations/get/).

The existing primary source remains the signed `post_call_transcription`
webhook, which contains the complete ElevenLabs conversation data after analysis
finishes. See
[Post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks).

The live Jenkar agent publishes transcript-extracted `caller_name`,
`company_name`, and `call_reason` data-collection fields. Missing or ambiguous
identity stays empty. These analysis values are useful matching candidates, not
permission to attach the call to a CRM record without the matching confidence
and review boundary.

Required tenant secret:

```text
ELEVENLABS_API_KEY
ELEVENLABS_AGENT_ID
```

The key needs permission to read Conversations and must remain in the tenant's
Supabase Edge Function secrets. `ELEVENLABS_AGENT_ID` must be the exact live
Jenkar receptionist agent ID. The module accepts only the documented
`https://api.elevenlabs.io` origin, sends the key as `xi-api-key`, rejects a
cross-agent list or detail response, and never includes it in returned errors.

## Honest state model

The provider `status` and transcript state are separate:

| Provider status                          |               Readable turns | Reconciliation transcript state |
| ---------------------------------------- | ---------------------------: | ------------------------------- |
| `initiated`, `in-progress`, `processing` |                          any | `processing`                    |
| `done`                                   |           full bounded array | `complete`                      |
| `done`                                   | missing or locally truncated | `partial`                       |
| `failed`                                 |                         some | `partial`                       |
| `failed`                                 |                         none | `failed`                        |
| unknown                                  |                  some / none | `partial` / `pending`           |

Only provider-confirmed `done` responses with an untruncated transcript produce
an `ingestionEnvelope`. Its event type is the Multideck-specific
`conversation_reconciliation`, not an invented ElevenLabs webhook type. The
stable correlation key is `conversation_id`; the delivery ID also contains a
hash of the bounded response so a later `done` version is not suppressed by an
earlier processing snapshot.

The adapter bounds:

- one frozen discovery window with a five-minute overlap;
- list pages (three by default), list page size, and discovered IDs;
- conversations per run (50 by default, 100 maximum);
- concurrency (4 by default, 10 maximum);
- response body (2 MiB by default, 5 MiB maximum), checked while streaming;
- transcript turns, per-turn characters, and aggregate transcript characters;
- attempts and request timeout.

Safe GET retries cover network failures, HTTP 408, 429, and 5xx, including a
bounded `Retry-After`. Terminal errors are isolated per conversation so one 404
does not prevent another known conversation from being repaired.

## Transcript and transfer boundary

The full-conversation response proves only the ElevenLabs conversation portion.
For the Jenkar SIP/conference journey the adapter always returns:

```text
transcriptScope = elevenlabs_conversation_only
includesEmployeeTranscript = false
transferBoundaryAt = null
transferBoundaryEvidence = not_provided_by_conversation_api
```

It never claims that ElevenLabs supplies the 3CX/employee transcript or the
transfer acceptance timestamp. A unified conversation must retain the ElevenLabs
segment provenance, use a separately evidenced Jenkar/Twilio accepted boundary
when it was captured, and use genuine 3CX transcription data for the employee
portion. If that source is unavailable or unlicensed, the unified transcript
remains partial.

## Integration

The source-integrated `POST /functions/v1/phone-calls/sync/elevenlabs` worker
first discovers calls belonging to the exact configured agent, then combines
those IDs with bounded provider legs whose transcript state is `pending`,
`processing`, or `partial`. It requires the same `x-multideck-worker-secret`
used by the other tenant maintenance workers. The route and its supporting
migration are locally tested in this checkout and deployed to the
user-authorised shared Development project. They are not deployed to a dedicated
Jenkar Multideck App tenant because that tenant project does not yet exist.

For each result:

1. `processing`: retain pending/partial state and schedule a bounded retry.
2. `done` + complete: record the stable reconciliation event and pass its `data`
   through a shared ElevenLabs payload processor with verification provenance
   `elevenlabs_api_key`. Do not send it through the signed-webhook verifier.
3. `done` + truncated: retain partial state; do not label it complete.
4. `failed` + turns: preserve the turns as partial evidence.
5. `failed` + no turns: mark the provider portion failed.

The signed webhook and API-key reconciliation routes share the same bounded
ElevenLabs payload processor after their different authentication boundaries.
The worker freezes each list window at the run start, overlaps the previous
watermark by five minutes, and retains processing or retryable IDs in a bounded
checkpoint queue. That means advancing the discovery watermark cannot strand a
conversation whose analysis finishes later. It commits the provider cursor only
after every result has been stored, processed or safely queued, and returns a
partial-success response when individual conversations still require retry.

## Local verification

```sh
npx --yes deno test supabase/functions/phone-calls/elevenlabs_reconcile_test.ts
```

Tests use invented conversation data and never contact ElevenLabs.
