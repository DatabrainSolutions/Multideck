-- Customer quote responses create an operator notification in the same
-- transaction as the quote outcome and accepted booking. Register the link
-- type first so a valid response cannot be rolled back by the notification FK.

begin;

insert into public."sys_CommLinkTypes" (
  "CommLinkType_Code",
  "CommLinkType_Name",
  "CommLinkType_Description",
  "CommLinkType_SortOrder",
  "CommLinkType_IsActive"
)
values (
  'quote_response',
  'Quote response',
  'Linked to a customer response on a freight quote.',
  145,
  true
)
on conflict ("CommLinkType_Code") do update
set "CommLinkType_Name" = excluded."CommLinkType_Name",
    "CommLinkType_Description" = excluded."CommLinkType_Description",
    "CommLinkType_IsActive" = true;

commit;
