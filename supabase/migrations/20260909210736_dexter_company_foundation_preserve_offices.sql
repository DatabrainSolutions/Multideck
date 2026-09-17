begin;
create or replace function public.multideck_dexter_action_update_company_foundation(
  p_company_id uuid,p_user_id uuid,p_arguments jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare profile public."CRM_AccountProfiles"; current_offices jsonb; proposed_offices jsonb; changes jsonb;
begin
  if auth.role() is distinct from 'service_role' or public._multideck_crm_actor_company(p_user_id) is distinct from p_company_id then
    raise exception 'The company scope does not match this operator.' using errcode='42501';
  end if;
  perform public._multideck_crm_write_actor(p_user_id);
  perform public._multideck_crm_require_account_access(p_user_id,(p_arguments->>'target_id')::uuid);
  select * into profile from public."CRM_AccountProfiles"
    where "CRMAccount_OrgID"=(p_arguments->>'target_id')::uuid and not "CRMAccount_IsDeleted"
    order by "CRMAccount_ID" limit 1 for update;
  if not found then raise exception 'Organisation not found.' using errcode='P0002';end if;
  if profile."CRMAccount_EditVersion" is distinct from (p_arguments->>'expected_version')::bigint then
    raise exception 'CRM_CONFLICT:This organisation changed since it was loaded.' using errcode='P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('officeId',"CRMAccountOffice_OrgOfficeID",'isPrimary',"CRMAccountOffice_IsPrimary") order by "CRMAccountOffice_OrgOfficeID"),'[]'::jsonb)
    into current_offices from public."CRM_AccountOfficeAssignments" where "CRMAccountOffice_AccountID"=profile."CRMAccount_ID";
  if jsonb_typeof(p_arguments->'office_assignments') is distinct from 'array' then
    raise exception 'Read the responsible offices before preparing this change.' using errcode='22023';end if;
  select coalesce(jsonb_agg(value order by value->>'officeId'),'[]'::jsonb) into proposed_offices from jsonb_array_elements(p_arguments->'office_assignments');
  changes:=jsonb_build_object('accountCode',p_arguments->>'account_code','scopeCode',p_arguments->>'scope_code','isPotential',p_arguments->'is_potential');
  -- The canonical writer accepts partial edits. Only replace assignments when
  -- they change; a code correction must not delete/recreate unchanged offices.
  if proposed_offices is distinct from current_offices then changes:=changes||jsonb_build_object('officeAssignments',proposed_offices);end if;
  return public.multideck_crm_update_organisation_foundation(p_user_id,(p_arguments->>'target_id')::uuid,(p_arguments->>'expected_version')::bigint,changes);
end $$;
update public."sys_AIDexterActions" set "AIDexterAction_AlwaysRequiresApproval"=true
  where "AIDexterAction_Code" in ('update_company_foundation','upsert_company_address');
commit;
