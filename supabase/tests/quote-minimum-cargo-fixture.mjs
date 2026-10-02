export const quoteMinimumCargoAssertions = `
do $$declare line jsonb; mode_code text; result jsonb; facts jsonb; q uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); begin
  line:=jsonb_build_object('id',gen_random_uuid(),'packageQuantity','10','packageType','Pallets',
    'length','100','width','120','height','95','lengthUnit','cm');
  foreach mode_code in array array['Air','Courier','Sea','Ocean','Road','Rail'] loop
    if cardinality(quote_api.cargo_issue_missing(jsonb_build_array(line),mode_code,'Loose'))<>0 then
      raise exception 'Package dimensions without goods/weight rejected for %',mode_code;
    end if;
  end loop;
  result:=quote_api.normalise_cargo_lines(jsonb_build_array(line),true);
  if result#>>'{0,description}' is not null or result#>>'{0,commodity}' is not null
    or result#>>'{0,grossWeightKg}' is not null then raise exception 'Unknown goods data fabricated'; end if;
  if result#>>'{0,packageQuantity}'<>'10' or result#>>'{0,length}'<>'100' then raise exception 'Packing specification lost'; end if;
  if cardinality(quote_api.cargo_issue_missing('[]','Sea','FCL'))<>0
    or quote_api.normalise_cargo_lines('[]',true)<>'[]'::jsonb then raise exception 'Container quote requires goods lines'; end if;
  if cardinality(quote_api.cargo_issue_missing(jsonb_build_array(line-'height'),'Road','Loose'))<>1 then raise exception 'Partial dimensions accepted'; end if;
  if cardinality(quote_api.cargo_issue_missing(jsonb_build_array(line||'{"packageQuantity":0}'),'Air','AIR'))<>1 then raise exception 'Zero quantity accepted'; end if;
  if cardinality(quote_api.cargo_issue_missing(jsonb_build_array(line-'packageType'),'Air','AIR'))<>1 then raise exception 'Missing package type accepted'; end if;
  if cardinality(quote_api.cargo_issue_missing(jsonb_build_array(line-'length'-'width'-'height'),'Air','AIR'))<>1 then raise exception 'Unpriced loose cargo accepted'; end if;
  if cardinality(quote_api.cargo_issue_missing(jsonb_build_array((line-'length'-'width'-'height')||'{"grossWeightKg":100}'),'Air','AIR'))<>0 then raise exception 'Known weight fallback lost'; end if;
  if cardinality(quote_api.cargo_issue_missing('[]','Road','Loose'))=0 then raise exception 'Empty loose cargo accepted'; end if;
  if cardinality(quote_api.cargo_issue_missing(jsonb_build_array(line||'{"length":"NaN"}'),'Road','Loose'))=0 then raise exception 'Malformed dimension accepted'; end if;
  if cardinality(quote_api.cargo_issue_missing(jsonb_build_array(line||'{"packageQuantity":1.5}'),'Road','Loose'))=0 then raise exception 'Fractional package count accepted'; end if;
  if cardinality(quote_api.cargo_issue_missing(jsonb_build_array(line||'{"id":"invalid"}'),'Road','Loose'))=0 then raise exception 'Invalid cargo ID accepted'; end if;
  facts:=jsonb_build_object('collectionRequired',false,'deliveryRequired',false,'customsIncluded',false,'cargoLines',jsonb_build_array(line));
  insert into public."CusQuote_Header"("CusQuoteHeader_ID","CusQuoteHeader_ShipmentFactsJSON") values(q,facts);
  insert into public."CusQuote_Versions"("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_SnapshotJSON") values(v,q,jsonb_build_object('quote',jsonb_build_object('shipmentFacts',facts,'currency','GBP')));
  insert into public."CusQuote_Lines" values(q,true,100);
  result:=booking_api.quote_readiness(q);
  if not (result->>'ready')::boolean then raise exception 'Minimum pallet quote blocked by final readiness: %',result;end if;
  facts:=facts||jsonb_build_object('cargoLines','[]'::jsonb,'container','1 x 20'' GP');
  update public."CusQuote_Header" set "CusQuoteHeader_ModeCode"='Sea',"CusQuoteHeader_ShipmentTypeCode"='FCL',"CusQuoteHeader_ShipmentFactsJSON"=facts where "CusQuoteHeader_ID"=q;
  update public."CusQuote_Versions" set "CusQuoteVersion_SnapshotJSON"=jsonb_build_object('quote',jsonb_build_object('shipmentFacts',facts,'currency','GBP')) where "CusQuoteVersion_ID"=v;
  result:=booking_api.quote_readiness(q);
  if not (result->>'ready')::boolean then raise exception 'Minimum container quote blocked by final readiness: %',result;end if;
end $$;
`
