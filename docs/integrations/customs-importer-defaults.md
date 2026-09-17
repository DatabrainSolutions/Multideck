# Importer office and payment defaults

Local implementation, 14 September 2026. No provider declaration was submitted and no backend deployment was performed for this change.

## Operator workflow

- Every company already has the Customs tab, independently of its company roles. This change extends that existing tab and existing `operations.customs` storage; it does not introduce tenant Admin preferences or another account store.
- Store the complete registered company EORI, optional `addressEoris` overrides keyed by the company's actual address IDs, and the duty/VAT method defaults.
- The importer selector snapshots the company, address ID, registered EORI and structured address. Changing office replaces the address and EORI together. Loading an existing draft does not repopulate or animate its saved data.
- Address presentation uses line breaks; editing remains structured so arbitrary text is not guessed back into postal fields. EORI is shown at the lower right. Company-linked EORIs are edited on the company record.
- Defaults fill empty A-series customs duty and B00 VAT payment methods across existing tax rows, including invoice-imported rows and newly entered tax types. They do not invent tax types, duty amounts or quantities for empty goods lines. Reapplication preserves manual values and same-type documents and does not duplicate references.
- For E/R customs duty, the configured C505/C506 document IDs are added to each applicable item, CGU/DPO holder EORIs once at the header, and the deferment account at the header. VAT-only deferment does not add duty authorisations. Missing required dependencies block validation, but drafts remain saveable.
- One duty/VAT default set per company is supported here. Selecting among multiple payer-account profiles, guarantee exemptions and automatic guarantee details are not implemented. Existing entries must be reviewed when changing importer or payer.

## Provider evidence

Verified against the iCustoms documentation at <https://ihub-tdr.customscloud.co/api/documentation>, CDS Create a draft, Import All Tags Payload:

| Value | XML location |
| --- | --- |
| Importer EORI | `GoodsShipment/Importer/ID` |
| Deferment accounts | Header `AdditionalDocument`, CategoryCode 1 or 2, TypeCode DAN |
| CGU / DPO holders | Repeating header `AuthorisationHolder`, ID plus CategoryCode |
| C505 / C506 | Item `AdditionalDocument`, CategoryCode C, TypeCode 505 or 506 |
| Import payment method | Item `Commodity/DutyTaxFee/Payment/MethodCode` |

The import payment mapper now follows that nested Payment structure; the existing export mapping is unchanged. Provider acceptance remains unverified until the Edge Function is deployed and the operator approves a sandbox test.

HMRC's [Group 4 guidance](https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-4-valuation-information-and-taxes) distinguishes duty deferment from other taxes. Stored identifiers are not proof of registration, account authority or applicability. This is not a complete CDS rules engine.

## Access, persistence and Dexter

Company updates retain the existing Customers.Write route, company-bound RPC, expected-version conflict handling, audit and deterministic customs-change signal. The new fields stay in the existing customs JSON. Client and customer API validate identifier shapes, without attempting registry verification. Existing unrelated account edits do not trigger validation of unchanged legacy customs profiles.

Existing account reads expose the customs profile, and account customs-change watches cover the changed JSON as before. New field-specific watches and the convenience action that selects an importer and applies its defaults are explicitly unsupported in Dexter; its customs prompt directs the operator to the company Customs tab and declaration Parties tab. No new generic write or watch permission is introduced.

## Copy and motion audit

Removed the party-section subtitle that repeated the visible groups, and the generic company Customs introduction. Persistent labels, required markers, missing-source feedback and payment consequences remain.

`multideck.client/src/components/multideck/auto-populated-field.tsx:16` — [timing-under-300ms] The shared booking reveal uses a 300ms segment plus up to 780ms spread. Retained deliberately because the request explicitly requires the same booking animation; the shared primitive was not changed. Initial loads and reduced-motion mode do not animate.

| Rule | Count | Severity |
| --- | --- | --- |
| timing-under-300ms | 1 | HIGH — existing, explicitly retained |

## Verification boundary

- Twenty-item bulk fill, idempotence, manual overrides, VAT-only behaviour, office EORI fallback and structured address tests pass.
- Shared animation event/reduced-motion tests and existing organisation/required-field contracts pass.
- TypeScript and the local production build pass; existing large-bundle warnings remain.
- Real PostgreSQL access regression suite passes. This does not prove live company-profile save/reload or provider acceptance.
- Signed-in desktop/mobile/keyboard browser verification and live save/reload remain blocked by the Chrome localhost sign-in screen. No customer data or credentials were entered for testing.
