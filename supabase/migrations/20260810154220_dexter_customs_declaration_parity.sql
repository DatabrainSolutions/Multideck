-- Connect the existing user-owned Customs declaration register to Dexter chat
-- and deterministic Watching for you. Provider filing intentionally remains
-- in the Customs workspace so the operator sees validation and confirms submit.

begin;

create or replace function public.multideck_dexter_domain_customs_declarations(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
  select coalesce(jsonb_agg(row_data order by search_rank desc, sort_updated desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'recordId', declaration."CUST_id",
        'reference', coalesce(declaration."CUST_LocalReferenceNumber", declaration."CUST_id"::text),
        'traderReference', declaration."CUST_TraderReference",
        'ucr', declaration."CUST_UCR",
        'status', declaration."CUST_Status",
        'direction', declaration."CUST_Direction",
        'declarationKind', declaration."CUST_DeclarationKind",
        'jurisdiction', declaration."CUST_JurisdictionCode",
        'destinationCountry', declaration."CUST_CountryOfDestinationCodeSnapshot",
        'invoiceAmount', declaration."CUST_InvoiceAmount",
        'currency', declaration."CUST_InvoiceCurrencyCodeSnapshot",
        'itemCount', coalesce(items.item_count, 0),
        'customsReference', declaration."CUST_CustomsReferenceNumber",
        'mrn', coalesce(latest_submission."ICUSS_MRN", declaration."CUST_MasterReferenceNumber"),
        'iCustomsStatus', declaration."CUST_iCustomsStatusSnapshot",
        'submissionStatus', latest_submission."ICUSS_Status",
        'submissionErrorCode', latest_submission."ICUSS_ErrorCode",
        'submissionErrorMessage', latest_submission."ICUSS_ErrorMessage",
        'submittedAt', latest_submission."ICUSS_SubmittedAt",
        'acknowledgedAt', latest_submission."ICUSS_AcknowledgedAt",
        'completedAt', latest_submission."ICUSS_CompletedAt",
        'createdAt', declaration."CUST_CreatedAt",
        'updatedAt', declaration."CUST_UpdatedAt",
        'searchEvidence', evidence.value - 'matched'
      ) as row_data,
      coalesce((evidence.value->>'confidence')::numeric, 0) as search_rank,
      declaration."CUST_UpdatedAt" as sort_updated
    from public."Customs_Declarations" declaration
    left join lateral (
      select count(*)::integer as item_count
      from public."Customs_Items" item
      where item."CUSTI_CustomsID" = declaration."CUST_id"
    ) items on true
    left join lateral (
      select submission.*
      from public."ICUS_Submissions" submission
      where submission."ICUSS_CustomsID" = declaration."CUST_id"
      order by submission."ICUSS_CreatedAt" desc, submission."ICUSS_id" desc
      limit 1
    ) latest_submission on true
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'recordId', declaration."CUST_id",
        'reference', declaration."CUST_LocalReferenceNumber",
        'traderReference', declaration."CUST_TraderReference",
        'ucr', declaration."CUST_UCR",
        'status', declaration."CUST_Status",
        'direction', declaration."CUST_Direction",
        'declarationKind', declaration."CUST_DeclarationKind",
        'jurisdiction', declaration."CUST_JurisdictionCode",
        'destinationCountry', declaration."CUST_CountryOfDestinationCodeSnapshot",
        'customsReference', declaration."CUST_CustomsReferenceNumber",
        'mrn', coalesce(latest_submission."ICUSS_MRN", declaration."CUST_MasterReferenceNumber"),
        'iCustomsStatus', declaration."CUST_iCustomsStatusSnapshot",
        'submissionStatus', latest_submission."ICUSS_Status"
      ),
      array['recordId', 'reference', 'traderReference', 'ucr', 'customsReference', 'mrn']::text[]
    ) evidence(value)
    where declaration."CUST_CreatedBy" = auth.uid()
      and not declaration."CUST_IsDeleted"
      and exists (
        select 1
        from public."cmp_Users" workspace_user
        where workspace_user."Auth_User_ID" = auth.uid()
          and workspace_user."Company_ID" = p_company_id
      )
      and (evidence.value->>'matched')::boolean
    order by search_rank desc, declaration."CUST_UpdatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) declarations;
$$;

revoke all on function public.multideck_dexter_domain_customs_declarations(uuid, text, integer)
from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code",
  "AIDexterDomain_Name",
  "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive",
  "AIDexterDomain_UpdatedAt"
) values (
  'customs_declarations',
  'Customs declarations',
  'The signed-in operator''s Customs declaration drafts and filing evidence, including status, references, destination, value, item count and the latest recorded iCustoms submission state.',
  'multideck_dexter_domain_customs_declarations',
  25,
  true,
  now()
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now();

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code",
  "AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_IsActive",
  "AIDexterWatchCapability_UpdatedAt"
) values (
  'customs_declarations',
  'Customs declarations',
  'Status, reference, destination, value and recorded iCustoms submission changes for one exact declaration owned by the signed-in operator.',
  '["status","iCustomsStatus","submissionStatus","customsReference","mrn","lrn","destinationCountry","invoiceAmount","currency","errorCode","submittedAt","acknowledgedAt","completedAt","updatedAt"]'::jsonb,
  25,
  true,
  now()
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_UpdatedAt" = now();

-- Customs declarations are user-owned in the current product. Requiring an
-- exact owned target keeps both record reads and watch delivery on that same
-- boundary; a company-wide watch must not reveal another operator's draft.
create or replace function public.multideck_dexter_create_watch(
  p_capability text,
  p_title text,
  p_summary text,
  p_request text,
  p_target_id uuid,
  p_target_label text,
  p_rule jsonb,
  p_action jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_watch public."AI_DexterWatches";
  v_fields jsonb;
  v_field text;
  v_capability text := lower(btrim(p_capability));
begin
  select * into v_context from public._multideck_dexter_context();

  select capability."AIDexterWatchCapability_FieldsJSON"
  into v_fields
  from public."sys_AIDexterWatchCapabilities" capability
  where capability."AIDexterWatchCapability_Code" = v_capability
    and capability."AIDexterWatchCapability_IsActive";

  if v_fields is null then
    raise exception 'That source cannot be watched yet.' using errcode = '22023';
  end if;

  if v_capability = 'email' and not (
    public._multideck_dexter_has_permission(v_context.user_id, 'Email.Read')
    and public._multideck_dexter_has_permission(v_context.user_id, 'Email.AIRead')
  ) then
    raise exception 'You do not have permission to watch email.' using errcode = '42501';
  end if;

  if v_capability = 'customs_declarations' and (
    p_target_id is null
    or not exists (
      select 1
      from public."Customs_Declarations" declaration
      where declaration."CUST_id" = p_target_id
        and declaration."CUST_CreatedBy" = auth.uid()
        and not declaration."CUST_IsDeleted"
        and exists (
          select 1
          from public."cmp_Users" workspace_user
          where workspace_user."User_ID" = v_context.user_id
            and workspace_user."Company_ID" = v_context.company_id
            and workspace_user."Auth_User_ID" = auth.uid()
        )
    )
  ) then
    raise exception 'Choose an exact Customs declaration that you own before creating this watch.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_rule) <> 'object' then
    raise exception 'The watch rule is invalid.' using errcode = '22023';
  end if;

  v_field := p_rule->>'field';
  if v_field is null or not v_fields ? v_field then
    raise exception 'That field cannot be watched.' using errcode = '22023';
  end if;

  if coalesce(p_rule->>'operator', '') not in ('changed', 'eq', 'neq', 'contains', 'contains_all', 'gt', 'gte', 'lt', 'lte') then
    raise exception 'That watch condition is not supported.' using errcode = '22023';
  end if;

  if p_action is not null and not exists (
    select 1
    from public."sys_AIDexterActions" action
    where action."AIDexterAction_Code" = p_action->>'action'
      and action."AIDexterAction_DomainCode" = v_capability
      and action."AIDexterAction_IsActive"
  ) then
    raise exception 'That prepared action is not available for this watch.' using errcode = '22023';
  end if;

  insert into public."AI_DexterWatches" (
    "AIDexterWatch_CompanyID",
    "AIDexterWatch_OwnerUserID",
    "AIDexterWatch_CapabilityCode",
    "AIDexterWatch_Title",
    "AIDexterWatch_Summary",
    "AIDexterWatch_Request",
    "AIDexterWatch_TargetID",
    "AIDexterWatch_TargetLabel",
    "AIDexterWatch_RuleJSON",
    "AIDexterWatch_ActionJSON"
  ) values (
    v_context.company_id,
    v_context.user_id,
    v_capability,
    left(btrim(p_title), 180),
    left(btrim(p_summary), 2000),
    left(btrim(p_request), 4000),
    p_target_id,
    nullif(left(btrim(p_target_label), 240), ''),
    p_rule,
    p_action
  )
  returning * into v_watch;

  return jsonb_build_object(
    'id', v_watch."AIDexterWatch_ID",
    'title', v_watch."AIDexterWatch_Title",
    'summary', v_watch."AIDexterWatch_Summary",
    'capability', v_watch."AIDexterWatch_CapabilityCode",
    'status', v_watch."AIDexterWatch_StatusCode",
    'targetLabel', v_watch."AIDexterWatch_TargetLabel",
    'rule', v_watch."AIDexterWatch_RuleJSON",
    'action', v_watch."AIDexterWatch_ActionJSON",
    'createdAt', v_watch."AIDexterWatch_CreatedAt",
    'updatedAt', v_watch."AIDexterWatch_UpdatedAt",
    'triggerCount', v_watch."AIDexterWatch_TriggerCount"
  );
end;
$$;

revoke all on function public.multideck_dexter_create_watch(text, text, text, text, uuid, text, jsonb, jsonb)
from public, anon;
grant execute on function public.multideck_dexter_create_watch(text, text, text, text, uuid, text, jsonb, jsonb)
to authenticated;

create or replace function public._multideck_dexter_customs_declaration_watch_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid;
  v_owner_user_id uuid;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb;
begin
  select workspace_user."Company_ID", workspace_user."User_ID"
  into v_company_id, v_owner_user_id
  from public."cmp_Users" workspace_user
  where workspace_user."Auth_User_ID" = new."CUST_CreatedBy"
  order by workspace_user."User_ID"
  limit 1;

  if v_company_id is null or v_owner_user_id is null then
    return new;
  end if;

  if tg_op <> 'INSERT' then
    v_old := jsonb_build_object(
      'status', old."CUST_Status",
      'iCustomsStatus', old."CUST_iCustomsStatusSnapshot",
      'customsReference', old."CUST_CustomsReferenceNumber",
      'mrn', old."CUST_MasterReferenceNumber",
      'destinationCountry', old."CUST_CountryOfDestinationCodeSnapshot",
      'invoiceAmount', old."CUST_InvoiceAmount",
      'currency', old."CUST_InvoiceCurrencyCodeSnapshot",
      'updatedAt', old."CUST_UpdatedAt"
    );
  end if;

  v_new := jsonb_build_object(
    'reference', coalesce(new."CUST_LocalReferenceNumber", new."CUST_id"::text),
    'status', new."CUST_Status",
    'iCustomsStatus', new."CUST_iCustomsStatusSnapshot",
    'customsReference', new."CUST_CustomsReferenceNumber",
    'mrn', new."CUST_MasterReferenceNumber",
    'destinationCountry', new."CUST_CountryOfDestinationCodeSnapshot",
    'invoiceAmount', new."CUST_InvoiceAmount",
    'currency', new."CUST_InvoiceCurrencyCodeSnapshot",
    'updatedAt', new."CUST_UpdatedAt"
  );

  if exists (
    select 1
    from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_OwnerUserID" = v_owner_user_id
      and watch."AIDexterWatch_CapabilityCode" = 'customs_declarations'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and watch."AIDexterWatch_TargetID" = new."CUST_id"
  ) then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID",
      "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON",
      "AIDexterWatchSignal_NewJSON"
    ) values (
      v_company_id,
      'customs_declarations',
      tg_table_name,
      new."CUST_id",
      v_old,
      v_new
    );
  end if;

  return new;
end;
$$;

revoke all on function public._multideck_dexter_customs_declaration_watch_change()
from public, anon, authenticated;

drop trigger if exists "TR_Customs_Declarations_dexter_watch" on public."Customs_Declarations";
create trigger "TR_Customs_Declarations_dexter_watch"
after insert or update of
  "CUST_Status",
  "CUST_iCustomsStatusSnapshot",
  "CUST_CustomsReferenceNumber",
  "CUST_MasterReferenceNumber",
  "CUST_CountryOfDestinationCodeSnapshot",
  "CUST_InvoiceAmount",
  "CUST_InvoiceCurrencyCodeSnapshot",
  "CUST_UpdatedAt"
on public."Customs_Declarations"
for each row execute function public._multideck_dexter_customs_declaration_watch_change();

create or replace function public._multideck_dexter_customs_submission_watch_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_declaration public."Customs_Declarations";
  v_company_id uuid;
  v_owner_user_id uuid;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb;
begin
  if new."ICUSS_CustomsID" is null then
    return new;
  end if;

  select declaration.*
  into v_declaration
  from public."Customs_Declarations" declaration
  where declaration."CUST_id" = new."ICUSS_CustomsID"
    and not declaration."CUST_IsDeleted";

  if v_declaration."CUST_id" is null then
    return new;
  end if;

  select workspace_user."Company_ID", workspace_user."User_ID"
  into v_company_id, v_owner_user_id
  from public."cmp_Users" workspace_user
  where workspace_user."Auth_User_ID" = v_declaration."CUST_CreatedBy"
  order by workspace_user."User_ID"
  limit 1;

  if v_company_id is null or v_owner_user_id is null then
    return new;
  end if;

  if tg_op <> 'INSERT' then
    v_old := jsonb_build_object(
      'status', v_declaration."CUST_Status",
      'iCustomsStatus', v_declaration."CUST_iCustomsStatusSnapshot",
      'submissionStatus', old."ICUSS_Status",
      'customsReference', v_declaration."CUST_CustomsReferenceNumber",
      'mrn', coalesce(old."ICUSS_MRN", v_declaration."CUST_MasterReferenceNumber"),
      'lrn', old."ICUSS_LRN",
      'errorCode', old."ICUSS_ErrorCode",
      'submittedAt', old."ICUSS_SubmittedAt",
      'acknowledgedAt', old."ICUSS_AcknowledgedAt",
      'completedAt', old."ICUSS_CompletedAt"
    );
  end if;

  v_new := jsonb_build_object(
    'reference', coalesce(v_declaration."CUST_LocalReferenceNumber", v_declaration."CUST_id"::text),
    'status', v_declaration."CUST_Status",
    'iCustomsStatus', v_declaration."CUST_iCustomsStatusSnapshot",
    'submissionStatus', new."ICUSS_Status",
    'customsReference', v_declaration."CUST_CustomsReferenceNumber",
    'mrn', coalesce(new."ICUSS_MRN", v_declaration."CUST_MasterReferenceNumber"),
    'lrn', new."ICUSS_LRN",
    'errorCode', new."ICUSS_ErrorCode",
    'submittedAt', new."ICUSS_SubmittedAt",
    'acknowledgedAt', new."ICUSS_AcknowledgedAt",
    'completedAt', new."ICUSS_CompletedAt"
  );

  if exists (
    select 1
    from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_OwnerUserID" = v_owner_user_id
      and watch."AIDexterWatch_CapabilityCode" = 'customs_declarations'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and watch."AIDexterWatch_TargetID" = v_declaration."CUST_id"
  ) then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID",
      "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON",
      "AIDexterWatchSignal_NewJSON"
    ) values (
      v_company_id,
      'customs_declarations',
      tg_table_name,
      v_declaration."CUST_id",
      v_old,
      v_new
    );
  end if;

  return new;
end;
$$;

revoke all on function public._multideck_dexter_customs_submission_watch_change()
from public, anon, authenticated;

drop trigger if exists "TR_ICUS_Submissions_dexter_watch" on public."ICUS_Submissions";
create trigger "TR_ICUS_Submissions_dexter_watch"
after insert or update of
  "ICUSS_Status",
  "ICUSS_MRN",
  "ICUSS_LRN",
  "ICUSS_ErrorCode",
  "ICUSS_SubmittedAt",
  "ICUSS_AcknowledgedAt",
  "ICUSS_CompletedAt"
on public."ICUS_Submissions"
for each row execute function public._multideck_dexter_customs_submission_watch_change();

commit;
