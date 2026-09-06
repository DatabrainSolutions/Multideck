export function bookingShipmentValueFixture(read) {
  return `
    -- Keep the broad workspace intentionally small; the new wrapper itself
    -- still executes its real active-user, office/company and read checks.
    create or replace function booking_api.workspace(uuid,text) returns jsonb language sql as $$
      select jsonb_build_object('booking',jsonb_build_object('jobId',"Job_ID")) from public."Job_Header"
      where "Job_BookingReference"=$2 or "Job_ID"::text=$2
    $$;
    ${read('20260905151617_booking_shipment_goods_value.sql')}
    do $goods_value_test$
    declare actor uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid(); foreign_actor uuid:=gen_random_uuid();
      q uuid:=gen_random_uuid(); v1 uuid:=gen_random_uuid(); v2 uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid();
      job uuid; review_id uuid:=gen_random_uuid(); snapshot jsonb; proposed jsonb; result jsonb; review jsonb; token text;
      before_cargo jsonb; before_events integer; current_projection jsonb; bad jsonb;
    begin
      if exists(select 1 from public."Job_Header" where "Job_GoodsValueAmount" is not null) then raise exception 'Upgrade inferred existing totals';end if;
      if booking_api.normalise_shipment_value('{"amount":"60,000.1250","currency":"gbp"}')<> '{"amount":60000.125,"currency":"GBP"}'::jsonb then raise exception 'Exact money normalisation failed';end if;
      for bad in select value from jsonb_array_elements('[{"amount":true,"currency":"GBP"},{"amount":"-1","currency":"GBP"},{"amount":"10,00","currency":"GBP"},{"amount":"1.00001","currency":"GBP"},{"amount":"100000000000000","currency":"GBP"},{"amount":1},{"amount":1,"currency":"GBPX"},{"amount":1,"currency":"GBP","extra":1}]') loop
        begin perform booking_api.normalise_shipment_value(bad);raise exception 'Invalid money accepted: %',bad;exception when invalid_parameter_value then null;end;
      end loop;
      insert into public."cmp_Users" values(actor,actor,company,'active'),(foreign_actor,foreign_actor,gen_random_uuid(),'active');
      insert into public."cmp_Offices" values(office,company);
      insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID","CusQuoteHeader_CreatedBy")
        values(q,office,'accepted',v1,actor);
      snapshot:=jsonb_build_object('quote',jsonb_build_object('mode','Sea','direction','Export','shipmentFacts',jsonb_build_object(
        'goodsValue','6000.1250','goodsValueCurrency','GBP','cargoLines',jsonb_build_array(
          jsonb_build_object('id',c1,'description','Machinery','grossWeightKg',100),jsonb_build_object('id',c2,'description','Spares','grossWeightKg',50)))));
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
        values(v1,q,1,snapshot,true,'accepted');
      select "CusQuoteVersion_SnapshotJSON" into snapshot from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1;
      result:=booking_api.convert_accepted_quote_before_sync_review_20260904(q,actor,null);job:=(result->>'jobId')::uuid;
      insert into public."Org_Master"("Org_id") select "Job_Customer" from public."Job_Header" where "Job_ID"=job;
      if (select "Job_GoodsValueAmount" from public."Job_Header" where "Job_ID"=job)<>6000.125 then raise exception 'Initial shipment total absent';end if;
      if exists(select 1 from public."Job_Cargo" where "JobCargo_JobID"=job and "JobCargo_DeclaredValueAmount" is not null) then raise exception 'Multi-line value was allocated';end if;
      result:=booking_api.workspace(actor,job::text);
      if result#>>'{booking,shipmentGoodsValue,amount}'<>'6000.1250' then raise exception 'Exact string amount absent from read';end if;
      begin perform booking_api.workspace(foreign_actor,job::text);raise exception 'Foreign shipment value read';exception when insufficient_privilege then null;end;
      begin perform booking_api.save_booking(foreign_actor,job,'{"shipmentGoodsValue":{"amount":10,"currency":"GBP"}}');raise exception 'Foreign shipment value write';exception when insufficient_privilege then null;end;
      -- Preserve independently entered allocations in different currencies.
      update public."Job_Cargo" set "JobCargo_DeclaredValueAmount"=200,"JobCargo_DeclaredValueCurrencyCodeSnapshot"='EUR' where "JobCargo_JobID"=job;
      select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") into before_cargo from public."Job_Cargo" c where "JobCargo_JobID"=job;
      perform booking_api.save_booking(actor,job,'{"shipmentGoodsValue":{"amount":"6500.0001","currency":"GBP"}}');
      select count(*) into before_events from booking_api.events;
      begin perform booking_api.save_booking(actor,job,'{"internalNotes":"must roll back","shipmentGoodsValue":{"amount":"oops","currency":"GBP"}}');raise exception 'Invalid value saved';exception when invalid_parameter_value then null;end;
      if (select count(*) from booking_api.events)<>before_events or (select "Job_InternalNotes" from public."Job_Header" where "Job_ID"=job)='must roll back' then raise exception 'Invalid value save was not atomic';end if;
      perform booking_api.save_booking(actor,job,'{}');
      if (select "Job_GoodsValueAmount" from public."Job_Header" where "Job_ID"=job)<>6500.0001 then raise exception 'Omitted shipment value cleared';end if;
      proposed:=jsonb_set(snapshot,'{quote,shipmentFacts,goodsValue}','"7000.5555"');
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
        values(v2,q,2,proposed,true,'accepted');
      current_projection:=booking_api.current_quote_sync_projection(job);
      insert into booking_api.quote_sync_reviews(review_id,company_id,job_id,quote_id,applied_version_id,proposed_version_id,baseline_snapshot,proposed_snapshot,booking_snapshot,differences)
        values(review_id,company,job,q,v1,v2,booking_api.quote_sync_projection(snapshot),booking_api.quote_sync_projection(proposed),current_projection,
          booking_api.quote_sync_differences(booking_api.quote_sync_projection(snapshot),current_projection,booking_api.quote_sync_projection(proposed)));
      update public."Job_Header" set "Job_PendingQuoteVersionID"=v2 where "Job_ID"=job;
      review:=public.booking_workflow_quote_sync_review_v2(actor,job);token:=review->>'reviewToken';
      if jsonb_array_length(review->'differences')<>1 or review#>>'{differences,0,key}'<>'shipmentGoodsValue' or not (review#>>'{differences,0,conflict}')::boolean
        or review#>>'{differences,0,reviewNote}' is null or review#>>'{differences,0,blockedReason}' is not null then raise exception 'Shipment total lacks selectable independent review';end if;
      perform booking_api.save_booking(actor,job,'{"shipmentGoodsValue":{"amount":"6600","currency":"GBP"}}');
      begin perform public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["shipmentGoodsValue"]',token);raise exception 'Stale value review accepted';exception when serialization_failure then null;end;
      review:=public.booking_workflow_quote_sync_review_v2(actor,job);
      result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["shipmentGoodsValue"]',review->>'reviewToken');
      if result->>'status'<>'applied' or (select "Job_GoodsValueAmount" from public."Job_Header" where "Job_ID"=job)<>7000.5555 then raise exception 'Shipment value Apply failed';end if;
      if (select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") from public."Job_Cargo" c where "JobCargo_JobID"=job)<>before_cargo then raise exception 'Shipment value redistributed cargo';end if;
      perform booking_api.save_booking(actor,job,'{"shipmentGoodsValue":{"amount":0,"currency":"GBP"}}');
      result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["shipmentGoodsValue"]',review->>'reviewToken');
      if not (result->>'reused')::boolean or (select "Job_GoodsValueAmount" from public."Job_Header" where "Job_ID"=job)<>0 then raise exception 'Retry overwrote operational value';end if;
      perform booking_api.save_booking(actor,job,'{"shipmentGoodsValue":{"amount":null,"currency":null}}');
      if (select "Job_GoodsValueAmount" from public."Job_Header" where "Job_ID"=job) is not null then raise exception 'Explicit clear failed';end if;
      if (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1)<>snapshot then raise exception 'Historical Quote changed';end if;
      if booking_api.quote_shipment_value(jsonb_set(snapshot,'{quote,shipmentFacts,goodsValue}','"malformed"'))->>'invalidReason' is null then raise exception 'Bad historical money hidden';end if;
      result:=booking_api.quote_sync_differences(booking_api.quote_sync_projection(snapshot),booking_api.current_quote_sync_projection(job),
        booking_api.quote_sync_projection(jsonb_set(snapshot,'{quote,shipmentFacts,goodsValue}','"malformed"')));
      if not exists(select 1 from jsonb_array_elements(result) d where d->>'key'='shipmentGoodsValue' and d->>'blockedReason' is not null) then raise exception 'Invalid proposed value is selectable';end if;
      update public."CusQuote_Header" set "CusQuoteHeader_ShipmentFactsJSON"=jsonb_set(proposed#>'{quote,shipmentFacts}','{goodsValue}','"bad"') where "CusQuoteHeader_ID"=q;
      result:=booking_api.quote_readiness(q);
      if (result->>'ready')::boolean or not exists(select 1 from jsonb_array_elements_text(result->'missing') item where item like 'Shipment goods value:%') then raise exception 'Issue readiness misses invalid money';end if;
      update public."CusQuote_Header" set "CusQuoteHeader_ShipmentFactsJSON"=jsonb_set(proposed#>'{quote,shipmentFacts}','{goodsValue}','"7001"') where "CusQuoteHeader_ID"=q;
      if not booking_api.quote_readiness(q)->'missing' ? 'Save the current shipment goods value before sending' then raise exception 'Unsaved shipment value can issue';end if;
      update public."CusQuote_Header" set "CusQuoteHeader_ShipmentFactsJSON"=proposed#>'{quote,shipmentFacts}' where "CusQuoteHeader_ID"=q;
      if booking_api.quote_readiness(q)->'missing' ? 'Save the current shipment goods value before sending' then raise exception 'Matching shipment value falsely stale';end if;
      if has_function_privilege('authenticated','booking_api.save_booking(uuid,uuid,jsonb)','execute') or has_function_privilege('anon','booking_api.workspace(uuid,text)','execute')
        or has_function_privilege('service_role','booking_api.save_before_goods_value_20260905(uuid,uuid,jsonb)','execute') then raise exception 'Shipment value internal boundary exposed';end if;
    end;
    $goods_value_test$;
    do $legacy_value_test$
    declare actor uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid();
      q uuid:=gen_random_uuid(); v1 uuid:=gen_random_uuid(); v2 uuid:=gen_random_uuid(); job uuid; review_id uuid:=gen_random_uuid();
      snapshot jsonb; proposed jsonb; result jsonb; review jsonb; current_projection jsonb;
    begin
      insert into public."cmp_Users" values(actor,actor,company,'active');insert into public."cmp_Offices" values(office,company);
      insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID","CusQuoteHeader_CreatedBy") values(q,office,'accepted',v1,actor);
      snapshot:='{"quote":{"mode":"Air","direction":"Export","shipmentFacts":{"goodsValue":"1000","goodsValueCurrency":"GBP","knownCargo":"Original goods","packageQuantity":2,"packageType":"Crates","grossWeightKg":100}}}';
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode") values(v1,q,1,snapshot,true,'accepted');
      result:=booking_api.convert_accepted_quote_before_sync_review_20260904(q,actor,null);job:=(result->>'jobId')::uuid;
      insert into public."Org_Master"("Org_id") select "Job_Customer" from public."Job_Header" where "Job_ID"=job;
      update public."Job_Cargo" set "JobCargo_DeclaredValueAmount"=250,"JobCargo_DeclaredValueCurrencyCodeSnapshot"='EUR' where "JobCargo_JobID"=job;
      proposed:=jsonb_set(jsonb_set(snapshot,'{quote,shipmentFacts,grossWeightKg}','125'),'{quote,shipmentFacts,goodsValue}','"2000"');
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode") values(v2,q,2,proposed,true,'accepted');
      current_projection:=booking_api.current_quote_sync_projection(job);
      insert into booking_api.quote_sync_reviews(review_id,company_id,job_id,quote_id,applied_version_id,proposed_version_id,baseline_snapshot,proposed_snapshot,booking_snapshot,differences)
        values(review_id,company,job,q,v1,v2,booking_api.quote_sync_projection(snapshot),booking_api.quote_sync_projection(proposed),current_projection,
          booking_api.quote_sync_differences(booking_api.quote_sync_projection(snapshot),current_projection,booking_api.quote_sync_projection(proposed)));
      update public."Job_Header" set "Job_PendingQuoteVersionID"=v2 where "Job_ID"=job;
      review:=public.booking_workflow_quote_sync_review_v2(actor,job);
      result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["cargo"]',review->>'reviewToken');
      if result->>'status'<>'partially_applied' or (select "Job_GoodsValueAmount" from public."Job_Header" where "Job_ID"=job)<>1000 then raise exception 'Legacy cargo Apply implicitly accepted shipment value';end if;
      if not exists(select 1 from public."Job_Cargo" where "JobCargo_JobID"=job and not "JobCargo_IsDeleted" and "JobCargo_GrossKilos"=125 and "JobCargo_DeclaredValueAmount"=250 and "JobCargo_DeclaredValueCurrencyCodeSnapshot"='EUR') then raise exception 'Legacy cargo Apply lost operational allocation';end if;
      review:=public.booking_workflow_quote_sync_review_v2(actor,job);
      result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["shipmentGoodsValue"]',review->>'reviewToken');
      if result->>'status'<>'applied' or (select "Job_GoodsValueAmount" from public."Job_Header" where "Job_ID"=job)<>2000 then raise exception 'Legacy separate shipment Apply failed';end if;
    end;
    $legacy_value_test$;
    do $value_send_test$
    declare actor uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid();
      q uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); facts jsonb; result jsonb;
    begin
      insert into public."cmp_Users" values(actor,actor,company,'active');insert into public."cmp_Offices" values(office,company);
      facts:='{"collectionRequired":false,"deliveryRequired":false,"customsIncluded":false,"knownCargo":"Goods","packageQuantity":2,"packageType":"Crates","grossWeightKg":100,"goodsValue":"1000.1250","goodsValueCurrency":"GBP"}';
      insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_ShipmentFactsJSON") values(q,office,facts);
      insert into public."CusQuote_Lines" values(q,true,100);
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_SnapshotJSON") values(v,q,jsonb_build_object('quote',jsonb_build_object('shipmentFacts',facts)));
      update public."CusQuote_Header" set "CusQuoteHeader_ShipmentFactsJSON"=jsonb_set(facts,'{goodsValue}','"1001"') where "CusQuoteHeader_ID"=q;
      begin
        perform public.quote_workflow_prepare_customer_response_v4(actor,q,'Customer','customer@example.test','saved','standard','http://localhost:3000',repeat('c',64),null);
        raise exception 'Unsaved value reached issue preparation';
      exception when invalid_parameter_value then null;end;
      if exists(select 1 from quote_api.customer_response_links where quote_id=q) then raise exception 'Unsaved value created response link';end if;
      update public."CusQuote_Header" set "CusQuoteHeader_ShipmentFactsJSON"=facts where "CusQuoteHeader_ID"=q;
      result:=public.quote_workflow_prepare_customer_response_v4(actor,q,'Customer','customer@example.test','saved','standard','http://localhost:3000',repeat('c',64),null);
      if (result->>'quoteVersionId')::uuid<>v or (select count(*) from quote_api.customer_response_links where quote_id=q)<>1 then raise exception 'Saved value cannot prepare version-bound issue';end if;
    end;
    $value_send_test$;
  `
}
