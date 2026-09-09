-- Account registers and details need contact totals, not every contact ID.
-- Aggregate the count in Postgres for the already-scoped account page.

begin;

create index if not exists "IX_Org_Contacts_AccountCount"
  on public."Org_Contacts" ("Org_ID", "OrgContact_ID");

create or replace function public.multideck_crm_contact_counts(p_account_ids uuid[])
returns table(account_id uuid, contact_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select contact."Org_ID", count(*)::bigint
  from public."Org_Contacts" contact
  where contact."Org_ID" = any(coalesce(p_account_ids, '{}'::uuid[]))
  group by contact."Org_ID"
$$;

revoke all on function public.multideck_crm_contact_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.multideck_crm_contact_counts(uuid[]) to service_role;

comment on function public.multideck_crm_contact_counts(uuid[]) is
  'Returns contact totals for an Edge-scoped account page without transferring contact rows.';

commit;
