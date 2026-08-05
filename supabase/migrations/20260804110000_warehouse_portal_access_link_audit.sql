-- Register the security-relevant audit event emitted when an authorised user
-- sends a warehouse customer a fresh access link.
-- Dexter and Watching for you intentionally do not expose this one-off outbound
-- email action; Dexter directs operators to the customer access panel instead.

insert into public."sys_PortalEventTypes" (
  "PortalEventType_Code",
  "PortalEventType_Name",
  "PortalEventType_Description",
  "PortalEventType_IsSecurityRelevant",
  "PortalEventType_SortOrder"
)
values (
  'access_link_delivery',
  'Access link delivery',
  'A warehouse customer portal access link delivery was requested and its outcome recorded.',
  true,
  35
)
on conflict ("PortalEventType_Code") do update set
  "PortalEventType_Name" = excluded."PortalEventType_Name",
  "PortalEventType_Description" = excluded."PortalEventType_Description",
  "PortalEventType_IsSecurityRelevant" = excluded."PortalEventType_IsSecurityRelevant",
  "PortalEventType_SortOrder" = excluded."PortalEventType_SortOrder";
