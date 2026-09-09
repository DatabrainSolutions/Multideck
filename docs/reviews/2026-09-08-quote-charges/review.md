# Quote charges review — 8 September 2026

Scope: read-only review of localhost Quote JQ20023 in the existing Chrome session, plus the active component and page adapter. No Quote edits, calculator saves, database changes, commits, pushes or deployments performed. Screenshots are exact captures of this review.

## Findings

1. **Enter and review charges — connected, but cluttered.** The active workspace supports supplier selection, cost/sell amounts and currencies, manual exchange rates, base amounts and line profit. The observed GBP 5,000 cost / GBP 6,500 sell produces GBP 1,500 profit and 23.1% selling margin correctly. The 15-column table overflows horizontally even at 1920px. Selected-line details duplicate fields beneath it, while the empty Job ROE grid competes with the record header. Overall Quote totals are not evident in the reviewed screen.
2. **Calculate a charge — incomplete; highest-priority concern.** Opening the calculator displayed 820kg actual and 240kg volumetric weight. Source confirms fixed starting values (820kg; 120 × 80 × 75cm; two pieces; divisor 6000), not this Quote's Goods. Applying stores calculation mode and result quantity, not the complete input breakdown. Cost/sell calculations do not multiply by that quantity. It is a helper, not an integrated cargo-based rating engine. Closed without applying.
3. **Handle currencies — partly connected, unclear health.** The screen displayed “Rates unavailable” despite the visible GBP-to-GBP line having exchange rate 1. The summary checks all supplied rates for the base currency, rather than only currencies used by charge lines. Manual rates are supported. The page also contains a development-only reference-rate fallback labelled “Demo reference set – not live”; local foreign-currency behaviour can therefore differ from hosted behaviour. No claim that the observed GBP line used that fallback, or that the finance service's failure cause was diagnosed.
4. **Enter amounts — validation risk.** Source converts blank or nonnumeric amount text to zero on blur rather than presenting an explicit correction. Not exercised against the user's saved Quote.
5. **Save and customer presentation — existing wiring, not fully verified here.** Rows connect to the existing Quote change/save mapping, including supplier, monetary values, rates and calculation quantity. Customer is derived from the Quote customer, not an independently persisted per-line customer. Save mapping sets showToCustomer true for every line; the active screen offers no corresponding visibility choice. This does not establish that internal cost information appears on a customer PDF. Save/reload, document output and Booking transfer were not exercised in this review.
6. **Compare supplier/service options — unresolved product dependency.** The reviewed workspace presents charge lines, not clearly separated alternative service quotations. Keep that work held until the intended supplier/carrier process is confirmed.

## Evidence

- [Charges screen](01-charges.jpg)
- [Calculator opened without saving](02-calculator.jpg)
- `multideck.client/src/components/multideck/unified-quote-charges-workspace.tsx`: amount parsing, calculator defaults/application, base calculations, rate summary and layout.
- `multideck.client/src/pages/quotes-page.tsx`: currency/party adapters, development rate fallback and Quote save mapping.
- `node --test multideck.client/tests/unified-quote-charges-currency-contract.test.mjs supabase/tests/quote-charge-parties.test.mjs`: 9 passed. These are targeted contract tests, not proof of browser persistence or full financial correctness.

## Next proposed microstep

Agree the basic manual-charge workflow and the information needed at a glance: description, supplier, buy amount/currency, sell amount/currency, line profit and whole-Quote totals. Preserve working connections. Before relying on the calculator, replace its fixed starting values with an explicitly agreed input/quantity workflow. Do not implement supplier alternatives yet.

## Limitations

No mobile/reflow, complete keyboard traversal, screen-reader, backend persistence, customer PDF, Booking conversion or live deployment verification. Small text and horizontal overflow are accessibility/usability risks, not a compliance determination. This audit used the product-audit skill to capture the actual screen and separate observed behaviour from source-only findings.
