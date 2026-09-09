begin;

alter function booking_api.quote_sync_projection(jsonb) rename to quote_sync_projection_before_cargo_lines_20260905;
create function booking_api.quote_sync_projection(snapshot jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select booking_api.quote_sync_projection_before_cargo_lines_20260905(snapshot)
    ||case when snapshot#>'{quote,shipmentFacts,cargoLines}' is not null then
      jsonb_build_object('cargoLines',quote_api.normalise_cargo_lines(snapshot#>'{quote,shipmentFacts,cargoLines}',false)) else '{}'::jsonb end
$$;
alter function booking_api.current_quote_sync_projection(uuid) rename to current_quote_sync_projection_before_cargo_lines_20260905;
create function booking_api.current_quote_sync_projection(requested_job_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select booking_api.current_quote_sync_projection_before_cargo_lines_20260905(requested_job_id)
    ||jsonb_build_object('cargoLines',booking_api.current_source_cargo_lines(requested_job_id))
$$;
alter function booking_api.quote_sync_differences(jsonb,jsonb,jsonb) rename to quote_sync_differences_before_cargo_lines_20260905;
create function booking_api.quote_sync_differences(baseline jsonb,booking jsonb,proposed jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; cargo_differences jsonb; old_value jsonb; new_value jsonb;
begin
  if not (baseline ? 'cargoLines' or proposed ? 'cargoLines') then
    return booking_api.quote_sync_differences_before_cargo_lines_20260905(baseline,booking,proposed); end if;
  result:=booking_api.quote_sync_differences_before_cargo_lines_20260905(baseline-'cargo',booking-'cargo',proposed-'cargo');
  cargo_differences:=booking_api.cargo_revision_differences(coalesce(baseline->'cargoLines','[]'),coalesce(booking->'cargoLines','[]'),coalesce(proposed->'cargoLines','[]'));
  if not (baseline ? 'cargoLines' and proposed ? 'cargoLines') then
    select coalesce(jsonb_agg(value||jsonb_build_object('blockedReason','Legacy cargo must be mapped to individual Quote lines before this change can be applied.',
      'requiresConfirmation',true,'recommendation','review')),'[]'::jsonb) into cargo_differences from jsonb_array_elements(cargo_differences);
  end if;
  old_value:=jsonb_build_object('goodsValue',baseline#>'{cargo,goodsValue}','currency',baseline#>'{cargo,goodsValueCurrency}');
  new_value:=jsonb_build_object('goodsValue',proposed#>'{cargo,goodsValue}','currency',proposed#>'{cargo,goodsValueCurrency}');
  if old_value is distinct from new_value then
    -- Never route aggregate shipment value through the legacy one-cargo-row
    -- replacement. Surface the still-unconnected allocation boundary honestly.
    result:=result||jsonb_build_array(jsonb_build_object('key','cargo','label','Shipment goods value','section','Goods',
      'previousQuoteValue',old_value,'newQuoteValue',new_value,'bookingValue',booking->'cargo',
      'requiresConfirmation',true,'recommendation','review','blockedReason','Shipment goods value and cargo allocations need a separate review before applying this change.'));
  end if;
  return result||cargo_differences;
end;
$$;

create function booking_api.refreshed_cargo_review(requested_review_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare review_row record; baseline jsonb; proposed jsonb; booking jsonb; differences jsonb; token text;
begin
  select * into strict review_row from booking_api.quote_sync_reviews where review_id=requested_review_id;
  select booking_api.quote_sync_projection("CusQuoteVersion_SnapshotJSON") into baseline from public."CusQuote_Versions" where "CusQuoteVersion_ID"=review_row.applied_version_id;
  select booking_api.quote_sync_projection("CusQuoteVersion_SnapshotJSON") into strict proposed from public."CusQuote_Versions" where "CusQuoteVersion_ID"=review_row.proposed_version_id;
  baseline:=coalesce(baseline,review_row.baseline_snapshot);
  booking:=booking_api.current_quote_sync_projection(review_row.job_id);
  differences:=booking_api.quote_sync_differences(baseline,booking,proposed);
  -- Keep immutable decision receipts visible after partial application, even
  -- when a later operational edit changes the remaining comparison's shape.
  select coalesce(jsonb_agg(value order by value->>'key'),'[]') into differences from (
    select value from jsonb_array_elements(review_row.differences) where review_row.applied_fields ? (value->>'key')
    union all select value from jsonb_array_elements(differences) where not review_row.applied_fields ? (value->>'key')
  ) items;
  token:=encode(sha256(convert_to(jsonb_build_object('reviewId',requested_review_id,'booking',booking,
    'differences',differences,'appliedFields',review_row.applied_fields)::text,'UTF8')),'hex');
  return jsonb_build_object('differences',differences,'reviewToken',token,'booking',booking,'baseline',baseline,'proposed',proposed);
end;
$$;

create function public.booking_workflow_quote_sync_review_v2(caller_auth_user_id uuid,requested_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare app_user record; review_row record; refreshed jsonb;
begin
  if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id,'Bookings.Read') then raise exception 'Booking access is not authorised.' using errcode='42501'; end if;
  select "User_ID","Company_ID" into strict app_user from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  select review.*,coalesce(quote."CusQuoteHeader_CustomerReference",'Q-'||quote."CusQuoteHeader_Number") as quote_reference,
    applied."CusQuoteVersion_Number" as applied_version_number,proposed."CusQuoteVersion_Number" as proposed_version_number
    into review_row from booking_api.quote_sync_reviews review join public."Job_Header" job on job."Job_ID"=review.job_id
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    join public."CusQuote_Header" quote on quote."CusQuoteHeader_ID"=review.quote_id and not quote."CusQuoteHeader_IsDeleted"
    left join public."CusQuote_Versions" applied on applied."CusQuoteVersion_ID"=review.applied_version_id
    join public."CusQuote_Versions" proposed on proposed."CusQuoteVersion_ID"=review.proposed_version_id
    where review.job_id=requested_job_id and review.company_id=app_user."Company_ID" and office."Company_ID"=app_user."Company_ID"
      and review.quote_id=job."Job_SourceQuoteID" and review.proposed_version_id=job."Job_PendingQuoteVersionID"
      and not job."Job_IsDeleted" and review.status_code in ('pending','partially_applied') order by review.created_at desc limit 1;
  if not found then return null; end if;
  refreshed:=booking_api.refreshed_cargo_review(review_row.review_id);
  return jsonb_build_object('reviewId',review_row.review_id,'jobId',review_row.job_id,'quoteId',review_row.quote_id,
    'appliedVersionId',review_row.applied_version_id,'proposedVersionId',review_row.proposed_version_id,'status',review_row.status_code,
    'quoteReference',review_row.quote_reference,'appliedVersionNumber',review_row.applied_version_number,'proposedVersionNumber',review_row.proposed_version_number,
    'differences',refreshed->'differences','reviewToken',refreshed->>'reviewToken','appliedFields',review_row.applied_fields,'createdAt',review_row.created_at);
exception when no_data_found or too_many_rows then raise exception 'Your workspace identity is incomplete.' using errcode='42501';
end;
$$;

create function public.booking_workflow_apply_quote_sync_v2(caller_auth_user_id uuid,requested_job_id uuid,requested_review_id uuid,
  requested_fields jsonb,expected_review_token text,confirm_mode_change boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare app_user record; job_row record; review_row record; refreshed jsonb; selected jsonb; cargo_fields jsonb; other_fields jsonb; result jsonb;
begin
  if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id,'Bookings.Write') then raise exception 'Booking changes are not authorised.' using errcode='42501'; end if;
  select "User_ID","Company_ID" into strict app_user from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  select job.* into strict job_row from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=requested_job_id and not job."Job_IsDeleted" and office."Company_ID"=app_user."Company_ID" for update of job;
  select * into strict review_row from booking_api.quote_sync_reviews where review_id=requested_review_id and job_id=requested_job_id
    and company_id=app_user."Company_ID" and quote_id=job_row."Job_SourceQuoteID"
    and status_code in ('pending','partially_applied','applied') for update;
  if requested_fields is null or jsonb_typeof(requested_fields)<>'array' or jsonb_array_length(requested_fields) not between 1 and 8030
    or (select count(distinct value) from jsonb_array_elements(requested_fields) where jsonb_typeof(value)='string')<>jsonb_array_length(requested_fields) then
    raise exception 'Choose unique Quote fields to apply.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(value),'[]') into selected from jsonb_array_elements(requested_fields) where not review_row.applied_fields ? (value#>>'{}');
  if jsonb_array_length(selected)=0 then
    return jsonb_build_object('reviewId',requested_review_id,'reused',true,'status',review_row.status_code,'appliedFields',review_row.applied_fields,
      'remainingFields',(select count(*) from jsonb_array_elements(review_row.differences) d where not review_row.applied_fields ? (d->>'key')),
      'workspace',booking_api.workspace_with_document_groups(caller_auth_user_id,job_row."Job_BookingReference")); end if;
  if review_row.status_code='applied' or job_row."Job_PendingQuoteVersionID" is distinct from review_row.proposed_version_id
    or job_row."Job_SourceQuoteVersionID" is distinct from review_row.applied_version_id then
    raise exception 'The Quote review changed. Refresh before applying.' using errcode='40001'; end if;
  if not exists(select 1 from public."CusQuote_Versions" version where version."CusQuoteVersion_ID"=review_row.proposed_version_id
      and version."CusQuoteHeader_ID"=job_row."Job_SourceQuoteID" and version."CusQuoteVersion_IsSubmitted" and version."CusQuoteVersion_StatusCode"='accepted'
      and exists(select 1 from public."CusQuote_Header" quote where quote."CusQuoteHeader_ID"=version."CusQuoteHeader_ID" and not quote."CusQuoteHeader_IsDeleted")
      and not exists(select 1 from public."CusQuote_Versions" newer where newer."CusQuoteHeader_ID"=version."CusQuoteHeader_ID"
        and newer."CusQuoteVersion_Number">version."CusQuoteVersion_Number" and newer."CusQuoteVersion_IsSubmitted" and newer."CusQuoteVersion_StatusCode"='accepted')) then
    raise exception 'This is no longer the latest accepted Quote. Refresh the review.' using errcode='40001'; end if;
  refreshed:=booking_api.refreshed_cargo_review(requested_review_id);
  if expected_review_token is distinct from refreshed->>'reviewToken' then
    raise exception 'The Booking or review changed. Refresh and check the differences before applying.' using errcode='40001'; end if;
  if exists(select 1 from jsonb_array_elements_text(selected) field where not exists(select 1 from jsonb_array_elements(refreshed->'differences') d
    where d->>'key'=field and nullif(d->>'blockedReason','') is null)) then
    raise exception 'A selected field is unavailable or needs a separate cargo mapping/value review.' using errcode='22023'; end if;
  if selected ? 'mode' and not coalesce(confirm_mode_change,false) then raise exception 'Confirm the mode change before applying it to the Booking.' using errcode='22023'; end if;
  -- Preserve the original booking_snapshot as creation evidence. Refreshed
  -- differences become the explicit decision record only inside Apply.
  update booking_api.quote_sync_reviews set differences=refreshed->'differences',baseline_snapshot=refreshed->'baseline',proposed_snapshot=refreshed->'proposed'
    where review_id=requested_review_id;
  select coalesce(jsonb_agg(value),'[]') into cargo_fields from jsonb_array_elements(selected) where value#>>'{}' like 'cargo:%';
  select coalesce(jsonb_agg(value),'[]') into other_fields from jsonb_array_elements(selected) where value#>>'{}' not like 'cargo:%';
  if jsonb_array_length(cargo_fields)>0 then
    result:=booking_api.apply_quote_cargo_fields(caller_auth_user_id,requested_job_id,requested_review_id,cargo_fields,refreshed#>'{booking,cargoLines}'); end if;
  if jsonb_array_length(other_fields)>0 then
    result:=public.booking_workflow_apply_quote_sync_confirmed(caller_auth_user_id,requested_job_id,requested_review_id,other_fields,confirm_mode_change); end if;
  select * into strict review_row from booking_api.quote_sync_reviews where review_id=requested_review_id;
  return coalesce(result,'{}')||jsonb_build_object('reviewId',requested_review_id,'status',review_row.status_code,'appliedFields',review_row.applied_fields,
    'remainingFields',(select count(*) from jsonb_array_elements(review_row.differences) d where not review_row.applied_fields ? (d->>'key')),
    'workspace',booking_api.workspace_with_document_groups(caller_auth_user_id,job_row."Job_BookingReference"));
exception when no_data_found or too_many_rows then raise exception 'The Quote review is unavailable in this workspace.' using errcode='42501';
end;
$$;

-- Older clients and service callers must not mark dynamic fields applied via
-- the old summary-only path, nor collapse cargo to change a shipment value.
do $migration$
declare definition text:=pg_get_functiondef('public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)'::regprocedure);
  anchor text:='  proposed := review_row.proposed_snapshot;';
begin
  if position(anchor in definition)=0 then raise exception 'Review the existing apply body before adding structured cargo guards.'; end if;
  execute replace(definition,anchor,$guard$
  if exists(select 1 from jsonb_array_elements_text(selected_fields) field where field like 'cargo:%') then
    raise exception 'Refresh the Booking and use the current cargo review action.' using errcode='22023'; end if;
  if selected_fields ? 'cargo' and (review_row.baseline_snapshot ? 'cargoLines' or review_row.proposed_snapshot ? 'cargoLines') then
    raise exception 'Shipment goods value requires a separate allocation review.' using errcode='22023'; end if;
  proposed := review_row.proposed_snapshot;$guard$);
end;
$migration$;

revoke all on function booking_api.quote_sync_projection_before_cargo_lines_20260905(jsonb),booking_api.current_quote_sync_projection_before_cargo_lines_20260905(uuid),
  booking_api.quote_sync_differences_before_cargo_lines_20260905(jsonb,jsonb,jsonb),booking_api.refreshed_cargo_review(uuid) from public,anon,authenticated,service_role;
revoke all on function booking_api.quote_sync_projection(jsonb),booking_api.current_quote_sync_projection(uuid),booking_api.quote_sync_differences(jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.booking_workflow_quote_sync_review_v2(uuid,uuid),public.booking_workflow_apply_quote_sync_v2(uuid,uuid,uuid,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.booking_workflow_quote_sync_review_v2(uuid,uuid),public.booking_workflow_apply_quote_sync_v2(uuid,uuid,uuid,jsonb,text,boolean) to service_role;
commit;
