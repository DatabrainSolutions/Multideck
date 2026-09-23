# Manual follow-ups in task conversations

Manual messages and retries in a named task-agent conversation now use the normal Dexter chat request, in the existing conversation. A background assignment's working status no longer disables the composer. The backend's blanket rejection of manual messages in assigned conversations has been removed; authenticated conversation preparation and existing action approvals still apply. Background assignment controls and lifecycle remain independent.

Background result refreshes wait while a manual reply streams and discard cancelled or stale-navigation responses. Three executable tests cover that race.

This is a chat transport correction, with no new data domain, write action or watch capability. Watching for you and background task execution retain their existing deterministic event and approval behaviour.

Validation:

- Client production build passed.
- Conversation switching and stream-failure tests: 8 passed.
- Background result refresh tests: 3 passed.
- Data access regression runner: 83 database/domain checks plus 10 policy contracts passed.
- Durable background task PostgreSQL lifecycle passed, including owner isolation, leases, schedules, event handling and completion.
- Broader Dexter contract suite: 41 passed, 5 failed (customs filing, watch compilation, Home email subjects, approval presentation, provider tool scope). Those areas were not modified for this fix.
- Two client send-lifecycle source contracts failed before the edit: timeout/recovery expectations and composer markup expectations.

Chrome on localhost opened Tasks → Zyven's conversation, enabled Send for a read-only follow-up, and entered the normal optimistic chat flow. The connected deployed backend rejected it with its old background-queue restriction; the draft was cleared afterwards. The backend fix is local only and requires deployment before end-to-end confirmation. No live working-agent concurrency or successful follow-up persistence was verified.
