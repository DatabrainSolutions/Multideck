-- Register the booking review notification before the accepted quote workflow
-- inserts it. Without this reference row, the notification foreign key rolls
-- back the customer's accepted version and its review transaction.

begin;

insert into public."sys_CommLinkTypes" (
  "CommLinkType_Code",
  "CommLinkType_Name",
  "CommLinkType_Description",
  "CommLinkType_SortOrder",
  "CommLinkType_IsActive"
)
values (
  'booking_quote_sync',
  'Booking quote update',
  'Linked to an accepted quote version awaiting review against an existing booking.',
  146,
  true
)
on conflict ("CommLinkType_Code") do update
set "CommLinkType_Name" = excluded."CommLinkType_Name",
    "CommLinkType_Description" = excluded."CommLinkType_Description",
    "CommLinkType_IsActive" = true;

commit;
