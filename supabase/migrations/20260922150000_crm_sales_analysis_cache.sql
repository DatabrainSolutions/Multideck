-- On-demand sales analysis is private to its requesting operator. Provider calls
-- remain governed by the shared model gateway; this lease also bounds repeats.
create table public."AI_CrmSalesAnalyses" (
  company_id uuid not null,
  user_id uuid not null references public."cmp_Users"("User_ID"),
  fingerprint text not null,
  result jsonb,
  generated_at timestamptz,
  attempted_at timestamptz not null default now(),
  lease_id uuid not null default gen_random_uuid(),
  primary key(company_id,user_id)
);
alter table public."AI_CrmSalesAnalyses" enable row level security;
revoke all on public."AI_CrmSalesAnalyses" from public,anon,authenticated;
grant all on public."AI_CrmSalesAnalyses" to service_role;

create or replace function public.multideck_crm_claim_sales_analysis(p_company_id uuid,p_user_id uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public."AI_CrmSalesAnalyses"; v_lease uuid:=gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_only' using errcode='42501';end if;
  if p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid analysis fingerprint' using errcode='22023';end if;
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and "Auth_User_ID" is not null and coalesce("User_AccessStatus",'active')='active')
     or not public._multideck_crm_has_permission(p_user_id,'CRM.Read') then raise exception 'Access unavailable' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,92226));
  select * into v_row from public."AI_CrmSalesAnalyses" where company_id=p_company_id and user_id=p_user_id for update;
  if v_row.fingerprint=p_fingerprint and v_row.result is not null and v_row.generated_at>now()-interval '10 minutes' then
    return jsonb_build_object('cached',v_row.result);
  end if;
  if v_row.attempted_at>now()-interval '60 seconds' then raise exception 'Wait a minute before requesting another sales analysis.' using errcode='P0001';end if;
  insert into public."AI_CrmSalesAnalyses"(company_id,user_id,fingerprint,lease_id)
  values(p_company_id,p_user_id,p_fingerprint,v_lease)
  on conflict(company_id,user_id) do update set fingerprint=excluded.fingerprint,result=null,generated_at=null,attempted_at=now(),lease_id=excluded.lease_id;
  return jsonb_build_object('leaseId',v_lease);
end $$;

create or replace function public.multideck_crm_finish_sales_analysis(p_company_id uuid,p_user_id uuid,p_lease_id uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_only' using errcode='42501';end if;
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and "Auth_User_ID" is not null and coalesce("User_AccessStatus",'active')='active')
     or not public._multideck_crm_has_permission(p_user_id,'CRM.Read') then raise exception 'Access unavailable' using errcode='42501';end if;
  if p_result is null or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>40000 then raise exception 'Invalid analysis result' using errcode='22023';end if;
  update public."AI_CrmSalesAnalyses" set result=p_result,generated_at=now() where company_id=p_company_id and user_id=p_user_id and lease_id=p_lease_id;
  get diagnostics v_count=row_count;
  return v_count=1;
end $$;
revoke all on function public.multideck_crm_claim_sales_analysis(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.multideck_crm_finish_sales_analysis(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_crm_claim_sales_analysis(uuid,uuid,text) to service_role;
grant execute on function public.multideck_crm_finish_sales_analysis(uuid,uuid,uuid,jsonb) to service_role;
