-- Make quote loss a first-class, reasoned outcome while keeping existing quote history intact.

begin;

create or replace function quote_api.transition_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  requested_transition text,
  requested_note text default null,
  requested_follow_up_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  quote_row record;
  current_version_id uuid;
  next_lifecycle text := lower(btrim(requested_transition));
begin
  if caller_auth_user_id is null
     or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Write') then
    raise exception 'Quote management is not authorised.' using errcode = '42501';
  end if;
  if next_lifecycle not in ('calculated', 'sent', 'revised', 'accepted', 'declined', 'ghosted') then
    raise exception 'Choose a supported quote action.' using errcode = '22023';
  end if;
  if next_lifecycle = 'declined' and nullif(btrim(requested_note), '') is null then
    raise exception 'Choose why this quote was lost.' using errcode = '22023';
  end if;

  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';

  select quote.* into quote_row
  from public."CusQuote_Header" quote
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where quote."CusQuoteHeader_ID" = requested_quote_id
    and office."Company_ID" = app_user."Company_ID"
    and not quote."CusQuoteHeader_IsDeleted"
  for update;
  if not found then
    raise exception 'That quote is outside this workspace.' using errcode = '42501';
  end if;
  if coalesce(quote_row."CusQuoteHeader_LifecycleCode", 'draft') = 'accepted'
     and next_lifecycle <> 'declined' then
    raise exception 'An accepted quote can only be marked lost.' using errcode = '22023';
  end if;

  select version."CusQuoteVersion_ID" into current_version_id
  from public."CusQuote_Versions" version
  where version."CusQuoteHeader_ID" = requested_quote_id
    and version."CusQuoteVersion_IsCurrent"
  limit 1;

  update public."CusQuote_Header" set
    "CusQuoteHeader_LifecycleCode" = next_lifecycle,
    "CusQuoteHeader_Status" = case next_lifecycle
      when 'calculated' then 2 when 'sent' then 4 when 'accepted' then 5
      when 'declined' then 6 when 'ghosted' then 7 else 1 end,
    "CusQuoteHeader_OutcomeNotes" = case
      when next_lifecycle in ('accepted', 'declined', 'ghosted')
        then nullif(btrim(requested_note), '')
      else "CusQuoteHeader_OutcomeNotes" end,
    "CusQuoteHeader_FollowUpAt" = coalesce(
      requested_follow_up_at, "CusQuoteHeader_FollowUpAt"
    ),
    "CusQuoteHeader_AcceptedVersionID" = case
      when next_lifecycle = 'accepted' then current_version_id
      when next_lifecycle = 'declined' then null
      else "CusQuoteHeader_AcceptedVersionID" end,
    "CusQuoteHeader_LastEditedBy" = app_user."User_ID",
    "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = requested_quote_id;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode",
    "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON",
    "CusQuoteEvent_ActorUserID"
  ) values (
    app_user."Company_ID", requested_quote_id, current_version_id, next_lifecycle,
    case when next_lifecycle = 'declined' then 'Lost' else initcap(next_lifecycle) end ||
      case when nullif(btrim(requested_note), '') is null
        then '.' else ': ' || left(btrim(requested_note), 500) end,
    jsonb_strip_nulls(jsonb_build_object(
      'followUpAt', requested_follow_up_at,
      'lossReason', case when next_lifecycle = 'declined' then btrim(requested_note) end
    )),
    app_user."User_ID"
  );

  return jsonb_build_object(
    'quoteId', requested_quote_id,
    'lifecycle', next_lifecycle,
    'lossReason', case when next_lifecycle = 'declined' then btrim(requested_note) end
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'User identity is incomplete or ambiguous.' using errcode = '42501';
end;
$$;

create or replace function public.multideck_dexter_domain_quotes(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(result.value order by result.updated_at desc), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'recordId', quote."CusQuoteHeader_ID",
      'quoteNumber', 'Q-' || quote."CusQuoteHeader_Number",
      'customerReference', quote."CusQuoteHeader_CustomerReference",
      'customer', coalesce(customer."Org_Name", quote."CusQuoteHeader_CustomerNameSnapshot"),
      'status', case when quote."CusQuoteHeader_LifecycleCode" in ('declined', 'ghosted') then 'Lost' else 'Open' end,
      'lossReason', case when quote."CusQuoteHeader_LifecycleCode" in ('declined', 'ghosted') then quote."CusQuoteHeader_OutcomeNotes" end,
      'mode', quote."CusQuoteHeader_ModeCode",
      'shipmentType', quote."CusQuoteHeader_ShipmentTypeCode",
      'serviceLevel', quote."CusQuoteHeader_ServiceLevel",
      'currency', quote."CusQuoteHeader_CurrencyCode",
      'origin', coalesce(quote."CusQuoteHeader_LoadingPoint", quote."CusQuoteHeader_OriginExtra"),
      'destination', coalesce(quote."CusQuoteHeader_DischargePoint", quote."CusQuoteHeader_DestinationExtra"),
      'direction', quote."CusQuoteHeader_Direction",
      'incoterm', quote."CusQuoteHeader_Incoterm",
      'validFrom', quote."CusQuoteHeader_ValidFrom",
      'validTo', quote."CusQuoteHeader_ValidTo",
      'supplier', coalesce(quote."CusQuoteHeader_SupplierNameSnapshot", supplier."Org_Name"),
      'carrier', coalesce(quote."CusQuoteHeader_CarrierNameSnapshot", carrier."Org_Name"),
      'followUpAt', quote."CusQuoteHeader_FollowUpAt",
      'costTotal', totals.cost,
      'sellTotal', totals.sell,
      'profit', totals.sell - totals.cost,
      'marginPct', case when totals.sell = 0 then null
        else round(((totals.sell - totals.cost) / totals.sell) * 100, 2) end,
      'updatedAt', quote."CusQuoteHeader_LastEditedDate",
      'evidence', jsonb_build_object(
        'sourceTable', 'CusQuote_Header',
        'sourceId', quote."CusQuoteHeader_ID",
        'currentVersionId', version."CusQuoteVersion_ID"
      )
    )) value,
    quote."CusQuoteHeader_LastEditedDate" updated_at
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
      and office."Company_ID" = p_company_id
    left join public."Org_Master" customer on customer."Org_id" = quote."CusQuoteHeader_CustomerID"
    left join public."Org_Master" supplier on supplier."Org_id" = quote."CusQuoteHeader_SupplierID"
    left join public."Org_Master" carrier on carrier."Org_id" = quote."CusQuoteHeader_CarrierID"
    left join public."CusQuote_Versions" version
      on version."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
      and version."CusQuoteVersion_IsCurrent"
    left join lateral (
      select coalesce(sum("CusQuoteLine_CostAmountLocal"), 0) cost,
        coalesce(sum("CusQuoteLine_RevenueAmountLocal"), 0) sell
      from public."CusQuote_Lines"
      where "CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
    ) totals on true
    where not quote."CusQuoteHeader_IsDeleted"
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', quote."CusQuoteHeader_Number",
          quote."CusQuoteHeader_CustomerReference",
          customer."Org_Name", quote."CusQuoteHeader_CustomerNameSnapshot",
          quote."CusQuoteHeader_LifecycleCode", quote."CusQuoteHeader_OutcomeNotes",
          quote."CusQuoteHeader_ModeCode", quote."CusQuoteHeader_ShipmentTypeCode",
          quote."CusQuoteHeader_OriginExtra", quote."CusQuoteHeader_DestinationExtra",
          quote."CusQuoteHeader_SupplierNameSnapshot", quote."CusQuoteHeader_CarrierNameSnapshot"
        ) ilike '%' || btrim(p_search) || '%'
      )
    order by quote."CusQuoteHeader_LastEditedDate" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) result;
$$;

create or replace function public.multideck_dexter_action_mark_quote_lost(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_auth_user_id uuid;
  loss_reason text := nullif(btrim(coalesce(p_arguments->>'loss_reason', '')), '');
begin
  if loss_reason is null then
    raise exception 'Choose why this quote was lost.' using errcode = '22023';
  end if;
  select "Auth_User_ID" into actor_auth_user_id
  from public."cmp_Users"
  where "User_ID" = p_user_id
    and "Company_ID" = p_company_id
    and "User_AccessStatus" = 'active';
  if actor_auth_user_id is null then
    raise exception 'The Dexter operator is outside this workspace.' using errcode = '42501';
  end if;
  return quote_api.transition_quote(
    actor_auth_user_id,
    (p_arguments->>'target_id')::uuid,
    'declined',
    loss_reason,
    null
  );
end;
$$;

revoke all on function public.multideck_dexter_action_mark_quote_lost(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.multideck_dexter_action_mark_quote_lost(uuid, uuid, jsonb)
  to service_role;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name",
  "AIDexterAction_Description", "AIDexterAction_Function",
  "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder",
  "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON", "AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values (
  'mark_quote_lost', 'quotes', 'Mark quote lost',
  'Mark an open quote as lost and save the operator-approved loss reason.',
  'multideck_dexter_action_mark_quote_lost',
  jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
      'target_id', jsonb_build_object('type', 'string', 'description', 'The exact quote recordId returned by the quotes data tool.'),
      'loss_reason', jsonb_build_object('type', 'string', 'description', 'The operator-approved reason the quote was lost.'),
      'reason', jsonb_build_object('type', 'string', 'description', 'A concise explanation of the proposed change for approval.')
    ),
    'required', jsonb_build_array('target_id', 'loss_reason', 'reason'),
    'additionalProperties', false
  ),
  191, true, now(), '["Quotes.Write"]'::jsonb, 'quote_loss',
  'canonical', true
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = excluded."AIDexterAction_IsActive",
  "AIDexterAction_UpdatedAt" = excluded."AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy" = excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect";

update public."sys_AIDexterActions"
set "AIDexterAction_IsActive" = false,
    "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'manage_quote_lifecycle';

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" =
      'Customer quotes with Open or Lost status, saved loss reasons, route, parties, charges, margin and source evidence.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" =
      'Quote changes including an Open quote being marked Lost. Evaluation remains event-driven from the quote table trigger.',
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

commit;
