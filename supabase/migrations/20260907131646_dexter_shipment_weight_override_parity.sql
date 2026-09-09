begin;
set local lock_timeout='5s';

-- Extend the existing shipment-level domain/signal projection. Weight is not
-- money, a derived cargo total, or the document's chargeable weight.
create or replace function booking_api.shipment_value_dexter_values(job public."Job_Header")
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('amount',job."Job_GoodsValueAmount"::text,'currency',job."Job_GoodsValueCurrencyCode",
    'chargeableWeightOverrideKg',job."Job_EditableDetailsJSON"->>'chargeableWeightKg');
$$;

create function public.multideck_dexter_action_update_booking_weight_override(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;job public."Job_Header";before_weight text;after_weight text;normalized jsonb;
begin
  select "Auth_User_ID" into actor from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and "User_AccessStatus"='active';
  if actor is null or not booking_api.has_permission(actor,'Bookings.Read') or not booking_api.has_permission(actor,'Bookings.Write') then
    raise exception 'You do not have permission to edit the shipment weight override.' using errcode='42501';end if;
  if jsonb_typeof(p_arguments) is distinct from 'object'
    or not (p_arguments ?& array['target_id','expected_updated_at','weightKg','reason'])
    or exists(select 1 from jsonb_object_keys(p_arguments) key where key not in ('target_id','expected_updated_at','weightKg','reason'))
    or jsonb_typeof(p_arguments->'weightKg') not in ('string','null')
    or nullif(btrim(p_arguments->>'reason'),'') is null then
    raise exception 'Provide the exact shipment override in kg, or explicit null to clear, with a reason.' using errcode='22023';end if;
  select j.* into job from public."Job_Header" j join public."cmp_Offices" office on office."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    where j."Job_ID"=nullif(p_arguments->>'target_id','')::uuid and office."Company_ID"=p_company_id and not j."Job_IsDeleted" for update of j;
  if not found then raise exception 'That shipment is outside this workspace.' using errcode='42501';end if;
  if nullif(p_arguments->>'expected_updated_at','') is null or job."Job_UpdatedAt" is distinct from (p_arguments->>'expected_updated_at')::timestamptz then
    raise exception 'The booking changed. Read it again and request fresh approval.' using errcode='40001';end if;
  normalized:=booking_api.normalise_cargo_numbers(jsonb_build_array(jsonb_build_object('chargeableWeightKg',p_arguments->'weightKg')))#>'{0,chargeableWeightKg}';
  before_weight:=job."Job_EditableDetailsJSON"->>'chargeableWeightKg';
  perform public.booking_workflow_save(actor,job."Job_ID",jsonb_build_object('editableDetails',jsonb_build_object('chargeableWeightKg',normalized)));
  select "Job_EditableDetailsJSON"->>'chargeableWeightKg' into after_weight from public."Job_Header" where "Job_ID"=job."Job_ID";
  if before_weight is distinct from after_weight then
    insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
      values(p_company_id,job."Job_ID",'dexter_weight_override_updated','Approved shipment weight override updated; cargo and documents unchanged.',
        jsonb_build_object('before',before_weight,'after',after_weight,'unit','kg','reason',btrim(p_arguments->>'reason')),p_user_id);
  end if;
  return jsonb_build_object('recordId',job."Job_ID",'before',before_weight,'after',after_weight,'unit','kg',
    'sourceUrl','/bookings/'||lower(job."Job_BookingReference"));
end $$;
revoke all on function public.multideck_dexter_action_update_booking_weight_override(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_action_update_booking_weight_override(uuid,uuid,jsonb) to service_role;

insert into public."sys_AIDexterActions"("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function",
  "AIDexterAction_ParametersJSON","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_AlwaysRequiresApproval")
values('update_booking_weight_override','booking_shipment_value','Review shipment weight override',
  'Always requires approval. Read the exact Booking timestamp and chargeableWeightOverrideKg first. Show before/after kg. Changes only the operator shipment override, never cargo weights, money, Quote or air waybill. No inferred billable calculation.',
  'multideck_dexter_action_update_booking_weight_override',
  '{"type":"object","properties":{"target_id":{"type":"string"},"expected_updated_at":{"type":"string"},"weightKg":{"type":["string","null"],"description":"Exact non-negative decimal kg, maximum 999999999999. Null clears the override; no allocation or AWB change."},"reason":{"type":"string"}},"required":["target_id","expected_updated_at","weightKg","reason"],"additionalProperties":false}',
  '["Bookings.Read","Bookings.Write"]','update_booking_weight_override',true);
update public."sys_AIDexterDataDomains" set "AIDexterDomain_Name"='Shipment values',
  "AIDexterDomain_Description"='Separate shipment goods amount/currency and operator chargeableWeightOverrideKg, as exact text. Null is unknown. Not freight charges, a cargo total/allocation, historical Quote value or AWB weight.'
  where "AIDexterDomain_Code"='booking_shipment_value';
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Name"='Shipment values',
  "AIDexterWatchCapability_Description"='Notify on a changed amount, currency or chargeableWeightOverrideKg for one exact Booking. No thresholds, recurring AI calls or automatic edits.',
  "AIDexterWatchCapability_FieldsJSON"="AIDexterWatchCapability_FieldsJSON"||'"chargeableWeightOverrideKg"'::jsonb
  where "AIDexterWatchCapability_Code"='booking_shipment_value';
do $$declare definition text;anchor text;
begin
  definition:=pg_get_functiondef('public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)'::regprocedure);
  anchor:='''update_booking_shipment_value''';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Review mandatory shipment action approval guard';end if;
  execute replace(definition,anchor,anchor||',''update_booking_weight_override''');
  definition:=pg_get_functiondef('public.multideck_dexter_domain_booking_shipment_value(uuid,text,integer)'::regprocedure);
  anchor:='''valueScope'',''shipment_goods''';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Review shipment domain scope';end if;
  definition:=replace(definition,anchor,'''valueScope'',''shipment_operational_values''');
  execute replace(definition,' · Shipment goods value',' · Shipment values');
end $$;
commit;
