-- Allow Agent Dexter to rename an existing lead through the same reviewed,
-- tenant-scoped action used for other lead updates.

begin;

create or replace function public.multideck_dexter_action_update_lead(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_id uuid := (p_arguments ->> 'target_id')::uuid;
  v_company_name text := nullif(btrim(coalesce(p_arguments ->> 'company_name', '')), '');
  v_result jsonb;
begin
  if v_company_name is null
     and nullif(btrim(coalesce(p_arguments ->> 'next_action_due_at', '')), '') is null
     and nullif(btrim(coalesce(p_arguments ->> 'service_interest', '')), '') is null then
    raise exception 'Choose at least one lead field to update.' using errcode = '22023';
  end if;

  if length(v_company_name) > 240 then
    raise exception 'Lead name must be 240 characters or fewer.' using errcode = '22023';
  end if;

  update public."CRM_Leads" lead
  set
    "CRMLead_CompanyName" = coalesce(v_company_name, lead."CRMLead_CompanyName"),
    "CRMLead_NextActionDueAt" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'next_action_due_at', '')), '')::timestamptz,
      lead."CRMLead_NextActionDueAt"
    ),
    "CRMLead_ServiceInterest" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'service_interest', '')), ''),
      lead."CRMLead_ServiceInterest"
    ),
    "CRMLead_UpdatedAt" = now(),
    "CRMLead_UpdatedBy" = p_user_id
  where lead."CRMLead_ID" = v_target_id
    and not lead."CRMLead_IsDeleted"
    and exists (
      select 1
      from public."cmp_Users" workspace_user
      where workspace_user."Company_ID" = p_company_id
        and workspace_user."User_ID" in (
          lead."CRMLead_OwnerUserID",
          lead."CRMLead_CreatedBy"
        )
    )
  returning jsonb_build_object(
    'companyName', lead."CRMLead_CompanyName",
    'nextActionDueAt', lead."CRMLead_NextActionDueAt",
    'serviceInterest', lead."CRMLead_ServiceInterest"
  ) into v_result;

  if v_result is null then
    raise exception 'That lead is outside this workspace or no longer exists.' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_action_update_lead(uuid, uuid, jsonb)
  from public, anon, authenticated;

update public."sys_AIDexterActions"
set
  "AIDexterAction_Description" = 'Change a lead name, next-action time or service interest.',
  "AIDexterAction_ParametersJSON" = '{
    "type": "object",
    "properties": {
      "target_id": {
        "type": "string",
        "description": "The recordId returned by the leads data tool."
      },
      "company_name": {
        "type": ["string", "null"],
        "description": "New lead or company name, or null when unchanged."
      },
      "next_action_due_at": {
        "type": ["string", "null"],
        "description": "New ISO date-time, or null when unchanged."
      },
      "service_interest": {
        "type": ["string", "null"],
        "description": "New service interest, or null when unchanged."
      },
      "reason": {
        "type": "string",
        "description": "A concise operator-facing explanation of the proposed change."
      }
    },
    "required": [
      "target_id",
      "company_name",
      "next_action_due_at",
      "service_interest",
      "reason"
    ],
    "additionalProperties": false
  }'::jsonb,
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'update_lead'
  and "AIDexterAction_Function" = 'multideck_dexter_action_update_lead';

commit;
