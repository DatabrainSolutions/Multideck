export function quoteDeliveryRecipientFixture(read) {
  return `
    ${read('20260906094835_quote_delivery_recipient_readiness.sql')}
    do $recipient_test$
    declare actor uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid();
      q uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); result jsonb; before_quote jsonb; before_version jsonb;
      facts jsonb:='{"collectionRequired":false,"deliveryRequired":false,"customsIncluded":false,"knownCargo":"QA goods","packageQuantity":2,"packageType":"Cartons","grossWeightKg":10}';
      bad text; links_before integer;
    begin
      insert into public."cmp_Users" values(actor,actor,company,'active');
      insert into public."cmp_Offices" values(office,company);
      insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_ShipmentFactsJSON","CusQuoteHeader_ContactEmailSnapshot") values(q,office,facts,null);
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_SnapshotJSON") values(v,q,jsonb_build_object('quote',jsonb_build_object('shipmentFacts',facts,'currency','GBP')));
      insert into public."CusQuote_Lines" values(q,true,100);
      if not (booking_api.quote_readiness(q)->>'ready')::boolean then raise exception 'Manual recipient is blocked by saved contact: %',booking_api.quote_readiness(q); end if;
      select to_jsonb(h) into before_quote from public."CusQuote_Header" h where "CusQuoteHeader_ID"=q;
      select to_jsonb(s) into before_version from public."CusQuote_Versions" s where "CusQuoteVersion_ID"=v;
      select count(*) into links_before from quote_api.customer_response_links;
      foreach bad in array array[null::text,'','invalid','multiple@example.test, other@example.test',E'qa@example.test\\nBcc: x@example.test'] loop
        begin
          perform public.quote_workflow_prepare_customer_response_v4(actor,q,'QA',bad,'manual','standard','https://dev.multideck.app',repeat('c',64),null);
          raise exception 'Invalid recipient created a link';
        exception when invalid_parameter_value then null; end;
      end loop;
      if (select count(*) from quote_api.customer_response_links)<>links_before then raise exception 'Invalid recipient left a link'; end if;
      result:=public.quote_workflow_prepare_customer_response_v4(actor,q,'QA','qa@example.test','manual','standard','https://dev.multideck.app',repeat('d',64),null);
      if result->>'recipientEmail'<>'qa@example.test' or not exists(select 1 from quote_api.customer_response_links where response_link_id=(result->>'responseLinkId')::uuid and recipient_source_code='manual' and status_code='revoked' and delivery_status_code='pending') then raise exception 'Manual recipient was not retained as pending delivery metadata'; end if;
      if (select to_jsonb(h) from public."CusQuote_Header" h where "CusQuoteHeader_ID"=q)<>before_quote
         or (select to_jsonb(s) from public."CusQuote_Versions" s where "CusQuoteVersion_ID"=v)<>before_version then raise exception 'Preparing manual delivery changed saved Quote/version'; end if;
      update public."CusQuote_Header" set "CusQuoteHeader_Incoterm"='' where "CusQuoteHeader_ID"=q;
      if (booking_api.quote_readiness(q)->>'ready')::boolean then raise exception 'Incoterm requirement bypassed'; end if;
      begin
        perform public.quote_workflow_prepare_customer_response_v4(actor,q,'QA','qa@example.test','manual','standard','https://dev.multideck.app',repeat('e',64),null);
        raise exception 'Valid recipient bypassed missing Incoterm';
      exception when invalid_parameter_value then null; end;
      update public."CusQuote_Header" set "CusQuoteHeader_Incoterm"='N/A' where "CusQuoteHeader_ID"=q;
      update public."CusQuote_Lines" set "CusQuoteLine_RevenueAmountLocal"=0 where "CusQuoteHeader_ID"=q;
      if not booking_api.quote_readiness(q)->'missing' ? 'At least one customer charge' then raise exception 'Commercial readiness bypassed'; end if;
      if has_function_privilege('anon','booking_api.readiness_before_goods_value_20260905(uuid)','EXECUTE')
         or has_function_privilege('authenticated','booking_api.readiness_before_goods_value_20260905(uuid)','EXECUTE') then raise exception 'Readiness helper exposed'; end if;
    end $recipient_test$;
  `
}
