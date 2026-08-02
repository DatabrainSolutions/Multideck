-- Seed the WMS location type, location status, and zone type reference tables used by the
-- Warehouse module location create/edit forms and validation.
-- Idempotent: existing rows are left untouched.

insert into public."sys_WMSLocationTypes"
  ("WMSLocationType_Code", "WMSLocationType_Name", "WMSLocationType_Description", "WMSLocationType_IsPickable", "WMSLocationType_IsActive", "WMSLocationType_SortOrder")
values
  ('rack', 'Rack', 'Standard pallet or shelf rack location.', true, true, 10),
  ('shelf', 'Shelf', 'Small parts shelf or bin location.', true, true, 20),
  ('floor', 'Floor', 'Floor or block-stacked storage location.', true, true, 30),
  ('bulk', 'Bulk', 'Bulk storage for high-volume stock.', true, true, 40),
  ('staging', 'Staging', 'Inbound/outbound staging position.', false, true, 50),
  ('dock', 'Dock', 'Dock door location for loading and unloading.', false, true, 60),
  ('quarantine', 'Quarantine', 'Held stock pending inspection or release.', false, true, 70)
on conflict ("WMSLocationType_Code") do nothing;

insert into public."sys_WMSLocationStatuses"
  ("WMSLocationStatus_Code", "WMSLocationStatus_Name", "WMSLocationStatus_Description", "WMSLocationStatus_IsUsable", "WMSLocationStatus_IsActive", "WMSLocationStatus_SortOrder")
values
  ('available', 'Available', 'Location is open for storage and picking.', true, true, 10),
  ('blocked', 'Blocked', 'Location is temporarily blocked from use.', false, true, 20),
  ('damaged', 'Damaged', 'Location is out of service due to damage.', false, true, 30),
  ('maintenance', 'Maintenance', 'Location is under maintenance.', false, true, 40)
on conflict ("WMSLocationStatus_Code") do nothing;

insert into public."sys_WMSZoneTypes"
  ("WMSZoneType_Code", "WMSZoneType_Name", "WMSZoneType_Description", "WMSZoneType_AllowsStock", "WMSZoneType_IsActive", "WMSZoneType_SortOrder")
values
  ('receiving', 'Receiving', 'Inbound goods receipt area.', false, true, 10),
  ('storage', 'Storage', 'General storage zone.', true, true, 20),
  ('picking', 'Picking', 'Active picking faces for order fulfilment.', true, true, 30),
  ('packing', 'Packing', 'Pack and consolidation zone.', false, true, 40),
  ('dispatch', 'Dispatch', 'Outbound dispatch and loading area.', false, true, 50),
  ('bonded', 'Bonded', 'Customs-controlled, duty-suspended zone.', true, true, 60),
  ('cold', 'Cold store', 'Temperature-controlled storage zone.', true, true, 70)
on conflict ("WMSZoneType_Code") do nothing;
