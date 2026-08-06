# Holding-time fee model — decisions required

Holding-time fees affect customer billing, so the mobile app must not create local-only parameters
or guess how overlapping rules are applied. The eventual backend belongs in the tenant's operational
Supabase project and must expose the same audited capability to the web Warehouse workspace, Dexter,
and event-driven Watching for you.

## Proposed rule dimensions

- Customer organisation
- Warehouse facility
- Direction: IN, OUT, or both
- Basis: duration, transaction, or both
- Grace period
- Duration band and unit: hours, days, weeks
- Rate, currency, tax treatment, and rounding
- Effective-from and effective-to dates
- Active/draft status and approval metadata

## Product decisions needed

1. Does “per length” mean a time band, such as days 1–7 and 8–14, or a physical item dimension?
2. Is duration charged per pallet, handling unit, SKU quantity, weight, volume, or receipt line?
3. For transaction pricing, does each IN/OUT order count once or does every line/pallet movement count?
4. When customer and warehouse rules overlap, does the customer rule replace or add to the warehouse default?
5. Which event starts and stops holding time: receipt, put-away, allocation, picking, or dispatch?
6. Are weekends/holidays counted, and which warehouse timezone determines each charge day?
7. Do generated charges require approval before entering finance, and how are reversals handled?

After these are answered, implement an incremental migration, an allowlisted Warehouse Edge Function
route, deterministic charge calculation, immutable calculation evidence, Dexter read/write parity,
event-driven watch notifications, and cross-tenant/permission lifecycle tests.
