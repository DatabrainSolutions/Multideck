# Record-table exports

Implemented locally on 3 September 2026. This is a client-side, Multideck-owned operator workflow, not a deployment or a new backend permission.

## Shared behaviour

- The **Export records** icon is immediately beside the existing column-settings icon. Its accessible name, focus indicator and tooltip use the same wording.
- The centred dialog defaults to **Records on this page** and **All time**. This page is a snapshot of the current displayed page, after local sorting and pagination or the server's current page. Scrolling the table does not change its meaning.
- **All records** uses the same authorised reader, search, filters, ownership, facility and sort as its register, starting at offset zero. `collectExportPages` follows actual response lengths to the exact total, including lower server caps. Finance already loads all authorised pages and exports the complete filtered in-memory result.
- A changed count, duplicate/missing identifier, unfinished empty page, invalid total, failed detail read or cancellation cannot produce a partial CSV. Retry preserves scope, date and field choices. Closing cancels or discards remaining work and restores keyboard focus.
- **7D / 30D / 90D / All time / Custom** use the named field below. UTC calendar days include both boundaries and today. The existing Multideck date picker handles custom ranges. Undated records appear only with All time; invalid/incomplete ranges, no matching rows and no chosen fields disable download with an explanation.
- Selected-row export, field selection, hidden detail sections and existing specialised document downloads remain available. Full-detail requests run in batches of 25. Associated history arrays retain the existing detail API's limits; “all” describes top-level register records, not unlimited nested histories.
- Downloads are real UTF-8 CSV files with a BOM, quoted/escaped values and protection against spreadsheet formulas, including leading whitespace and nested arrays. No files are uploaded or shared. Standard browser download permissions still apply.
- No new database table, generic query endpoint, permission, tenant credential, backend mutation or Dexter capability was introduced. Every read uses the existing signed-in tenant service and its existing authorisation. Contact-card export has a separate read-only adapter so traversing export pages does not change the visible register/store.

## Supported registers and date fields

| Register | Date used | Complete-scope source |
| --- | --- | --- |
| CRM Leads | Lead created date | `listLeadsPage`, including Mine, facets, advanced filters and sort |
| CRM Companies / Accounts | Last contact date | `listAccountsPage`, same company, ownership and filter scope |
| CRM Contacts | Last contact date | `listContactsPage`, same consent, account, channel and search scope |
| CRM Opportunities / Deals, list view | Deal created date | `listDealsPage`, same pipeline, owner and status |
| CRM Phone calls | Call started date | `listPhoneCalls`, same date/time-zone and call facets; preview fallbacks cannot export |
| CRM Contact cards | Card created date | Existing authorised contact-card register RPC, same status/automation/search/sort |
| Legacy Customers, list view | Last contact date | `listCustomerDirectoryPage`, same Mine and status; the old success-only header action was removed |
| Quotes register | Quote created date | `listSalesQuotesPage`, same ownership/search/filter/sort |
| Bookings register | Departure date | `listLiveBookingsPage`, same operator, mode, direction, type, filters and sort |
| Recent generated documents | Document created date | `getGeneratedDocumentsPage`, same search/sort; preview mode is disabled |
| Rate contracts and tariffs | Valid from date | `getRatesPage`, same mode, tariff type, expiry, search and sort |
| Warehouse facilities / items / locations | Record created date | Existing paginated readers, same active status, facility and search |
| Warehouse orders / goods in / goods out | Order created date | Existing operational-order reader, same open/direction/status/facility/search scope |
| Warehouse customer purchase orders | Purchase order created date | Existing paginated purchase-order reader, same filters |
| Warehouse stock / objects | Last updated date | Corresponding authorised inventory/handling-unit page reader |
| Warehouse movements / exceptions | Movement posted / exception raised date | Corresponding page reader; exceptions retain the open-only scope |
| Finance documents / cash | Document / transaction date | Complete paginated finance reader, then the same ledger/search/status filter and local sort |
| Standalone and job-related Customs declaration registers | Declaration created date | Existing draft reader, same declaration kind/scope/status/destination/search/sort |
| Admin active and detailed logs | Event recorded date | `getAdminAudit`, same permitted view, source, dates, search and sort |

Companies, Contacts and Customers use last contact because their current register API does not expose a trustworthy creation date. Bookings uses the available departure date. These choices are explicit in the dialog; no creation dates are fabricated.

The reusable **Table Export** component is registered at `/components?component=table-export`, with source, usage, a working example-data preview, and links to the product routes. The existing Data Table and Date Pickers entries document the reuse.

## Intentional exceptions

| Table or surface | Reason it does not receive an all-record/date dialog |
| --- | --- |
| Customs screening controls, results/history and Download report actions | Separate compliance/report workflow, explicitly outside this export change. No report behaviour was modified. |
| Booking cargo/route lines, quote charges/carrier options/job exchange rates, purchase-order lines, finance document lines, Customs goods lines | Embedded editors or child/evidence lists, not independently dated record registers. Existing selected export is unchanged where enabled. |
| Quote detail recent/related quote tables; embedded Booking/Warehouse summary tables | Bounded parent-supplied slices without a complete authorised list adapter. They are not labelled as all records. |
| CRM marketing list members, broadcasts, marketing-email lists and form requests | Current data is fixtures or an empty scaffold, not a verified complete live register. Existing demo actions are not evidence of real export. |
| CRM engaged/unsubscribed lists, contact-card analytics/recent exchanges, AI usage/allowance tables | Analytics or recent subsets; exporting a subset as a complete source register would be misleading. |
| Report history/scheduled reports/generated-report previews | Existing report demonstration workflow, not a live general record source. Specialised downloads are untouched. |
| Rate source preview | An uploaded file preview, not a persisted record register. |
| Record-level document/audit workspaces and account operational summaries | Detail-bound inputs or report/snapshot data; no independently verified full-history reader at the component boundary. |
| Admin/Settings user and access-management tables | Security/account-administration workflow, not an operational register export. No additional identity/access-data export was introduced. |
| Finance P&L, balance sheet, trial balance and accrual/WIP runs | Period-specific financial reports and accounting approval workflows, not generic record registers. |
| Gallery-only examples and duplicate ` 2` source backups | Gallery export is explicitly example data; duplicate backups are not separate product routes. |

## Verification

- Client production build and TypeScript check pass locally. The build retains its existing large-chunk warning.
- 49 focused tests pass across the export, CSV, pagination, pinning and commercial-register paging suites. New checks cover multi-page collection beyond 100 rows, lower server caps, exact totals, changed/duplicate/partial responses, access failures, cancellation, sorting/slicing, UTC/DST boundaries, invalid dates and CSV injection/escaping.
- Live localhost verification: Leads exported 10 rows; Companies loaded/exported 20 rows with their detail sections; Quotes exported 25 rows; Bookings page 2 exported exactly the displayed 30 references in their displayed order; All records produced 75 unique booking rows. The page-2 references match positions 31–60 in the all-record file. A searched Bookings scope returned 32 records rather than the unfiltered 75.
- Leads presets and custom date-picker interaction were checked, including the zero-match disabled state. Bookings simulated offline export showed the real error and disabled download; restoring the connection and pressing Try again recovered the matching records.
- Keyboard Escape and return focus were verified. The dialog, scrollable body and persistent footer fit at a 390 × 844 viewport with the user's 125% browser zoom; no horizontal dialog overflow. Desktop dark-theme rendering was inspected.
- The registered gallery preview works: All + 7D selects exactly seven example records. Shift+F10 opens the row-selection menu, and selected-row export downloads exactly the chosen `CH-057` example record without replacing that workflow with register scope controls.
- The wider canonical-table suite still reports six existing non-DataTable implementations (account operations, finance line editor, finance accrual/WIP and finance reports, including two backup copies). Those source files were unchanged by this work; the test was not weakened or bypassed.
- An additional 27-test nearby-workflow sweep passed 23 checks and reported four unrelated existing/concurrent contract mismatches: two Admin navigation/gallery assertions still expect `/admin/ai-usage`; the finance compatibility assertion expects an older literal reader implementation; the transcript assertion expects a Jenkar-specific label. The finance API and phone-call component are unchanged by this task. These tests were not modified.

Not claimed: end-to-end verification of every adapter, light-theme/US-locale visual verification, cross-tenant or revoked-role live tests, a database-level point-in-time snapshot while other operators edit records, deployment, Git commit or push. The new code does not change backend access boundaries. Count/identity consistency checks detect common concurrent changes but do not provide transaction-level snapshot isolation.
