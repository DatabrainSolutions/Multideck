begin;
alter table public.email_signature_policies add column company_details jsonb not null default '{}' check(jsonb_typeof(company_details)='object');
create function public.email_signature_company_details(p_actor uuid,p_details jsonb,p_revision integer)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare company uuid; current_revision integer;
begin
 select u."Company_ID" into company from public."cmp_Users" u where u."User_ID"=p_actor and u."Auth_User_ID" is not null and coalesce(u."User_AccessStatus",'active')='active'
 and exists(select 1 from public."cmp_Users_Roles" ur join public."sys_UserRole_Permissions" rp using("sys_UserRole_ID") join public."sys_Permissions" p using("sys_Permission_ID") where ur."User_ID"=p_actor and p."sys_Permission_Value"='Email.Signatures.Manage');
 if company is null then raise exception 'Signature manager required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(company::text,1430));
 select revision into current_revision from public.email_signature_policies where company_id=company;
 if p_revision is distinct from coalesce(current_revision,0) then raise exception 'Company details changed. Refresh and try again.' using errcode='40001'; end if;
 if jsonb_typeof(p_details) is distinct from 'object' or pg_column_size(p_details)>10000 then raise exception 'Invalid company details' using errcode='22023'; end if;
 insert into public.email_signature_policies(company_id,company_details) values(company,p_details)
 on conflict(company_id) do update set company_details=excluded.company_details,revision=email_signature_policies.revision+1,updated_at=clock_timestamp();
 insert into public.email_signature_events(company_id,actor_id,kind,details) values(company,p_actor,'policy_changed','{"companyDetailsChanged":true}');
end $$;
revoke all on function public.email_signature_company_details(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.email_signature_company_details(uuid,jsonb,integer) to service_role;
commit;
