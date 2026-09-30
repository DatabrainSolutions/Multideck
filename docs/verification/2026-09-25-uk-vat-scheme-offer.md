# UK VAT scheme offer — local verification

The UK product offer is Standard Accounting (default) and Cash Accounting (secondary, still gated until its full return controls are complete). The earlier Annual Accounting prototype is retired for **new** UK VAT registrations and periods. A new database trigger rejects direct service-role insertion and conversion to Annual for `gb-vat-mtd`, while permitting existing Annual registrations and periods to advance through their historical lifecycle. Other tax obligations and jurisdictions are unaffected by this offer guard.

The operator VAT UI and protected Edge registration routes already accept Standard only. The new database guard closes the privileged SQL path that still permitted Annual creation. Cash remains unavailable for a return; this migration does not enable it.

`node --test supabase/tests/uk-vat-retire-annual-postgres.test.mjs` passed against disposable PostgreSQL, including conversion attempts from another obligation and jurisdiction. The full staged tenant VAT migration chain and focused VAT foundation test passed locally. The serial data-access runner passed with 120 database and 9 contract checks; its Annual case ran before the final cross-jurisdiction guard refinement, which then passed the focused test. No tenant migration, historical Annual account review or authenticated operator browser journey has been performed.

Dexter chat and Watching for you remain explicitly unsupported for UK VAT scheme setup and change. The operator must use Finance; this migration creates no Dexter write or watch adapter.
