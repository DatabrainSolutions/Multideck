-- Staged with the editor/review package; never deploy independently.
begin;
set local lock_timeout='5s';

-- Attach reliable source identity at creation, rather than guessing afterwards
-- from description, price or row position. Historical rows are not backfilled.
create function booking_api.capture_quote_charge_origin() returns trigger
language plpgsql security definer set search_path='' as $$
declare version public."CusQuote_Versions"%rowtype; source_line jsonb; source_id text; matches integer;
begin
 if new."JobCostingLine_DomainCode"<>'freight' or new."JobCostingLine_SourceTable" is distinct from 'CusQuote_Versions' then return new;end if;
 source_id:=new."JobCostingLine_SourceMetadataJSON"#>>'{quoteCharge,id}';
 select v.* into strict version from public."CusQuote_Versions" v join public."Job_Header" j on j."Job_SourceQuoteID"=v."CusQuoteHeader_ID"
 where j."Job_ID"=new."Job_ID" and v."CusQuoteVersion_ID"=new."JobCostingLine_SourceID"
 and v."CusQuoteVersion_IsSubmitted" and v."CusQuoteVersion_StatusCode"='accepted';
 select count(*),(jsonb_agg(q))[0] into matches,source_line from jsonb_array_elements(version."CusQuoteVersion_SnapshotJSON"#>'{quote,charges}') q
 where q->>'id'=source_id;
 if matches<>1 or source_line is distinct from new."JobCostingLine_SourceMetadataJSON"->'quoteCharge' then
  raise exception 'The accepted Quote charge identity is unavailable or ambiguous.' using errcode='22023';end if;
 if exists(select 1 from booking_api.charge_origins where costing_line_id=new."JobCostingLine_ID"
  and job_id=new."Job_ID" and quote_version_id=version."CusQuoteVersion_ID" and quote_line_id=source_id) then
  return new; -- Explicit restoration retains the immutable original lineage.
 end if;
 insert into booking_api.charge_origins(job_id,costing_line_id,origin,quote_id,quote_version_id,quote_line_id,source_snapshot,recorded_by)
 values(new."Job_ID",new."JobCostingLine_ID",'quote',version."CusQuoteHeader_ID",version."CusQuoteVersion_ID",source_id,source_line,new."JobCostingLine_CreatedBy");
 return new;
end $$;
create trigger booking_quote_charge_origin after insert on public."Job_Costing_Lines"
for each row execute function booking_api.capture_quote_charge_origin();
revoke all on function booking_api.capture_quote_charge_origin() from public,anon,authenticated,service_role;

-- Fail on source drift, and patch only the exact costing insert's columns/values.
do $$declare definition text; anchor text; replacement text; function_name text;begin
 foreach function_name in array array[
  'booking_api.convert_accepted_quote_before_sync_review_20260904(uuid,uuid,uuid)',
  'booking_api.release_provisional_quote_charges()'
 ] loop
  definition:=pg_get_functiondef(function_name::regprocedure);
  if function_name like '%convert_accepted%' then
   anchor:='"JobCostingLine_ShowToCustomer", "JobCostingLine_CreatedBy", "JobCostingLine_UpdatedBy"';
   replacement:=anchor||', "JobCostingLine_DomainCode", "JobCostingLine_SourceTable", "JobCostingLine_SourceID", "JobCostingLine_SourceMetadataJSON"';
  else
   anchor:='"JobCostingLine_ShowToCustomer", "JobCostingLine_CreatedBy", "JobCostingLine_UpdatedBy", "JobCostingLine_DomainCode"';
   replacement:=anchor||', "JobCostingLine_SourceTable", "JobCostingLine_SourceID", "JobCostingLine_SourceMetadataJSON"';
  end if;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Quote charge creation columns changed: %',function_name;end if;
  definition:=replace(definition,anchor,replacement);
  if function_name like '%convert_accepted%' then
   anchor:='coalesce((charge->>''showToCustomer'')::boolean, true), actor_user_id, actor_user_id';
   replacement:=anchor||', ''freight'', ''CusQuote_Versions'', version_row."CusQuoteVersion_ID", jsonb_build_object(''quoteCharge'',charge)';
  else
   anchor:='coalesce((charge->>''showToCustomer'')::boolean, true), actor_user_id, actor_user_id, ''freight''';
   replacement:=anchor||', ''CusQuote_Versions'', new."Job_SourceQuoteVersionID", jsonb_build_object(''quoteCharge'',charge)';
  end if;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Quote charge creation values changed: %',function_name;end if;
  execute replace(definition,anchor,replacement);
 end loop;

 -- Old whole-list entry points must not bypass individual preservation decisions.
 definition:=pg_get_functiondef('booking_api.save_operational_booking(uuid,uuid,jsonb)'::regprocedure);
 anchor:='  saved := booking_api.save_booking(caller_auth_user_id, requested_job_id, payload);';
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Operational saver changed; review charge guard.';end if;
 execute replace(definition,anchor,$guard$
  if payload ? 'charges' then
   raise exception 'Use the Booking Finance charge editor; whole-list charge replacement is not supported.' using errcode='55000';
  end if;
  saved := booking_api.save_booking(caller_auth_user_id, requested_job_id, payload);$guard$);

 definition:=pg_get_functiondef('public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)'::regprocedure);
 anchor:='  proposed := review_row.proposed_snapshot;';
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Quote update saver changed; review charge guard.';end if;
 execute replace(definition,anchor,$guard$
  if selected_fields ? 'charges' then
   raise exception 'Review Quote charge changes individually in Booking Finance. Existing charges have been preserved.' using errcode='55000';
  end if;
  proposed := review_row.proposed_snapshot;$guard$);
end $$;
commit;
