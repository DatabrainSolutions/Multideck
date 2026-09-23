-- Validate final transaction state: CRM creation may insert roles before profiles.
-- No ownership is inferred and no historical records are silently reassigned.
begin;
create function public._accounting_require_party_profile(p_org uuid, p_entity uuid default null)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_count integer;
begin
 select count(*) into v_count from public."CRM_AccountProfiles" p
 where p."CRMAccount_OrgID"=p_org and not p."CRMAccount_IsDeleted"
 and p."CRMAccount_CompanyID" is not null
 and (p_entity is null or exists(select 1 from public."cmp_LegalEntities" e
   where e."LegalEntity_ID"=p_entity and e."Company_ID"=p."CRMAccount_CompanyID"
   and (p."CRMAccount_LegalEntityID" is null or p."CRMAccount_LegalEntityID"=p_entity)));
 if v_count<>1 then
  raise exception 'An active, unambiguous CRM profile in the correct company and legal entity is required. Repair the organisation record before linking or posting.' using errcode='23514';
 end if;
end $$;
revoke all on function public._accounting_require_party_profile(uuid,uuid) from public,anon,authenticated;

-- Serialise dependent writers against profile removal/reassignment. A real row
-- update also causes stale repeatable-read writers to fail instead of racing.
create function public._accounting_lock_party_profile() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_old uuid; v_new uuid; v_org uuid;
begin
 if tg_op<>'INSERT' then v_old:=coalesce(to_jsonb(old)->>'CRMAccount_OrgID',to_jsonb(old)->>'Org_ID',to_jsonb(old)->>'ACCIPM_OrgID',to_jsonb(old)->>'FINDoc_PartyOrgID')::uuid; end if;
 if tg_op<>'DELETE' then v_new:=coalesce(to_jsonb(new)->>'CRMAccount_OrgID',to_jsonb(new)->>'Org_ID',to_jsonb(new)->>'ACCIPM_OrgID',to_jsonb(new)->>'FINDoc_PartyOrgID')::uuid; end if;
 for v_org in select distinct id from unnest(array[v_old,v_new]) id where id is not null order by id loop
  update public."Org_Master" set "Org_Name"="Org_Name" where "Org_id"=v_org;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public._accounting_lock_party_profile() from public,anon,authenticated;

create function public._accounting_check_party_profile() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_org uuid; v_entity uuid;
begin
 if tg_table_name='CRM_AccountProfiles' then
  -- Preserve profiles required by any retained financial document or active link.
  for v_org in select distinct id from unnest(array[old."CRMAccount_OrgID",case when tg_op='UPDATE' then new."CRMAccount_OrgID" end]) id where id is not null loop
   if exists(select 1 from public."Org_Master_Type" mt join public."Org_Types" t on t."OrgType_ID"=mt."OrgType_ID"
     where mt."Org_ID"=v_org and lower(t."OrgType_Name") in ('customer','potential customer','key customer account','supplier')) then
    perform public._accounting_require_party_profile(v_org);
   end if;
   for v_entity in
    select d."FINDoc_LegalEntityID" from public."FIN_Documents" d where d."FINDoc_PartyOrgID"=v_org
    union select c."ACCIC_LegalEntityID" from public."ACCI_PartyMappings" m join public."ACCI_Connections" c on c."ACCIC_ID"=m."ACCIPM_ConnectionID"
     where m."ACCIPM_OrgID"=v_org and m."ACCIPM_IsActive"
   loop perform public._accounting_require_party_profile(v_org,v_entity); end loop;
  end loop;
 elsif tg_table_name='Org_Master_Type' then
  if exists(select 1 from public."Org_Master_Type" mt join public."Org_Types" t on t."OrgType_ID"=mt."OrgType_ID"
    where mt."Org_ID"=new."Org_ID" and lower(t."OrgType_Name") in ('customer','potential customer','key customer account','supplier')) then
   perform public._accounting_require_party_profile(new."Org_ID");
  end if;
 elsif tg_table_name='FIN_Documents' then
  select d."FINDoc_PartyOrgID",d."FINDoc_LegalEntityID" into v_org,v_entity from public."FIN_Documents" d where d."FINDoc_ID"=new."FINDoc_ID";
  if v_org is not null then perform public._accounting_require_party_profile(v_org,v_entity); end if;
 else
  select m."ACCIPM_OrgID",c."ACCIC_LegalEntityID" into v_org,v_entity from public."ACCI_PartyMappings" m join public."ACCI_Connections" c on c."ACCIC_ID"=m."ACCIPM_ConnectionID"
   where m."ACCIPM_ID"=new."ACCIPM_ID" and m."ACCIPM_IsActive";
  if v_org is not null then perform public._accounting_require_party_profile(v_org,v_entity); end if;
 end if;
 return null;
end $$;
revoke all on function public._accounting_check_party_profile() from public,anon,authenticated;
create trigger accounting_profile_lock before update or delete on public."CRM_AccountProfiles" for each row execute function public._accounting_lock_party_profile();
create trigger accounting_role_profile_lock before insert or update on public."Org_Master_Type" for each row execute function public._accounting_lock_party_profile();
create trigger accounting_document_profile_lock before insert or update on public."FIN_Documents" for each row execute function public._accounting_lock_party_profile();
create trigger accounting_mapping_profile_lock before insert or update on public."ACCI_PartyMappings" for each row execute function public._accounting_lock_party_profile();
create constraint trigger accounting_profile_required after update or delete on public."CRM_AccountProfiles" deferrable initially deferred for each row execute function public._accounting_check_party_profile();
create constraint trigger accounting_role_profile_required after insert or update on public."Org_Master_Type" deferrable initially deferred for each row execute function public._accounting_check_party_profile();
create constraint trigger accounting_document_profile_required after insert or update on public."FIN_Documents" deferrable initially deferred for each row execute function public._accounting_check_party_profile();
create constraint trigger accounting_mapping_profile_required after insert or update on public."ACCI_PartyMappings" deferrable initially deferred for each row execute function public._accounting_check_party_profile();
commit;
