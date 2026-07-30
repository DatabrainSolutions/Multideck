-- Authenticated CRM data access for the tenant Supabase project.
-- The web client previously depended on the ASP.NET API for these reads and writes. The tenant
-- deployment is physically isolated, so these RPCs authenticate the current cmp_Users row and
-- keep all CRM data inside the tenant's Supabase project.

begin;

create or replace function public._multideck_crm_initials(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select upper(
    coalesce(left((regexp_split_to_array(btrim(coalesce(p_value, '')), '\s+'))[1], 1), '') ||
    coalesce(left((regexp_split_to_array(btrim(coalesce(p_value, '')), '\s+'))[2], 1), '')
  );
$$;

create or replace function public._multideck_crm_context()
returns table(user_id uuid, company_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in again to use CRM.' using errcode = '42501';
  end if;

  return query
  select u."User_ID", u."Company_ID"
  from public."cmp_Users" u
  where u."Auth_User_ID" = auth.uid()
  limit 1;

  if not found then
    raise exception 'Your signed-in account is not linked to this Multideck workspace.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._multideck_crm_lead_json(p_lead_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', l."CRMLead_ID",
    'companyName', names.company_name,
    'initials', public._multideck_crm_initials(names.company_name),
    'primaryContactName', names.contact_name,
    'primaryContactEmail', coalesce(nullif(btrim(l."CRMLead_Email"), ''), contact_email.email),
    'countryCode', upper(nullif(btrim(l."CRMLead_CountryCode"), '')),
    'sourceCode', l."CRMLead_SourceCode",
    'sourceName', source."CRMLeadSource_Name",
    'ownerId', l."CRMLead_OwnerUserID",
    'ownerName', names.owner_name,
    'ownerInitials', case when names.owner_name is null then null else public._multideck_crm_initials(names.owner_name) end,
    'statusCode', l."CRMLead_StatusCode",
    'statusName', status."CRMLeadStatus_Name",
    'isOpen', status."CRMLeadStatus_IsOpen",
    'isConverted', status."CRMLeadStatus_IsConverted",
    'isDisqualified', status."CRMLeadStatus_IsDisqualified",
    'ratingCode', l."CRMLead_RatingCode",
    'ratingName', rating."CRMLeadRating_Name",
    'qualificationScore', coalesce(qualification.score, l."CRMLead_Score"),
    'qualificationCriteriaMet', coalesce(qualification.criteria_met, 0),
    'conversionProbability', l."CRMLead_AIProbabilityToConvert",
    'lastActivityAt',
      case
        when l."CRMLead_LastInteractionAt" is null then activity.activity_at
        when activity.activity_at is null then l."CRMLead_LastInteractionAt"
        else greatest(l."CRMLead_LastInteractionAt", activity.activity_at)
      end,
    'lastActivitySubject',
      case
        when activity.activity_at is not null
          and (l."CRMLead_LastInteractionAt" is null or activity.activity_at >= l."CRMLead_LastInteractionAt")
        then activity.subject
        else null
      end,
    'nextFollowUpAt', l."CRMLead_NextActionDueAt",
    'createdAt', l."CRMLead_CreatedAt",
    'valueAmount', coalesce(l."CRMLead_EstimatedValueAmount", valued_opportunity.value_amount),
    'valueCurrencyCode',
      upper(coalesce(
        case when l."CRMLead_EstimatedValueAmount" is not null then nullif(btrim(l."CRMLead_EstimatedValueCurrencyCode"), '') end,
        nullif(btrim(valued_opportunity.currency_code), '')
      )),
    'valueContext',
      coalesce(
        nullif(concat_ws(' · ', valued_opportunity.name, valued_opportunity.stage_name), ''),
        nullif(btrim(l."CRMLead_ServiceInterest"), ''),
        nullif(btrim(l."CRMLead_TradeLane"), '')
      ),
    'tradeLane', nullif(btrim(l."CRMLead_TradeLane"), ''),
    'serviceInterest', nullif(btrim(l."CRMLead_ServiceInterest"), ''),
    'openOpportunityCount', coalesce(open_opportunities.open_count, 0)
  )
  from public."CRM_Leads" l
  join public."sys_CRMLeadSources" source
    on source."CRMLeadSource_Code" = l."CRMLead_SourceCode"
  join public."sys_CRMLeadStatuses" status
    on status."CRMLeadStatus_Code" = l."CRMLead_StatusCode"
  join public."sys_CRMLeadRatings" rating
    on rating."CRMLeadRating_Code" = l."CRMLead_RatingCode"
  left join public."Org_Contacts" contact
    on contact."OrgContact_ID" = l."CRMLead_PrimaryContactID"
  left join public."cmp_Users" owner
    on owner."User_ID" = l."CRMLead_OwnerUserID"
  cross join lateral (
    select
      coalesce(
        nullif(btrim(l."CRMLead_PersonName"), ''),
        nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), '')
      ) as contact_name,
      coalesce(
        nullif(btrim(l."CRMLead_CompanyName"), ''),
        nullif(btrim(l."CRMLead_PersonName"), ''),
        nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), ''),
        'Unnamed lead'
      ) as company_name,
      coalesce(
        nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), ''),
        nullif(btrim(owner."User_Email"), '')
      ) as owner_name
  ) names
  left join lateral (
    select nullif(btrim(email."OrgContactEmail_Email"), '') as email
    from public."OrgContact_Emails" email
    where email."OrgContact_ID" = contact."OrgContact_ID"
    order by email."OrgContactEmail_Type", email."OrgContactEmail_ID"
    limit 1
  ) contact_email on true
  left join lateral (
    select
      a."CRMActivity_ActivityAt" as activity_at,
      a."CRMActivity_Subject" as subject
    from public."CRM_Activities" a
    where a."CRMActivity_LeadID" = l."CRMLead_ID"
      and not a."CRMActivity_IsDeleted"
    order by a."CRMActivity_ActivityAt" desc
    limit 1
  ) activity on true
  left join lateral (
    select
      q."CRMLeadQual_QualificationScore" as score,
      (
        (q."CRMLeadQual_HasAuthority" is true)::integer +
        (q."CRMLeadQual_HasBudget" is true)::integer +
        (q."CRMLeadQual_HasNeed" is true)::integer +
        (q."CRMLeadQual_HasTimeline" is true)::integer
      ) as criteria_met
    from public."CRM_LeadQualification" q
    where q."CRMLeadQual_LeadID" = l."CRMLead_ID"
    order by coalesce(q."CRMLeadQual_QualifiedAt", q."CRMLeadQual_CreatedAt") desc
    limit 1
  ) qualification on true
  left join lateral (
    select count(*)::integer as open_count
    from public."CRM_Opportunities" opportunity
    where opportunity."CRMOppty_SourceLeadID" = l."CRMLead_ID"
      and not opportunity."CRMOppty_IsDeleted"
      and opportunity."CRMOppty_WonAt" is null
      and opportunity."CRMOppty_LostAt" is null
  ) open_opportunities on true
  left join lateral (
    select
      opportunity."CRMOppty_ExpectedValueAmount" as value_amount,
      opportunity."CRMOppty_CurrencyCode" as currency_code,
      nullif(btrim(opportunity."CRMOppty_Name"), '') as name,
      stage."CRMStage_Name" as stage_name
    from public."CRM_Opportunities" opportunity
    join public."sys_CRMOpportunityStages" stage
      on stage."CRMStage_Code" = opportunity."CRMOppty_StageCode"
    where opportunity."CRMOppty_SourceLeadID" = l."CRMLead_ID"
      and not opportunity."CRMOppty_IsDeleted"
      and opportunity."CRMOppty_WonAt" is null
      and opportunity."CRMOppty_LostAt" is null
      and opportunity."CRMOppty_ExpectedValueAmount" is not null
    order by coalesce(opportunity."CRMOppty_LastActivityAt", opportunity."CRMOppty_CreatedAt") desc
    limit 1
  ) valued_opportunity on true
  where l."CRMLead_ID" = p_lead_id
    and not l."CRMLead_IsDeleted";
$$;

create or replace function public.multideck_crm_list_leads(p_search text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_search text := nullif(btrim(p_search), '');
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();

  select coalesce(
    jsonb_agg(
      public._multideck_crm_lead_json(l."CRMLead_ID")
      order by
        (l."CRMLead_NextActionDueAt" is null),
        l."CRMLead_NextActionDueAt",
        l."CRMLead_LastInteractionAt" desc nulls last,
        l."CRMLead_CreatedAt" desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public."CRM_Leads" l
  left join public."cmp_Users" owner on owner."User_ID" = l."CRMLead_OwnerUserID"
  where not l."CRMLead_IsDeleted"
    and (
      v_search is null
      or l."CRMLead_CompanyName" ilike '%' || v_search || '%'
      or l."CRMLead_PersonName" ilike '%' || v_search || '%'
      or l."CRMLead_Email" ilike '%' || v_search || '%'
      or owner."User_Email" ilike '%' || v_search || '%'
    );

  return v_result;
end;
$$;

create or replace function public.multideck_crm_get_lead(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_lead record;
  v_summary jsonb;
  v_company jsonb;
  v_contacts jsonb;
  v_activities jsonb;
begin
  select * into v_context from public._multideck_crm_context();

  select * into v_lead
  from public."CRM_Leads"
  where "CRMLead_ID" = p_lead_id and not "CRMLead_IsDeleted";

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  v_summary := public._multideck_crm_lead_json(p_lead_id);

  select jsonb_build_object(
    'organisationId', v_lead."CRMLead_OrgID",
    'email', coalesce(
      address."OrgAdd_MainEmail",
      v_lead."CRMLead_MetadataJSON" ->> 'companyEmail',
      v_lead."CRMLead_MetadataJSON" ->> 'organisationEmail'
    ),
    'website', coalesce(
      v_lead."CRMLead_MetadataJSON" ->> 'companyWebsite',
      v_lead."CRMLead_MetadataJSON" ->> 'website',
      v_lead."CRMLead_MetadataJSON" ->> 'websiteUrl'
    ),
    'phone', coalesce(
      address."OrgAdd_MainPhone",
      v_lead."CRMLead_MetadataJSON" ->> 'companyPhone',
      v_lead."CRMLead_MetadataJSON" ->> 'organisationPhone'
    ),
    'address', coalesce(
      nullif(concat_ws(', ',
        nullif(btrim(address."Org_NameOverride"), ''),
        nullif(btrim(address."OrgAdd_Line1"), ''),
        nullif(btrim(address."OrgAdd_Line2"), ''),
        nullif(btrim(concat_ws(' ',
          address."OrgAdd_TownCity",
          address."OrgAdd_CountyState",
          address."OrgAdd_PostZipCode"
        )), ''),
        nullif(btrim(address."OrgAdd_Country"), '')
      ), ''),
      v_lead."CRMLead_MetadataJSON" ->> 'companyAddress',
      v_lead."CRMLead_MetadataJSON" ->> 'address'
    )
  )
  into v_company
  from (select 1) seed
  left join lateral (
    select a.*
    from public."Org_Addresses" a
    where a."Org_ID" = v_lead."CRMLead_OrgID"
    order by (a."OrgAdd_MainEmail" is not null) desc, a."OrgAdd_ID"
    limit 1
  ) address on true;

  with linked_contacts as (
    select
      contact."OrgContact_ID" as id,
      nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), '') as name,
      profile."CRMContact_RoleCode" as role_code,
      email.email,
      phone.phone,
      contact."OrgContact_ID" = v_lead."CRMLead_PrimaryContactID" as is_primary,
      coalesce(
        profile."CRMContact_LastContactAt",
        case when contact."OrgContact_ID" = v_lead."CRMLead_PrimaryContactID"
          then (v_summary ->> 'lastActivityAt')::timestamptz
        end
      ) as last_contact_at
    from public."Org_Contacts" contact
    left join public."CRM_ContactProfiles" profile
      on profile."CRMContact_OrgContactID" = contact."OrgContact_ID"
    left join lateral (
      select nullif(btrim(e."OrgContactEmail_Email"), '') as email
      from public."OrgContact_Emails" e
      where e."OrgContact_ID" = contact."OrgContact_ID"
      order by e."OrgContactEmail_Type", e."OrgContactEmail_ID"
      limit 1
    ) email on true
    left join lateral (
      select nullif(btrim(i."CommIdentity_Address"), '') as phone
      from public."Comm_Identities" i
      where i."CommIdentity_ContactID" = contact."OrgContact_ID"
        and not i."CommIdentity_IsDeleted"
        and i."CommIdentity_ChannelCode" in ('phone', 'sms', 'whatsapp')
      order by coalesce(i."CommIdentity_LastSeenAt", i."CommIdentity_UpdatedAt") desc
      limit 1
    ) phone on true
    where contact."Org_ID" = v_lead."CRMLead_OrgID"
  ),
  contact_rows as (
    select * from linked_contacts
    union all
    select
      coalesce(v_lead."CRMLead_PrimaryContactID", v_lead."CRMLead_ID") as id,
      nullif(btrim(v_lead."CRMLead_PersonName"), '') as name,
      null::varchar as role_code,
      nullif(btrim(v_lead."CRMLead_Email"), '') as email,
      nullif(btrim(v_lead."CRMLead_Phone"), '') as phone,
      true as is_primary,
      (v_summary ->> 'lastActivityAt')::timestamptz as last_contact_at
    where (
      nullif(btrim(v_lead."CRMLead_PersonName"), '') is not null
      or nullif(btrim(v_lead."CRMLead_Email"), '') is not null
      or nullif(btrim(v_lead."CRMLead_Phone"), '') is not null
    )
    and not exists (
      select 1
      from linked_contacts existing
      where existing.id = v_lead."CRMLead_PrimaryContactID"
         or (
           existing.email is not null
           and lower(existing.email) = lower(nullif(btrim(v_lead."CRMLead_Email"), ''))
         )
    )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'initials', public._multideck_crm_initials(coalesce(name, email, '?')),
        'roleCode', role_code,
        'email', email,
        'phone', phone,
        'isPrimary', is_primary,
        'lastContactAt', last_contact_at
      )
      order by is_primary desc, name nulls last
    ),
    '[]'::jsonb
  )
  into v_contacts
  from contact_rows;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', activity."CRMActivity_ID",
        'typeCode', activity."CRMActivity_ActivityTypeCode",
        'subject', activity."CRMActivity_Subject",
        'summary', nullif(btrim(activity."CRMActivity_Summary"), ''),
        'activityAt', activity."CRMActivity_ActivityAt"
      )
      order by activity."CRMActivity_ActivityAt" desc
    ),
    '[]'::jsonb
  )
  into v_activities
  from (
    select *
    from public."CRM_Activities"
    where "CRMActivity_LeadID" = p_lead_id
      and not "CRMActivity_IsDeleted"
    order by "CRMActivity_ActivityAt" desc
    limit 8
  ) activity;

  return v_summary || jsonb_build_object(
    'company', v_company,
    'contacts', v_contacts,
    'activities', v_activities
  );
end;
$$;

create or replace function public._multideck_crm_deal_json(p_deal_id uuid, p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', deal."CRMOppty_ID",
    'organisationId', deal."CRMOppty_OrgID",
    'companyName', coalesce(
      nullif(btrim(source_lead."CRMLead_CompanyName"), ''),
      nullif(btrim(organisation."Org_Name"), ''),
      'Organisation'
    ),
    'sourceLeadId', coalesce(deal."CRMOppty_SourceLeadID", '00000000-0000-0000-0000-000000000000'::uuid),
    'name', deal."CRMOppty_Name",
    'pipelineId', deal."CRMOppty_PipelineID",
    'pipelineName', pipeline."CRMPipeline_Name",
    'pipelineStageId', deal."CRMOppty_PipelineStageID",
    'pipelineStageName', pipeline_stage."CRMPipelineStage_Name",
    'opportunityTypeCode', deal."CRMOppty_TypeCode",
    'opportunityTypeName', opportunity_type."CRMOpptyType_Name",
    'stageCode', deal."CRMOppty_StageCode",
    'stageName', opportunity_stage."CRMStage_Name",
    'statusCode', deal."CRMOppty_StatusCode",
    'statusName', opportunity_status."CRMOpptyStatus_Name",
    'primaryContactId', deal."CRMOppty_PrimaryContactID",
    'primaryContactName', nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), ''),
    'ownerId', deal."CRMOppty_OwnerUserID",
    'ownerName', coalesce(
      nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), ''),
      nullif(btrim(owner."User_Email"), '')
    ),
    'expectedCloseDate', deal."CRMOppty_ExpectedCloseDate",
    'expectedValueAmount', deal."CRMOppty_ExpectedValueAmount",
    'expectedMarginAmount', deal."CRMOppty_ExpectedMarginAmount",
    'currencyCode', nullif(btrim(deal."CRMOppty_CurrencyCode"), ''),
    'probabilityPct', deal."CRMOppty_ProbabilityPct",
    'modeCode', nullif(btrim(deal."CRMOppty_ModeCode"), ''),
    'directionCode', nullif(btrim(deal."CRMOppty_DirectionCode"), ''),
    'originName', nullif(btrim(deal."CRMOppty_OriginNameSnapshot"), ''),
    'destinationName', nullif(btrim(deal."CRMOppty_DestinationNameSnapshot"), ''),
    'tradeLane', nullif(btrim(deal."CRMOppty_TradeLane"), ''),
    'serviceInterest', nullif(btrim(deal."CRMOppty_ServiceInterest"), ''),
    'customerNeed', nullif(btrim(deal."CRMOppty_CustomerNeed"), ''),
    'valueProposition', nullif(btrim(deal."CRMOppty_ValueProposition"), ''),
    'nextActionDueAt', deal."CRMOppty_NextActionDueAt",
    'createdAt', deal."CRMOppty_CreatedAt",
    'wasAlreadyConverted', false
  )
  from public."CRM_Opportunities" deal
  join public."CRM_Pipelines" pipeline
    on pipeline."CRMPipeline_ID" = deal."CRMOppty_PipelineID"
    and pipeline."Company_ID" = p_company_id
    and not pipeline."Is_Deleted"
  join public."CRM_PipelineStages" pipeline_stage
    on pipeline_stage."CRMPipelineStage_ID" = deal."CRMOppty_PipelineStageID"
    and pipeline_stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID"
    and not pipeline_stage."Is_Deleted"
  join public."sys_CRMOpportunityTypes" opportunity_type
    on opportunity_type."CRMOpptyType_Code" = deal."CRMOppty_TypeCode"
  join public."sys_CRMOpportunityStages" opportunity_stage
    on opportunity_stage."CRMStage_Code" = deal."CRMOppty_StageCode"
  join public."sys_CRMOpportunityStatuses" opportunity_status
    on opportunity_status."CRMOpptyStatus_Code" = deal."CRMOppty_StatusCode"
  left join public."CRM_Leads" source_lead
    on source_lead."CRMLead_ID" = deal."CRMOppty_SourceLeadID"
  left join public."Org_Master" organisation
    on organisation."Org_id" = deal."CRMOppty_OrgID"
  left join public."Org_Contacts" contact
    on contact."OrgContact_ID" = deal."CRMOppty_PrimaryContactID"
  left join public."cmp_Users" owner
    on owner."User_ID" = deal."CRMOppty_OwnerUserID"
  where deal."CRMOppty_ID" = p_deal_id
    and not deal."CRMOppty_IsDeleted";
$$;

create or replace function public.multideck_crm_list_deals()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();

  select coalesce(
    jsonb_agg(
      public._multideck_crm_deal_json(deal."CRMOppty_ID", v_context.company_id)
      order by
        (deal."CRMOppty_ExpectedCloseDate" is null),
        deal."CRMOppty_ExpectedCloseDate",
        deal."CRMOppty_CreatedAt" desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public."CRM_Opportunities" deal
  join public."CRM_Pipelines" pipeline
    on pipeline."CRMPipeline_ID" = deal."CRMOppty_PipelineID"
    and pipeline."Company_ID" = v_context.company_id
    and not pipeline."Is_Deleted"
  join public."CRM_PipelineStages" stage
    on stage."CRMPipelineStage_ID" = deal."CRMOppty_PipelineStageID"
    and not stage."Is_Deleted"
  where not deal."CRMOppty_IsDeleted";

  return v_result;
end;
$$;

create or replace function public.multideck_crm_deal_conversion_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();

  select jsonb_build_object(
    'opportunityTypes',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', type."CRMOpptyType_Code",
          'name', type."CRMOpptyType_Name",
          'description', type."CRMOpptyType_Description"
        )
        order by type."CRMOpptyType_SortOrder", type."CRMOpptyType_Name"
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public."sys_CRMOpportunityTypes" type
  where type."CRMOpptyType_IsActive";

  return v_result;
end;
$$;

create or replace function public.multideck_crm_pipeline_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_pipelines jsonb;
  v_fields jsonb;
begin
  select * into v_context from public._multideck_crm_context();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
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
      order by pipeline."CRMPipeline_SortOrder", pipeline."CRMPipeline_Name"
    ),
    '[]'::jsonb
  )
  into v_pipelines
  from public."CRM_Pipelines" pipeline
  where pipeline."Company_ID" = v_context.company_id
    and not pipeline."Is_Deleted";

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', field."CRMLeadField_ID",
        'label', field."CRMLeadField_Label",
        'type', field."CRMLeadField_TypeCode",
        'options', coalesce(field."CRMLeadField_OptionsJSON", '[]'::jsonb),
        'activeOptions', coalesce(field."CRMLeadField_ActiveOptionsJSON", '[]'::jsonb),
        'sortOrder', field."CRMLeadField_SortOrder"
      )
      order by field."CRMLeadField_SortOrder", field."CRMLeadField_Label"
    ),
    '[]'::jsonb
  )
  into v_fields
  from public."CRM_LeadFieldSettings" field
  where field."Company_ID" = v_context.company_id
    and not field."Is_Deleted";

  return jsonb_build_object('pipelines', v_pipelines, 'fields', v_fields);
end;
$$;

create or replace function public.multideck_crm_move_deal_stage(
  p_deal_id uuid,
  p_pipeline_id uuid,
  p_pipeline_stage_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_stage record;
  v_deal record;
begin
  select * into v_context from public._multideck_crm_context();

  select stage.* into v_stage
  from public."CRM_PipelineStages" stage
  join public."CRM_Pipelines" pipeline
    on pipeline."CRMPipeline_ID" = stage."CRMPipeline_ID"
  where stage."CRMPipelineStage_ID" = p_pipeline_stage_id
    and stage."CRMPipeline_ID" = p_pipeline_id
    and stage."Company_ID" = v_context.company_id
    and pipeline."Company_ID" = v_context.company_id
    and not stage."Is_Deleted"
    and not pipeline."Is_Deleted";

  if not found then
    raise exception 'Choose a stage from an active pipeline in this workspace.' using errcode = '22023';
  end if;

  select deal.* into v_deal
  from public."CRM_Opportunities" deal
  join public."CRM_Pipelines" pipeline
    on pipeline."CRMPipeline_ID" = deal."CRMOppty_PipelineID"
  where deal."CRMOppty_ID" = p_deal_id
    and not deal."CRMOppty_IsDeleted"
    and pipeline."Company_ID" = v_context.company_id
    and not pipeline."Is_Deleted"
  for update of deal;

  if not found then
    raise exception 'Deal not found.' using errcode = 'P0002';
  end if;

  update public."CRM_Opportunities"
  set
    "CRMOppty_PipelineID" = p_pipeline_id,
    "CRMOppty_PipelineStageID" = p_pipeline_stage_id,
    "CRMOppty_ProbabilityPct" = v_stage."CRMPipelineStage_ProbabilityPct",
    "CRMOppty_WeightedValueAmount" =
      case
        when v_deal."CRMOppty_ExpectedValueAmount" is null then null
        else round(
          v_deal."CRMOppty_ExpectedValueAmount" * v_stage."CRMPipelineStage_ProbabilityPct" / 100,
          4
        )
      end,
    "CRMOppty_UpdatedAt" = now(),
    "CRMOppty_UpdatedBy" = v_context.user_id
  where "CRMOppty_ID" = p_deal_id;

  insert into public."CRM_OpportunityStageHistory" (
    "CRMOpptyStage_ID",
    "CRMOpptyStage_OpportunityID",
    "CRMOpptyStage_FromStageCode",
    "CRMOpptyStage_ToStageCode",
    "CRMOpptyStage_ProbabilityPct",
    "CRMOpptyStage_Reason",
    "CRMOpptyStage_ChangedAt",
    "CRMOpptyStage_ChangedBy"
  )
  values (
    gen_random_uuid(),
    p_deal_id,
    v_deal."CRMOppty_StageCode",
    v_deal."CRMOppty_StageCode",
    v_stage."CRMPipelineStage_ProbabilityPct",
    'Moved to ' || v_stage."CRMPipelineStage_Name",
    now(),
    v_context.user_id
  );

  return public._multideck_crm_deal_json(p_deal_id, v_context.company_id);
end;
$$;

create or replace function public.multideck_crm_convert_lead(
  p_lead_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_lead record;
  v_existing_id uuid;
  v_deal_id uuid := gen_random_uuid();
  v_name text := nullif(btrim(p_input ->> 'name'), '');
  v_type_code text := nullif(btrim(p_input ->> 'opportunityTypeCode'), '');
  v_primary_contact_id uuid := nullif(p_input ->> 'primaryContactId', '')::uuid;
  v_expected_close_date date := nullif(p_input ->> 'expectedCloseDate', '')::date;
  v_expected_value numeric := nullif(p_input ->> 'expectedValueAmount', '')::numeric;
  v_expected_margin numeric := nullif(p_input ->> 'expectedMarginAmount', '')::numeric;
  v_currency text := upper(nullif(btrim(p_input ->> 'currencyCode'), ''));
  v_probability numeric := coalesce(nullif(p_input ->> 'probabilityPct', '')::numeric, 0);
  v_next_action timestamptz := nullif(p_input ->> 'nextActionDueAt', '')::timestamptz;
  v_customer_need text := nullif(btrim(p_input ->> 'customerNeed'), '');
  v_pipeline record;
  v_pipeline_stage record;
  v_stage_code text;
  v_status_code text;
  v_forecast_code text;
  v_converted_status text;
  v_account_id uuid;
begin
  select * into v_context from public._multideck_crm_context();
  perform pg_advisory_xact_lock(hashtextextended(p_lead_id::text, 0));

  select deal."CRMOppty_ID" into v_existing_id
  from public."CRM_Opportunities" deal
  join public."CRM_Pipelines" pipeline
    on pipeline."CRMPipeline_ID" = deal."CRMOppty_PipelineID"
  where deal."CRMOppty_SourceLeadID" = p_lead_id
    and not deal."CRMOppty_IsDeleted"
    and pipeline."Company_ID" = v_context.company_id
    and not pipeline."Is_Deleted"
  limit 1;

  if v_existing_id is not null then
    return public._multideck_crm_deal_json(v_existing_id, v_context.company_id)
      || jsonb_build_object('wasAlreadyConverted', true);
  end if;

  select * into v_lead
  from public."CRM_Leads"
  where "CRMLead_ID" = p_lead_id and not "CRMLead_IsDeleted"
  for update;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if v_lead."CRMLead_OrgID" is null then
    raise exception 'Add a company to this lead before converting it to a deal.' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'Give the deal a name.' using errcode = '22023';
  end if;
  if length(v_name) > 240 then
    raise exception 'Deal names must be 240 characters or fewer.' using errcode = '22023';
  end if;
  if v_type_code is null then
    raise exception 'Choose a deal type.' using errcode = '22023';
  end if;
  if v_expected_close_date is null or v_expected_close_date < current_date then
    raise exception 'Expected close date cannot be in the past.' using errcode = '22023';
  end if;
  if coalesce(v_expected_value, 0) < 0 then
    raise exception 'Expected value cannot be negative.' using errcode = '22023';
  end if;
  if coalesce(v_expected_margin, 0) < 0 then
    raise exception 'Expected margin cannot be negative.' using errcode = '22023';
  end if;
  if (v_expected_value is not null or v_expected_margin is not null) and v_currency is null then
    raise exception 'Choose a currency for the commercial values.' using errcode = '22023';
  end if;
  if v_probability < 0 or v_probability > 100 then
    raise exception 'Probability must be between 0 and 100.' using errcode = '22023';
  end if;
  if v_customer_need is null then
    raise exception 'Describe what the customer needs from this deal.' using errcode = '22023';
  end if;
  if v_next_action is null or v_next_action <= now() then
    raise exception 'Next action must be in the future.' using errcode = '22023';
  end if;

  if v_primary_contact_id is not null and not exists (
    select 1
    from public."Org_Contacts"
    where "OrgContact_ID" = v_primary_contact_id
      and "Org_ID" = v_lead."CRMLead_OrgID"
  ) then
    raise exception 'Choose a contact linked to this lead''s company.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public."sys_CRMOpportunityTypes"
    where "CRMOpptyType_Code" = v_type_code
      and "CRMOpptyType_IsActive"
  ) then
    raise exception 'Choose an active deal type.' using errcode = '22023';
  end if;

  select * into v_pipeline
  from public."CRM_Pipelines"
  where "Company_ID" = v_context.company_id and not "Is_Deleted"
  order by "CRMPipeline_SortOrder"
  limit 1;
  if not found then
    raise exception 'Create a deal pipeline before converting this lead.' using errcode = '22023';
  end if;

  select * into v_pipeline_stage
  from public."CRM_PipelineStages"
  where "Company_ID" = v_context.company_id
    and "CRMPipeline_ID" = v_pipeline."CRMPipeline_ID"
    and not "Is_Deleted"
  order by "CRMPipelineStage_IsDefaultEntry" desc, "CRMPipelineStage_SortOrder"
  limit 1;
  if not found then
    raise exception 'Add an entry stage to this deal pipeline before converting this lead.' using errcode = '22023';
  end if;

  select "CRMStage_Code" into v_stage_code
  from public."sys_CRMOpportunityStages"
  where "CRMStage_IsActive" and "CRMStage_IsOpen"
  order by "CRMStage_SortOrder"
  limit 1;

  select "CRMOpptyStatus_Code" into v_status_code
  from public."sys_CRMOpportunityStatuses"
  where "CRMOpptyStatus_IsActive" and "CRMOpptyStatus_IsOpen"
  order by "CRMOpptyStatus_SortOrder"
  limit 1;

  select "CRMForecast_Code" into v_forecast_code
  from public."sys_CRMForecastCategories"
  where "CRMForecast_IsActive" and "CRMForecast_IsIncluded"
  order by "CRMForecast_SortOrder"
  limit 1;

  select "CRMLeadStatus_Code" into v_converted_status
  from public."sys_CRMLeadStatuses"
  where "CRMLeadStatus_IsActive" and "CRMLeadStatus_IsConverted"
  order by "CRMLeadStatus_SortOrder"
  limit 1;

  if v_stage_code is null or v_status_code is null or v_forecast_code is null or v_converted_status is null then
    raise exception 'The workspace CRM lookups are incomplete.' using errcode = '55000';
  end if;

  select "CRMAccount_ID" into v_account_id
  from public."CRM_AccountProfiles"
  where "CRMAccount_OrgID" = v_lead."CRMLead_OrgID"
    and not "CRMAccount_IsDeleted"
  limit 1;

  insert into public."CRM_Opportunities" (
    "CRMOppty_ID",
    "CRMOppty_AccountID",
    "CRMOppty_OrgID",
    "CRMOppty_PrimaryContactID",
    "CRMOppty_SourceLeadID",
    "CRMOppty_OwnerUserID",
    "CRMOppty_OrgOfficeID",
    "CRMOppty_LegalEntityID",
    "CRMOppty_BrandID",
    "CRMOppty_PipelineID",
    "CRMOppty_PipelineStageID",
    "CRMOppty_Name",
    "CRMOppty_TypeCode",
    "CRMOppty_StageCode",
    "CRMOppty_StatusCode",
    "CRMOppty_ForecastCategoryCode",
    "CRMOppty_ModeCode",
    "CRMOppty_DirectionCode",
    "CRMOppty_OriginNameSnapshot",
    "CRMOppty_DestinationNameSnapshot",
    "CRMOppty_TradeLane",
    "CRMOppty_ServiceInterest",
    "CRMOppty_ExpectedCloseDate",
    "CRMOppty_ProbabilityPct",
    "CRMOppty_ExpectedValueAmount",
    "CRMOppty_ExpectedMarginAmount",
    "CRMOppty_CurrencyCode",
    "CRMOppty_WeightedValueAmount",
    "CRMOppty_NextActionDueAt",
    "CRMOppty_LastActivityAt",
    "CRMOppty_CustomerNeed",
    "CRMOppty_ValueProposition",
    "CRMOppty_MetadataJSON",
    "CRMOppty_CreatedAt",
    "CRMOppty_CreatedBy",
    "CRMOppty_UpdatedAt",
    "CRMOppty_UpdatedBy",
    "CRMOppty_IsDeleted"
  )
  values (
    v_deal_id,
    v_account_id,
    v_lead."CRMLead_OrgID",
    coalesce(v_primary_contact_id, v_lead."CRMLead_PrimaryContactID"),
    p_lead_id,
    coalesce(v_lead."CRMLead_OwnerUserID", v_context.user_id),
    v_lead."CRMLead_OrgOfficeID",
    v_lead."CRMLead_LegalEntityID",
    v_lead."CRMLead_BrandID",
    v_pipeline."CRMPipeline_ID",
    v_pipeline_stage."CRMPipelineStage_ID",
    v_name,
    v_type_code,
    v_stage_code,
    v_status_code,
    v_forecast_code,
    coalesce(nullif(btrim(p_input ->> 'modeCode'), ''), v_lead."CRMLead_ModeCode"),
    coalesce(nullif(btrim(p_input ->> 'directionCode'), ''), v_lead."CRMLead_DirectionCode"),
    nullif(btrim(p_input ->> 'originName'), ''),
    nullif(btrim(p_input ->> 'destinationName'), ''),
    coalesce(nullif(btrim(p_input ->> 'tradeLane'), ''), v_lead."CRMLead_TradeLane"),
    coalesce(nullif(btrim(p_input ->> 'serviceInterest'), ''), v_lead."CRMLead_ServiceInterest"),
    v_expected_close_date,
    round(v_probability, 2),
    v_expected_value,
    v_expected_margin,
    v_currency,
    case when v_expected_value is null then null else round(v_expected_value * v_probability / 100, 4) end,
    v_next_action,
    v_lead."CRMLead_LastInteractionAt",
    v_customer_need,
    nullif(btrim(p_input ->> 'valueProposition'), ''),
    jsonb_build_object('convertedFromLeadId', p_lead_id, 'conversionSource', 'lead_conversion_wizard'),
    now(),
    v_context.user_id,
    now(),
    v_context.user_id,
    false
  );

  insert into public."CRM_OpportunityStageHistory" (
    "CRMOpptyStage_ID",
    "CRMOpptyStage_OpportunityID",
    "CRMOpptyStage_ToStageCode",
    "CRMOpptyStage_ProbabilityPct",
    "CRMOpptyStage_Reason",
    "CRMOpptyStage_ChangedAt",
    "CRMOpptyStage_ChangedBy"
  )
  values (
    gen_random_uuid(),
    v_deal_id,
    v_stage_code,
    v_probability,
    'Created from lead conversion',
    now(),
    v_context.user_id
  );

  insert into public."CRM_LeadConversions" (
    "CRMLeadConv_ID",
    "CRMLeadConv_LeadID",
    "CRMLeadConv_OrgID",
    "CRMLeadConv_AccountID",
    "CRMLeadConv_OpportunityID",
    "CRMLeadConv_ConvertedAt",
    "CRMLeadConv_ConvertedBy",
    "CRMLeadConv_ConversionNotes"
  )
  values (
    gen_random_uuid(),
    p_lead_id,
    v_lead."CRMLead_OrgID",
    v_account_id,
    v_deal_id,
    now(),
    v_context.user_id,
    nullif(btrim(p_input ->> 'conversionNotes'), '')
  );

  insert into public."CRM_LeadStatusHistory" (
    "CRMLeadStatus_ID",
    "CRMLeadStatus_LeadID",
    "CRMLeadStatus_FromStatusCode",
    "CRMLeadStatus_ToStatusCode",
    "CRMLeadStatus_Reason",
    "CRMLeadStatus_ChangedAt",
    "CRMLeadStatus_ChangedBy"
  )
  values (
    gen_random_uuid(),
    p_lead_id,
    v_lead."CRMLead_StatusCode",
    v_converted_status,
    'Converted to deal',
    now(),
    v_context.user_id
  );

  update public."CRM_Leads"
  set
    "CRMLead_StatusCode" = v_converted_status,
    "CRMLead_UpdatedAt" = now(),
    "CRMLead_UpdatedBy" = v_context.user_id
  where "CRMLead_ID" = p_lead_id;

  return public._multideck_crm_deal_json(v_deal_id, v_context.company_id);
end;
$$;

revoke all on function public._multideck_crm_initials(text) from public, anon, authenticated;
revoke all on function public._multideck_crm_context() from public, anon, authenticated;
revoke all on function public._multideck_crm_lead_json(uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_deal_json(uuid, uuid) from public, anon, authenticated;

revoke all on function public.multideck_crm_list_leads(text) from public, anon;
revoke all on function public.multideck_crm_get_lead(uuid) from public, anon;
revoke all on function public.multideck_crm_list_deals() from public, anon;
revoke all on function public.multideck_crm_deal_conversion_options() from public, anon;
revoke all on function public.multideck_crm_pipeline_settings() from public, anon;
revoke all on function public.multideck_crm_move_deal_stage(uuid, uuid, uuid) from public, anon;
revoke all on function public.multideck_crm_convert_lead(uuid, jsonb) from public, anon;

grant execute on function public.multideck_crm_list_leads(text) to authenticated;
grant execute on function public.multideck_crm_get_lead(uuid) to authenticated;
grant execute on function public.multideck_crm_list_deals() to authenticated;
grant execute on function public.multideck_crm_deal_conversion_options() to authenticated;
grant execute on function public.multideck_crm_pipeline_settings() to authenticated;
grant execute on function public.multideck_crm_move_deal_stage(uuid, uuid, uuid) to authenticated;
grant execute on function public.multideck_crm_convert_lead(uuid, jsonb) to authenticated;

commit;
