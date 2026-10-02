-- Keep the Customs importer distinct from the operational consignee/account code.
-- Existing handover RPCs already recognise the importer role and prioritise its
-- primary sequence when a Booking has both an importer and a consignee.
insert into public."sys_JobPartyRoles" (
  "JPR_Code", "JPR_Name", "JPR_Description", "JPR_IsRequiredTypical", "JPR_SortOrder", "JPR_IsActive"
) values (
  'importer', 'Importer', 'Party responsible as importer on a Customs declaration.', false, 35, true
)
on conflict ("JPR_Code") do nothing;
