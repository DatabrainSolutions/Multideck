# UK VAT Cash Accounting exit arithmetic — local verification

HMRC VAT Notice 731 section 6.4 allows outstanding VAT from supplies made while using Cash Accounting to be brought into account in the final Cash period, or (where eligible) over a further six months. The local `calculateUkCashExitOutstanding` helper computes the **immediate option's unpaid fraction** for one reviewed GBP invoice. It apportions from cumulative cash paid through exit and returns line-level net and VAT, candidate Box 1/4/6/7 source amounts, the unpaid gross and any four-decimal apportionment remainder.

This helper creates no cash event, VAT evidence, posting, period review, scheme transition or return. A caller still needs to prove the final Cash period, complete dated payment history, invoice and tax-treatment provenance, prior filing/transition exclusions, source-to-ledger reconciliation and eligibility for the chosen exit method. The six-month option, compulsory exits and re-entry require separate workflows. Cash Accounting remains unavailable as a filing scheme.

Verification: `node --test supabase/tests/uk-vat-cash-exit.test.mjs supabase/tests/uk-vat-cash-allocation.test.mjs` passed 7 tests locally. The fixture covers a half-paid sale, a fully paid invoice, purchase recoverability, a disclosed £0.0001 apportionment remainder and invalid source rejection. `git diff --check` passed for the changed helper. `deno check` could not run because Deno is not installed in this shell.

Source: [HMRC Cash Accounting Scheme, VAT Notice 731, section 6](https://www.gov.uk/guidance/vat-cash-accounting-scheme-notice-731).
