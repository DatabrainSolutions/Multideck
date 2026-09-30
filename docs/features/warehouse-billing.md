# Warehouse billing

Warehouse charges apply the existing rate cards (Admin → Warehouse → Default pricing, and each CRM account's Warehouse tab) to real warehouse events. They are calculated for review, not posted.

## Settings (Admin → Warehouse → Billing settings, `/warehouse/billing`)

- **Time zone** and **daily cut-off**. Stock on hand at the cut-off is charged as one day of storage for that day. The cut-off follows the time zone, including clock changes.
- **Billing cycle**: weekly (starting on a chosen weekday) or monthly (starting on day 1–28).
- Until a workspace saves its own settings, the defaults are Europe/London, 23:59 and calendar months.
- Settings are versioned (stale saves are refused) and every change is audited. `Warehouse.Read` can view them; `Warehouse.Write` can change them.

## When charging starts

Charges come only from physical events:

| Stage | Event | Quantity |
|---|---|---|
| Goods in | Each receipt, on its received date | Pallets (distinct pallet handling units), units, kg (units × item gross weight), m³ (units × item dimensions) or fixed |
| Goods out | Each dispatch, on its dispatched date | The same measures, from the dispatched stock |
| Storage | Each recorded daily stock count | Stock on hand at the cut-off, per the rate's measure |

Expected receipts, warehouse orders, customer purchase orders and invoices never create charges. Storage exists only for stock that was booked in and on hand at a cut-off.

## Stock counts

A scheduled job (`multideck-warehouse-stock-records`, every ten minutes) records every stock balance once each workspace's cut-off passes. A missed count is caught up only within six hours; after that the day stays unrecorded and is **not charged**, and the statement shows the gap. Pallets are counted only from pallet handling units; they are never estimated from units.

## Rates

- Customer rates replace default rates with the same charge code on each date.
- Nightly and "per started 24 hours" storage charge every recorded day. Weekly storage charges the peak quantity in each started seven-day block of the period.
- Free periods: a stock line is free for its first N days after it was first received.
- Minimums apply per receipt or dispatch, and once per storage charge per period, never when the quantity is zero.
- Hourly storage and additional-handling (transaction) rates are not calculated automatically; the statement says so.
- Amounts are net of tax and totalled per currency.

## Charges (`/warehouse/charges`)

Choose a customer and move between billing periods. Each line shows the charge, the event reference, the measured quantity, the rate, any minimum and the amount, followed by warnings to check before invoicing. Access follows the warehouse scope: facilities of the offices the user is assigned to, within their company.

## Dexter

Chat reads settings and a customer's current and previous period through the `warehouse_charges` domain, using the same functions and access checks. Changing settings, approving charges and watching charges are unsupported (charges are calculated on request, not stored); Dexter directs the operator to these pages.

## Not yet included

Approving a period's charges, turning them into draft sales invoices, manual/additional handling charges, and credit/reversal handling.
