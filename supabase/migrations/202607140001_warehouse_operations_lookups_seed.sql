-- Operational WMS lookup rows required by warehouse orders, goods receipt,
-- stock balances, and dispatch posting. Idempotent for existing databases.

insert into public."sys_WMSOrderTypes"
  ("WMSOrderType_Code", "WMSOrderType_Name", "WMSOrderType_Description", "WMSOrderType_DirectionCode", "WMSOrderType_IsBonded", "WMSOrderType_IsActive", "WMSOrderType_SortOrder")
values
  ('inbound', 'Inbound receipt', 'Goods expected into a warehouse.', 'in', false, true, 10),
  ('outbound', 'Outbound release', 'Goods requested from warehouse stock.', 'out', false, true, 20)
on conflict ("WMSOrderType_Code") do nothing;

insert into public."sys_WMSOrderStatuses"
  ("WMSOrderStatus_Code", "WMSOrderStatus_Name", "WMSOrderStatus_Description", "WMSOrderStatus_IsOpen", "WMSOrderStatus_IsFinal", "WMSOrderStatus_IsActive", "WMSOrderStatus_SortOrder")
values
  ('draft', 'Draft', 'Order preparation has not finished.', true, false, true, 10),
  ('booked', 'Booked', 'Order is confirmed and ready for warehouse work.', true, false, true, 20),
  ('planned', 'Planned', 'Warehouse work has been planned.', true, false, true, 30),
  ('in_progress', 'In progress', 'Warehouse work is being performed.', true, false, true, 40),
  ('part_complete', 'Part complete', 'Some order lines or quantities are complete.', true, false, true, 50),
  ('blocked', 'Blocked', 'Order cannot progress until a hold is resolved.', true, false, true, 60),
  ('complete', 'Complete', 'All ordered quantities are complete.', false, true, true, 70),
  ('cancelled', 'Cancelled', 'Order was cancelled before completion.', false, true, true, 80)
on conflict ("WMSOrderStatus_Code") do nothing;

insert into public."sys_WMSOrderLineStatuses"
  ("WMSOrderLineStatus_Code", "WMSOrderLineStatus_Name", "WMSOrderLineStatus_Description", "WMSOrderLineStatus_IsOpen", "WMSOrderLineStatus_IsFinal", "WMSOrderLineStatus_IsActive", "WMSOrderLineStatus_SortOrder")
values
  ('open', 'Open', 'Line is awaiting warehouse work.', true, false, true, 10),
  ('allocated', 'Allocated', 'Stock has been allocated.', true, false, true, 20),
  ('picked', 'Picked', 'Stock has been picked.', true, false, true, 30),
  ('received', 'Received', 'Inbound quantity has been received.', false, true, true, 40),
  ('packed', 'Packed', 'Outbound quantity has been packed.', true, false, true, 50),
  ('dispatched', 'Dispatched', 'Outbound quantity has left the warehouse.', false, true, true, 60),
  ('short', 'Short', 'The line completed short.', false, true, true, 70),
  ('cancelled', 'Cancelled', 'The line was cancelled.', false, true, true, 80)
on conflict ("WMSOrderLineStatus_Code") do nothing;

insert into public."sys_WMSInventoryStatuses"
  ("WMSInventoryStatus_Code", "WMSInventoryStatus_Name", "WMSInventoryStatus_Description", "WMSInventoryStatus_IsAvailableCandidate", "WMSInventoryStatus_IsActive", "WMSInventoryStatus_SortOrder")
values
  ('available', 'Available', 'Stock available for outbound allocation.', true, true, 10),
  ('allocated', 'Allocated', 'Stock allocated to an outbound order.', false, true, 20),
  ('picked', 'Picked', 'Stock picked and awaiting packing or dispatch.', false, true, 30),
  ('quarantine', 'Quarantine', 'Stock held for inspection or release.', false, true, 40),
  ('damaged', 'Damaged', 'Stock recorded as damaged and unavailable.', false, true, 50),
  ('customs_hold', 'Customs hold', 'Stock unavailable pending customs release.', false, true, 60),
  ('compliance_hold', 'Compliance hold', 'Stock unavailable pending compliance release.', false, true, 70),
  ('finance_hold', 'Finance hold', 'Stock unavailable pending finance release.', false, true, 80),
  ('expired', 'Expired', 'Stock is beyond its expiry date.', false, true, 90),
  ('destroyed', 'Destroyed', 'Stock has been destroyed.', false, true, 100)
on conflict ("WMSInventoryStatus_Code") do nothing;

insert into public."sys_WMSTransactionTypes"
  ("WMSTransactionType_Code", "WMSTransactionType_Name", "WMSTransactionType_Description", "WMSTransactionType_AffectsOnHand", "WMSTransactionType_DefaultSign", "WMSTransactionType_IsActive", "WMSTransactionType_SortOrder")
values
  ('receipt', 'Receipt', 'Stock received into a warehouse.', true, 1, true, 10),
  ('putaway', 'Putaway', 'Stock moved from receiving into storage.', false, 0, true, 20),
  ('move', 'Move', 'Stock moved between warehouse locations.', false, 0, true, 30),
  ('adjustment_in', 'Adjustment in', 'Positive inventory adjustment.', true, 1, true, 40),
  ('adjustment_out', 'Adjustment out', 'Negative inventory adjustment.', true, -1, true, 50),
  ('dispatch', 'Dispatch', 'Stock dispatched from a warehouse.', true, -1, true, 60),
  ('return', 'Return', 'Stock returned into a warehouse.', true, 1, true, 70),
  ('status_change', 'Status change', 'Inventory status changed without changing on hand.', false, 0, true, 80)
on conflict ("WMSTransactionType_Code") do nothing;
