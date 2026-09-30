# CargoWise charge catalogue reconciliation — 25 September 2026

## Source and scope

Read-only BoxTop Helper gateway Data Explorer snapshot of CargoWise
`AccChargeCode` (417 records), `AccGLHeader` (468 records) and
`GlbDepartment` (92 records), plus 15 `AccTaxRate` definitions in the
[tax reference](../../supabase/operations/cargowise-tax-rates-20260925.json).
The resulting [manifest](../../supabase/operations/cargowise-charge-catalogue-20260925.json)
contains 266 distinct charge codes. Duplicate CargoWise records remain as
source variants under each code, including their active status, department
filters, rate calculator, tax-rate source ID and four GL account references.
No CargoWise or Multideck data was changed while collecting the snapshot.

The catalogue divides into 207 operational codes and 59 non-job/overhead
codes. Overhead codes are retained for reconciliation but deliberately held
inactive in the quote/booking catalogue. `AC_ShowOnQuotation` is true for all
417 source records, including salaries and expenses, so it cannot safely
decide which charges belong in operational selection.

| Category | Distinct codes |
| --- | ---: |
| Freight | 59 |
| Origin | 42 |
| Destination | 32 |
| Customs and clearance | 26 |
| Haulage and cartage | 23 |
| Warehouse | 18 |
| Storage | 6 |
| Insurance | 1 |
| Other, mostly overhead | 59 |

## Multideck mapping

- CargoWise department flags derive quote and booking direction/mode
  applicability. The original department IDs and inferred modules are also
  saved in the charge's source metadata. This preserves forwarding, customs,
  transport, warehouse, ships agency and general department evidence.
- CargoWise `ALL` expands to all 40 quote/booking combinations. Domestic and
  non-directional work maps to `other` direction; rail, post and non-transport
  map to `other` mode because Multideck's current matrix has no dedicated
  values for them. These mappings are visible in the manifest for review.
- Each code carries exact CargoWise revenue actual/WIP and cost
  actual/accrual nominal numbers. An active Multideck charge requires matching
  **existing** nominal groups in the selected legal entity, with those exact
  account pairs. The import does not create, alter or approximate nominal
  accounts or groups. It calls Multideck's existing validated mapping and
  catalogue functions and records catalogue/nominal audit entries.
- A code is held inactive if the source status, name, group or nominal
  references conflict, if it is overhead, a non-job/clearing or disbursement
  code requiring review, or if its exact legal-entity nominal groups do not
  exist. CargoWise tax-rate IDs resolve to source tax codes and countries;
  those and the rate calculators are preserved as evidence in the manifest and
  charge metadata. No Multideck tax code or pricing basis is guessed from them.

## Readiness and execution

Of 266 codes, 161 active operational codes pass the static source checks.
Against the connected **Databrain Test** entity's current 14 approved nominal
groups, 99 are active with exact cost/revenue mappings and 167 were
created inactive. The held set consists of 59 overhead, three source-inactive,
43 requiring source-setting review, and 62 needing additional exact nominal
groups. The user designated the demo data as the destination on 25 September
2026. The import was applied to the **MultiDeck** Supabase project
`aqtwypsuijxlnvtxpuxe`, legal entity `Databrain Test` / ID
`a8e98266-f5f4-4620-b45a-e3d991a38209`, with the authorised finance actor.
It did not target the separate Jenkar project.

The 62 otherwise eligible codes held for nominal groups use these CargoWise
account families: container `1050` (20), transport other `1330` (13), warehouse
services `1220` (8), warehouse handling `1210` (7), handling `1060` (4),
government services `1080` (4), cartage `1070` (3), and one each for distinct
freight `1010.30/40`, transport `1310`, and transport fuel `1320` pairs.
These are not mapped to a generic existing group. Finance can add exact
legal-entity account pairs and groups through its separate reviewed workflow.

`scripts/build-cargowise-charge-catalogue.py` regenerates the manifest from
the gateway snapshot and tax reference. `scripts/prepare-cargowise-charge-import.py` generates
a transaction for a named legal entity and actor. The default SQL ends in
`ROLLBACK`; `--apply` generates a committing transaction. The import checks
target identity, finance permission, categories, existing code collisions and
each nominal pair before writing. It rejects a company with multiple active
legal entities because the catalogue is shared and active codes would need
nominal mappings in every entity. Existing finance records and chart
definitions are not modified.

The preview transaction completed against Databrain Test and rolled back.
The charge count remained one before and after that preview. A wrong
legal-entity name was rejected with `22023`; an unauthorised actor was rejected
with `42501`. After the committed demo import, read-only checks found 267
catalogue codes: the original `MULTIDECK-DEMO` plus 266 CargoWise codes.
Of the CargoWise set, 99 were active with legal-entity nominal mappings and
167 inactive; all 266 had configured applicability (3,930 matrix rows).

The separate Multideck starter set is now in the tenant provisioning
reference data and in the idempotent
[`20260925_install_standard_charge_catalogue.sql`](../../supabase/operations/20260925_install_standard_charge_catalogue.sql)
operation for existing tenants. Seven `MD-` codes were installed in the demo
project and mapped through its existing seven cost/revenue nominal families.
The demo project now has 274 charge codes total: 266 CargoWise, seven
Multideck standard and the pre-existing `MULTIDECK-DEMO` fixture. A read-only
check found no active unmapped charge in the demo legal entity. The standard
codes have no assumed tax, price basis or provider mapping.
The live nominal resolver returned cost `1010.20.10` and revenue `1010.10.10`
for both imported `FRT` and standard `MD-FREIGHT` in Databrain Test.
Re-running the standard install operation left the catalogue at 274 codes,
including exactly seven standard codes.
The 23 existing demo quote lines were not backfilled: their saved descriptions
include generic test placeholders, and several named services could match
more than one charge code. Assigning them from text alone would change quote
meaning without reliable source identity.

The demo database does not yet expose
`multideck_resolve_operational_charge`, the newer quote/booking resolution
function in the local migration chain. Catalogue and nominal persistence were
verified live; the latest quote/booking resolution path was not confirmed on
that hosted project. The full local data-access regression also encountered
an unrelated in-progress finance release-manifest mismatch: it expects
`20260925102000_finance_multi_entity_dexter_drafts.sql`, which is not present
in the current checkout. The focused UK VAT staged-provisioning test passed
after the standard seed was kept out of the migration chain.
The separate connected `Multideck-jenkar` project currently has no
`cmp_LegalEntities` or charge catalogue schema, so it is not an executable
target for this import until its App database is provisioned.
