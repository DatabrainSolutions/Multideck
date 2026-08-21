-- iCustoms notifications are Customs records with provider evidence in their
-- metadata. Reuse the canonical notification link taxonomy instead of adding a
-- provider-specific foreign-key value.
begin;

drop index if exists public."UX_Comm_Notifications_icustoms_event";
create unique index "UX_Comm_Notifications_icustoms_event"
  on public."Comm_Notifications" (("CommNotif_MetadataJSON" ->> 'provider_event_id'))
  where "CommNotif_LinkTypeCode" = 'customs'
    and "CommNotif_MetadataJSON" ->> 'event_type' = 'icustoms_webhook'
    and nullif("CommNotif_MetadataJSON" ->> 'provider_event_id', '') is not null;

commit;
