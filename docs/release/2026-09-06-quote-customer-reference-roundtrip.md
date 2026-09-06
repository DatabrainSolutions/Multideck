# Customer enquiry reference round-trip

## Observed defect

The deployed development editor created synthetic draft `JQ20022` (Quote ID `ce9e3e2d-1db5-40f4-81e1-c76dba657d37`). Its customer reference `QA-FREIGHT-20260906-NOT-A-SHIPMENT` was persisted in the current version snapshot, but reloading displayed the master reference `JQ20022` instead. No email, submission, acceptance or Booking mutation was performed.

Two synthetic cargo lines survived saving and reloading with stable IDs and exact values: 2 crates / 100.10 kg / 1.000001 CBM and 3 cartons / 0.20 kg / 0.000002 CBM. Repeated autosaves retained one unsubmitted version, ID `44e4b47b-b9b3-42dd-ad76-30df16a4db66`.

## Correction and boundaries

- The authorised Quote workspace reads the customer's enquiry reference from the current version snapshot, independently of the immutable master-reference header column. Explicit blank/null means cleared. Missing legacy snapshot fields retain existing fallback behaviour; ambiguous current versions or invalid saved field types fail visibly.
- The client mapping preserves an explicit blank rather than replacing it with the master reference. Master numbering, aliases, Booking references, submitted snapshots and database schema are unchanged.
- Temporary Dexter exception: the legacy `quotes.customerReference` domain field still describes the master Quote reference. The prompt explicitly prohibits claiming enquiry-reference reads, edits or watches through this domain and directs users to Quote Details. A dedicated adapter remains outstanding; this exception is not full parity or completion of the broader goal.

## Local evidence

22 focused tests passed (customer-reference helper, real editor load/save mapping, structured cargo and immutable submitted versions), zero skipped. Deno checks passed for both complete `quotes-workflow` and `agent-dexter` import graphs. The root deployment build passed; the existing large-chunk warning remains.

Before release, development functions were `quotes-workflow` v74 and `agent-dexter` v157, both JWT-verified. Deployment and hosted corrected reload evidence must be recorded below before claiming the fix live.

## Development release and hosted proof

- Fetched and merged the team's four new `origin/dev` commits through `e698be2`, preserving finance/accounts changes and their duplicate-file cleanup. The combined Deno check caught an undefined `FINANCE_EDGE_ACTIONS` left in the merged Dexter handler. Restored the explicit set of the three existing finance actions, without altering approval or permission rules; 91 finance/Dexter checks pass.
- Released source commit `45d3fe913db3a343324f5bdc719a47a1d0a8060b`: development `quotes-workflow` v75 and `agent-dexter` v158. Downloaded and SHA-256-compared all 32 bundled source-file instances to the checkout. Both retain JWT verification and return 401 to unauthenticated requests. No database migration or finance function deployment was performed.
- Fast-forwarded `origin/dev` to the same commit. Vercel `dpl_9aurZcwHdL6RbyJm8JeWeTSWBfo2` is READY; approved host `dev.multideck.app` and its immutable deployment URL serve the same `/assets/app-BHnsOjsQ.js`. Existing Vercel setup was not changed.
- Reloading the existing test Quote restored its saved enquiry reference, with no data repair required. Keyboard select-all/delete then autosaved an explicit empty string; database read and hard-reload UI both confirmed it remained empty. Master `JQ20022` and draft version ID remained unchanged. Restored `QA-FREIGHT-20260906-NOT-A-SHIPMENT` through the editor afterwards.
- The browser automation's `fill("")` did not change this controlled input; a normal keyboard clear did. This is not recorded as an application save defect. The prior unrelated animation AbortError remains in the tab log.

## Additional ownership display correction

Hosted Overview incorrectly showed demo person `AM1 - Maya Stone` when the same Quote's top bar correctly showed Unassigned. Removed only the missing-owner fallback, retaining explicitly recorded names and legacy-code formatting. Empty operations ownership also displays Unassigned. Local focused tests now total 23 passing, and the build passes.

Follow-up client commit `e167329ea5c1f4f41bf849d46bd8d1998c93587b` was fast-forwarded to `origin/dev`. Vercel deployment `dpl_DvT2SefCSNGztsSs2ehyE1yDkTMy` is READY. Hard reload and the rendered Overview on `dev.multideck.app/quotes/jq20022` confirm both Quote owner and Operations owner now show Unassigned. This change does not assign or mutate an owner.

## Additional hosted draft checks

- Saved Sea/FCL, requested one 40GP and one 20GP through the actual editor. Scoped database reads confirm two separate requests with quantity 1 each. Both requests and both original cargo lines survive hard reload.
- Selected Air from the saved Sea Quote. The review dialog explicitly describes retaining routing/cargo/equipment and leaving submitted versions/Bookings/documents unchanged. Chose Keep current mode; the screen and saved snapshot remained Sea/FCL with both requests. This proves cancellation, not the confirmed mode-change lifecycle.
- Selected United Kingdom / Felixstowe (`GBFXT`) and Netherlands / Rotterdam (`NLRTM`) using official location options. The UK branch's automatic direction became Export. Database and hard-reload UI agree. Blank/partial routes previously displayed Cross trade; that separate incomplete-route presentation remains to review, not silently certified here.
- The single draft version remains `44e4b47b-b9b3-42dd-ad76-30df16a4db66`, unsubmitted. Customer test label restored. Cargo IDs `05c3aa23-eb93-4a88-bd90-9414e29e34de` and `2561514a-4620-4074-bd78-d997a35ac5a6` and exact quantities/measurements remain intact. No email, customer response, acceptance or Booking mutation occurred.

The full send/response/PDF/Booking-revision lifecycle and deeper all-mode/Dexter gates remain open; these round-trip fixes do not certify the complete goal.
