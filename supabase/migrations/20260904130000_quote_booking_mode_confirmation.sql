-- Keep mode changes visible and approval-safe when applying a newer accepted quote.

begin;

create or replace function booking_api.quote_sync_differences(
  baseline jsonb,
  booking jsonb,
  proposed jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with fields(order_no, field_key, label, section_name) as (values
    (1,'direction','Direction','Job data'), (2,'mode','Mode','Job data'),
    (3,'shipmentType','Shipment type','Service'), (4,'serviceLevel','Service level','Service'),
    (5,'carrier','Carrier','Carrier & supplier'), (6,'supplier','Supplier','Carrier & supplier'),
    (7,'origin','Origin','Route & service'), (8,'destination','Destination','Route & service'),
    (9,'collectionAddress','Collection address','Route & service'), (10,'deliveryAddress','Delivery address','Route & service'),
    (11,'incoterm','Incoterm','Route & service'), (12,'incotermLocation','Named place','Route & service'),
    (13,'estimatedDeparture','ETD','Route & service'), (14,'estimatedArrival','ETA','Route & service'),
    (15,'shipper','Shipper','Parties'), (16,'consignee','Consignee','Parties'),
    (17,'cargo','Goods','Goods'), (18,'equipment','Equipment / container','Goods'),
    (19,'customerNotes','Customer notes','Customer terms'), (20,'terms','Terms and conditions','Customer terms'),
    (21,'subjectToTerms','Subject to terms','Customer terms'), (22,'charges','Quote charges','Financials')
  ), comparison as (
    select
      order_no,
      field_key,
      label,
      section_name,
      (booking->field_key) is distinct from (baseline->field_key) as booking_changed,
      (booking->field_key) is distinct from (baseline->field_key)
        and (booking->field_key) is distinct from (proposed->field_key) as has_conflict
    from fields
    where (proposed->field_key) is distinct from (baseline->field_key)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', field_key,
    'label', label,
    'section', section_name,
    'previousQuoteValue', baseline->field_key,
    'bookingValue', booking->field_key,
    'newQuoteValue', proposed->field_key,
    'bookingChanged', booking_changed,
    'conflict', has_conflict,
    'requiresConfirmation', field_key='mode' or has_conflict,
    'warningCode', case
      when field_key='mode' then 'mode_change'
      when has_conflict then 'booking_changed'
      else null
    end,
    'recommendation', case when field_key='mode' or has_conflict then 'review' else 'apply' end
  ) order by order_no), '[]'::jsonb)
  from comparison
$$;

-- Bring any already-open review forward without changing its booking or decision state.
update booking_api.quote_sync_reviews review
set differences = (
  select coalesce(jsonb_agg(
    difference || jsonb_build_object(
      'requiresConfirmation', (difference->>'key'='mode') or coalesce((difference->>'conflict')::boolean,false),
      'warningCode', case
        when difference->>'key'='mode' then 'mode_change'
        when coalesce((difference->>'conflict')::boolean,false) then 'booking_changed'
        else null
      end,
      'recommendation', case
        when difference->>'key'='mode' or coalesce((difference->>'conflict')::boolean,false) then 'review'
        else 'apply'
      end
    ) order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(review.differences) with ordinality as item(difference, ordinality)
)
where review.status_code in ('pending','partially_applied');

create or replace function public.booking_workflow_apply_quote_sync_confirmed(
  caller_auth_user_id uuid,
  requested_job_id uuid,
  requested_review_id uuid,
  requested_fields jsonb,
  confirm_mode_change boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_fields ? 'mode' and not coalesce(confirm_mode_change,false) then
    raise exception 'Confirm the mode change before applying it to the booking.' using errcode='22023';
  end if;

  return public.booking_workflow_apply_quote_sync(
    caller_auth_user_id,
    requested_job_id,
    requested_review_id,
    requested_fields
  );
end;
$$;

revoke all on function booking_api.quote_sync_differences(jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.booking_workflow_apply_quote_sync(uuid,uuid,uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.booking_workflow_apply_quote_sync_confirmed(uuid,uuid,uuid,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.booking_workflow_apply_quote_sync_confirmed(uuid,uuid,uuid,jsonb,boolean) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Canonical freight bookings, including accepted-quote provenance, applied quote version and any operator-reviewable newer accepted quote. Applying a quote update is approval-only; mode changes always require explicit operator confirmation in Booking Details.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='bookings';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Freight booking summary status, route, delivery, ownership, risk, job-related Customs handoff and newer accepted quote review availability. Quote updates require operator approval and mode changes require explicit confirmation.',
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='bookings';

commit;
