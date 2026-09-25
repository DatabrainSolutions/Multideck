# UK Cash Accounting draft calculation

The draft calculation records an immutable revision for one Cash VAT period and one current, verified payment-event projection. Its Box 1, 4, 6 and 7 source lines retain individual payment-event IDs and four-decimal amounts, including multiple part payments against one invoice. The calculation records a projection fingerprint, registration terms and rounded draft boxes. Another source revision creates another calculation rather than editing a prior one.

The draft remains **unreconciled**. It cannot approve or submit a Cash return. Cash period creation and registration changes remain guarded off in the product. The required [Cash VAT control bridge](../architecture/uk-vat-cash-control-bridge.md) defines the ledger-to-payment identity and sign-off gates. Before enabling Cash periods, the workflow still needs:

- a complete cash-to-VAT-control bridge, including credits, refunds, excluded transactions and transitions;
- individual Cash event reconciliation dates and source locks, plus a review lock that checks all event lines and exceptions;
- proof that earlier Cash events were included in accepted returns, so an exit adjustment cannot count them again;
- HMRC obligation matching, sandbox end-to-end testing, filing receipt/readback and production approval.

The calculator is a service-only backend preparation API. Dexter chat and Watching for you deliberately do not expose it yet: there is no operator-approved Cash return lifecycle to inspect or watch, and presenting this draft as a return would mislead operators. Dexter must report Cash filing as unsupported until the full lifecycle is available.

Verification: `node --test supabase/tests/uk-vat-cash-calculation-event-lines-postgres.test.mjs` passed against PostgreSQL. It exercises the actual migrations, two separate payment events, exact box lines, wrong-scheme and cross-entity denials, immutable records and denied direct service-role inserts. The data-access regression also passed (122 database tests and 9 contract checks); the focused Cash test is now included in its runner. This is local evidence only; no tenant migration or HMRC connection is claimed.
