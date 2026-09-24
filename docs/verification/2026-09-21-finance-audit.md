# Finance audit correction

Confirmed the local client's MultiDeck database was missing the journal workflow
record type. Applied only the idempotent audit registration migration to project
aqtwypsuijxlnvtxpuxe and verified a journal audit insert inside a rolled-back
transaction. No customer journal was saved or posted by this verification.

The separate snapshot migration remains local. It supplements existing
actor-attributed lifecycle events with before/after journal, posting-batch and
posting-line evidence, excluding delivery payloads and tokens. Evidence rolls
back with failed transactions. It does not reconstruct missing historical events.

The GL PostgreSQL lifecycle fixture now includes the real audit record-type
foreign key. Journal save/post, permission and Dexter lifecycle checks pass.
Full access regression: 33 passed, 2 existing failures in accounting-party and
webhook receipt baseline contracts. Wider audit deployment is held pending these
release blockers and verification across native finance posting workflows.

Dexter: no new read/write capability or permission is introduced. Existing journal
chat and deterministic watches retain their access controls. Raw audit snapshots
are not a new Dexter domain; exposing their detailed financial history requires
an explicitly authorised audit reader and is unsupported in this change.
