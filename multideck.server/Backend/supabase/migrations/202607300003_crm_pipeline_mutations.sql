-- Move the remaining CRM pipeline and lead-field settings writes from the ASP.NET API to
-- authenticated, tenant-scoped Supabase RPCs.

begin;

create or replace function public._multideck_crm_require_settings_manage(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public."cmp_Users_Roles" user_role
    join public."sys_UserRole_Permissions" role_permission
      on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    join public."sys_Permissions" permission
      on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
    where user_role."User_ID" = p_user_id
      and permission."sys_Permission_Value" = 'Settings.Manage'
  ) then
    raise exception 'You do not have permission to manage CRM settings.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._multideck_crm_pipeline_json(
  p_pipeline_id uuid,
  p_company_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', pipeline."CRMPipeline_ID",
    'name', pipeline."CRMPipeline_Name",
    'owner', coalesce(pipeline."CRMPipeline_Owner", ''),
    'automation', coalesce(pipeline."CRMPipeline_Automation", ''),
    'sortOrder', pipeline."CRMPipeline_SortOrder",
    'defaultStage', coalesce(
      (
        select stage."CRMPipelineStage_Name"
        from public."CRM_PipelineStages" stage
        where stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID"
          and not stage."Is_Deleted"
        order by stage."CRMPipelineStage_IsDefaultEntry" desc, stage."CRMPipelineStage_SortOrder"
        limit 1
      ),
      ''
    ),
    'conversionStage', coalesce(
      (
        select stage."CRMPipelineStage_Name"
        from public."CRM_PipelineStages" stage
        where stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID"
          and not stage."Is_Deleted"
        order by stage."CRMPipelineStage_IsConversion" desc, stage."CRMPipelineStage_SortOrder" desc
        limit 1
      ),
      ''
    ),
    'stages', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', stage."CRMPipelineStage_ID",
            'name', stage."CRMPipelineStage_Name",
            'tone', stage."CRMPipelineStage_Tone",
            'rule', coalesce(stage."CRMPipelineStage_EntryRule", ''),
            'probability', stage."CRMPipelineStage_ProbabilityPct",
            'sortOrder', stage."CRMPipelineStage_SortOrder",
            'isDefaultEntry', stage."CRMPipelineStage_IsDefaultEntry",
            'isConversion', stage."CRMPipelineStage_IsConversion"
          )
          order by stage."CRMPipelineStage_SortOrder"
        )
        from public."CRM_PipelineStages" stage
        where stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID"
          and not stage."Is_Deleted"
      ),
      '[]'::jsonb
    )
  )
  from public."CRM_Pipelines" pipeline
  where pipeline."CRMPipeline_ID" = p_pipeline_id
    and pipeline."Company_ID" = p_company_id
    and not pipeline."Is_Deleted";
$$;

create or replace function public._multideck_crm_lead_field_json(
  p_field_id uuid,
  p_company_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', field."CRMLeadField_ID",
    'label', field."CRMLeadField_Label",
    'type', field."CRMLeadField_TypeCode",
    'options', coalesce(field."CRMLeadField_OptionsJSON", '[]'::jsonb),
    'activeOptions', coalesce(field."CRMLeadField_ActiveOptionsJSON", '[]'::jsonb),
    'sortOrder', field."CRMLeadField_SortOrder"
  )
  from public."CRM_LeadFieldSettings" field
  where field."CRMLeadField_ID" = p_field_id
    and field."Company_ID" = p_company_id
    and not field."Is_Deleted";
$$;

create or replace function public.multideck_crm_mutate_pipeline_settings(
  p_action text,
  p_id uuid default null,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_now timestamptz := now();
  v_name text;
  v_owner text;
  v_automation text;
  v_stages jsonb;
  v_stage jsonb;
  v_stage_id uuid;
  v_pipeline_id uuid;
  v_field_id uuid;
  v_sort_order integer;
  v_options jsonb;
  v_active_options jsonb;
  v_type text;
  v_result jsonb;
  v_ids uuid[];
begin
  select * into v_context from public._multideck_crm_context();
  perform public._multideck_crm_require_settings_manage(v_context.user_id);

  if v_action in ('create_pipeline', 'save_pipeline') then
    if jsonb_typeof(p_payload) is distinct from 'object' then
      raise exception 'Pipeline details are required.' using errcode = '22023';
    end if;

    v_name := btrim(coalesce(p_payload->>'name', ''));
    v_owner := nullif(btrim(coalesce(p_payload->>'owner', '')), '');
    v_automation := nullif(btrim(coalesce(p_payload->>'automation', '')), '');
    v_stages := coalesce(p_payload->'stages', '[]'::jsonb);

    if v_name = '' then
      raise exception 'Give the pipeline a name before saving.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_stages) is distinct from 'array' or jsonb_array_length(v_stages) = 0 then
      raise exception 'A pipeline needs at least one stage.' using errcode = '22023';
    end if;
    if jsonb_array_length(v_stages) > 24 then
      raise exception 'A pipeline can hold up to 24 stages.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_stages) stage
      where btrim(coalesce(stage->>'name', '')) = ''
    ) then
      raise exception 'Every stage needs a name.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_stages) stage
      group by lower(btrim(stage->>'name'))
      having count(*) > 1
    ) then
      raise exception 'A stage name is used more than once.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_stages) stage
      where lower(coalesce(stage->>'tone', '')) not in ('green', 'amber', 'red', 'blue', 'neutral', 'teal')
    ) then
      raise exception 'Choose a supported stage colour.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_stages) stage
      where coalesce((stage->>'probability')::numeric, 0) < 0
         or coalesce((stage->>'probability')::numeric, 0) > 100
    ) then
      raise exception 'Win probability must be between 0 and 100.' using errcode = '22023';
    end if;
    if (
      select count(*) from jsonb_array_elements(v_stages) stage
      where coalesce((stage->>'isDefaultEntry')::boolean, false)
    ) > 1 then
      raise exception 'Only one stage can be the default entry point.' using errcode = '22023';
    end if;
    if (
      select count(*) from jsonb_array_elements(v_stages) stage
      where coalesce((stage->>'isConversion')::boolean, false)
    ) > 1 then
      raise exception 'Only one stage can be the conversion trigger.' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public."CRM_Pipelines" pipeline
      where pipeline."Company_ID" = v_context.company_id
        and not pipeline."Is_Deleted"
        and lower(pipeline."CRMPipeline_Name") = lower(v_name)
        and (v_action = 'create_pipeline' or pipeline."CRMPipeline_ID" <> p_id)
    ) then
      raise exception 'Another pipeline already uses that name.' using errcode = '23505';
    end if;

    if v_action = 'create_pipeline' then
      if (
        select count(*)
        from public."CRM_Pipelines" pipeline
        where pipeline."Company_ID" = v_context.company_id
          and not pipeline."Is_Deleted"
      ) >= 24 then
        raise exception 'A workspace can hold up to 24 pipelines.' using errcode = '22023';
      end if;

      select coalesce(max(pipeline."CRMPipeline_SortOrder") + 1, 0)
      into v_sort_order
      from public."CRM_Pipelines" pipeline
      where pipeline."Company_ID" = v_context.company_id
        and not pipeline."Is_Deleted";

      v_pipeline_id := gen_random_uuid();
      insert into public."CRM_Pipelines" (
        "CRMPipeline_ID", "Company_ID", "CRMPipeline_Name", "CRMPipeline_Owner",
        "CRMPipeline_Automation", "CRMPipeline_SortOrder", "Created_At", "Updated_At",
        "Created_By_User_ID", "Updated_By_User_ID", "Is_Deleted"
      ) values (
        v_pipeline_id, v_context.company_id, v_name, v_owner, v_automation, v_sort_order,
        v_now, v_now, v_context.user_id, v_context.user_id, false
      );
    else
      select pipeline."CRMPipeline_ID"
      into v_pipeline_id
      from public."CRM_Pipelines" pipeline
      where pipeline."CRMPipeline_ID" = p_id
        and pipeline."Company_ID" = v_context.company_id
        and not pipeline."Is_Deleted"
      for update;

      if v_pipeline_id is null then
        raise exception 'That pipeline no longer exists.' using errcode = 'P0002';
      end if;

      if exists (
        select 1
        from jsonb_array_elements(v_stages) stage
        where nullif(stage->>'id', '') is not null
          and not exists (
            select 1
            from public."CRM_PipelineStages" existing
            where existing."CRMPipelineStage_ID" = (stage->>'id')::uuid
              and existing."CRMPipeline_ID" = v_pipeline_id
              and existing."Company_ID" = v_context.company_id
              and not existing."Is_Deleted"
          )
      ) then
        raise exception 'A pipeline stage changed while you were editing. Reload and try again.' using errcode = '55000';
      end if;

      update public."CRM_PipelineStages" stage
      set
        "CRMPipelineStage_Name" = stage."CRMPipelineStage_ID"::text,
        "CRMPipelineStage_IsDefaultEntry" = false,
        "CRMPipelineStage_IsConversion" = false,
        "Is_Deleted" = not exists (
          select 1
          from jsonb_array_elements(v_stages) incoming
          where nullif(incoming->>'id', '')::uuid = stage."CRMPipelineStage_ID"
        ),
        "Updated_At" = v_now
      where stage."CRMPipeline_ID" = v_pipeline_id
        and stage."Company_ID" = v_context.company_id
        and not stage."Is_Deleted";

      update public."CRM_Pipelines"
      set
        "CRMPipeline_Name" = v_name,
        "CRMPipeline_Owner" = v_owner,
        "CRMPipeline_Automation" = v_automation,
        "Updated_At" = v_now,
        "Updated_By_User_ID" = v_context.user_id
      where "CRMPipeline_ID" = v_pipeline_id;
    end if;

    v_sort_order := 0;
    for v_stage in select value from jsonb_array_elements(v_stages)
    loop
      v_stage_id := nullif(v_stage->>'id', '')::uuid;

      if v_stage_id is null then
        v_stage_id := gen_random_uuid();
        insert into public."CRM_PipelineStages" (
          "CRMPipelineStage_ID", "Company_ID", "CRMPipeline_ID", "CRMPipelineStage_Name",
          "CRMPipelineStage_Tone", "CRMPipelineStage_EntryRule",
          "CRMPipelineStage_ProbabilityPct", "CRMPipelineStage_SortOrder",
          "CRMPipelineStage_IsDefaultEntry", "CRMPipelineStage_IsConversion",
          "Created_At", "Updated_At", "Is_Deleted"
        ) values (
          v_stage_id, v_context.company_id, v_pipeline_id, btrim(v_stage->>'name'),
          lower(v_stage->>'tone'), nullif(btrim(coalesce(v_stage->>'rule', '')), ''),
          round(coalesce((v_stage->>'probability')::numeric, 0), 2), v_sort_order,
          coalesce((v_stage->>'isDefaultEntry')::boolean, false),
          coalesce((v_stage->>'isConversion')::boolean, false),
          v_now, v_now, false
        );
      else
        update public."CRM_PipelineStages"
        set
          "CRMPipelineStage_Name" = btrim(v_stage->>'name'),
          "CRMPipelineStage_Tone" = lower(v_stage->>'tone'),
          "CRMPipelineStage_EntryRule" = nullif(btrim(coalesce(v_stage->>'rule', '')), ''),
          "CRMPipelineStage_ProbabilityPct" = round(coalesce((v_stage->>'probability')::numeric, 0), 2),
          "CRMPipelineStage_SortOrder" = v_sort_order,
          "CRMPipelineStage_IsDefaultEntry" = coalesce((v_stage->>'isDefaultEntry')::boolean, false),
          "CRMPipelineStage_IsConversion" = coalesce((v_stage->>'isConversion')::boolean, false),
          "Updated_At" = v_now,
          "Is_Deleted" = false
        where "CRMPipelineStage_ID" = v_stage_id
          and "CRMPipeline_ID" = v_pipeline_id
          and "Company_ID" = v_context.company_id;
      end if;

      v_sort_order := v_sort_order + 1;
    end loop;

    return public._multideck_crm_pipeline_json(v_pipeline_id, v_context.company_id);
  end if;

  if v_action = 'delete_pipeline' then
    update public."CRM_Pipelines"
    set
      "Is_Deleted" = true,
      "Updated_At" = v_now,
      "Updated_By_User_ID" = v_context.user_id
    where "CRMPipeline_ID" = p_id
      and "Company_ID" = v_context.company_id
      and not "Is_Deleted"
    returning "CRMPipeline_ID" into v_pipeline_id;

    if v_pipeline_id is null then
      raise exception 'That pipeline no longer exists.' using errcode = 'P0002';
    end if;

    update public."CRM_PipelineStages"
    set "Is_Deleted" = true, "Updated_At" = v_now
    where "CRMPipeline_ID" = v_pipeline_id
      and "Company_ID" = v_context.company_id
      and not "Is_Deleted";

    return null;
  end if;

  if v_action = 'reorder_pipelines' then
    if jsonb_typeof(p_payload) is distinct from 'array' then
      raise exception 'The complete pipeline order is required.' using errcode = '22023';
    end if;

    select coalesce(array_agg((item.value #>> '{}')::uuid order by item.ordinality), '{}'::uuid[])
    into v_ids
    from jsonb_array_elements(p_payload) with ordinality item(value, ordinality);

    if cardinality(v_ids) <> (
      select count(*) from public."CRM_Pipelines"
      where "Company_ID" = v_context.company_id and not "Is_Deleted"
    ) or cardinality(v_ids) <> (
      select count(distinct id) from unnest(v_ids) id
    ) or exists (
      select 1 from unnest(v_ids) id
      where not exists (
        select 1 from public."CRM_Pipelines"
        where "CRMPipeline_ID" = id
          and "Company_ID" = v_context.company_id
          and not "Is_Deleted"
      )
    ) then
      raise exception 'The pipeline list changed while you were reordering. Reload and try again.' using errcode = '55000';
    end if;

    update public."CRM_Pipelines" pipeline
    set
      "CRMPipeline_SortOrder" = ordered.ordinality - 1,
      "Updated_At" = v_now,
      "Updated_By_User_ID" = v_context.user_id
    from unnest(v_ids) with ordinality ordered(id, ordinality)
    where pipeline."CRMPipeline_ID" = ordered.id;

    select coalesce(
      jsonb_agg(public._multideck_crm_pipeline_json(id, v_context.company_id) order by ordinality),
      '[]'::jsonb
    )
    into v_result
    from unnest(v_ids) with ordinality ordered(id, ordinality);

    return v_result;
  end if;

  if v_action in ('create_field', 'save_field') then
    if jsonb_typeof(p_payload) is distinct from 'object' then
      raise exception 'Lead field details are required.' using errcode = '22023';
    end if;

    if v_action = 'save_field' then
      select field."CRMLeadField_ID", field."CRMLeadField_Label", field."CRMLeadField_TypeCode",
        field."CRMLeadField_OptionsJSON"
      into v_field_id, v_name, v_type, v_options
      from public."CRM_LeadFieldSettings" field
      where field."CRMLeadField_ID" = p_id
        and field."Company_ID" = v_context.company_id
        and not field."Is_Deleted"
      for update;

      if v_field_id is null then
        raise exception 'That lead field no longer exists.' using errcode = 'P0002';
      end if;
    else
      v_name := '';
      v_type := '';
      v_options := '[]'::jsonb;
    end if;

    if p_payload ? 'label' then v_name := btrim(coalesce(p_payload->>'label', '')); end if;
    if p_payload ? 'type' then v_type := btrim(coalesce(p_payload->>'type', '')); end if;
    if p_payload ? 'options' then v_options := coalesce(p_payload->'options', '[]'::jsonb); end if;
    v_active_options := coalesce(p_payload->'activeOptions', '[]'::jsonb);

    if v_name = '' then
      raise exception 'Give the field a name before saving.' using errcode = '22023';
    end if;
    if lower(v_type) = 'dropdown' then
      v_type := 'Dropdown';
    elsif lower(v_type) = 'multi-select dropdown' then
      v_type := 'Multi-select dropdown';
    else
      raise exception 'Choose a supported field type.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_options) is distinct from 'array' or jsonb_array_length(v_options) = 0 then
      raise exception 'Give the field at least one option.' using errcode = '22023';
    end if;
    if jsonb_array_length(v_options) > 40 then
      raise exception 'A field can hold up to 40 options.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_active_options) is distinct from 'array' then
      raise exception 'Selected options must be a list.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(v_active_options) active(value)
      where not exists (
        select 1 from jsonb_array_elements_text(v_options) option(value)
        where lower(btrim(option.value)) = lower(btrim(active.value))
      )
    ) then
      raise exception 'A selected value is not an option on this field.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from public."CRM_LeadFieldSettings" field
      where field."Company_ID" = v_context.company_id
        and not field."Is_Deleted"
        and lower(field."CRMLeadField_Label") = lower(v_name)
        and (v_action = 'create_field' or field."CRMLeadField_ID" <> p_id)
    ) then
      raise exception 'Another lead field already uses that name.' using errcode = '23505';
    end if;

    if v_action = 'create_field' then
      if (
        select count(*) from public."CRM_LeadFieldSettings"
        where "Company_ID" = v_context.company_id and not "Is_Deleted"
      ) >= 40 then
        raise exception 'A workspace can hold up to 40 lead fields.' using errcode = '22023';
      end if;

      select coalesce(max(field."CRMLeadField_SortOrder") + 1, 0)
      into v_sort_order
      from public."CRM_LeadFieldSettings" field
      where field."Company_ID" = v_context.company_id
        and not field."Is_Deleted";

      v_field_id := gen_random_uuid();
      insert into public."CRM_LeadFieldSettings" (
        "CRMLeadField_ID", "Company_ID", "CRMLeadField_Label", "CRMLeadField_TypeCode",
        "CRMLeadField_OptionsJSON", "CRMLeadField_ActiveOptionsJSON", "CRMLeadField_SortOrder",
        "Created_At", "Updated_At", "Updated_By_User_ID", "Is_Deleted"
      ) values (
        v_field_id, v_context.company_id, v_name, v_type, v_options, v_active_options,
        v_sort_order, v_now, v_now, v_context.user_id, false
      );
    else
      update public."CRM_LeadFieldSettings"
      set
        "CRMLeadField_Label" = v_name,
        "CRMLeadField_TypeCode" = v_type,
        "CRMLeadField_OptionsJSON" = v_options,
        "CRMLeadField_ActiveOptionsJSON" = v_active_options,
        "Updated_At" = v_now,
        "Updated_By_User_ID" = v_context.user_id
      where "CRMLeadField_ID" = v_field_id;
    end if;

    return public._multideck_crm_lead_field_json(v_field_id, v_context.company_id);
  end if;

  if v_action = 'delete_field' then
    update public."CRM_LeadFieldSettings"
    set
      "Is_Deleted" = true,
      "Updated_At" = v_now,
      "Updated_By_User_ID" = v_context.user_id
    where "CRMLeadField_ID" = p_id
      and "Company_ID" = v_context.company_id
      and not "Is_Deleted"
    returning "CRMLeadField_ID" into v_field_id;

    if v_field_id is null then
      raise exception 'That lead field no longer exists.' using errcode = 'P0002';
    end if;

    return null;
  end if;

  if v_action = 'reorder_fields' then
    if jsonb_typeof(p_payload) is distinct from 'array' then
      raise exception 'The complete field order is required.' using errcode = '22023';
    end if;

    select coalesce(array_agg((item.value #>> '{}')::uuid order by item.ordinality), '{}'::uuid[])
    into v_ids
    from jsonb_array_elements(p_payload) with ordinality item(value, ordinality);

    if cardinality(v_ids) <> (
      select count(*) from public."CRM_LeadFieldSettings"
      where "Company_ID" = v_context.company_id and not "Is_Deleted"
    ) or cardinality(v_ids) <> (
      select count(distinct id) from unnest(v_ids) id
    ) or exists (
      select 1 from unnest(v_ids) id
      where not exists (
        select 1 from public."CRM_LeadFieldSettings"
        where "CRMLeadField_ID" = id
          and "Company_ID" = v_context.company_id
          and not "Is_Deleted"
      )
    ) then
      raise exception 'The field list changed while you were reordering. Reload and try again.' using errcode = '55000';
    end if;

    update public."CRM_LeadFieldSettings" field
    set
      "CRMLeadField_SortOrder" = ordered.ordinality - 1,
      "Updated_At" = v_now,
      "Updated_By_User_ID" = v_context.user_id
    from unnest(v_ids) with ordinality ordered(id, ordinality)
    where field."CRMLeadField_ID" = ordered.id;

    select coalesce(
      jsonb_agg(public._multideck_crm_lead_field_json(id, v_context.company_id) order by ordinality),
      '[]'::jsonb
    )
    into v_result
    from unnest(v_ids) with ordinality ordered(id, ordinality);

    return v_result;
  end if;

  raise exception 'That CRM settings action is not supported.' using errcode = '22023';
end;
$$;

revoke all on function public._multideck_crm_require_settings_manage(uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_pipeline_json(uuid, uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_lead_field_json(uuid, uuid) from public, anon, authenticated;
revoke all on function public.multideck_crm_mutate_pipeline_settings(text, uuid, jsonb) from public, anon;
grant execute on function public.multideck_crm_mutate_pipeline_settings(text, uuid, jsonb) to authenticated;

commit;
