# UK Cash Accounting VAT control bridge

## Purpose and accounting boundary

The native ledger currently posts invoice VAT when an invoice is posted. A Cash Accounting VAT return recognises output tax when a customer pays and input tax when a supplier is paid. A Cash draft can therefore disagree with VAT control account movements without either amount being wrong. The difference must be explained by unpaid invoice VAT, supported exclusions and corrections before any Cash transaction receives a VAT reconciliation date.

Cash Accounting remains unavailable for registration and filing until this bridge, review and submission lifecycle is implemented and tested. The existing payment-event projection and draft calculation are source preparation only.

Entry also needs a reviewed eligibility decision. HMRC's published entry estimate is £1.35 million of taxable supplies, with a £1.6 million exit tolerance and limited exceptions. The product must measure the relevant taxable-supply window from posted evidence and flag compulsory exit; it must not infer eligibility from total revenue or let a user retrospectively change the scheme. [VAT Notice 731, sections 2–3](https://www.gov.uk/guidance/vat-cash-accounting-scheme-notice-731).

HMRC requires payment records to cross-refer to invoices and normal commercial evidence, and requires payments for supplies already accounted for under Standard Accounting to be excluded on entry to the scheme. [VAT Notice 731, sections 3.1 and 4.3](https://www.gov.uk/guidance/vat-cash-accounting-scheme-notice-731).

## Exact period identity

Maintain output VAT and recoverable input VAT as **separate signed streams** at four decimal places. For each stream and VAT period, the normal supported-invoice identity is:

```text
opening unpaid invoice VAT
+ VAT on eligible invoices first posted in the period
- closing unpaid invoice VAT
= VAT recognised from payments in the period
```

This is a control identity, not a replacement for payment-event evidence. The invoice side is taken from immutable VAT evidence tied to posted journal lines. The payment side is taken from immutable Cash event lines and their reviewed payment dates. Unpaid balances are calculated from the exact invoice-line amount less cumulative eligible payment portions, not from rounded VAT boxes or a mutable invoice outstanding field. Mixed-rate invoices are apportioned by line. The final payment receives the rounding remainder so cumulative recognised VAT equals the reviewed invoice VAT.

The control must expose, as separate signed and source-linked lines, every item outside the normal identity: posted credit or debit notes, refunds, overpayments, bad-debt relief, prior-return corrections, historic opening balances, pre-entry Standard-accounted invoices, and the immediate or six-month Cash exit option. A missing treatment, unsupported currency conversion, tax code change, posted source without VAT evidence, unexplained nominal, or incomplete prior Cash return makes the bridge **blocked**. It must never be reported as a zero difference.

The bridge also compares the invoice VAT side to all relevant posted VAT-control journal lines. Each accounting month intersecting the VAT period needs its own complete source inventory and current two-person VAT control approval. A monthly approval proves the source ledger; the VAT-period bridge proves the cash timing movement. Neither substitutes for the other.

## Return and lock rules

1. Bind the Cash calculation to one effective Cash registration, one exact VAT period and one verified payment-event projection. The immutable draft stores every event-to-box line and exact source fingerprint.
2. Recompute the bridge within the sign-off transaction. Match every period payment event to one current reviewed source, its invoice evidence and its native posted cash allocation. Include a complete source inventory, not a sample.
3. Prove the opening balance from scheme entry and accepted earlier Cash returns. A projection or draft is not evidence that HMRC accepted a payment event. Bind event IDs to the exact calculation and accepted submission attempt before treating them as previously filed.
4. Require a matched four-decimal control for output and input streams, no unresolved exceptions, a current registration and an open HMRC obligation. The reviewer records a reason and the server-recorded reconciliation timestamp for each event. A second authorised operator approves the period lock.
5. After reconciliation, prevent changes to the payment-date review, VAT treatment and linked invoice/payment sources. Corrections create new reviewed events, never edit signed history. If a draft source changes before sign-off, require a new draft and fingerprint.
6. The final Cash period must handle the chosen HMRC exit option without double counting earlier Cash events. Under Notice 731, the six-month option has eligibility limits and must be recorded separately from post-exit Standard supplies. [VAT Notice 731, sections 6.4–6.5](https://www.gov.uk/guidance/vat-cash-accounting-scheme-notice-731).

## Implementation and verification gate

The read-only source inventory and exact-decimal arithmetic preview now bind invoice balances and payment events to one Cash period and report opening/additions/closing/payment VAT separately. They block known date anomalies, credits, stale payment reviews, missing event coverage and arithmetic differences. The source inventory checks each inventoried invoice VAT line against its posted journal tax line, tax nominal and legal entity, and detects tax postings on those invoices without an inventoried source line. It now also requires current, separately approved accounting VAT controls for every accounting period covering the VAT period, with no uncovered or overlapping days. The monthly approval inventories posted VAT-control and tax-labelled lines; this Cash bridge still needs a complete account-balance and timing-difference proof before it can support sign-off. It does **not** yet prove prior accepted Cash returns.

Next, prove the complete VAT-control account balance and its Cash timing differences with a deterministic whole-period digest. Add real PostgreSQL cases for credits/refunds, an accepted pre-entry Standard invoice, altered allocation/review and unsupported postings. Then add immutable reconciliation records and triggers. The review lock must recheck the bridge digest and monthly approval digests inside its transaction and refuse incomplete or stale evidence. Only after this should Cash registration, period setup and the HMRC filing path be enabled.

The model remains jurisdiction-neutral at the indirect-tax record boundary. UK Cash rules live in UK-named functions and rule versions; another country must supply its own tax-point, scheme, box and control rules rather than inheriting UK assumptions.
