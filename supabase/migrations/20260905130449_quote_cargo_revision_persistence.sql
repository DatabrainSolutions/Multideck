-- Guarded internal persistence for the cargo revision planner. Public review
-- and Apply integration follows separately; no application role can call this
-- helper directly and no client-supplied plan is trusted.
begin;

-- A later working draft or declined revision must not invalidate the last
-- accepted version awaiting Booking review. Acceptance belongs to the version,
-- not the mutable master lifecycle/accepted-id convenience field.
do $migration$
declare definition text:=pg_get_functiondef('booking_api.plan_quote_cargo_revision(uuid,uuid,uuid,jsonb,jsonb)'::regprocedure);
  old_boundary text:=$old$and version."CusQuoteVersion_IsSubmitted" and quote."CusQuoteHeader_AcceptedVersionID"=proposed_version_id
      and quote."CusQuoteHeader_LifecycleCode"='accepted' and not quote."CusQuoteHeader_IsDeleted";$old$;
  new_boundary text:=$new$and version."CusQuoteVersion_IsSubmitted" and version."CusQuoteVersion_StatusCode"='accepted'
      and not quote."CusQuoteHeader_IsDeleted"
      and not exists(select 1 from public."CusQuote_Versions" newer
        where newer."CusQuoteHeader_ID"=version."CusQuoteHeader_ID" and newer."CusQuoteVersion_IsSubmitted"
          and newer."CusQuoteVersion_StatusCode"='accepted' and newer."CusQuoteVersion_Number">version."CusQuoteVersion_Number");$new$;
begin
  if position(old_boundary in definition)=0 then raise exception 'Review cargo acceptance binding before applying persistence.'; end if;
  execute replace(definition,old_boundary,new_boundary);
end;
$migration$;

create function booking_api.apply_quote_cargo_fields(
  caller_auth_user_id uuid, requested_job_id uuid, requested_review_id uuid,
  requested_fields jsonb, observed_booking_lines jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  app_user record; job_row record; review_row record; plan jsonb; item jsonb; target jsonb;
  selected_fields jsonb; combined_fields jsonb; remaining_count integer; cargo_id uuid;
  next_line integer; updated_count integer; before_lines jsonb; after_lines jsonb; applied_changes jsonb:='[]';
  snapshot jsonb; source_values jsonb; compatibility_errors text[]; field_prefix text; write_fields jsonb;
begin
  if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id,'Bookings.Write') then
    raise exception 'Booking changes are not authorised.' using errcode='42501'; end if;
  select "User_ID","Company_ID" into strict app_user from public."cmp_Users"
    where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  select job.* into strict job_row from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=requested_job_id and not job."Job_IsDeleted" and office."Company_ID"=app_user."Company_ID" for update of job;
  select * into strict review_row from booking_api.quote_sync_reviews
    where review_id=requested_review_id and job_id=requested_job_id and company_id=app_user."Company_ID"
      and quote_id=job_row."Job_SourceQuoteID" and status_code in ('pending','partially_applied','applied') for update;
  if requested_fields is null or jsonb_typeof(requested_fields)<>'array' or jsonb_array_length(requested_fields) not between 1 and 8000 then
    raise exception 'Choose cargo fields to apply.' using errcode='22023'; end if;
  if (select count(distinct value) from jsonb_array_elements(requested_fields) item where jsonb_typeof(value)='string')<>jsonb_array_length(requested_fields)
    or exists(select 1 from jsonb_array_elements_text(requested_fields) field where field not like 'cargo:%'
      or not exists(select 1 from jsonb_array_elements(review_row.differences) d where d->>'key'=field)) then
    raise exception 'One or more cargo fields are not available in this review.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into selected_fields from jsonb_array_elements(requested_fields)
    where not review_row.applied_fields ? (value#>>'{}');
  -- A repeated request is a receipt, never permission to reapply stale values.
  if jsonb_array_length(selected_fields)=0 then
    return jsonb_build_object('reviewId',requested_review_id,'reused',true,'appliedFields',review_row.applied_fields,'changes','[]'::jsonb);
  end if;
  if review_row.status_code='applied' or job_row."Job_PendingQuoteVersionID" is distinct from review_row.proposed_version_id then
    raise exception 'The pending Quote review changed. Refresh before applying.' using errcode='40001'; end if;
  plan:=booking_api.plan_quote_cargo_revision(requested_job_id,review_row.applied_version_id,
    review_row.proposed_version_id,selected_fields,observed_booking_lines);
  select "CusQuoteVersion_SnapshotJSON" into strict snapshot from public."CusQuote_Versions"
    where "CusQuoteVersion_ID"=review_row.proposed_version_id;
  source_values:=quote_api.cargo_line_map(snapshot#>'{quote,shipmentFacts,cargoLines}');
  before_lines:=booking_api.current_source_cargo_lines(requested_job_id);
  select coalesce(max("JobCargo_LineNo"),0) into next_line from public."Job_Cargo" where "JobCargo_JobID"=requested_job_id;
  for item in select value from jsonb_array_elements(plan->'changes') loop
    cargo_id:=nullif(item->>'bookingCargoId','')::uuid; target:=item->'values';
    field_prefix:='cargo:'||(item->>'sourceLineId')||':';
    write_fields:=selected_fields;
    if selected_fields ? (field_prefix||'line') and item->>'operation'<>'remove' then
      select jsonb_agg(field_prefix||key) into write_fields from jsonb_object_keys(target) key;
    end if;
    if item->>'operation'<>'remove' then
      -- Validate authoritative incoming Quote values, not unselected operational
      -- text. An operator may have a longer description which must be retained.
      compatibility_errors:=quote_api.cargo_booking_missing(jsonb_build_array(
        (source_values->(item->>'sourceLineId'))||jsonb_build_object('id',item->>'sourceLineId')));
      if cardinality(compatibility_errors)>0 then raise exception 'Correct cargo before applying the Quote.' using errcode='22023',detail=to_jsonb(compatibility_errors)::text; end if;
    end if;
    if item->>'operation'='remove' then
      if cargo_id is not null then
        update public."Job_Cargo" set "JobCargo_IsDeleted"=true,"JobCargo_UpdatedAt"=now(),"JobCargo_UpdatedBy"=app_user."User_ID"
          where "JobCargo_ID"=cargo_id and "JobCargo_JobID"=requested_job_id and not "JobCargo_IsDeleted";
      end if;
    elsif cargo_id is null then
      next_line:=next_line+1;
      insert into public."Job_Cargo" (
        "JobCargo_JobID","JobCargo_LineNo","JobCargo_Description","JobCargo_Commodity","JobCargo_Qty","JobCargo_PackageQty",
        "JobCargo_PackageTypeCodeSnapshot","JobCargo_GrossKilos","JobCargo_NettKilos","JobCargo_VolumeCBM",
        "JobCargo_Length","JobCargo_Width","JobCargo_Height","JobCargo_LengthUnit","JobCargo_HSCode","JobCargo_CountryOfOriginCodeSnapshot",
        "JobCargo_IsHazardous","JobCargo_IsTemperatureControlled","JobCargo_SourceQuoteVersionID","JobCargo_SourceQuoteLineID",
        "JobCargo_CargoJSON","JobCargo_UpdatedBy"
      ) values(requested_job_id,next_line,target->>'description',target->>'commodity',(target->>'packageQuantity')::numeric,(target->>'packageQuantity')::numeric,
        target->>'packageType',(target->>'grossWeightKg')::numeric,(target->>'netWeightKg')::numeric,(target->>'volumeCbm')::numeric,
        (target->>'length')::numeric,(target->>'width')::numeric,(target->>'height')::numeric,target->>'lengthUnit',target->>'hsCode',target->>'countryOfOrigin',
        (target->>'isHazardous')::boolean,(target->>'isTemperatureControlled')::boolean,review_row.proposed_version_id,(item->>'sourceLineId')::uuid,
        target||jsonb_build_object('source','accepted_quote_update','quoteVersionId',review_row.proposed_version_id,'quoteCargoLineId',item->>'sourceLineId'),app_user."User_ID")
      returning "JobCargo_ID" into cargo_id;
    else
      update public."Job_Cargo" set
        "JobCargo_Description"=case when write_fields ? (field_prefix||'description') then target->>'description' else "JobCargo_Description" end,
        "JobCargo_Commodity"=case when write_fields ? (field_prefix||'commodity') then target->>'commodity' else "JobCargo_Commodity" end,
        "JobCargo_Qty"=case when write_fields ? ('cargo:'||(item->>'sourceLineId')||':packageQuantity') then (target->>'packageQuantity')::numeric else "JobCargo_Qty" end,
        "JobCargo_PackageQty"=case when write_fields ? (field_prefix||'packageQuantity') then (target->>'packageQuantity')::numeric else "JobCargo_PackageQty" end,
        "JobCargo_PackageTypeCodeSnapshot"=case when write_fields ? (field_prefix||'packageType') then target->>'packageType' else "JobCargo_PackageTypeCodeSnapshot" end,
        "JobCargo_GrossKilos"=case when write_fields ? (field_prefix||'grossWeightKg') then (target->>'grossWeightKg')::numeric else "JobCargo_GrossKilos" end,
        "JobCargo_NettKilos"=case when write_fields ? (field_prefix||'netWeightKg') then (target->>'netWeightKg')::numeric else "JobCargo_NettKilos" end,
        "JobCargo_VolumeCBM"=case when write_fields ? (field_prefix||'volumeCbm') then (target->>'volumeCbm')::numeric else "JobCargo_VolumeCBM" end,
        "JobCargo_Length"=case when write_fields ? (field_prefix||'length') then (target->>'length')::numeric else "JobCargo_Length" end,
        "JobCargo_Width"=case when write_fields ? (field_prefix||'width') then (target->>'width')::numeric else "JobCargo_Width" end,
        "JobCargo_Height"=case when write_fields ? (field_prefix||'height') then (target->>'height')::numeric else "JobCargo_Height" end,
        "JobCargo_LengthUnit"=case when write_fields ? (field_prefix||'lengthUnit') then target->>'lengthUnit' else "JobCargo_LengthUnit" end,
        "JobCargo_HSCode"=case when write_fields ? (field_prefix||'hsCode') then target->>'hsCode' else "JobCargo_HSCode" end,
        "JobCargo_CountryOfOriginCodeSnapshot"=case when write_fields ? (field_prefix||'countryOfOrigin') then target->>'countryOfOrigin' else "JobCargo_CountryOfOriginCodeSnapshot" end,
        "JobCargo_IsHazardous"=case when write_fields ? (field_prefix||'isHazardous') then (target->>'isHazardous')::boolean else "JobCargo_IsHazardous" end,
        "JobCargo_IsTemperatureControlled"=case when write_fields ? (field_prefix||'isTemperatureControlled') then (target->>'isTemperatureControlled')::boolean else "JobCargo_IsTemperatureControlled" end,
        "JobCargo_CargoJSON"="JobCargo_CargoJSON"||coalesce((select jsonb_object_agg(key,value) from jsonb_each(target) where write_fields ? (field_prefix||key)),'{}'::jsonb),
        "JobCargo_UpdatedAt"=now(),"JobCargo_UpdatedBy"=app_user."User_ID"
      where "JobCargo_ID"=cargo_id and "JobCargo_JobID"=requested_job_id and not "JobCargo_IsDeleted";
      get diagnostics updated_count=row_count;
      if updated_count<>1 then raise exception 'Booking cargo changed. Refresh before applying.' using errcode='40001'; end if;
    end if;
    applied_changes:=applied_changes||jsonb_build_array(item||jsonb_build_object('bookingCargoId',cargo_id));
  end loop;
  select coalesce(jsonb_agg(distinct value),'[]'::jsonb) into combined_fields from jsonb_array_elements(review_row.applied_fields||selected_fields);
  select count(*) into remaining_count from jsonb_array_elements(review_row.differences) d where not combined_fields ? (d->>'key');
  update booking_api.quote_sync_reviews set applied_fields=combined_fields,
    status_code=case when remaining_count=0 then 'applied' else 'partially_applied' end,
    decided_by=app_user."User_ID",decided_at=case when remaining_count=0 then now() else decided_at end
    where review_id=requested_review_id;
  if remaining_count=0 then
    update public."Job_Header" set "Job_SourceQuoteVersionID"=review_row.proposed_version_id,
      "Job_SourceQuoteResponseID"=review_row.proposed_response_id,"Job_PendingQuoteVersionID"=null,"Job_PendingQuoteResponseID"=null,
      "Job_QuoteSyncStatus"='in_sync',"Job_QuoteSyncDetectedAt"=null,
      "Job_SourceSnapshotJSON"="Job_SourceSnapshotJSON"||jsonb_build_object('acceptedSnapshot',snapshot),
      "Job_UpdatedAt"=now(),"Job_UpdatedBy"=app_user."User_ID" where "Job_ID"=requested_job_id;
  else
    update public."Job_Header" set "Job_QuoteSyncStatus"='partially_applied',"Job_UpdatedAt"=now(),"Job_UpdatedBy"=app_user."User_ID" where "Job_ID"=requested_job_id;
  end if;
  after_lines:=booking_api.current_source_cargo_lines(requested_job_id);
  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
    values(app_user."Company_ID",requested_job_id,
      case when remaining_count=0 then 'quote_update_applied' else 'quote_update_partially_applied' end,
      'Selected cargo changes from the accepted Quote were applied.',
      jsonb_build_object('reviewId',requested_review_id,'baselineVersionId',review_row.applied_version_id,'quoteVersionId',review_row.proposed_version_id,
        'appliedFields',selected_fields,'changes',applied_changes,'beforeCargo',before_lines,'afterCargo',after_lines,'remainingFields',remaining_count),app_user."User_ID");
  return jsonb_build_object('reviewId',requested_review_id,'reused',false,'appliedFields',combined_fields,'remainingFields',remaining_count,'changes',applied_changes);
exception when no_data_found or too_many_rows then
  raise exception 'The cargo review is unavailable in this workspace.' using errcode='42501';
end;
$$;
revoke all on function booking_api.apply_quote_cargo_fields(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
commit;
