# Global finance and compliance boundary

## Product decision

Multideck is the canonical double-entry ledger for its operational finance
scope. It produces the trial balance, profit and loss, and balance sheet from
posted Multideck journals. An external accounting package is a permanent,
first-class mirror integration, not a prerequisite and not the accounting
source of truth.

This permits a tenant to operate without a third-party accounting provider
when its Multideck configuration, opening balances, controls and jurisdiction
pack are ready. It does **not** remove the legal entity's filing obligations,
the need for qualified local advice, audit requirements or authority software
approval. Until a filing channel is production-approved, the tenant must use
an approved filing product, portal, agent or accountant for that submission.

Payroll is deliberately excluded. The finance schema, obligations and screens
must not imply payroll calculation, employment-tax submission or payroll
compliance.

## Jurisdiction packs

The first supported English-speaking freight markets are:

| Pack | Accounting/reporting basis | Initial obligations | Current readiness |
| --- | --- | --- | --- |
| United Kingdom (`gb-v1`) | UK GAAP / IFRS as configured | VAT MTD, Corporation Tax and iXBRL computations, Companies House accounts | Foundation |
| United States (`us-v1`) | US GAAP | Federal corporation tax, state/local sales and use tax, financial statements | Foundation |
| Canada (`ca-v1`) | Canadian GAAP / IFRS as configured | GST/HST, T2 corporation return, provincial sales taxes | Foundation |
| Australia (`au-v1`) | Australian Accounting Standards | GST/BAS, company tax, applicable financial reporting | Foundation |

`foundation` means the obligation, authority, source, filing channel and known
production gate are modelled. It does not mean Multideck is certified to file.
Only a reviewed migration may move a capability through these statuses:

1. `foundation` — accounting data and obligation model exist.
2. `calculation_ready` — reviewed calculations and statutory data outputs pass
   the jurisdiction contract.
3. `sandbox_ready` — conformance/security testing has passed in the authority's
   test environment.
4. `production_ready` — the authority has granted production access and the
   tenant-safe filing lifecycle has passed end-to-end tests.

The UI must display the actual status and must never call a foundation pack
“compliant”, “certified” or “approved”.

## Authority production gates

- UK VAT MTD direct filing requires HMRC software production approval and the
  required fraud-prevention headers. Corporation Tax submissions require the
  relevant return plus iXBRL accounts and computations through approved
  software. Companies House software filing has its own presenter and format
  requirements. Sources: [HMRC VAT API](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/2.0), [Company Tax Returns](https://www.gov.uk/company-tax-returns), [Companies House filing changes](https://www.gov.uk/government/news/changes-to-filing-annual-accounts-at-companies-house).
- US corporate Modernized e-File requires the applicable IRS-authorised
  software/provider lifecycle. State and local sales/use taxes remain
  jurisdiction-specific. Source: [IRS corporate e-file](https://www.irs.gov/e-file-providers/form-1120-1120-s-1120-f-1120-h-e-file).
- Canada GST/HST supports CRA electronic channels, while T2 Corporation
  Internet Filing requires CRA-certified software and the applicable access or
  EFILE credentials. Sources: [CRA GST/HST filing](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/file-gst-hst-return/how-file.html), [CRA T2 Internet Filing](https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses/corporation-internet-filing.html).
- Australia direct SBR filing requires the digital service provider lifecycle,
  EVTE/conformance testing, the Operational Security Framework and production
  whitelisting. Sources: [ATO software developer onboarding](https://softwaredevelopers.ato.gov.au/getting_started), [ATO online services and SBR](https://www.ato.gov.au/online-services/businesses-and-organisations-online-services).

These gates are release blockers, not configuration hints. Provider or portal
fallback remains available until each direct channel is genuinely approved.

## Reporting and mirror equality

The Multideck report source is posted `FIN_PostingBatches` and
`FIN_PostingLines`, scoped to one legal entity and its base currency. The
posting invariant is exact double entry: every posted batch has equal debit
and credit totals.

P&L reports use credits minus debits across income, direct-cost, expense and
finance categories for the selected period. The balance sheet uses closing
asset, liability and equity balances plus cumulative current earnings through
the reporting date. A non-zero balance difference is an exception and must be
shown, never hidden by rounding or an invented suspense value.

Historical documents approved before native posting was introduced remain
`pending_migration`. Reports disclose their count until a controlled opening
balance or journal migration is approved; the system must never invent those
journals from incomplete historical data.

When an external mirror is connected, parity is evidence-based:

1. export the immutable Multideck source reference and idempotency key;
2. retain the external object reference and delivery outcome;
3. read back provider journal/trial-balance evidence where the adapter supports
   it;
4. compare account mappings, currency, debit/credit totals, P&L and balance
   sheet for the same legal entity and period;
5. retain every difference as a reconciliation issue until reviewed and
   resolved.

An adapter without journal or trial-balance readback may mirror documents, but
must not claim full financial-statement reconciliation.

## Dexter and Watching for you

Dexter has a tenant-safe finance domain for native financial summaries and
compliance obligations with source identifiers and report routes. It has no
generic SQL or ledger write access. High-impact posting, correction, filing and
compliance registration changes remain explicit allowlisted workflows.

Watching for you reacts to real finance and compliance database events. Rules
are deterministic and event-driven; ordinary evaluation performs no recurring
LLM calls. A meaningful registration-status change emits once with the legal
entity and obligation evidence, while unrelated or cross-tenant changes do not
fire.
