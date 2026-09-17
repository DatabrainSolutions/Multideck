begin;
alter table public.email_signature_profiles add column overrides jsonb not null default '{}', add column revision integer not null default 1;
-- Retain existing explicit signature details; empty legacy values inherit the profile.
update public.email_signature_profiles set overrides=jsonb_strip_nulls(jsonb_build_object('phone',nullif(phone,''),'mobile',nullif(mobile,'')));
alter table public.email_signature_profiles add constraint signature_profile_overrides_object check(jsonb_typeof(overrides)='object');
create or replace function public.email_signature_profile_sources(p_company uuid)
returns table(user_id uuid, name text, phone text, mobile text, website text)
language sql stable security definer set search_path=public,pg_temp as $$
 select u."User_ID",coalesce(nullif(trim(concat_ws(' ',a.raw_user_meta_data->>'first_name',a.raw_user_meta_data->>'last_name')),''),nullif(a.raw_user_meta_data->>'full_name',''),nullif(a.raw_user_meta_data->>'name','')),
 coalesce(a.raw_user_meta_data->>'phone',a.raw_user_meta_data->>'phone_number',a.raw_user_meta_data->>'mobile',a.phone,''),coalesce(a.raw_user_meta_data->>'mobile',''),coalesce(a.raw_user_meta_data->>'website',a.raw_user_meta_data->>'website_url','')
 from public."cmp_Users" u join auth.users a on a.id=u."Auth_User_ID" where u."Company_ID"=p_company and coalesce(u."User_AccessStatus",'active')='active'
$$;
revoke all on function public.email_signature_profile_sources(uuid) from public,anon,authenticated;
grant execute on function public.email_signature_profile_sources(uuid) to service_role;
create or replace function public.email_signature_team_patch(p_actor uuid,p_user uuid,p_field text,p_value text,p_expected integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare company uuid; saved public.email_signature_profiles%rowtype;
begin
 select "Company_ID" into company from "cmp_Users" where "User_ID"=p_actor and "Auth_User_ID" is not null and coalesce("User_AccessStatus",'active')='active';
 if company is null or not exists(select 1 from "cmp_Users_Roles" ur join "sys_UserRole_Permissions" rp using("sys_UserRole_ID") join "sys_Permissions" p using("sys_Permission_ID") where ur."User_ID"=p_actor and p."sys_Permission_Value"='Email.Signatures.Manage') then raise exception 'Signature manager required' using errcode='42501';end if;
 if not exists(select 1 from "cmp_Users" where "User_ID"=p_user and "Company_ID"=company and "Auth_User_ID" is not null and coalesce("User_AccessStatus",'active')='active') then raise exception 'Person unavailable' using errcode='42501';end if;
 if p_field not in ('name','jobTitle','email','phone','mobile','address','website','company') or length(p_value)>500 then raise exception 'Invalid signature field' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,1700));
 select * into saved from email_signature_profiles where user_id=p_user for update;
 if coalesce(saved.revision,0)<>p_expected then raise exception 'Details changed; refresh before saving' using errcode='40001';end if;
 insert into email_signature_profiles(user_id,company_id,overrides,revision) values(p_user,company,case when p_value is null then '{}'::jsonb else jsonb_build_object(p_field,p_value) end,1)
 on conflict(user_id) do update set overrides=case when p_value is null then email_signature_profiles.overrides-p_field else email_signature_profiles.overrides||jsonb_build_object(p_field,p_value) end,revision=email_signature_profiles.revision+1,updated_at=now() returning * into saved;
 insert into email_signature_events(company_id,actor_id,owner_user_id,kind,details) values(company,p_actor,p_user,'profile_override_changed',jsonb_build_object('field',p_field,'reset',p_value is null,'revision',saved.revision));
 return to_jsonb(saved);
end $$;
revoke all on function public.email_signature_team_patch(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.email_signature_team_patch(uuid,uuid,text,text,integer) to service_role;
commit;
