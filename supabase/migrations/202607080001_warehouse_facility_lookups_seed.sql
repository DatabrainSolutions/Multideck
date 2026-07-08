-- Seed the WMS facility type and customs status reference tables used by the
-- Warehouse module (facility create/edit forms and validation).
-- Idempotent: existing rows are left untouched.

insert into public."sys_WMSFacilityTypes"
  ("WMSFacilityType_Code", "WMSFacilityType_Name", "WMSFacilityType_Description", "WMSFacilityType_IsBondedCandidate", "WMSFacilityType_IsActive", "WMSFacilityType_SortOrder")
values
  ('distribution_centre', 'Distribution centre', 'General distribution and fulfilment warehouse.', false, true, 10),
  ('bonded_warehouse', 'Bonded warehouse', 'Customs-controlled, duty-suspended storage.', true, true, 20),
  ('cross_dock', 'Cross-dock', 'Short-dwell transhipment and consolidation site.', false, true, 30),
  ('cold_store', 'Cold store', 'Temperature-controlled storage facility.', false, true, 40),
  ('overflow', 'Overflow store', 'Secondary overflow and buffer storage.', false, true, 50)
on conflict ("WMSFacilityType_Code") do nothing;

insert into public."sys_WMSCustomsStatuses"
  ("WMSCustomsStatus_Code", "WMSCustomsStatus_Name", "WMSCustomsStatus_Description", "WMSCustomsStatus_IsDutySuspended", "WMSCustomsStatus_IsCustomsControlled", "WMSCustomsStatus_IsActive", "WMSCustomsStatus_SortOrder")
values
  ('free_circulation', 'Free circulation', 'Goods cleared for free circulation with duties paid.', false, false, true, 10),
  ('customs_warehousing', 'Customs warehousing', 'Duty-suspended goods held under customs warehousing.', true, true, true, 20),
  ('temporary_admission', 'Temporary admission', 'Goods temporarily imported with relief from duty.', true, true, true, 30),
  ('inward_processing', 'Inward processing', 'Goods imported for processing under duty suspension.', true, true, true, 40),
  ('transit', 'Transit', 'Goods moving under a customs transit procedure.', true, true, true, 50)
on conflict ("WMSCustomsStatus_Code") do nothing;
