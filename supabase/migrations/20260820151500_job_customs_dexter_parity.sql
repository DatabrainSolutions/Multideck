-- Dexter parity for accepted-quote bookings and job Customs in the shared
-- company workspace.
-- Reads and writes reuse the product permission boundaries. Watches emit only
-- deterministic database signals and never poll an LLM.

begin;

create or replace function public.multideck_dexter_domain_bookings(
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
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', job."Job_ID",
        'bookingReference', coalesce(job."Job_BookingReference", 'MD-' || job."Job_Number"),
        'jobReference', coalesce(job."Job_BookingReference", 'JOB-' || job."Job_Number"),
        'sourceQuoteId', job."Job_SourceQuoteID",
        'sourceQuoteVersionId', job."Job_SourceQuoteVersionID",
        'customerName', coalesce(customer."Org_Name", 'Unassigned customer'),
        'customerReference', coalesce(customer."Org_AccCode", ''),
        'status', case
          when job."Job_ClosedDate" is not null then 'Closed'
          when coalesce(job."Job_TrackingRiskScore", 0) >= 0.80 then 'Exception'
          when coalesce(job."Job_TrackingRiskScore", 0) >= 0.50 then 'Delayed'
          else initcap(coalesce(job."Job_Status", 'Draft'))
        end,
        'jobStatus', job."Job_Status",
        'trackingStatus', job."Job_TrackingStatus",
        'riskScore', job."Job_TrackingRiskScore",
        'mode', upper(coalesce(job."Job_TransportModeSummary", '')),
        'direction', initcap(replace(coalesce(job."Job_Direction", 'unknown'), '_', ' ')),
        'origin', coalesce(job."Job_OriginNameSnapshot", job."Job_OriginUNLocode", ''),
        'destination', coalesce(job."Job_DestinationNameSnapshot", job."Job_DestinationUNLocode", ''),
        'route', concat_ws(' → ', coalesce(job."Job_OriginNameSnapshot", job."Job_OriginUNLocode"), coalesce(job."Job_DestinationNameSnapshot", job."Job_DestinationUNLocode")),
        'carrier', coalesce(carrier."Org_Name", 'Carrier pending'),
        'equipment', cargo.description,
        'packageQuantity', cargo.package_quantity,
        'grossWeightKg', cargo.gross_weight_kg,
        'currentLocation', coalesce(job."Job_CurrentLocationNameSnapshot", 'Planning'),
        'requiredDeliveryDate', job."Job_RequiredDeliveryDate",
        'predictedDeliveryAt', job."Job_PredictedDeliveryAt",
        'departureDate', coalesce(route."JobRoute_EstimatedDepartureAt", route."JobRoute_PlannedDepartureAt")::date,
        'arrivalDate', coalesce(route."JobRoute_EstimatedArrivalAt", route."JobRoute_PlannedArrivalAt", job."Job_PredictedDeliveryAt")::date,
        'customsDeclarationId', customs."CUST_id",
        'customsReference', customs."CUST_LocalReferenceNumber",
        'customsStatus', customs."CUST_Status",
        'customsDirection', customs."CUST_Direction",
        'customsHandoffAt', customs."CUST_HandoffAt",
        'updatedAt', job."Job_UpdatedAt",
        'searchEvidence', evidence.value - 'matched'
      )) as row_data,
      coalesce((evidence.value->>'confidence')::numeric, 0) as search_rank,
      job."Job_UpdatedAt" as sort_updated
    from public."Job_Header" job
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
     and office."Company_ID" = p_company_id
    left join public."Org_Master" customer on customer."Org_id" = job."Job_Customer"
    left join public."Org_Master" carrier on carrier."Org_id" = job."Job_Carrier"
    left join lateral (
      select routing.* from public."Job_Routing" routing
      where routing."Job_ID" = job."Job_ID"
      order by routing."JobRoute_IsMainCarriage" desc, routing."JobRoute_OrderNo" nulls last
      limit 1
    ) route on true
    left join lateral (
      select max(cargo_row."JobCargo_Description") as description,
             sum(coalesce(cargo_row."JobCargo_PackageQty", cargo_row."JobCargo_Qty")) as package_quantity,
             sum(cargo_row."JobCargo_GrossKilos") as gross_weight_kg
      from public."Job_Cargo" cargo_row
      where cargo_row."JobCargo_JobID" = job."Job_ID" and not coalesce(cargo_row."JobCargo_IsDeleted", false)
    ) cargo on true
    left join lateral (
      select declaration.* from public."Customs_Declarations" declaration
      where declaration."CUST_JobID" = job."Job_ID" and not declaration."CUST_IsDeleted"
      order by declaration."CUST_HandoffAt" desc nulls last, declaration."CUST_CreatedAt" desc
      limit 1
    ) customs on true
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'bookingReference', coalesce(job."Job_BookingReference", 'MD-' || job."Job_Number"),
        'jobNumber', job."Job_Number", 'customerName', customer."Org_Name",
        'customerReference', customer."Org_AccCode", 'jobStatus', job."Job_Status",
        'trackingStatus', job."Job_TrackingStatus", 'mode', job."Job_TransportModeSummary",
        'direction', job."Job_Direction", 'origin', coalesce(job."Job_OriginNameSnapshot", job."Job_OriginUNLocode"),
        'destination', coalesce(job."Job_DestinationNameSnapshot", job."Job_DestinationUNLocode"),
        'carrier', carrier."Org_Name", 'customsReference', customs."CUST_LocalReferenceNumber"
      ),
      array['bookingReference', 'jobNumber', 'customerReference', 'customsReference']::text[]
    ) evidence(value)
    where not coalesce(job."Job_IsDeleted", false) and (evidence.value->>'matched')::boolean
    order by search_rank desc, job."Job_UpdatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) bookings;
$$;

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
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', declaration."CUST_id",
        'sourceType', case when declaration."CUST_JobID" is null then 'standalone' else 'job_related' end,
        'jobId', declaration."CUST_JobID",
        'bookingReference', job."Job_BookingReference",
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
        'transactionNature', nullif(declaration."CUST_GenericPayloadJSON"->>'transactionNature', ''),
        'freightChargeAmount', nullif(declaration."CUST_GenericPayloadJSON"->>'freightChargeAmount', ''),
        'freightChargeCurrency', nullif(declaration."CUST_GenericPayloadJSON"->>'freightChargeCurrency', ''),
        'vatValueAdjustmentAmount', nullif(declaration."CUST_GenericPayloadJSON"->>'vatValueAdjustmentAmount', ''),
        'vatValueAdjustmentCurrency', nullif(declaration."CUST_GenericPayloadJSON"->>'vatValueAdjustmentCurrency', ''),
        'insuranceCostAmount', nullif(declaration."CUST_GenericPayloadJSON"->>'insuranceCostAmount', ''),
        'insuranceCostCurrency', nullif(declaration."CUST_GenericPayloadJSON"->>'insuranceCostCurrency', ''),
        'containerPackingCostAmount', nullif(declaration."CUST_GenericPayloadJSON"->>'containerPackingCostAmount', ''),
        'containerPackingCostCurrency', nullif(declaration."CUST_GenericPayloadJSON"->>'containerPackingCostCurrency', ''),
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
        'handoffAt', declaration."CUST_HandoffAt",
        'createdAt', declaration."CUST_CreatedAt",
        'updatedAt', declaration."CUST_UpdatedAt",
        'searchEvidence', evidence.value - 'matched'
      )) as row_data,
      coalesce((evidence.value->>'confidence')::numeric, 0) as search_rank,
      declaration."CUST_UpdatedAt" as sort_updated
    from public."Customs_Declarations" declaration
    left join public."Job_Header" job on job."Job_ID" = declaration."CUST_JobID" and not job."Job_IsDeleted"
    left join lateral (
      select count(*)::integer as item_count from public."Customs_Items" item
      where item."CUSTI_CustomsID" = declaration."CUST_id"
    ) items on true
    left join lateral (
      select submission.* from public."ICUS_Submissions" submission
      where submission."ICUSS_CustomsID" = declaration."CUST_id"
      order by submission."ICUSS_CreatedAt" desc, submission."ICUSS_id" desc limit 1
    ) latest_submission on true
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'recordId', declaration."CUST_id", 'reference', declaration."CUST_LocalReferenceNumber",
        'traderReference', declaration."CUST_TraderReference", 'ucr', declaration."CUST_UCR",
        'status', declaration."CUST_Status", 'direction', declaration."CUST_Direction",
        'customsReference', declaration."CUST_CustomsReferenceNumber",
        'mrn', coalesce(latest_submission."ICUSS_MRN", declaration."CUST_MasterReferenceNumber"),
        'bookingReference', job."Job_BookingReference"
      ),
      array['recordId', 'reference', 'traderReference', 'ucr', 'customsReference', 'mrn', 'bookingReference']::text[]
    ) evidence(value)
    where not declaration."CUST_IsDeleted"
      and booking_api.customs_access(auth.uid(), declaration."CUST_id", false)
      and exists (
        select 1 from public."cmp_Users" actor
        where actor."Auth_User_ID" = auth.uid() and actor."Company_ID" = p_company_id and actor."User_AccessStatus" = 'active'
      )
      and (
        declaration."CUST_JobID" is null or exists (
          select 1 from public."Job_Header" scoped_job
          join public."cmp_Offices" scoped_office on scoped_office."Office_ID" = coalesce(scoped_job."Job_OrgOfficeID", scoped_job."Job_OfficeID")
          where scoped_job."Job_ID" = declaration."CUST_JobID" and scoped_office."Company_ID" = p_company_id and not scoped_job."Job_IsDeleted"
        )
      )
      and (evidence.value->>'matched')::boolean
    order by search_rank desc, declaration."CUST_UpdatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) declarations;
$$;

-- Keep this migration self-contained for projects whose historical ledger did
-- not receive the earlier standalone Customs Dexter helper.
create or replace function public._multideck_dexter_customs_draft_payload(
  p_draft jsonb,
  p_direction text
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_direction text := lower(btrim(coalesce(p_direction, '')));
  v_draft jsonb := coalesce(p_draft, '{}'::jsonb);
begin
  if v_direction not in ('import', 'export') then
    raise exception 'Choose whether this is an import or export Customs declaration.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_draft) <> 'object' then
    raise exception 'A valid Customs declaration field-value object is required.' using errcode = '22023';
  end if;
  if v_draft ? 'items' and jsonb_typeof(v_draft -> 'items') <> 'array' then
    raise exception 'Customs declaration goods items must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(v_draft -> 'items', '[]'::jsonb)) > 250 then
    raise exception 'A Dexter Customs declaration can contain up to 250 goods items.' using errcode = '22023';
  end if;
  v_draft := v_draft - array['direction', 'multideckReference', 'iCustomsCorrelationId'];
  return v_draft || jsonb_build_object('direction', v_direction);
end;
$$;

revoke all on function public._multideck_dexter_customs_draft_payload(jsonb, text) from public, anon, authenticated;

create or replace function public.multideck_dexter_action_send_booking_to_customs(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, booking_api
as $$
declare
  v_auth_user_id uuid;
  v_target_id uuid := nullif(p_arguments->>'target_id', '')::uuid;
  v_result jsonb;
begin
  select actor."Auth_User_ID" into v_auth_user_id
  from public."cmp_Users" actor
  where actor."User_ID" = p_user_id and actor."Company_ID" = p_company_id
    and actor."Auth_User_ID" is not null and actor."User_AccessStatus" = 'active';
  if v_auth_user_id is null then raise exception 'Your signed-in account is not linked to this workspace.' using errcode = '42501'; end if;
  if v_target_id is null then raise exception 'Choose the exact booking to send to Customs.' using errcode = '22023'; end if;
  v_result := booking_api.send_to_customs(v_auth_user_id, v_target_id, gen_random_uuid());
  return v_result || jsonb_build_object('bookingId', v_target_id);
end;
$$;

create or replace function public.multideck_dexter_action_update_customs_declaration(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, booking_api
as $$
declare
  v_auth_user_id uuid;
  v_target_id uuid := nullif(p_arguments->>'target_id', '')::uuid;
  v_direction text;
  v_current jsonb;
  v_draft jsonb;
  v_saved record;
  v_has_provider_draft boolean := false;
  v_job_related boolean := false;
begin
  select actor."Auth_User_ID" into v_auth_user_id
  from public."cmp_Users" actor
  where actor."User_ID" = p_user_id and actor."Company_ID" = p_company_id
    and actor."Auth_User_ID" is not null and actor."User_AccessStatus" = 'active';
  if v_auth_user_id is null then raise exception 'Your signed-in account is not linked to this workspace.' using errcode = '42501'; end if;

  select declaration."CUST_Direction", declaration."CUST_GenericPayloadJSON",
         nullif(btrim(declaration."CUST_iCustomsExternalID"), '') is not null,
         declaration."CUST_JobID" is not null
  into v_direction, v_current, v_has_provider_draft, v_job_related
  from public."Customs_Declarations" declaration
  where declaration."CUST_id" = v_target_id
    and declaration."CUST_Status" = 'draft'
    and declaration."CUST_DeclarationKind" in ('cds_export', 'cds_import')
    and declaration."CUST_Direction" in ('export', 'import')
    and not declaration."CUST_IsDeleted"
    and booking_api.customs_access(v_auth_user_id, declaration."CUST_id", true)
  for update;
  if not found then raise exception 'This Customs draft is unavailable or can no longer be edited.' using errcode = '42501'; end if;

  v_draft := public._multideck_dexter_customs_draft_payload(
    coalesce(v_current, '{}'::jsonb) || coalesce(p_arguments->'draft', '{}'::jsonb), v_direction
  );
  if v_job_related then
    select * into v_saved from booking_api.save_job_customs_draft(v_auth_user_id, v_target_id, v_draft);
  elsif v_direction = 'import' then
    -- The legacy standalone writers use auth.uid(). This action is server-only
    -- and the prepared-action dispatcher has already bound p_user_id to the
    -- approved company and target, so expose that exact actor only for this
    -- transaction-local call.
    perform set_config('request.jwt.claim.sub', v_auth_user_id::text, true);
    select * into v_saved from public.save_customs_import_draft(v_target_id, v_draft);
  else
    perform set_config('request.jwt.claim.sub', v_auth_user_id::text, true);
    select * into v_saved from public.save_customs_export_draft(v_target_id, v_draft);
  end if;
  return jsonb_build_object(
    'recordId', v_saved.declaration_id, 'reference', v_saved.local_reference_number,
    'direction', v_direction, 'sourceType', case when v_job_related then 'job_related' else 'standalone' end,
    'needsProviderDraftRefresh', v_has_provider_draft, 'updatedAt', v_saved.updated_at
  );
end;
$$;

revoke all on function public.multideck_dexter_domain_bookings(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.multideck_dexter_domain_customs_declarations(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.multideck_dexter_action_send_booking_to_customs(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.multideck_dexter_action_update_customs_declaration(uuid,uuid,jsonb) from public,anon,authenticated;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name", "AIDexterAction_Description",
  "AIDexterAction_Function", "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder", "AIDexterAction_IsActive",
  "AIDexterAction_RequiredPermissionsJSON", "AIDexterAction_IntentFamily", "AIDexterAction_HasExternalEffect", "AIDexterAction_UpdatedAt"
) values (
  'send_booking_to_customs', 'bookings', 'Send booking to Customs',
  'Check the real Customs readiness rules for one exact booking, then create or reuse its assigned job declaration in the shared Customs workspace and notify the Customs department. This does not submit anything to iCustoms or HMRC.',
  'multideck_dexter_action_send_booking_to_customs',
  '{"type":"object","properties":{"target_id":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","reason"],"additionalProperties":false}'::jsonb,
  122, true, '["Bookings.Write"]'::jsonb, 'send_booking_to_customs', true, now()
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect",
  "AIDexterAction_UpdatedAt" = now();

update public."sys_AIDexterActions"
set
  "AIDexterAction_Description" = 'Edit an exact authorised UK CDS import or export declaration draft, including its valid nature of transaction code and import valuation costs, whether standalone or linked to a job in the shared Customs workspace. Existing fields are preserved unless supplied in the reviewed draft data; this does not send anything to iCustoms.',
  "AIDexterAction_Function" = 'multideck_dexter_action_update_customs_declaration',
  "AIDexterAction_RequiredPermissionsJSON" = '["Customs.Write"]'::jsonb,
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'update_customs_declaration';

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Canonical freight bookings, including accepted-quote provenance, route and cargo data, and any related Customs handoff or declaration.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'bookings';
update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Authorised standalone and job-related UK CDS import and export declarations in the shared company Customs workspace, including booking provenance, nature of transaction, import valuation costs and recorded iCustoms filing evidence.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'customs_declarations';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Freight booking status, route, delivery, ownership, risk and job-related Customs handoff changes.',
  "AIDexterWatchCapability_FieldsJSON" = '["status","trackingStatus","riskScore","mode","direction","origin","destination","currentLocation","requiredDeliveryDate","predictedDeliveryAt","customerId","carrierId","customsStatus","customsReference","customsHandoffAt"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'bookings';
update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Status, reference, value, transaction, import valuation cost and recorded iCustoms changes for one exact authorised standalone or job-related declaration.',
  "AIDexterWatchCapability_FieldsJSON" = '["status","iCustomsStatus","submissionStatus","customsReference","mrn","lrn","errorCode","destinationCountry","invoiceAmount","currency","transactionNature","freightChargeAmount","vatValueAdjustmentAmount","insuranceCostAmount","containerPackingCostAmount","submittedAt","acknowledgedAt","completedAt","updatedAt"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'customs_declarations';

-- Keep the security-hardened watch creator but permit the same authorised
-- department boundary used by the job-related Customs editor.
create or replace function public.multideck_dexter_create_watch(
  p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,auth,booking_api as $$
declare v_context record; v_watch public."AI_DexterWatches"; v_capability text:=lower(btrim(p_capability)); v_fields jsonb; v_required jsonb; v_field text;
begin
  select * into v_context from public._multideck_dexter_context();
  select c."AIDexterWatchCapability_FieldsJSON",c."AIDexterWatchCapability_RequiredPermissionsJSON" into v_fields,v_required
  from public."sys_AIDexterWatchCapabilities" c where c."AIDexterWatchCapability_Code"=v_capability and c."AIDexterWatchCapability_IsActive";
  if v_fields is null then raise exception 'That source cannot be watched yet.' using errcode='22023'; end if;
  if not public._multideck_dexter_has_permissions(v_context.user_id,v_required) then raise exception 'You do not have permission to watch that source.' using errcode='42501'; end if;
  if v_capability='deals' and p_target_id is not null
     and not public._multideck_crm_deal_is_operator_visible(p_target_id,v_context.company_id) then
    raise exception 'Choose a deal that is available in this workspace.' using errcode='42501';
  end if;
  if v_capability='todo' and (
    p_target_id is null or not exists(
      select 1 from public."OPS_UserTasks" task
      where task."TodoTask_ID"=p_target_id
        and task."TodoTask_CompanyID"=v_context.company_id
        and task."TodoTask_OwnerUserID"=v_context.user_id
        and not task."TodoTask_IsDeleted"
    )
  ) then
    raise exception 'Choose one of your To Do tasks before creating this watch.' using errcode='42501';
  end if;
  if v_capability='customs_declarations' and (p_target_id is null or not booking_api.customs_access(auth.uid(),p_target_id,false)) then
    raise exception 'Choose an exact Customs declaration you are authorised to read before creating this watch.' using errcode='42501';
  end if;
  if jsonb_typeof(p_rule)<>'object' then raise exception 'The watch rule is invalid.' using errcode='22023'; end if;
  v_field:=p_rule->>'field';
  if v_field is null or not v_fields?v_field then raise exception 'That field cannot be watched.' using errcode='22023'; end if;
  if coalesce(p_rule->>'operator','') not in ('changed','eq','neq','contains','contains_all','gt','gte','lt','lte') then raise exception 'That watch condition is not supported.' using errcode='22023'; end if;
  if p_action is not null and not exists(
    select 1 from public."sys_AIDexterActions" a where a."AIDexterAction_Code"=p_action->>'action'
      and a."AIDexterAction_DomainCode"=v_capability and a."AIDexterAction_IsActive"
      and public._multideck_dexter_has_permissions(v_context.user_id,a."AIDexterAction_RequiredPermissionsJSON")
  ) then raise exception 'That prepared action is not available for this watch.' using errcode='42501'; end if;
  insert into public."AI_DexterWatches"(
    "AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title",
    "AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_TargetLabel","AIDexterWatch_RuleJSON","AIDexterWatch_ActionJSON"
  ) values(v_context.company_id,v_context.user_id,v_capability,left(btrim(p_title),180),left(btrim(p_summary),2000),left(btrim(p_request),4000),
    p_target_id,nullif(left(btrim(p_target_label),240),''),p_rule,p_action) returning * into v_watch;
  return jsonb_build_object('id',v_watch."AIDexterWatch_ID",'title',v_watch."AIDexterWatch_Title",'summary',v_watch."AIDexterWatch_Summary",
    'capability',v_watch."AIDexterWatch_CapabilityCode",'status',v_watch."AIDexterWatch_StatusCode",'targetLabel',v_watch."AIDexterWatch_TargetLabel",
    'rule',v_watch."AIDexterWatch_RuleJSON",'action',v_watch."AIDexterWatch_ActionJSON",'createdAt',v_watch."AIDexterWatch_CreatedAt",
    'updatedAt',v_watch."AIDexterWatch_UpdatedAt",'triggerCount',v_watch."AIDexterWatch_TriggerCount");
end $$;

revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) to authenticated,service_role;

create or replace function public._multideck_dexter_pause_unauthorised_customs_watches(
  p_company_id uuid,
  p_declaration_id uuid
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public, auth, booking_api
as $$
  update public."AI_DexterWatches" watch
  set "AIDexterWatch_StatusCode" = 'paused',
      "AIDexterWatch_IsArmed" = false,
      "AIDexterWatch_UpdatedAt" = now()
  where watch."AIDexterWatch_CompanyID" = p_company_id
    and watch."AIDexterWatch_CapabilityCode" = 'customs_declarations'
    and watch."AIDexterWatch_StatusCode" = 'active'
    and watch."AIDexterWatch_TargetID" = p_declaration_id
    and not exists (
      select 1
      from public."cmp_Users" owner_user
      where owner_user."User_ID" = watch."AIDexterWatch_OwnerUserID"
        and owner_user."Company_ID" = p_company_id
        and owner_user."User_AccessStatus" = 'active'
        and booking_api.customs_access(owner_user."Auth_User_ID", p_declaration_id, false)
    )
$$;

create or replace function public._multideck_dexter_customs_declaration_watch_change()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_company_id uuid; v_old jsonb:='{}'::jsonb; v_new jsonb;
begin
  if new."CUST_JobID" is not null then
    select office."Company_ID" into v_company_id from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID") where job."Job_ID"=new."CUST_JobID";
  else
    select actor."Company_ID" into v_company_id from public."cmp_Users" actor where actor."Auth_User_ID"=new."CUST_CreatedBy" order by actor."User_ID" limit 1;
  end if;
  if v_company_id is null then return new; end if;
  perform public._multideck_dexter_pause_unauthorised_customs_watches(v_company_id, new."CUST_id");
  if tg_op<>'INSERT' then v_old:=jsonb_build_object(
    'status',old."CUST_Status",'iCustomsStatus',old."CUST_iCustomsStatusSnapshot",'customsReference',old."CUST_CustomsReferenceNumber",
    'mrn',old."CUST_MasterReferenceNumber",'destinationCountry',old."CUST_CountryOfDestinationCodeSnapshot",
    'invoiceAmount',old."CUST_InvoiceAmount",'currency',old."CUST_InvoiceCurrencyCodeSnapshot",
    'transactionNature',old."CUST_GenericPayloadJSON"->>'transactionNature',
    'freightChargeAmount',old."CUST_GenericPayloadJSON"->>'freightChargeAmount',
    'vatValueAdjustmentAmount',old."CUST_GenericPayloadJSON"->>'vatValueAdjustmentAmount',
    'insuranceCostAmount',old."CUST_GenericPayloadJSON"->>'insuranceCostAmount',
    'containerPackingCostAmount',old."CUST_GenericPayloadJSON"->>'containerPackingCostAmount',
    'updatedAt',old."CUST_UpdatedAt"); end if;
  v_new:=jsonb_build_object(
    'reference',coalesce(new."CUST_LocalReferenceNumber",new."CUST_id"::text),'sourceType',case when new."CUST_JobID" is null then 'standalone' else 'job_related' end,
    'jobId',new."CUST_JobID",'status',new."CUST_Status",'iCustomsStatus',new."CUST_iCustomsStatusSnapshot",
    'customsReference',new."CUST_CustomsReferenceNumber",'mrn',new."CUST_MasterReferenceNumber",
    'destinationCountry',new."CUST_CountryOfDestinationCodeSnapshot",'invoiceAmount',new."CUST_InvoiceAmount",
    'currency',new."CUST_InvoiceCurrencyCodeSnapshot",
    'transactionNature',new."CUST_GenericPayloadJSON"->>'transactionNature',
    'freightChargeAmount',new."CUST_GenericPayloadJSON"->>'freightChargeAmount',
    'vatValueAdjustmentAmount',new."CUST_GenericPayloadJSON"->>'vatValueAdjustmentAmount',
    'insuranceCostAmount',new."CUST_GenericPayloadJSON"->>'insuranceCostAmount',
    'containerPackingCostAmount',new."CUST_GenericPayloadJSON"->>'containerPackingCostAmount',
    'updatedAt',new."CUST_UpdatedAt");
  if exists(select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company_id
    and watch."AIDexterWatch_CapabilityCode"='customs_declarations' and watch."AIDexterWatch_StatusCode"='active' and watch."AIDexterWatch_TargetID"=new."CUST_id") then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(v_company_id,'customs_declarations',tg_table_name,new."CUST_id",v_old,v_new);
  end if;
  return new;
end $$;

create or replace function public._multideck_dexter_customs_submission_watch_change()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_declaration public."Customs_Declarations"; v_company_id uuid; v_old jsonb:='{}'::jsonb; v_new jsonb;
begin
  if new."ICUSS_CustomsID" is null then return new; end if;
  select declaration.* into v_declaration from public."Customs_Declarations" declaration where declaration."CUST_id"=new."ICUSS_CustomsID" and not declaration."CUST_IsDeleted";
  if not found then return new; end if;
  if v_declaration."CUST_JobID" is not null then
    select office."Company_ID" into v_company_id from public."Job_Header" job join public."cmp_Offices" office
      on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID") where job."Job_ID"=v_declaration."CUST_JobID";
  else
    select actor."Company_ID" into v_company_id from public."cmp_Users" actor where actor."Auth_User_ID"=v_declaration."CUST_CreatedBy" order by actor."User_ID" limit 1;
  end if;
  if v_company_id is null then return new; end if;
  perform public._multideck_dexter_pause_unauthorised_customs_watches(v_company_id, v_declaration."CUST_id");
  if tg_op<>'INSERT' then v_old:=jsonb_build_object(
    'status',v_declaration."CUST_Status",'iCustomsStatus',v_declaration."CUST_iCustomsStatusSnapshot",'submissionStatus',old."ICUSS_Status",
    'customsReference',v_declaration."CUST_CustomsReferenceNumber",'mrn',coalesce(old."ICUSS_MRN",v_declaration."CUST_MasterReferenceNumber"),
    'lrn',old."ICUSS_LRN",'errorCode',old."ICUSS_ErrorCode",'submittedAt',old."ICUSS_SubmittedAt",'acknowledgedAt',old."ICUSS_AcknowledgedAt",'completedAt',old."ICUSS_CompletedAt"); end if;
  v_new:=jsonb_build_object(
    'reference',coalesce(v_declaration."CUST_LocalReferenceNumber",v_declaration."CUST_id"::text),
    'sourceType',case when v_declaration."CUST_JobID" is null then 'standalone' else 'job_related' end,
    'jobId',v_declaration."CUST_JobID",'status',v_declaration."CUST_Status",'iCustomsStatus',v_declaration."CUST_iCustomsStatusSnapshot",
    'submissionStatus',new."ICUSS_Status",'customsReference',v_declaration."CUST_CustomsReferenceNumber",
    'mrn',coalesce(new."ICUSS_MRN",v_declaration."CUST_MasterReferenceNumber"),'lrn',new."ICUSS_LRN",'errorCode',new."ICUSS_ErrorCode",
    'submittedAt',new."ICUSS_SubmittedAt",'acknowledgedAt',new."ICUSS_AcknowledgedAt",'completedAt',new."ICUSS_CompletedAt");
  if exists(select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company_id
    and watch."AIDexterWatch_CapabilityCode"='customs_declarations' and watch."AIDexterWatch_StatusCode"='active' and watch."AIDexterWatch_TargetID"=v_declaration."CUST_id") then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(v_company_id,'customs_declarations',tg_table_name,v_declaration."CUST_id",v_old,v_new);
  end if;
  return new;
end $$;

-- Creating or changing a job declaration is also a meaningful booking event.
create or replace function public._multideck_dexter_booking_customs_watch_change()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_company_id uuid; v_booking_reference text; v_old jsonb:='{}'::jsonb; v_new jsonb;
begin
  if new."CUST_JobID" is null then return new; end if;
  select office."Company_ID",coalesce(job."Job_BookingReference",'MD-'||job."Job_Number") into v_company_id,v_booking_reference
  from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
  where job."Job_ID"=new."CUST_JobID" and not job."Job_IsDeleted";
  if v_company_id is null then return new; end if;
  if tg_op<>'INSERT' then v_old:=jsonb_build_object('customsStatus',old."CUST_Status",'customsReference',old."CUST_LocalReferenceNumber",'customsHandoffAt',old."CUST_HandoffAt"); end if;
  v_new:=jsonb_build_object('bookingReference',v_booking_reference,'customsStatus',new."CUST_Status",'customsReference',new."CUST_LocalReferenceNumber",'customsHandoffAt',new."CUST_HandoffAt");
  if exists(select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company_id
    and watch."AIDexterWatch_CapabilityCode"='bookings' and watch."AIDexterWatch_StatusCode"='active' and watch."AIDexterWatch_TargetID"=new."CUST_JobID") then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(v_company_id,'bookings',tg_table_name,new."CUST_JobID",v_old,v_new);
  end if;
  return new;
end $$;

revoke all on function public._multideck_dexter_customs_declaration_watch_change() from public,anon,authenticated;
revoke all on function public._multideck_dexter_customs_submission_watch_change() from public,anon,authenticated;
revoke all on function public._multideck_dexter_booking_customs_watch_change() from public,anon,authenticated;
revoke all on function public._multideck_dexter_pause_unauthorised_customs_watches(uuid,uuid) from public,anon,authenticated;

drop trigger if exists "TR_Customs_Declarations_dexter_watch" on public."Customs_Declarations";
create trigger "TR_Customs_Declarations_dexter_watch" after insert or update of
  "CUST_Status","CUST_iCustomsStatusSnapshot","CUST_CustomsReferenceNumber","CUST_MasterReferenceNumber",
  "CUST_CountryOfDestinationCodeSnapshot","CUST_InvoiceAmount","CUST_InvoiceCurrencyCodeSnapshot",
  "CUST_GenericPayloadJSON","CUST_UpdatedAt"
on public."Customs_Declarations" for each row execute function public._multideck_dexter_customs_declaration_watch_change();

drop trigger if exists "TR_ICUS_Submissions_dexter_watch" on public."ICUS_Submissions";
create trigger "TR_ICUS_Submissions_dexter_watch" after insert or update of
  "ICUSS_Status","ICUSS_MRN","ICUSS_LRN","ICUSS_ErrorCode","ICUSS_SubmittedAt","ICUSS_AcknowledgedAt","ICUSS_CompletedAt"
on public."ICUS_Submissions" for each row execute function public._multideck_dexter_customs_submission_watch_change();

drop trigger if exists "TR_Customs_Declarations_booking_watch" on public."Customs_Declarations";
create trigger "TR_Customs_Declarations_booking_watch" after insert or update of "CUST_Status","CUST_LocalReferenceNumber","CUST_HandoffAt"
on public."Customs_Declarations" for each row execute function public._multideck_dexter_booking_customs_watch_change();

commit;
