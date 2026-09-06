// Extends the disposable cargo database with the real legacy projection/apply
// chain. Identity resolution and the broad document workspace are declared
// fixtures in the parent test; no live provider or public HTTP flow is mocked.
export function quoteCargoReviewFixture(read, sqlFunction) {
  const sync = read('20260904100000_quote_booking_sync_reviews.sql')
  const routing = read('20260904133000_quote_booking_routing_plans.sql')
  const payer = read('20260904144000_quote_bill_to_payer.sql')
  const containers = read('20260904161000_quote_booking_container_allocation.sql')
  return `
    alter table booking_api.quote_sync_reviews add column baseline_snapshot jsonb default '{}',
      add column proposed_snapshot jsonb default '{}',add column booking_snapshot jsonb default '{}',
      add column created_at timestamptz default now();
    alter table booking_api.events add column event_id uuid default gen_random_uuid(),add column occurred_at timestamptz default now();
    alter table public."Org_Master" add column "Org_Name" text;
    alter table public."Job_Header" add column if not exists "Job_EditableDetailsJSON" jsonb default '{}',
      add column if not exists "Job_CustomerNotes" text,add column if not exists "Job_TermsConditions" text,
      add column if not exists "Job_SubjectToTerms" text;
    create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$
      select $2 in ('Bookings.Read','Bookings.Write') and exists(select 1 from public."cmp_Users" where "Auth_User_ID"=$1 and "User_AccessStatus"='active')
    $$;
    create function booking_api.workspace_with_document_groups(uuid,text) returns jsonb language sql as $$
      select jsonb_build_object('booking',jsonb_build_object('bookingReference',$2))
    $$;
    ${sqlFunction(sync, 'booking_api.quote_sync_projection')}
    ${sqlFunction(sync, 'booking_api.current_quote_sync_projection')}
    ${sqlFunction(sync, 'booking_api.quote_sync_differences')}
    ${sqlFunction(read('20260904104500_quote_booking_sync_apply_preservation.sql'), 'public.booking_workflow_apply_quote_sync')}
    ${sqlFunction(read('20260901100000_booking_detail_editing.sql'), 'booking_api.save_booking_detail_fields')}
    ${sqlFunction(read('20260902153715_booking_multi_leg_routes_and_cargo_dimensions.sql'), 'booking_api.save_booking_cargo_measurements')}
    ${routing.slice(routing.indexOf('alter function booking_api.quote_sync_projection'), routing.indexOf('-- A first-time accepted'))}
    ${read('20260904134000_quote_routing_plan_labels_and_order.sql')}
    ${payer.slice(payer.indexOf('alter function booking_api.quote_sync_projection'), payer.indexOf('alter function booking_api.convert_accepted_quote'))}
    ${read('20260904152000_booking_quote_charge_apply_operational_permission.sql')}
    ${containers.slice(containers.indexOf('create or replace function booking_api.quote_container_rows'), containers.indexOf('alter function booking_api.convert_accepted_quote'))}
    alter function public.booking_workflow_apply_quote_sync(uuid,uuid,uuid,jsonb)
      rename to booking_workflow_apply_quote_sync_before_container_allocation_20260904;
    ${sqlFunction(containers,'public.booking_workflow_apply_quote_sync')}
    ${read('20260905132442_quote_cargo_review_integration.sql')}

    do $review_test$
    declare actor uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid();
      foreign_actor uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); v1 uuid:=gen_random_uuid(); v2 uuid:=gen_random_uuid();
      c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); review_id uuid:=gen_random_uuid(); job uuid; cargo_id uuid;
      snapshot jsonb; proposed jsonb; lines jsonb; review jsonb; result jsonb; original_booking jsonb; token text; keys jsonb;
      weight_key text; description_key text; before_events integer; before_signals integer; before_routes jsonb;
    begin
      insert into public."cmp_Users" values(actor,actor,company,'active'),(foreign_actor,foreign_actor,gen_random_uuid(),'active');
      insert into public."cmp_Offices" values(office,company);
      insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID","CusQuoteHeader_CreatedBy")
        values(q,office,'accepted',v1,actor);
      lines:=jsonb_build_array(jsonb_build_object('id',c1,'description','Machinery','grossWeightKg',100,'packageQuantity',2,'packageType','Crates'),
        jsonb_build_object('id',c2,'description','Spares','grossWeightKg',50,'packageQuantity',1,'packageType','Cartons'));
      snapshot:=jsonb_build_object('quote',jsonb_build_object('mode','Sea','direction','Export','customerNotes','Original note',
        'shipmentFacts',jsonb_build_object('cargoLines',lines,'goodsValue','6000','goodsValueCurrency','GBP')));
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
        values(v1,q,1,snapshot,true,'accepted');
      select "CusQuoteVersion_SnapshotJSON" into snapshot from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1;
      result:=booking_api.convert_accepted_quote_before_sync_review_20260904(q,actor,null);job:=(result->>'jobId')::uuid;
      insert into public."Org_Master" ("Org_id") select "Job_Customer" from public."Job_Header" where "Job_ID"=job;
      select "JobCargo_ID" into cargo_id from public."Job_Cargo" where "JobCargo_JobID"=job and "JobCargo_SourceQuoteLineID"=c1;
      weight_key:='cargo:'||c1||':grossWeightKg';description_key:='cargo:'||c1||':description';
      proposed:=jsonb_set(jsonb_set(jsonb_set(snapshot,'{quote,shipmentFacts,cargoLines,0,grossWeightKg}','125'),
        '{quote,shipmentFacts,cargoLines,0,description}','"Revised machinery"'),'{quote,customerNotes}','"Revised note"');
      proposed:=jsonb_set(proposed,'{quote,mode}','"Air"');
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
        values(v2,q,2,proposed,true,'accepted');
      original_booking:=booking_api.current_quote_sync_projection(job);
      insert into booking_api.quote_sync_reviews(review_id,company_id,job_id,quote_id,applied_version_id,proposed_version_id,baseline_snapshot,proposed_snapshot,booking_snapshot,differences)
        values(review_id,company,job,q,v1,v2,booking_api.quote_sync_projection(snapshot),booking_api.quote_sync_projection(proposed),original_booking,
          booking_api.quote_sync_differences(booking_api.quote_sync_projection(snapshot),original_booking,booking_api.quote_sync_projection(proposed)));
      update public."Job_Header" set "Job_PendingQuoteVersionID"=v2,"Job_QuoteSyncStatus"='out_of_sync' where "Job_ID"=job;
      review:=public.booking_workflow_quote_sync_review_v2(actor,job);token:=review->>'reviewToken';
      if review->>'quoteReference'<>'JQTEST' or (review->>'proposedVersionNumber')::int<>2 or (review->>'appliedVersionNumber')::int<>1
        or length(token)<>64 then raise exception 'Review labels/version/token missing'; end if;
      if public.booking_workflow_quote_sync_review_v2(actor,job)->>'reviewToken'<>token then raise exception 'Unchanged review token unstable'; end if;
      if jsonb_array_length(review->'differences')<>4 or review->'differences' @> '[{"key":"cargo"}]' then raise exception 'Structured cargo still uses flat replacement review'; end if;
      if public.booking_workflow_quote_sync_review_v2(foreign_actor,job) is not null then raise exception 'Foreign review leaked'; end if;
      begin perform public.booking_workflow_apply_quote_sync_v2(foreign_actor,job,review_id,jsonb_build_array(weight_key),token);raise exception 'Foreign apply allowed';exception when insufficient_privilege then null;end;
      begin perform public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,jsonb_build_array(weight_key,'mode'),token);raise exception 'Mode confirmation bypassed';exception when invalid_parameter_value then null;end;
      if (select "JobCargo_GrossKilos" from public."Job_Cargo" where "JobCargo_ID"=cargo_id)<>100 then raise exception 'Rejected mode change wrote cargo'; end if;
      begin perform public.booking_workflow_apply_quote_sync_confirmed(actor,job,review_id,jsonb_build_array(weight_key),false);raise exception 'Legacy path marked cargo applied';exception when invalid_parameter_value then null;end;
      update public."Job_Cargo" set "JobCargo_GrossKilos"=110 where "JobCargo_ID"=cargo_id;
      begin perform public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,jsonb_build_array(weight_key),token);raise exception 'Stale review accepted';exception when serialization_failure then null;end;
      review:=public.booking_workflow_quote_sync_review_v2(actor,job);token:=review->>'reviewToken';
      if not exists(select 1 from jsonb_array_elements(review->'differences') d where d->>'key'=weight_key and (d->>'conflict')::boolean and (d->>'bookingValue')::numeric=110) then raise exception 'Fresh operational conflict absent'; end if;
      -- A real legacy save failure after the cargo write must roll back all
      -- writes, review receipts, audits and deterministic watch signals.
      insert into public."AI_DexterWatches" values(company,'booking_cargo','active',cargo_id);
      select count(*) into before_events from booking_api.events;
      select count(*) into before_signals from public."AI_DexterWatchSignals";
      begin
        delete from public."Org_Master" where "Org_id"=(select "Job_Customer" from public."Job_Header" where "Job_ID"=job);
        perform public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,jsonb_build_array(weight_key,'customerNotes'),token);
        raise exception 'Invalid customer reached mixed completion';
      exception when invalid_parameter_value then null;end;
      if (select "JobCargo_GrossKilos" from public."Job_Cargo" where "JobCargo_ID"=cargo_id)<>110
        or (select count(*) from booking_api.events)<>before_events or (select count(*) from public."AI_DexterWatchSignals")<>before_signals
        or (select applied_fields from booking_api.quote_sync_reviews r where r.review_id=(review->>'reviewId')::uuid)<>'[]'::jsonb then raise exception 'Mixed failure was not atomic'; end if;
      result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,jsonb_build_array(weight_key,'customerNotes'),token);
      if result->>'status'<>'partially_applied' or (select "JobCargo_GrossKilos" from public."Job_Cargo" where "JobCargo_ID"=cargo_id)<>125
        or (select "Job_CustomerNotes" from public."Job_Header" where "Job_ID"=job)<>'Revised note'
        or (select "Job_SourceQuoteVersionID" from public."Job_Header" where "Job_ID"=job)<>v1 then raise exception 'Mixed partial application failed'; end if;
      update public."Job_Cargo" set "JobCargo_GrossKilos"=130 where "JobCargo_ID"=cargo_id;
      select count(*) into before_events from booking_api.events;
      result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,jsonb_build_array(weight_key,'customerNotes'),token);
      if not (result->>'reused')::boolean or (select "JobCargo_GrossKilos" from public."Job_Cargo" where "JobCargo_ID"=cargo_id)<>130
        or (select count(*) from booking_api.events)<>before_events then raise exception 'Mixed retry overwrote subsequent edit'; end if;
      review:=public.booking_workflow_quote_sync_review_v2(actor,job);token:=review->>'reviewToken';
      if jsonb_array_length(review->'differences')<>4 or jsonb_array_length(review->'appliedFields')<>2 then raise exception 'Partial review lost decision receipts'; end if;
      result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,jsonb_build_array(description_key,'mode'),token,true);
      if result->>'status'<>'applied' or (select "Job_TransportModeSummary" from public."Job_Header" where "Job_ID"=job)<>'air'
        or (select "Job_SourceQuoteVersionID" from public."Job_Header" where "Job_ID"=job)<>v2
        or (select "JobCargo_GrossKilos" from public."Job_Cargo" where "JobCargo_ID"=cargo_id)<>130
        or (select "JobCargo_Description" from public."Job_Cargo" where "JobCargo_ID"=cargo_id)<>'Revised machinery' then raise exception 'Final confirmed mixed application failed'; end if;
      if public.booking_workflow_quote_sync_review_v2(actor,job) is not null then raise exception 'Completed review still pending'; end if;
      if (select booking_snapshot from booking_api.quote_sync_reviews r where r.review_id=(result->>'reviewId')::uuid)<>original_booking
        or (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1)<>snapshot then raise exception 'Original evidence overwritten'; end if;
      if has_function_privilege('anon','public.booking_workflow_apply_quote_sync_v2(uuid,uuid,uuid,jsonb,text,boolean)','EXECUTE')
        or has_function_privilege('authenticated','public.booking_workflow_quote_sync_review_v2(uuid,uuid)','EXECUTE')
        or has_function_privilege('service_role','booking_api.refreshed_cargo_review(uuid)','EXECUTE') then raise exception 'Private boundary exposed'; end if;
      if not has_function_privilege('service_role','public.booking_workflow_apply_quote_sync_v2(uuid,uuid,uuid,jsonb,text,boolean)','EXECUTE') then raise exception 'Server apply unavailable'; end if;
    end $review_test$;
  `
}
