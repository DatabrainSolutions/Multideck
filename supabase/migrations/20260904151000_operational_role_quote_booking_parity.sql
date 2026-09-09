-- Keep the role catalogue used by the live product aligned with the Quote and
-- Booking workflow permissions. Company Manager and Company User are the
-- ordinary internal roles currently assigned to operators; the older
-- Operations manager and Operator names already had these grants.

begin;

with role_permissions(role_name, permission_value) as (
  values
    ('Company Admin', 'Quotes.Read'),
    ('Company Admin', 'Quotes.Write'),
    ('Company Admin', 'Bookings.Read'),
    ('Company Admin', 'Bookings.Write'),
    ('Company Manager', 'Quotes.Read'),
    ('Company Manager', 'Quotes.Write'),
    ('Company Manager', 'Bookings.Read'),
    ('Company Manager', 'Bookings.Write'),
    ('Company User', 'Quotes.Read'),
    ('Company User', 'Quotes.Write'),
    ('Company User', 'Bookings.Read'),
    ('Company User', 'Bookings.Write'),
    ('System Admin', 'Quotes.Read'),
    ('System Admin', 'Quotes.Write'),
    ('System Admin', 'Bookings.Read'),
    ('System Admin', 'Bookings.Write')
)
insert into public."sys_UserRole_Permissions" (
  "sys_UserRole_ID",
  "sys_Permission_ID"
)
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role
  on lower(role."sys_UserRole_Name") = lower(mapping.role_name)
join public."sys_Permissions" permission
  on permission."sys_Permission_Value" = mapping.permission_value
on conflict ("sys_UserRole_ID", "sys_Permission_ID") do nothing;

commit;
