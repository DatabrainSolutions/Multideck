-- Let authenticated operators read canonical records belonging to their company.
-- These helpers resolve ownership without relying on nested RLS-visible joins.

create or replace function public.app_user_can_access_office(target_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public."cmp_Offices" office
    where office."Office_ID" = target_office_id
      and office."Company_ID" = public.app_current_company_id()
  )
$$;

create or replace function public.app_user_can_access_organisation(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public."Job_Header" job
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    where office."Company_ID" = public.app_current_company_id()
      and target_organisation_id in (job."Job_Customer", job."Job_Carrier")
  ) or exists (
    select 1
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where office."Company_ID" = public.app_current_company_id()
      and quote."CusQuoteHeader_CustomerID" = target_organisation_id
  )
$$;

revoke all on function public.app_user_can_access_office(uuid) from public;
revoke all on function public.app_user_can_access_organisation(uuid) from public;
grant execute on function public.app_user_can_access_office(uuid) to authenticated;
grant execute on function public.app_user_can_access_organisation(uuid) to authenticated;

drop policy if exists "App read company offices" on public."cmp_Offices";
create policy "App read company offices"
on public."cmp_Offices"
for select
to authenticated
using ("Company_ID" = public.app_current_company_id());

drop policy if exists "App read company colleagues" on public."cmp_Users";
create policy "App read company colleagues"
on public."cmp_Users"
for select
to authenticated
using ("Company_ID" = public.app_current_company_id());

drop policy if exists "App read company organisations" on public."Org_Master";
create policy "App read company organisations"
on public."Org_Master"
for select
to authenticated
using (public.app_user_can_access_organisation("Org_id"));

drop policy if exists "App read company jobs" on public."Job_Header";
create policy "App read company jobs"
on public."Job_Header"
for select
to authenticated
using (public.app_user_can_access_office(coalesce("Job_OrgOfficeID", "Job_OfficeID")));

drop policy if exists "App read company quotes" on public."CusQuote_Header";
create policy "App read company quotes"
on public."CusQuote_Header"
for select
to authenticated
using (public.app_user_can_access_office(coalesce("CusQuoteHeader_OrgOfficeID", "OrgOffice_ID")));
