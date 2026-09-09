-- Add the operational departments requested for the quote ownership lookup.
-- Scope is limited to the tenant that already owns the Customs department.

with tenant as (
  select "Company_ID"
  from public."cmp_Departments"
  where "Department_Name" = 'Customs'
  order by "Department_CreatedAt", "Department_ID"
  limit 1
), requested(name) as (
  values ('Imports'), ('Operations Staff'), ('Road Freight'), ('Sales'), ('Warehouse')
)
insert into public."cmp_Departments"(
  "Department_ID", "Company_ID", "Department_Name", "Department_IsActive", "Department_CreatedAt", "Department_UpdatedAt"
)
select gen_random_uuid(), tenant."Company_ID", requested.name, true, now(), now()
from tenant cross join requested
where not exists (
  select 1 from public."cmp_Departments" existing
  where existing."Company_ID" = tenant."Company_ID"
    and lower(existing."Department_Name") = lower(requested.name)
);
