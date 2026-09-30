# Native bank matching: local verification — 25 September 2026

The statement import endpoint now calls a single database transaction that
imports the CSV and evaluates automatic matches. The `bank_match` approval
policy is scoped to a legal entity and defaults to review. When an authorised
finance administrator enables an eligible policy, the matcher accepts only one
unmatched statement line to one unmatched, approved and native-posted cash
transaction for the same bank, currency, transaction date and signed amount.
The cash entry must also have an equal posted bank nominal line in the same
accounting period. A variance allowance in the general approval policy does
not relax these bank and general ledger equalities.

Each automatic match records the initiating user, exact criteria, policy ID
and revision in `Audit_Events`; the match row identifies the method as
`automatic`. The run records every unmatched line and its review reason.
Ambiguous, absent, out-of-period or amount-different pairs remain unmatched
for the existing manual workflow. Statement verification still requires the
full independent bank control and an authorised, audited finance action.

Dexter chat can read the latest saved statement status and the manual and
automatic match counts. Watching for you receives a deterministic status event
when a statement becomes fully matched or returns to needing matches. Dexter
cannot initiate an import or match: those actions need CSV input and a live
finance review screen, so there is no safe bounded Dexter write proposal yet.

Local checks: the real PostgreSQL bank contract passed, including default-off
policy, configured automatic matching, access denial, audit evidence, Dexter
read/watch evidence and manual verification. The client production build
passed. The bank endpoint and policy migrations have not been deployed to the
development tenant or demonstrated through the connected browser yet.
