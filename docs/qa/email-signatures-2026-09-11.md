# Email signature verification — 11 September 2026

## Environment and release boundary

Chrome on localhost:3000, connected to the MultiDeck development backend (`aqtwypsuijxlnvtxpuxe`). Three signature migrations applied with approval. Scoped backend source downloaded and matched after deployment: Inbox 122, agent-dexter 237, quotes-workflow 85, email-watch-worker 85. Existing JWT settings and concurrently deployed tracking code preserved. The separate Jenkar production project and provider signature settings were not changed. No frontend release was made.

## Connected journeys

- Created a company signature through the real admin builder; uploaded the existing Multideck PNG to private storage; saved and published only to the tester. Reload confirmed the document, assignment and version.
- The composer resolved the actual Outlook sending address, not the employee's primary Gmail address. Preview contained name, role and inline logo; empty phone was omitted.
- Switched signature off, saved a draft, reloaded and reopened through **Edit saved draft**. Signature remained off and the original sole recipient was restored. Backend owner/send-access checks and exact reply-recipient removals have regression coverage. Sending subsequently soft-deleted that saved draft.
- Imported the connected Gmail signature. Sanitised text, layout and links appeared in the reviewed result; remote images were removed with an explanation. The reviewed import was not applied to the company template and Gmail settings were not modified.
- Created a personal copy, renamed, published and reloaded it. Backend confirmed independent owner/source/version. **Reset to assigned signature** archived the test copy successfully.
- Cleanup confirmed in the connected database: personal test copy archived; company test template retained for review with empty draft and published assignments (revision 7). No tester or department remains assigned and no company-wide default was introduced.

## Actual delivery

Only Harry's own two connected mailboxes were used, with Track opens off in both tests.

| Check | Recipient evidence | Outcome |
| --- | --- | --- |
| Outlook → Gmail, signature enabled | Gmail message `1a0910b8e32657ef`; recipient Inbox row `a867126a-c6f5-4309-9659-c3828d2f6691` | Name, role and Outlook email arrived. Gmail lists `multideck-logo.png` as a 10,126-byte inline PNG with a matching Multideck CID, rather than an ordinary attachment. |
| Gmail → Outlook, signature disabled | Recipient Inbox row `7cc6cd3c-51b1-4f44-9120-5135adc6e1df` | Authored message arrived with no Multideck signature or logo/CID. |

Subjects were `Multideck signature QA — Outlook to Gmail — enabled` and `Multideck signature QA — Gmail to Outlook — disabled`. Sender records are `2330ad21-af9d-419b-8eb5-ad678ce26907` and `555dff57-ab50-48c7-baca-cf38251c18a6` respectively. Provider sync independently stored each recipient's received copy. The Gmail connector also confirmed the first recipient message and inline image metadata.

Jenkar's mail infrastructure appended existing legal/environmental text after transmission. The per-email toggle therefore demonstrably controls Multideck's content; provider-side footer rules remain independent. This does not identify which external product performed insertion or prove a WiseStamp exclusion.

## Automated and interaction checks

- Client production build passed; latest accessibility label change typechecked separately.
- Full PostgreSQL access regression passed after migration: 25 primary and 10 secondary tests, including signature persistence, eligibility, policy, version and deterministic watch lifecycle cases.
- Nine signature/backend tests and 59 client Inbox contract tests passed after saved-draft reopening was added. Existing core/provider-draft contracts also passed during implementation.
- Chrome component editing covered drag placement, keyboard alternatives, reduced motion and responsive controls. At 390 × 844, closing the properties sheet returned focus to the originating palette control; Escape returned focus to the existing block edit control. Viewport overrides were removed afterwards.

## Remaining release checks

The local UI and connected development backend are verified at the boundaries above. Wider rollout still needs the scoped frontend release, a real restricted-user session and physical cross-project credential denial. PostgreSQL permission tests are not evidence of those live sessions. Native Outlook/Apple Mail pixel rendering, every possible provider draft variant and a tenant's external server-signature exclusion remain separate integration checks. Contact/Dexter/quote composers use the shared signature control and central send resolver; no quote was issued or operational contact emailed as part of this verification.

## Editor feedback iteration

The Design workspace now fills the available app viewport, with its palette flush against the sidebar, properties flush against the right edge and independently scrolling canvas between them. Title, stages and name are grouped at the top left; save/apply and employee preview controls are at the top right. Mobile retains its properties dialog and has a reachable navigation trigger.

Field removal has a visible labelled action and an on-canvas remove control, with Delete/Backspace support and undo. Removing a populated row is also undoable rather than blocked by the old empty-row requirement. Image blocks offer upload/replace and an image preview. Import from brand appears only for a configured saved Admin brand with a logo; the connected import succeeded and copied the logo into private signature storage. SVG brand logos are rasterised for email compatibility.

Trust badges is a new portable block with up to eight managed images. Batch upload, per-image description/removal, size adjustment and email-safe table rendering use the existing asset ownership and total-size checks. Two images were uploaded into an isolated unassigned draft (`6fdc2a5d-7913-4357-ab3a-256ea95dbc4c`), saved to the connected backend and verified after a full reload. The draft was archived after checking. Concurrent changes to the user's active signature were left intact.

Chrome evidence: field deletion and Undo; configured brand import; batch image upload; badge removal and Undo; mobile properties at 390 × 844 and focus returned to Edit Trust badges; desktop panel edges measured flush to the shell/right viewport; no browser errors. Viewport override reset. Ten signature tests passed including badge sanitisation/rendering, and production build plus subsequent TypeScript checks passed.

The portable contract was updated in scoped backend bundles only, preserving all other deployed files and JWT settings: Inbox 124, Dexter 239, quotes 87 and watch worker 87. Frontend remains local; this iteration sent no email and changed no provider signature settings.

### Column width autosave reset follow-up

Confirmed the deployed portable contract lacked `columnWidths`, so backend save validation discarded resized proportions. Updated only `shared/email-signatures.ts` in fresh development bundles: inbox-api 125, agent-dexter 240, quotes-workflow 88, email-watch-worker 88. Readback confirmed all four match the local contract; other deployed files and JWT settings were preserved.

All 11 focused Deno signature tests pass, including repeated JSON/save validation after a field edit and percentage-width email output. Chrome verification used an unassigned `Column width verification` draft: keyboard resize to 48%, select another block, edit its label, autosave, reload and reopen retained 48%. Pointer resize to 33% followed by selecting another block retained 33%. No email sent or user signature published.
Pointer-resized 33% also survived a full reload and re-open in Chrome (AX slider value 33). Browser automation subsequently encountered CDP timeouts during test-draft cleanup.
Cleanup completed through the normal Archive action after the browser recovered; the temporary verification draft no longer appears in the library.
