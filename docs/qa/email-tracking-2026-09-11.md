# Email tracking verification — 11 September 2026

Status: fixes implemented and the backend tested against real Gmail, Microsoft 365 and Apple Mail, including a live Dexter provider-draft send and authorised tracking readback. Native Outlook/mobile certification, quote live send coverage and a complete frontend release are still outstanding. Do not describe this as confirmed live across all tenant deployments.

## What changed

- The common sender appends the opt-in pixel to both plain messages and trusted HTML templates. Previously a supplied HTML template replaced the tracked HTML and silently lost the pixel.
- Provider-native drafts retain their approved recipients/body, tracking choice and idempotent send claim. Normal sends now refresh credentials before creating a send claim; uncertain provider outcomes remain awaiting confirmation and cannot be silently resent as another copy.
- A relayed/expanded delivery report is no longer presented as final delivery. Only an explicit delivered action confirms delivery; failed reports remain bounces.
- Status confidence follows the displayed state. A confirmed reply is no longer described as estimated merely because an earlier open exists.
- Sender previews strip the original tracking image, including quoted originals in matched inbound replies. An independently received email still renders normally. This fixes a real extra-open observed while viewing the C1 reply in Multideck.
- Inbox distinguishes Sent/no open signal, Opened (estimated), Replied, Delivered, Bounced, Failed, Draft and Awaiting confirmation. No open signal is never described as proof of an unread recipient mailbox. Multi-recipient evidence does not identify the reader or prove delivery to everyone.
- Quote issue has an explicit Track opens checkbox, off initially for each new issue dialog. Standard HTML and simple PDF email both use the common tracked sender. This frontend addition is local, not yet deployed.
- Dexter's authorised email-thread read now returns delivery evidence. Deterministic engagement watch signals include the mailbox needed by the existing access checks; notification text identifies estimated opens. Private evidence helpers remain service-only.
- Pixel infrastructure failures emit a safe generic diagnostic while preserving the identical transparent GIF response. No raw token, recipient address, IP, URL or provider body is logged by this handler.
- Gmail API quota/policy denials have specific safe guidance rather than all being called an expired connection. A stale sync cannot replace a newly reconnected connection's status after its credential reference changes.
- Credential failures release the acquired mailbox sync lease. A stale sync also cannot mark the mailbox index as failed after a reconnect.
- Composer Send and its keyboard shortcut wait until pending attachments have finished loading.
- Confirmed draft sends now remove their stale Drafts membership and add the mailbox's existing Sent folder atomically with the message update. Custom labels and other mailboxes remain untouched. The live G1 check exposed this: the old Drafts label hid the successfully sent message from Dexter search.

## Real-mail evidence

Times below are UTC; add one hour for the browser's British summer time.

| Test | Sender → recipient | Real result |
| --- | --- | --- |
| A1 | Microsoft 365 Jenkar → Databrain Gmail | Sent 13:55:07; zero opens before opening Gmail in Chrome; first estimated open 13:58:10; actual Gmail reply matched 14:01:49. Multideck badge and evidence verified. |
| B1 | Databrain Gmail → personal Outlook.com | Failed before provider acceptance during mailbox recovery. Preserved failed evidence; no successful-send claim. |
| B2 | Databrain Gmail → personal Outlook.com | Sent 14:26:46; first estimated open 14:27:07. The receiving client/human action was not observed, so this is an image-load signal only. |
| C1 | Databrain Gmail → Jenkar Microsoft 365 | Sent 14:27:52; unread result in Outlook web and zero opens before opening; actual Outlook web open 14:30:13; Outlook reply matched 14:32:23. Confirmed Replied state survives reloading Multideck. |
| D1 | Databrain Gmail → Jenkar Microsoft 365, tracking OFF | Sent 14:31:52; no pixel and no token. Received and opened in Outlook web; still Sent, tracking disabled, no opened timestamp afterwards. |
| E1 | Databrain Gmail → To Jenkar, Cc personal Outlook, Bcc Databrain | Sent 14:50:17 with one tracking token and the expected recipient roles. First signal 14:50:28 preceded the observed Outlook open, so reader attribution is unknown. Received in Outlook web; To/Cc visible, Bcc not exposed; the attachment preview contained the exact disposable test text. |
| F1 | Databrain Gmail → harryphillips4@icloud.com | Separately approved by the user. Sent 14:54:27; arrived unread in Apple Mail with zero open signals before opening. Actual Apple Mail open produced an estimated signal at 14:59:54. Apple Mail 16.0 (3895.100.17), Protect Mail Activity enabled; settings were read without changes. |
| G1 | Dexter saved Gmail draft → Jenkar Microsoft 365 | Created a real provider draft, reviewed Gmail sender and tracking-on, then sent that same draft at 15:20:45. One token; received body and signature verified in Outlook web. First estimated signal 15:20:52 preceded the observed recipient opening. After the stale folder-label fix, actual Dexter search/read returned tracking enabled, opened_estimated, estimated confidence and no delivered/reply/bounce/failure evidence, with a source link. |

All recipients were explicitly supplied by the user. No business quote, invoice or customer correspondence was sent as part of these tests.

Internal message IDs for reproducibility:

- A1: `756fca8e-b154-46f6-8986-609c1b8a6560`
- B1: `a0d3afe6-8d1e-40aa-9516-4e54a22ebab8`
- B2: `f9d7ac81-026a-4ff2-9175-172f0f330439`
- C1: `f9d1991f-bd3d-4bfc-8ae1-f3738b7f00d3`
- D1: `c6e92c0f-36ea-4703-895a-28d4ff2b3435`
- E1: `f4e5e45f-7fd2-419e-8b7b-f59a821852fe`
- F1: `ca531e28-aa70-4d5c-b9ad-324639ce748c`
- G1: `0604a745-63e0-48c4-b393-13a7d73fa876`; thread `3e4452e9-2d24-4e1a-b0a0-3e430717d2e4`; Dexter conversation `49f2e4c0-1d01-4a5d-a500-596681bc65c9`.

A1 generated an Exchange “Relayed” DSN which exposed the false-delivery bug. Its known incorrect delivered event was corrected to sent, with the previous event type/reason/timestamp retained in `evidenceCorrection` metadata, and its false delivered timestamp cleared. Other historical events were not blindly rewritten.

C1 accumulated additional image requests while the quoted-preview defect was reproduced. These raw counts were preserved; they are not unique readers. After the fix, the actual rendered iframe contained no tracking pixel and the count stayed at seven across subsequent sender preview/reload checks.

Gmail recovery used the same previously granted scopes. A direct authenticated Google profile read confirmed the refreshed credential and correct mailbox before restoring the stale error state. B2, C1 and D1 subsequently sent through the normal Multideck UI; the connection remained active.

## Checks

- 60 focused Inbox, tracking and native-provider-draft contract/behaviour tests passed. Two additional native-draft tracking/failure regressions were then added; the affected 12-test suite passed, bringing the covered total to 62. These verify actual sent HTML/token binding, retry reuse, and token deactivation only after definite rejection.
- 55 frontend Inbox contract tests passed.
- 27 Deno core tests passed.
- Latest mandatory PostgreSQL access regression run passed (25 primary and 10 secondary tests), including the expanded real PostgreSQL tracking lifecycle fixture.
- Folder-transition tests verify pending/failed drafts retain their labels, confirmed sends become Sent, custom/foreign-mailbox labels are preserved, repeated updates do not duplicate labels, inbound/deleted/unconfirmed states are unchanged, and the historical repair handles the contradictory confirmed-sent state. The live preflight found one affected message (G1); after migration its folder is Sent and actual Dexter readback succeeds.
- The PostgreSQL fixture exercises token hashing, repeated-open deduplication, expiry/inactive rejection, no mutation of mailbox read state, confirmed reply confidence, watch pause/resume/nonmatches, foreign-company/owner/denied-mailbox cases and private helper grants. The fixture deliberately stubs the pre-existing authorised thread-read shell; live checks separately confirm the original read guards remain present.
- The three scoped deployed sender/sync bundles and public pixel entrypoint passed Deno checks. The frontend production build passed; the existing large-chunk warning remains.
- Local real C1 thread: status popover opens using the keyboard; timestamps and reply evidence persist after reload. At 390 × 844, the popover and actions remain usable. Temporary viewport override was reset.
- Browser source check confirms the rendered quoted reply has no `/email-track/` image after the fix. Tracking-off D1 has neither a database token nor an outbound pixel and creates no open when actually viewed in Outlook web.

## Deployment boundary

Only the existing MultiDeck development backend `aqtwypsuijxlnvtxpuxe`, used by `dev.multideck.app` and the local client, was changed. The separate Jenkar production Supabase project was not changed.

Applied migration: `20260911141000_email_tracking_evidence_parity.sql` (already applied; do not edit).

Also applied: `20260911153500_sent_draft_folder_reconciliation.sql` after the complete access regression run. This migration uses a private trigger function and preserves existing read/send permissions. Do not edit the applied migration.

Scoped Edge releases, downloaded and compared against the intended bundle:

| Function | Version | Authentication |
| --- | --- | --- |
| inbox-api | 121 | Existing JWT requirement preserved |
| email-watch-worker | 84 | Existing worker custom authentication preserved |
| quotes-workflow | 84 | Existing JWT requirement preserved |
| email-track | 53 | Existing opaque random capability token; public GIF endpoint |
| agent-dexter | 235 | Existing JWT requirement preserved; description-only bundle change |

The initial tracking releases were assembled from previously deployed bundles. The concurrent signature task subsequently released versions 121/84/84. Those bundles were downloaded: their complete inbox runtime matches the current checkout exactly, including the final tracking and sync recovery fixes. They were preserved rather than overwritten with the earlier scoped bundle. No reset, worktree or frontend release was performed by this task.

## Coverage and remaining sign-off

Code and automated coverage: Inbox new/reply/forward, existing provider drafts sent through Dexter, CRM actions reusing Inbox compose, and the common quote sender when `trackOpens` is explicitly true. HTML, escaping, attachments, To/Cc/Bcc and tracking-off are exercised in transport tests. A real quote with PDF was not sent in this run. The real Dexter provider-draft send and engagement readback are now complete (G1).

Disposable quote JQ20026 was created through the UI and saved with client/local reference `QA EMAIL TRACKING 110926 - NOT A BUSINESS QUOTE` and source NEW. It remains an unissued working draft at `/quotes/jq20026`. Repeated Chrome command timeouts prevented completing its details/preview/send journey, including after session resets, a fresh tab, longer locator timeout and duplicate-tab cleanup attempts. Do not mistake the automated template test for this live journey.

On continuation the real quote issue dialog displayed Track opens (off initially), the generated branded preview and required-field validation. The saved contact email is the approved Jenkar test address. Databrain/Jenkar were not available as customer selections; an existing Demo Organisation 003 was found elsewhere in the workspace, but its customer ID has not yet been selected in this quote. The user was asked for a test customer. Reduced-motion emulation did not resolve the quote-tab stalls and was reset; no display override remains.

Tracking is currently a per-message option, not a global account preference. Automated quote follow-ups and system/auth/notification email have no user tracking switch and remain explicitly untracked. Click tracking is not implemented; neither UI nor Dexter should claim click evidence.

Before broad production sign-off:

1. Restore reliable quote-tab interaction, complete the quote tracking control's draft/preview/issue journey using JQ20026 and verify the received PDF/HTML pixel. The Dexter native-draft test is complete. The multi-recipient attachment test is complete for recipient-side Outlook receipt/content/headers; the separate personal Outlook human open was not observed.
2. Confirm Outlook desktop/mobile behaviour with the user's available devices; record app/version and image/privacy settings. The pending user question asks which apps are available. Apple Mail with privacy protection is now tested. No claim of a native Outlook test should be inferred from Outlook web or an Outlook.com address.
3. Release the reviewed frontend changes, apply the migration and scoped Edge fixes to each intended tenant, and verify each actual URL/version. Production rollout across customer tenants was not performed.
4. Review any older delivered records where the saved report evidence proves only relay; do not infer invalidity from a 2.x status alone.

Open tracking cannot establish that a human has read an email. Gmail image proxies/caching, Outlook image blocking and Apple Mail Privacy Protection can suppress, cache or generate image requests. Tokens currently expire after 90 days. A read/unread badge on the operator's Inbox is their mailbox state, not the recipient's state.

Primary references: [Gmail image handling](https://support.google.com/mail/answer/145919), [Outlook automatic pictures](https://support.microsoft.com/en-us/outlook/block-or-unblock-automatic-picture-downloads-in-classic-outlook-email-messages), [Apple Mail Privacy Protection](https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/), [DSN actions in RFC 3464](https://www.rfc-editor.org/rfc/rfc3464.html), [Gmail API error handling](https://developers.google.com/workspace/gmail/api/guides/handle-errors).
