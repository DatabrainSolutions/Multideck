# Universal double-entry posting guard

The database now validates every committed posted FIN_PostingBatches entry,
regardless of source (manual journal, invoice, cash, accrual/WIP or reversal).
Drafts can remain incomplete. Posted entries require at least two lines,
a nominal account on each line, one positive debit or credit per line,
equal positive debit/credit totals and matching batch control totals.
Checks are deferred until commit so existing atomic posting routines can
create their batch before their lines. Line inserts, edits, moves and deletes
also trigger validation; parent writes serialise competing changes.

Migration 20260921072027 and the provisioning snapshot contain the same guard.
The migration refuses existing invalid posted entries; it never manufactures
balancing entries or alters historical amounts. Review and authorised correction
are required if its preflight fails.

Dexter parity: this introduces no new action, permission, read or watch.
Existing journal chat reads and deterministic watches are unchanged. All existing
posting workflows inherit the same transaction rejection, and their audit/watch
events roll back with a rejected posting. Journal creation remains unsupported
through chat as documented in the GL implementation.

Local verification: real PostgreSQL tests exercise valid multi-line entries,
fractional amounts, drafts, commit rejection, missing sides/accounts, invalid
amounts, mismatched header totals, line mutations and migration preflight.
The existing GL lifecycle test also runs with this guard installed, including
permission boundaries, period locks, rollback and deterministic Dexter watches.
No tenant database migration or linked accounts-system delivery was performed.
