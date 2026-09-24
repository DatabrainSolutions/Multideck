# Dexter live voice

## Product contract

An empty Dexter prompt offers Speak to Dexter; entered text restores Send. Speech streams into the normal conversation, without an orb, separate transcript panel or countdown. The compact prompt controls expose mute, end and return to typing. User settings offer ten English-speaking voices with bounded previews. Preferences persist per operator across devices.

Voice uses GPT-Live-1 over a server-authenticated WebSocket, with mono PCM16 at 24 kHz. Provider captions are a presentation timeline, not action instructions. Only a provider delegation starts work through the existing Dexter request path. Corrections can steer its existing active run. Tool results, tables, approval cards and audit retain their normal ownership and permissions. Spoken approval never bypasses an approval card.

## Turn identity

Caption fragments join only adjacent same-speaker speech. They never join across the other speaker. Delegation takes the latest unanswered request, excluding greetings already answered aloud. A longer pause within an unanswered request does not lose its earlier clauses.

The text conversation branch is selected before adding speech. Voice utterances do not enter retry-version grouping. Saved request metadata attaches to the final matching spoken request and answer, preserving all earlier exchanges and stable render keys. The written backend answer remains the displayed content, including its complete Markdown links and inline citations; spoken captions are a concise audio summary and must not overwrite that evidence. Requests to show or repeat links also delegate to the backend before voice claims a result is available. Legacy combined requests are reconstructed for display from their original private captions; their underlying audit history is not rewritten.

## Access, storage and cost

- The browser sends its session token in the first WebSocket frame, never in the URL. The server validates origin, active identity, company, Dexter permission and conversation ownership before opening the provider connection.
- Provider credentials stay server-side. The relay accepts existing `OPEN_API_KEY`, falling back to `OPENAI_API_KEY`, matching the established Dexter configuration.
- The daily allowance is 300 seconds per person, shared across tabs, devices and previews; it resets at midnight Europe/London. Only one session may be active. Preview reservations are at most 18 seconds. The remaining workspace AI allowance may further shorten a reservation.
- Usage reservation is atomic. Both voice and ordinary model requests respect outstanding reservations. Cumulative provider duration is settled once into the main AI egress ledger and a Voice minutes category. Disconnected workers retain explicitly unconfirmed conservative usage, reconciled by database maintenance.
- Audio is not stored in Multideck. Private captions expire after 30 days; duration and financial audit remain. A one-minute database maintenance job reconciles abandoned sessions and removes expired captions in bounded batches, without LLM calls. Voice-only sessions create a private chat immediately, so their captions can be reopened.
- The current planning rate is USD 0.05 per session minute, converted at the existing budgeting rate of USD 1.30 per GBP. Session time includes listening, speaking and tool waits. The delegated text/tool model is charged separately through its existing meter. See the [official model documentation](https://developers.openai.com/api/docs/models/gpt-live-1).

The pricing sheet uses a conservative 31-day maximum: 155 minutes/person/month, or £5.96. Additional monthly voice budgets are £59.62 / £149.04 / £298.08 for 10 / 25 / 50 seats. Blue inputs and formulas feed the existing total-cost calculation. This adds voice above the full existing text-AI budget; it is not a second charge in the app's actual usage ledger.

## Dexter and watch parity

The existing permissioned usage data domain reads the new Voice category. Settlement emits the existing deterministic usage-watch signal once; the generic usage capability can filter to Voice. No recurring LLM evaluation is introduced.

Personal voice selection and raw private captions are deliberately not a new general-purpose Dexter data/write/watch domain. Voice changes stay in the signed-in person's Settings, and raw captions remain conversation-owner-only. Business operations still use existing allowlisted Dexter actions. No generic table writes or voice-only approval path are introduced.

## Verification and deployment — 17 September 2026

- Deployed the two incremental voice migrations and `dexter-voice` to development project `aqtwypsuijxlnvtxpuxe`; also deployed the scoped retention-cleanup change. Production projects were not changed. The database maintenance job was observed active with a successful run.
- All ten provider voices returned audio, streaming captions and confirmed duration.
- Chrome against localhost and the deployed development backend: preference save/reload, real preview, synthetic spoken read-only usage lookup through normal Dexter tools, output captions/audio, duration/AI ledger settlement, mute and keyboard end, saved-history reload, Voice category, and desktop/mobile presentation.
- The reported multi-exchange collapse was reproduced with saved captions. The repaired UI displays each greeting/question/reply separately after reload, retains the leads table, and does not create false retry-version controls.
- Nine voice contract/transcript/audio tests pass, including legacy combined requests, late/duplicate captions, interruptions and delegation boundaries. The complete PostgreSQL access regression run passed 29 + 10 checks, including voice ownership, cross-company denial, daily limits, concurrent reservation, idempotent charging, watch signalling and retention.
- Client build/TypeScript and Deno checks passed. No hardware microphone quality or hosted frontend deployment is claimed by those checks. The frontend remains the shared local checkout; no unrelated changes were committed or promoted.

Supabase WebSocket workers need sufficient wall-clock duration for a five-minute call (paid Edge limits, rather than the 150-second free-plan limit). Provider/transport failures leave ordinary chat available and usage provenance explicit.
