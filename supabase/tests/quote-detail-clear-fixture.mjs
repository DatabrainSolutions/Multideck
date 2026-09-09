// Executes the current canonical review/apply chain installed by the parent.
// Acceptance is seeded; this is not a customer-link/email acceptance test.
export const quoteDetailClearAssertions = `
do $clear_test$
declare actor uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid();
  quote_id uuid; v1 uuid; v2 uuid; job uuid; review_id uuid; snapshot jsonb; proposed jsonb;
  baseline jsonb; current_values jsonb; result jsonb; review jsonb; item record; key text; blank jsonb;
begin
  insert into public."cmp_Users" values(actor,actor,company,'active');
  insert into public."cmp_Offices" values(office,company);
  for item in select * from (values
    ('shipmentType','shipmentType','{quote,shipmentType}'::text[]),
    ('customerNotes','customerNotes','{quote,customerNotes}'::text[]),
    ('terms','termsAndConditions','{quote,terms}'::text[]),
    ('subjectToTerms','subjectToTerms','{quote,shipmentFacts,subjectToTerms}'::text[])
  ) fields(field_name,detail_key,snapshot_path) loop
    for blank in select value from jsonb_array_elements('[null,"","   "]'::jsonb) loop
      quote_id:=gen_random_uuid();v1:=gen_random_uuid();v2:=gen_random_uuid();review_id:=gen_random_uuid();
      snapshot:=jsonb_build_object('quote',jsonb_build_object(
        'mode','Sea','direction','Export','shipmentType','FCL','customerNotes','Original note','terms','Original terms',
        'shipmentFacts',jsonb_build_object('subjectToTerms','Original condition','cargoLines',
          jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'description','Synthetic goods')))));
      insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID","CusQuoteHeader_CreatedBy")
        values(quote_id,office,'accepted',v1,actor);
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
        values(v1,quote_id,1,snapshot,true,'accepted');
      select "CusQuoteVersion_SnapshotJSON" into snapshot from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1;
      result:=booking_api.convert_accepted_quote_before_sync_review_20260904(quote_id,actor,null);job:=(result->>'jobId')::uuid;
      insert into public."Org_Master" ("Org_id") select "Job_Customer" from public."Job_Header" where "Job_ID"=job;
      update public."Job_Header" set "Job_CustomerNotes"='Original note',"Job_TermsConditions"='Original terms',
        "Job_SubjectToTerms"='Original condition',"Job_EditableDetailsJSON"=
        '{"shipmentType":"FCL","customerNotes":"Original note","termsAndConditions":"Original terms","subjectToTerms":"Original condition","ownerName":"Keep operator"}'
        where "Job_ID"=job;
      baseline:=booking_api.current_quote_sync_projection(job);
      proposed:=jsonb_set(snapshot,item.snapshot_path,blank);
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
        values(v2,quote_id,2,proposed,true,'accepted');
      insert into booking_api.quote_sync_reviews(review_id,company_id,job_id,quote_id,applied_version_id,proposed_version_id,baseline_snapshot,proposed_snapshot,booking_snapshot,differences)
        values(review_id,company,job,quote_id,v1,v2,booking_api.quote_sync_projection(snapshot),
          booking_api.quote_sync_projection(proposed),baseline,
          booking_api.quote_sync_differences(booking_api.quote_sync_projection(snapshot),baseline,booking_api.quote_sync_projection(proposed)));
      update public."Job_Header" set "Job_PendingQuoteVersionID"=v2,"Job_QuoteSyncStatus"='out_of_sync' where "Job_ID"=job;
      review:=public.booking_workflow_quote_sync_review_v2(actor,job);
      if not exists(select 1 from jsonb_array_elements(review->'differences') d where d->>'key'=item.field_name) then
        raise exception 'Clear missing from review: %',item.field_name;end if;
      result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,jsonb_build_array(item.field_name),review->>'reviewToken');
      current_values:=booking_api.current_quote_sync_projection(job);
      if current_values->>item.field_name is not null or
        (select "Job_EditableDetailsJSON"->>item.detail_key from public."Job_Header" where "Job_ID"=job) is not null then
        raise exception 'Explicit clear failed for % / %',item.field_name,blank;end if;
      foreach key in array array['shipmentType','customerNotes','terms','subjectToTerms'] loop
        if key<>item.field_name and current_values->key is distinct from baseline->key then
          raise exception 'Clearing % changed unselected %',item.field_name,key;end if;
      end loop;
      if (select "Job_EditableDetailsJSON"->>'ownerName' from public."Job_Header" where "Job_ID"=job)<>'Keep operator'
        or (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1)<>snapshot then
        raise exception 'Operator or submitted history changed';end if;
      if not exists(select 1 from booking_api.events where job_id=job and event_type in ('quote_update_applied','quote_update_partially_applied')
        and metadata->'before'->>item.field_name = baseline->>item.field_name
        and metadata->'after'->>item.field_name is null) then raise exception 'Clear audit missing';end if;
    end loop;
  end loop;
end;
$clear_test$;
`
