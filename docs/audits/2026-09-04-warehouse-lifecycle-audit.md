# Warehouse lifecycle audit

Date: 4 September 2026
Scope: Warehouse dashboard, facilities, locations, items, inventory, expected receipts, goods in, goods out, and the corresponding Supabase contracts.
Classification: Multideck-owned internal operator workflow.

## Implementation update

The priority findings in this audit have now been implemented as one bounded warehouse lifecycle:

- an item remains unique by customer and SKU, but can be assigned to several warehouses with one default;
- inbound and outbound warehouse orders require a typed operational source and reference;
- web creates and oversees warehouse orders, while mobile is the preferred interface for receive, putaway, pick, and ship;
- receiving is restricted to active dock or staging locations and creates separate putaway work;
- outbound release allocates FIFO stock and creates pick tasks;
- task confirmation records scan evidence, and dispatch can consume only picked quantities;
- cross-warehouse inventory identifies the warehouse throughout the stock, object, movement, and exception views;
- Dexter can read the execution evidence and release an outbound order through its approval-safe action, while Watching for you reacts to deterministic warehouse task events.

The intentionally small boundary is an **outbound warehouse order**, not a complete sales-order or ERP module. Pricing, tax, invoicing, credit control, commercial approval, packing waves, and carrier integrations remain outside this change. A separate commercial sales-order aggregate can be introduced later if integrations, split releases, or commercial ownership require it.

## Verdict

At the time of the audit, the warehouse structure was credible, but the transaction lifecycle was not yet a complete warehouse-management flow. Facilities, locations, customer-owned items, lots, stock balances, customer purchase orders, receipts, and dispatches existed. The largest gap was outbound fulfilment: the interface presented picking as a stage, but the only operational action was **Dispatch goods**, and that action also recorded allocation, picking, packing, and dispatch together. The database contained pick-task and pack-task tables, but they were not connected to a working staff workflow.

The second structural issue is that an item master is tied to one default facility. That prevents the same customer SKU from being managed naturally across multiple warehouses. The third is traceability: the customer-PO route can create a linked inbound order, but generic inbound and outbound orders can be created with only a free-text customer reference. There is no first-class customer sales-order record.

## Intended operating model

```text
Business / tenant
  -> Warehouses
     -> Zones
        -> Locations: dock, staging, bin, rack, pick face, quarantine

Customer / stock owner
  -> Item master
     -> Warehouse assignments and storage rules
     -> Stock balances by warehouse, location, lot and condition

Inbound warehouse order: customer PO, ASN, return or transfer
  -> Goods-in booking
  -> Receive and record discrepancies
  -> Putaway task
  -> Available stock

Customer sales order / outbound warehouse order
  -> Release and allocate stock
  -> Pick task
  -> Pack and stage
  -> Dispatch / shipment confirmation
```

An item should not itself require an invoice or order. The reusable item master should exist independently. Every stock movement should instead be traceable to an order line, receipt, adjustment, transfer, or other explicit source.

## Journey review

1. **Choose a warehouse and define its locations — Good.** Multiple facilities are supported. Locations belong to a facility and cover docks, staging, bulk racks, bins, pick faces, and quarantine.
2. **Create a customer-owned item — Partial.** Ownership is explicit and SKUs are unique per customer, but each item has one default facility. A customer SKU should be reusable across several facilities through warehouse assignments rather than duplicated or locked to one warehouse.
3. **Create the inbound instruction — Partial.** A customer purchase order can generate and remain linked to a goods-in order. Direct inbound creation does not require a structured source type or source record, so provenance can become a free-text reference.
4. **Book and receive goods — Partial.** Booking, received quantities, lots, damage, shortages, and destination location are handled. Receiving and putaway are combined; there is no staff putaway queue or scan-confirmed putaway task.
5. **Inspect stock across warehouses — At risk.** Inventory can be filtered to “All warehouses”, but the stock table does not show a Warehouse column. Location codes can repeat between facilities, so an operator can misread which physical warehouse holds stock.
6. **Create an outbound instruction — Missing a key business record.** Goods-out orders exist, and a customer sales-order number can be typed as a reference, but there is no first-class sales-order or outbound-source lifecycle to own lines, releases, changes, cancellations, and fulfilment status.
7. **Allocate and pick — Critical gap.** The product shows Placed → Picking → Dispatched, but warehouse staff receive no working pick task. The dispatch action selects the source location and simultaneously treats the quantity as allocated, picked, packed, and dispatched.
8. **Pack, stage, and ship — Partial.** Dispatch and carrier/reference capture exist, but packing, staging, partial picks, substitutions, short picks, and scan evidence are not separate controlled steps.

## Priority findings

### P0 — Make picking real before presenting it as completed

Create an outbound release/allocation step, generate pick tasks by warehouse balance and location, give staff a pick queue, and require item/location/quantity confirmation. Dispatch must consume only quantities that were actually picked or packed. Do not silently advance allocation, picked, packed, and dispatched quantities in one mutation.

### P1 — Separate the item master from warehouse assignment

Keep `customer + SKU` as the identity of an item. Replace the single default-facility dependency with one-to-many warehouse assignments carrying facility-specific settings such as default pick face, replenishment rule, storage constraints, and active status. Continue holding balances by facility and location.

### P1 — Add first-class source records to both directions

Model each goods-in order as originating from a typed inbound instruction and each goods-out order as originating from a customer sales order or outbound instruction. Keep the customer's document number as an external reference, not as the relationship itself. Allow “manual exception” as an audited source when no document exists.

### P1 — Always identify the warehouse in cross-warehouse inventory

Show Warehouse whenever the inventory scope contains more than one facility, and keep it visible in stock details and movement evidence. Location alone is not globally unique enough for safe operation.

### P2 — Split receipt from putaway

Receive into a dock or goods-in staging location, then create directed putaway tasks. A lightweight version can remain optional for very small warehouses, but the audit trail must distinguish received from physically put away.

### P2 — Tighten terminology

The operator-facing name is now **Expected receipts**, with Customer PO retained as a source type and reference. Executable work is named **Inbound warehouse order** or **Outbound warehouse order**, keeping it distinct from finance and commercial order ownership.

## What is already strong

- The tenant's facilities and location hierarchy fit the intended physical model.
- Stock is scoped by facility, stock owner, item, location, lot, customs status, and condition.
- Availability logic respects facility and customer ownership, which protects one customer's stock from another.
- Customer purchase-order lines can link through to inbound order and receipt lines.
- The inventory transaction model provides a good foundation for traceability.

## Verification notes

- The client production build completed successfully after implementation.
- The mobile TypeScript check and Android export completed successfully.
- All 118 focused Supabase warehouse contracts passed, including lifecycle, bounded-read, tenant/facility scope, Dexter, and event-driven watch contracts.
- Edge Function syntax checks and diff validation passed.
- Browser verification confirmed the cross-warehouse identity, typed outbound order form, and route-specific top-bar action in the live local product.
- Database lint could not run because the local Supabase Postgres instance was not running on port 54322; the migration still requires validation against an isolated Supabase project before deployment.

## Recommended delivery order

1. Correct the outbound state model and implement real pick tasks.
2. Add a typed outbound source / sales-order model and require source linkage.
3. Decouple item identity from a single facility.
4. Add warehouse identity to cross-warehouse inventory views.
5. Implement directed putaway and staff task queues.
6. Align terminology, Dexter chat capability, and Watching for you events with the final lifecycle.
