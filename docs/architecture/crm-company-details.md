# Company record information architecture

The company record separates the relationship overview from record maintenance. Overview keeps the summary, owner, relationship, active shipments, upcoming meetings, contacts and history. Details holds compact, labelled editing groups. Notes and the existing specialist tabs remain available; switching between Overview, Details and Notes does not discard a draft or failed save.

## Storage and save boundaries

- Company name, company code, owner, segmentation, relationship, summary and service preferences use their existing CRM fields. Owner is shown read-only; this change does not introduce an ownership mutation.
- Registered name, registration number, website, LinkedIn company URL, employee count and source use optional keys under the existing CRM profile `MetadataJSON.companyProfile`. They are not a second organisation or contact record.
- Main email, phone and postal fields use the existing main-address payload. Purpose-specific addresses, including billing, remain canonical organisation addresses with their existing purposes, defaults and opening hours. Individual people remain Contacts.
- Quote defaults remain in `MetadataJSON.quoteTerms`. Updates merge the changed keys against the latest record inside the existing serial, version-checked save queue. Unknown metadata and neighbouring edits are retained.
- Finance (payment terms, currencies, credit and tax settings), Customs, Privacy and other specialist data keep their existing panels, data sources and permissions. Details does not copy restricted financial values into general CRM metadata.

No schema, RLS, tenant routing or production backend privilege changes are needed. The existing audited account mutation persists the added metadata keys. Failed inline edits retain the entered value and offer retry or cancellation.

## Dexter parity exception

The new `companyProfile` keys have no typed Dexter read/edit adapter or field-specific watcher yet. Dexter must state this limitation and direct the operator to Companies → company → Details. It must not substitute generic queries or write these values through an unrelated action. Existing approved company foundation/address actions and generic saved account update watches remain unchanged. Dedicated typed support and field-specific watch conditions require a separate capability change with its normal lifecycle and access tests.
