-- Final customer confirmations must have the operational facts shown in review.
-- Drafts remain available while operators complete the Booking.
begin;
set local lock_timeout = '5s';

create function document_api.booking_confirmation_missing_fields(review jsonb)
returns text[] language plpgsql immutable set search_path = '' as $$
declare missing text[] := '{}'; line jsonb; position integer := 0;
begin
  if nullif(btrim(review#>>'{customer,name}'),'') is null then missing:=array_append(missing,'Customer name'); end if;
  if nullif(btrim(review#>>'{shipper,name}'),'') is null then missing:=array_append(missing,'Shipper name'); end if;
  if nullif(btrim(review#>>'{consignee,name}'),'') is null then missing:=array_append(missing,'Consignee name'); end if;
  if jsonb_array_length(coalesce(review->'cargo','[]'))=0 then missing:=array_append(missing,'Cargo details'); end if;
  for line in select value from jsonb_array_elements(coalesce(review->'cargo','[]')) loop
    position:=position+1;
    if nullif(btrim(line->>'description'),'') is null then missing:=array_append(missing,format('Cargo line %s: goods description',position)); end if;
    if coalesce((line->>'packages')::numeric,0)<=0 then missing:=array_append(missing,format('Cargo line %s: package count',position)); end if;
    if coalesce((line->>'grossWeightKg')::numeric,0)<=0 then missing:=array_append(missing,format('Cargo line %s: gross weight',position)); end if;
  end loop;
  if coalesce((review#>>'{scope,collection}')::boolean,false) and nullif(btrim(review#>>'{collection,address}'),'') is null then missing:=array_append(missing,'Collection address'); end if;
  if coalesce((review#>>'{scope,delivery}')::boolean,false) and nullif(btrim(review#>>'{delivery,address}'),'') is null then missing:=array_append(missing,'Delivery address'); end if;
  if coalesce((review#>>'{scope,mainTransport}')::boolean,false) then
    if jsonb_array_length(coalesce(nullif(review->'mainTransport','null'::jsonb),'[]'))=0 then missing:=array_append(missing,'Main transport route'); end if;
    position:=0;
    for line in select value from jsonb_array_elements(coalesce(nullif(review->'mainTransport','null'::jsonb),'[]')) loop
      position:=position+1;
      if nullif(btrim(line->>'origin'),'') is null then missing:=array_append(missing,format('Route %s: origin',position)); end if;
      if nullif(btrim(line->>'destination'),'') is null then missing:=array_append(missing,format('Route %s: destination',position)); end if;
    end loop;
  end if;
  return missing;
end $$;

alter function document_api.apply_booking_document_issue(uuid,uuid,text)
  rename to apply_booking_document_issue_before_readiness_20261001;

create function document_api.apply_booking_document_issue(
  caller_auth_user_id uuid, requested_render_job_id uuid, requested_issue_status text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb; missing text[];
begin
  -- The existing implementation verifies the active actor, permission, office,
  -- source review token, provisional status and the exact render-job ownership.
  snapshot:=document_api.apply_booking_document_issue_before_readiness_20261001(
    caller_auth_user_id,requested_render_job_id,requested_issue_status);
  if requested_issue_status='final' then
    missing:=document_api.booking_confirmation_missing_fields(snapshot->'bookingConfirmation');
    if cardinality(missing)>0 then
      raise exception 'Complete before approval: %.',array_to_string(missing,'; ') using errcode='22023';
    end if;
  end if;
  return snapshot;
end $$;

revoke all on function document_api.booking_confirmation_missing_fields(jsonb) from public,anon,authenticated;
revoke all on function document_api.apply_booking_document_issue_before_readiness_20261001(uuid,uuid,text) from public,anon,authenticated;
revoke all on function document_api.apply_booking_document_issue(uuid,uuid,text) from public,anon,authenticated;
grant execute on function document_api.booking_confirmation_missing_fields(jsonb) to service_role;
grant execute on function document_api.apply_booking_document_issue(uuid,uuid,text) to service_role;

-- Dexter exception: operational document sign-off is currently operator-only.
-- Chat may read stored document evidence and deterministic document watches
-- continue to observe completed renders; neither mode claims issuance authority.
commit;

