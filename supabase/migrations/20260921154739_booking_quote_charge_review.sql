begin;
set local lock_timeout='5s';
create function booking_api.quote_charge_values(charge jsonb,line_id uuid,customer_id uuid) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',line_id,'code',coalesce(charge->>'code',''),'description',charge->>'description',
 'supplierId',charge->'supplierId','customerId',customer_id,'cost',charge->'costAmount','sell',charge->'sellAmount',
 'costCurrency',charge->>'costCurrency','sellCurrency',charge->>'sellCurrency',
 'costRoe',charge->'costRoe','sellRoe',charge->'sellRoe','quantity',coalesce(charge->'quantity','1'),
 'calculationBasis',charge->'calculationBasis');
$$;
revoke all on function booking_api.quote_charge_values(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create function booking_api.quote_charge_review(caller_auth_user_id uuid,requested_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; review booking_api.quote_sync_reviews%rowtype; version public."CusQuote_Versions"%rowtype;
 job public."Job_Header"%rowtype; items jsonb:='[]'; item jsonb; line jsonb; next_charge jsonb;
 origin booking_api.charge_origins%rowtype; removed booking_api.removed_charges%rowtype;
 has_unknown boolean; token text;
begin
 context:=booking_api.operational_charge_workspace(caller_auth_user_id,requested_job_id);
 select * into strict job from public."Job_Header" where "Job_ID"=requested_job_id;
 select r.* into review from booking_api.quote_sync_reviews r where r.job_id=requested_job_id
 and r.quote_id=job."Job_SourceQuoteID" and r.proposed_version_id=job."Job_PendingQuoteVersionID"
 and r.company_id=(select "Company_ID" from public."cmp_Offices" where "Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID"))
 and r.status_code in ('pending','partially_applied') and not r.applied_fields ? 'charges'
 order by r.created_at desc limit 1;
 if not found then return null;end if;
 select * into strict version from public."CusQuote_Versions" where "CusQuoteVersion_ID"=review.proposed_version_id
 and "CusQuoteHeader_ID"=job."Job_SourceQuoteID" and "CusQuoteVersion_IsSubmitted" and "CusQuoteVersion_StatusCode"='accepted';
 if review.applied_version_id is distinct from job."Job_SourceQuoteVersionID" or exists(
  select 1 from public."CusQuote_Versions" newer where newer."CusQuoteHeader_ID"=version."CusQuoteHeader_ID"
   and newer."CusQuoteVersion_Number">version."CusQuoteVersion_Number" and newer."CusQuoteVersion_IsSubmitted" and newer."CusQuoteVersion_StatusCode"='accepted') then
  raise exception 'This is no longer the current accepted Quote review.' using errcode='40001';end if;
 if jsonb_typeof(version."CusQuoteVersion_SnapshotJSON"#>'{quote,charges}') is distinct from 'array' then
  raise exception 'The accepted Quote charge snapshot needs review.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(version."CusQuoteVersion_SnapshotJSON"#>'{quote,charges}') q where nullif(btrim(q->>'id'),'') is null)
 or (select count(distinct q->>'id') from jsonb_array_elements(version."CusQuoteVersion_SnapshotJSON"#>'{quote,charges}') q)
  <>jsonb_array_length(version."CusQuoteVersion_SnapshotJSON"#>'{quote,charges}') then
  raise exception 'The accepted Quote charge identities are missing or duplicated.' using errcode='22023';end if;
 select exists(select 1 from public."Job_Costing_Lines" c where c."Job_ID"=requested_job_id and c."JobCostingLine_DomainCode"='freight'
  and not exists(select 1 from booking_api.charge_origins o where o.costing_line_id=c."JobCostingLine_ID")) into has_unknown;
 for line in select * from jsonb_array_elements(context->'lines') loop
  select * into origin from booking_api.charge_origins where costing_line_id=(line->>'id')::uuid;
  next_charge:=null;
  if origin.origin='quote' then
   select q into next_charge from jsonb_array_elements(version."CusQuoteVersion_SnapshotJSON"#>'{quote,charges}') q where q->>'id'=origin.quote_line_id;
  end if;
  item:=jsonb_build_object('key','booking:'||(line->>'id'),'bookingLineId',line->>'id','quoteLineId',origin.quote_line_id,
   'kind',case when origin.origin is distinct from 'quote' then 'preserve' when next_charge is null then 'remove' else 'replace' end,
   'before',line->'values','proposed',case when next_charge is not null then booking_api.quote_charge_values(next_charge,(line->>'id')::uuid,job."Job_Customer") end,
   'beforeNotes',jsonb_build_object('internalNotes',line#>'{snapshot,JobCostingLine_InternalNotes}','customerNotes',line#>'{snapshot,JobCostingLine_CustomerNotes}','showToCustomer',line#>'{snapshot,JobCostingLine_ShowToCustomer}'),
   'proposedNotes',case when next_charge is not null then jsonb_build_object('internalNotes',next_charge->'internalNotes','customerNotes',next_charge->'customerNotes','showToCustomer',coalesce(next_charge->'showToCustomer','true')) end,
   'blockedReason',case when origin.origin is distinct from 'quote' then 'Booking-added or unconfirmed historical line: preserved independently of this Quote.' else line->>'blockedReason' end);
  items:=items||jsonb_build_array(item);
 end loop;
 for next_charge in select * from jsonb_array_elements(version."CusQuoteVersion_SnapshotJSON"#>'{quote,charges}') loop
  if exists(select 1 from booking_api.charge_origins o join public."Job_Costing_Lines" c on c."JobCostingLine_ID"=o.costing_line_id
   where o.job_id=requested_job_id and o.quote_id=review.quote_id and o.quote_line_id=next_charge->>'id') then continue;end if;
  select r.* into removed from booking_api.removed_charges r join booking_api.charge_origins o on o.costing_line_id=r.costing_line_id
   where o.job_id=requested_job_id and o.quote_id=review.quote_id and o.quote_line_id=next_charge->>'id'
   and not exists(select 1 from booking_api.charge_restorations s where s.removal_id=r.removal_id);
  items:=items||jsonb_build_array(jsonb_build_object('key','quote:'||(next_charge->>'id'),'quoteLineId',next_charge->>'id',
   'bookingLineId',removed.costing_line_id,'removalId',removed.removal_id,'kind',case when removed.removal_id is null then 'add' else 'restore' end,
   'before',case when removed.removal_id is not null then booking_api.operational_charge_values(removed.before_state) end,
   'proposed',booking_api.quote_charge_values(next_charge,removed.costing_line_id,job."Job_Customer"),
   'beforeNotes',case when removed.removal_id is not null then jsonb_build_object('internalNotes',removed.before_state->'JobCostingLine_InternalNotes','customerNotes',removed.before_state->'JobCostingLine_CustomerNotes','showToCustomer',removed.before_state->'JobCostingLine_ShowToCustomer') end,
   'proposedNotes',jsonb_build_object('internalNotes',next_charge->'internalNotes','customerNotes',next_charge->'customerNotes','showToCustomer',coalesce(next_charge->'showToCustomer','true')),
   'blockedReason',case when has_unknown then 'Match historical charge origins before adding or restoring Quote charges.' end));
 end loop;
 token:=encode(sha256(convert_to(jsonb_build_object('context',context,'items',items,'snapshot',version."CusQuoteVersion_SnapshotJSON",'review',to_jsonb(review))::text,'UTF8')),'hex');
 return jsonb_build_object('reviewId',review.review_id,'versionId',review.proposed_version_id,'token',token,'items',items,
  'editable',context->'editable','blockedReason',context->'blockedReason');
end $$;
revoke all on function booking_api.quote_charge_review(uuid,uuid) from public,anon,authenticated,service_role;

create function booking_api.apply_quote_charge_review(caller_auth_user_id uuid,requested_job_id uuid,
 requested_review_id uuid,expected_token text,requested_decisions jsonb,requested_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public."cmp_Users"%rowtype; job public."Job_Header"%rowtype; review booking_api.quote_sync_reviews%rowtype;
 current_review jsonb; context jsonb; item jsonb; decision jsonb; action text; line_id uuid; before_row jsonb; after_row jsonb;
 value jsonb; quote_charge jsonb; version_snapshot jsonb; line_number integer; receipt jsonb:='[]'; remaining integer;
begin
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false) then raise exception 'Booking changes are not authorised.' using errcode='42501';end if;
 select * into strict actor from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
 select j.* into strict job from public."Job_Header" j join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" and o."Company_ID"=actor."Company_ID" for update of j;
 select * into strict review from booking_api.quote_sync_reviews where review_id=requested_review_id and job_id=requested_job_id
 and company_id=actor."Company_ID" and quote_id=job."Job_SourceQuoteID" and proposed_version_id=job."Job_PendingQuoteVersionID"
 and status_code in ('pending','partially_applied') and not applied_fields ? 'charges' for update;
 -- Lock every current line in a fixed order. FK financial-link writers must
 -- complete before the fresh protection checks below, or wait for this save.
 perform 1 from public."Job_Costing_Lines" where "Job_ID"=requested_job_id and "JobCostingLine_DomainCode"='freight' order by "JobCostingLine_ID" for update;
 select "CusQuoteVersion_SnapshotJSON" into strict version_snapshot from public."CusQuote_Versions" where "CusQuoteVersion_ID"=review.proposed_version_id
 and "CusQuoteHeader_ID"=job."Job_SourceQuoteID" and "CusQuoteVersion_IsSubmitted" and "CusQuoteVersion_StatusCode"='accepted' for share;
 current_review:=booking_api.quote_charge_review(caller_auth_user_id,requested_job_id);
 if current_review is null or current_review->>'reviewId'<>requested_review_id::text or expected_token is distinct from current_review->>'token' then
  raise exception 'The Quote or Booking changed. Refresh the charge review.' using errcode='40001';end if;
 if not (current_review->>'editable')::boolean then raise exception '%',current_review->>'blockedReason' using errcode='55000';end if;
 if nullif(btrim(requested_reason),'') is null or length(requested_reason)>2000 then raise exception 'Enter a reason for the charge decisions.' using errcode='22023';end if;
 if jsonb_typeof(requested_decisions) is distinct from 'array' or jsonb_array_length(requested_decisions)>400
 or (select count(distinct d->>'key') from jsonb_array_elements(requested_decisions) d)<>jsonb_array_length(requested_decisions) then
  raise exception 'Choose one decision per charge.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(requested_decisions) d where not exists(select 1 from jsonb_array_elements(current_review->'items') i where i->>'key'=d->>'key')
  or coalesce(d->>'action','') not in ('keep','add','replace','remove','restore')) then raise exception 'Invalid charge decision.' using errcode='22023';end if;
 context:=booking_api.operational_charge_workspace(caller_auth_user_id,requested_job_id);
 for item in select * from jsonb_array_elements(current_review->'items') loop
  select d into decision from jsonb_array_elements(requested_decisions) d where d->>'key'=item->>'key';
  action:=coalesce(decision->>'action','keep'); before_row:=null; after_row:=null;
  if action='keep' then
   receipt:=receipt||jsonb_build_array(jsonb_build_object('key',item->>'key','action','keep','before',item->'before','after',item->'before'));continue;
  end if;
  if item->>'blockedReason' is not null or action<>item->>'kind' then raise exception 'A selected charge is protected or its decision is invalid.' using errcode='55000';end if;
  line_id:=(item->>'bookingLineId')::uuid;
  if action='restore' then
   select r.before_state into before_row from booking_api.removed_charges r where r.removal_id=(item->>'removalId')::uuid;
   perform booking_api.restore_operational_charge(caller_auth_user_id,requested_job_id,(item->>'removalId')::uuid,before_row,requested_reason);
  end if;
  if line_id is not null then select to_jsonb(c) into strict before_row from public."Job_Costing_Lines" c where c."JobCostingLine_ID"=line_id and c."Job_ID"=requested_job_id for update;
   if booking_api.charge_has_financial_evidence(line_id) then raise exception 'This charge has financial evidence.' using errcode='55000';end if;
  end if;
  if action='remove' then
   perform booking_api.remove_operational_charge(caller_auth_user_id,requested_job_id,line_id,before_row,requested_reason);
  else
   if line_id is null then line_id:=gen_random_uuid();end if;
   value:=item->'proposed'||jsonb_build_object('id',line_id);
   perform booking_api.validate_operational_charge(value,context);
   select q into strict quote_charge from jsonb_array_elements(version_snapshot#>'{quote,charges}') q where q->>'id'=item->>'quoteLineId';
   if action='add' then
    select coalesce(max("JobCostingLine_Number"),0)+1 into line_number from public."Job_Costing_Lines" where "Job_ID"=requested_job_id;
    insert into public."Job_Costing_Lines"("JobCostingLine_ID","Job_ID","JobCostingLine_Number","JobCostingLine_Description","JobCostingLine_DomainCode",
     "JobCostingLine_SourceTable","JobCostingLine_SourceID","JobCostingLine_SourceMetadataJSON","JobCostingLine_CreatedBy","JobCostingLine_UpdatedBy")
    values(line_id,requested_job_id,line_number,value->>'description','freight','CusQuote_Versions',review.proposed_version_id,jsonb_build_object('quoteCharge',quote_charge),actor."User_ID",actor."User_ID");
   end if;
   update public."Job_Costing_Lines" set "JobCostingLine_Description"=btrim(value->>'description'),"JobCostingLine_SupplierID"=(value->>'supplierId')::uuid,
    "JobCostingLine_CostAmountCurrency"=(value->>'cost')::numeric,"JobCostingLine_RevenueAmountCurrency"=(value->>'sell')::numeric,
    "JobCostingLine_CostROE"=(value->>'costRoe')::numeric,"JobCostingLine_RevenueROE"=(value->>'sellRoe')::numeric,
    "JobCostingLine_CostAmountLocal"=round((value->>'cost')::numeric/(value->>'costRoe')::numeric,4),
    "JobCostingLine_RevenueAmountLocal"=round((value->>'sell')::numeric/(value->>'sellRoe')::numeric,4),
    "JobCostingLine_InternalNotes"=quote_charge->>'internalNotes',"JobCostingLine_CustomerNotes"=quote_charge->>'customerNotes',
    "JobCostingLine_ShowToCustomer"=coalesce((quote_charge->>'showToCustomer')::boolean,true),
    "JobCostingLine_SourceMetadataJSON"=coalesce("JobCostingLine_SourceMetadataJSON",'{}')||jsonb_build_object('bookingCharge',value,'baseCurrency',context->>'baseCurrency','lastQuoteReviewId',review.review_id),
    "JobCostingLine_UpdatedBy"=actor."User_ID","JobCostingLine_UpdatedAt"=clock_timestamp()
   where "JobCostingLine_ID"=line_id returning to_jsonb("Job_Costing_Lines") into after_row;
  end if;
  receipt:=receipt||jsonb_build_array(jsonb_build_object('key',item->>'key','action',action,'before',before_row,'after',after_row));
 end loop;
 update booking_api.quote_sync_reviews set applied_fields=applied_fields||'"charges"'::jsonb,decided_by=actor."User_ID" where review_id=requested_review_id;
 select count(*) into remaining from jsonb_array_elements(booking_api.refreshed_cargo_review(requested_review_id)->'differences') d where d->>'key'<>'charges' and not review.applied_fields ? (d->>'key');
 update booking_api.quote_sync_reviews set status_code=case when remaining=0 then 'applied' else 'partially_applied' end,
  decided_at=case when remaining=0 then clock_timestamp() else decided_at end where review_id=requested_review_id;
 if remaining=0 then
  update public."Job_Header" set "Job_SourceQuoteVersionID"=review.proposed_version_id,"Job_SourceQuoteResponseID"=review.proposed_response_id,
   "Job_PendingQuoteVersionID"=null,"Job_PendingQuoteResponseID"=null,"Job_QuoteSyncStatus"='in_sync',"Job_QuoteSyncDetectedAt"=null,
   "Job_SourceSnapshotJSON"=coalesce("Job_SourceSnapshotJSON",'{}')||jsonb_build_object('acceptedSnapshot',version_snapshot) where "Job_ID"=requested_job_id;
 else
  update public."Job_Header" set "Job_QuoteSyncStatus"='partially_applied' where "Job_ID"=requested_job_id;
 end if;
 update public."Job_Header" set "Job_UpdatedAt"=clock_timestamp(),"Job_UpdatedBy"=actor."User_ID" where "Job_ID"=requested_job_id;
 insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
 values(actor."Company_ID",requested_job_id,'quote_charge_decisions','Quote charge decisions recorded',
  jsonb_build_object('reason',btrim(requested_reason),'reviewId',requested_review_id,'quoteVersionId',review.proposed_version_id,'decisions',receipt),actor."User_ID");
 return booking_api.operational_charge_workspace(caller_auth_user_id,requested_job_id);
exception when no_data_found or too_many_rows then raise exception 'The charge review is unavailable or ambiguous.' using errcode='42501';
end $$;
revoke all on function booking_api.apply_quote_charge_review(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
commit;
