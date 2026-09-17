# Commercial invoice headers and dated HMRC estimates

Invoice header is tab 5 for imports and exports; Invoice items is tab 6. Each commercial invoice has a stable internal ID. Goods rows store that ID and display the current invoice number. Renaming, reordering, JSON persistence and reimport do not change the association. Linked invoices cannot be removed until their items are moved.

Each header owns its number, optional invoice date, amount/currency, official HMRC exchange rate, Incoterms/place, nature of transaction, gross/net weights, packages/type and separate letter of credit rate. The configurable DataTable provides column visibility, ordering, sizing and pinning. Declaration-level totals are derived from the headers. Different currencies are never added together; incompatible shared fields require reconciliation before the current provider submission can proceed. Header data and invoice references are also included in the declaration document dataset. A new provider-specific commercial-invoice XML group has not been invented; that contract remains to be confirmed.

## Estimate and submission dates

The initial estimate uses today's UK calendar date. Its date remains visible when reopening a saved estimate. Refresh HMRC rates obtains today's official rates; failed lookups retain the previous dated snapshot. Changing an invoice currency requests the applicable official rate. There is no recurring model call or background subscription.

Submission preparation refreshes against today's UK date, saves and validates the result, then shows the date and rates in the existing final confirmation. The server submission gate independently rechecks both the date and the official rates, preventing a stale snapshot or a rate changed after confirmation from being submitted. Nothing is filed during these checks. This is an estimate and rate workflow; it does not introduce a new duty/tax calculation engine.

The source is the public [HMRC Trade Tariff monthly exchange-rate API](https://www.trade-tariff.service.gov.uk/uk/api/exchange_rates/2026-9?filter%5Btype%5D=monthly), using published validity periods and foreign currency units per GBP. [HMRC guidance](https://www.gov.uk/guidance/customs-valuation/exchange-rates) allows exceptional changes within a month, so the same month alone does not guarantee the same rate. GBP needs no conversion. The invoice date and letter of credit rate never replace the HMRC rate.

## Existing drafts and extraction

Legacy imported invoice rows are recognised conservatively from their original import IDs and invoice references. Other customs previous-document references are not treated as invoices. One legacy header can receive existing declaration-level values; multiple headers retain an unallocated legacy summary for operator reconciliation. Unrecognised rows remain unlinked until the operator chooses an invoice.

Mistral schema version 4 extracts only explicitly present header fields. Missing fields remain blank; ordinary exchange rates are not extracted. Import invoice from Invoice header reviews and applies header details only, preserving every existing item and association. Import invoice from Invoice items retains the line approval, append and replace workflow. Recovery preserves the selected import target. A reviewed invoice number is required before applying the import. Matching invoice numbers reuse the existing stable ID and fill empty fields without overwriting reviewed values. Existing import recovery and field-population feedback are retained.

## Dexter exception

Individual header/link reads, edits and field conditions are explicitly unsupported in chat and Watching for you until the capability adapter exposes and validates these exact rows. Dexter's instructions direct operators to Invoice header/Invoice items and require preservation of the header data, date and item links during other edits. Existing declaration updatedAt watches remain supported; no rate-polling or extraction watch is added. Existing access, approval and audit boundaries remain unchanged.

## Verification and delivery boundary (14 September 2026)

- Client production build passed. Focused invoice, HMRC, guarantee and import-term tests passed (27 tests); OCR normalisation passed (8 tests). The PostgreSQL access regression suite passed earlier in this change, including Customs colleagues/child rows and cross-company denials.
- Earlier isolated Chrome checks confirmed seven headers, invoice renaming, item reassignment and persisted links in synthetic import/export drafts. The expanded fields and final dated-rate controls still need completed responsive/keyboard/browser verification: the Chrome browser connection disconnected and the native fallback did not expose the page content. Local Vite serves both the page and shared rate module successfully; that is not browser acceptance.
- Wider Dexter contract checks have five failures involving existing prompt/mode/watch/email assertions, including the old submission-approval wording. These assertions were not weakened. The broader OCR contract also has an unrelated purchase-order copy assertion failure.
- No functions or frontend were deployed in this change. Read-only inspection confirmed the intended MultiDeck backend's active OCR function is version 75 and does not yet return invoiceHeader. Expanded live extraction needs the reviewed OCR function deployment. The authoritative HMRC submission gate likewise requires deployment of icustoms-api and its shared modules. Coordinate deployments with the other customs edits in this shared checkout.
- No declaration was submitted. The real 54-item customer draft was not written by QA. Synthetic QA drafts remain explicitly labelled QA-INVOICE-HEADERS-IMPORT and QA-INVOICE-HEADERS-EXPORT for continuing verification.

## OCR header repair (14 September, follow-up)

Confirmed root cause: live OCR v75 used schema 3 and returned no invoiceHeader. The client incorrectly labelled the absent response fields as missing from the document. Deployed OCR v76 to the verified MultiDeck backend, preserving JWT checks and the three existing supporting modules byte-for-byte from the deployed function. Only the entrypoint prompt/merge and shared extraction schema/normalisation changed. The shared OCR module was bundled with esbuild to include only its small empty-header helper, excluding unrelated customs validation/rate work from the deployment.

A fresh source read confirmed v76 ACTIVE, commercial schema 4 and the header response. New uploads use the new cache version. Locally, old saved responses without a header now request a fresh upload instead of manufacturing an empty header, and nullable extracted fields say Not extracted rather than asserting that the document lacks the information. Eight OCR unit tests passed. The full OCR contract retains the unrelated purchase-order copy failure. Chrome briefly reconnected, but disconnected again before the fresh-document upload; a successful real invoice extraction is still unverified. No customer declaration was submitted or altered by this verification.

## Agreed-place UN/LOCODE conversion

The local import review and invoice table resolve exact unique place names or explicitly supplied codes against the existing UN/LOCODE directory. Ambiguous names remain source text for operator selection through the searchable agreed-place control. The original source wording is retained when a match is applied. Non-code agreed places are flagged by shared validation. Seventeen focused invoice tests and TypeScript passed; this follow-up has not deployed the submission API or completed browser verification.
