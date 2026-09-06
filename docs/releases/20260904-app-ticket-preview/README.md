# App ticket frontend preview, 4 September 2026

This reviewable patch contains only the Support ticket conversation UI, authenticated client API adapters, confirmed-submission refresh, and existing component gallery links. It is based on the exact version serving dev.multideck.app when inspected: `01c0ccbfc2f41b18e5e58d7871597f2afd11e8fb`.

The shared checkout was not checked out, reset or committed. A plain local temporary archive was used, not a Git worktree. Only four tracked files differ from that baseline and two implementation files are new. No dependencies or unrelated work were included.

- Preview: https://multideck-app-580gfojde-databrain-solutions.vercel.app
- Deployment: `dpl_HbQLCmmyWLqzDksou4iu95QEvtdd`, READY, no domain aliases.
- Build: TypeScript, Vite and Vercel prebuilt output passed.
- Actual served Settings asset returned HTTP 200 and matched the built artifact byte for byte; see manifest for its SHA256.
- Configuration is bound to dev.multideck.app and App project aqtwypsuijxlnvtxpuxe using its verified public anon key. No credentials are included in this release record.
- The exact-host guard remains in force. The temporary preview URL is artifact proof, not an authenticated production journey.

No permanent domain was repointed. Do not use a blanket production promotion: this Vercel project also owns other domains. If this reviewed candidate is published, only dev.multideck.app should be considered, after checking that its current release has not changed. Verify the permanent ticket URL after publication.

See ../../support-ticket-lifecycle-verification.md for real ticket, email, callback and local-browser proof. Main Cloud MFA is resolved and authenticated local ticket/detail/conversation reads are verified. Staff write lifecycle verification, a genuine reporter mailbox reply and permanent frontend publication remain outstanding.
