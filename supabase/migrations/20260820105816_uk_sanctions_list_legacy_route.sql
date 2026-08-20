-- Keep existing callers on the same current UKSL and consolidated result path.
-- New UI/API integrations call v2 directly with workflow context.

create or replace function public.cmp_run_screening_check(
  p_company_id uuid,
  p_user_id uuid,
  p_subject_name text,
  p_country text default null,
  p_org_id uuid default null
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select public.cmp_run_screening_check_v2(
    p_company_id,
    p_user_id,
    p_subject_name,
    p_country,
    p_org_id,
    'manual',
    null,
    null,
    'party',
    false
  );
$$;

revoke all on function public.cmp_run_screening_check(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.cmp_run_screening_check(uuid, uuid, text, text, uuid) to service_role;
