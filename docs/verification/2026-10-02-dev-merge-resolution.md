# Dev merge resolution — 2 October 2026

Merged local `4b07b1aa` (quote and finance updates) with incoming `d14bf6af` on dev.

## Resolution

- Retained the quote Includes checkboxes, hidden Department/Branch, supplier-only options table, cargo row handles/removal/weights, removed expanded weight section and wider country controls.
- Retained incoming route-leg and recurrence editing, saved-version charge handling, single-choice charge creation and legacy cargo projection.
- Kept dedicated customer/supplier Finance registers and their contextual creation actions, while retaining CRM company views and filters. Supplier financial reads retain payables permission and separately gated integration access; incoming independent reads remain parallel.
- Combined finance approval and customer statement guidance for Dexter, component gallery links and both finance migration lists.
- Registered the optional-goods migration explicitly in the operational release list. Corrected a date-dependent CRM fixture to verify the superseded task identity rather than assuming the replacement could not share that date.
- Replaced an obsolete exact-source charge-creation assertion with execution of the real row factory covering blank supplier, explicitly selected supplier, single charge and multiple choices.

## Validation

- Production build passed (existing large-chunk warning).
- PostgreSQL data-access runner: 149 tests and 9 contracts passed; no skips.
- Dexter regression: 344 passed.
- Cargo/charge mapping tests: 23 passed.
- Local Chrome: JQ20030 loads with requested controls; /suppliers opens Finance / Supplier accounts and correctly withholds financial data without payables permission.
- Additional CRM account/contact source-contract suite: eight failures reproduced against incoming MERGE_HEAD as well as merged code. These pre-existing literal-source assertions remain unresolved; they were not weakened.
- No tenant migration, backend deployment or production release was performed.
