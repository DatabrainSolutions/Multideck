-- Adds the resource used by the customer administrator role. Kept separate from
-- the portal foundation so already-provisioned development databases can upgrade.

insert into public."sys_PortalResourceTypes"
  ("PortalResourceType_Code", "PortalResourceType_Name", "PortalResourceType_Description", "PortalResourceType_DefaultRequiresExplicitShare", "PortalResourceType_IsSensitive", "PortalResourceType_SortOrder")
values
  ('warehouse_users', 'Warehouse users', 'Customer organisation users with access to the warehouse portal.', false, true, 140)
on conflict ("PortalResourceType_Code") do update set
  "PortalResourceType_Name" = excluded."PortalResourceType_Name",
  "PortalResourceType_Description" = excluded."PortalResourceType_Description",
  "PortalResourceType_DefaultRequiresExplicitShare" = excluded."PortalResourceType_DefaultRequiresExplicitShare",
  "PortalResourceType_IsSensitive" = excluded."PortalResourceType_IsSensitive",
  "PortalResourceType_SortOrder" = excluded."PortalResourceType_SortOrder";
