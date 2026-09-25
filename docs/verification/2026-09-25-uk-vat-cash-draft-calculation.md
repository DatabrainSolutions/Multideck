# UK Cash Accounting draft calculation

The draft calculation records an immutable revision for one Cash VAT period and one current, verified payment-event projection. Its Box 1, 4, 6 and 7 source lines retain individual payment-event IDs and four-decimal amounts, including multiple part payments against one invoice. The calculation records a projection fingerprint, registration terms and rounded draft boxes. Another source revision creates another calculation rather than editing a prior one.

The draft remains **unreconciled**. It cannot approve or submit a Cash return. Cash period creation and registration changes remain guarded off in the product. The required [Cash VAT control bridge](../architecture/uk-vat-cash-control-bridge.md) defines the ledger-to-payment identity and sign-off gates. Before enabling Cash periods, the workflow still needs:

- a complete cash-to-VAT-control bridge, including credits, refunds, excluded transactions and transitions;
- individual Cash event reconciliation dates and source locks, plus a review lock that checks all event lines and exceptions;
- proof that earlier Cash events were included in accepted returns, so an exit adjustment cannot count them again;
- HMRC obligation matching, sandbox end-to-end testing, filing receipt/readback and production approval.

The calculator and control-source inventory are service-only backend preparation APIs. Dexter chat and Watching for you deliberately do not expose them yet: there is no operator-approved Cash return lifecycle to inspect or watch, and presenting these previews as a return would mislead operators. Dexter must report Cash filing as unsupported until the full lifecycle is available.

The read-only Cash control source inventory now binds the invoice-balance snapshot and verified payment projection to the same recorded VAT period. A separate exact-decimal bridge preview checks the opening unpaid VAT plus invoice VAT posted in the period, less closing unpaid VAT, against period payment-event VAT for output and input tax separately. Date anomalies, credits, missing evidence, unsupported cash and arithmetic differences block the preview. It remains a source arithmetic check: it does not yet prove posted VAT-control journal balances, accepted earlier Cash returns or the two-person period lock, and never sets `returnReady` true.

Verification: `node --test supabase/tests/uk-vat-cash-calculation-event-lines-postgres.test.mjs supabase/tests/uk-vat-cash-control-bridge.test.mjs` passes. The PostgreSQL case exercises the actual migrations, period/projection binding, date anomalies, exact box lines, wrong-scheme and cross-entity denials, immutable records and denied direct service-role inserts. The arithmetic cases cover two part payments, a mixed-rate sale, a purchase, a one ten-thousandth mismatch and incomplete sources. The full data-access regression passed with these cases included (125 tests and 9 access contracts). This is local evidence only; no tenant migration or HMRC connection is claimed.
