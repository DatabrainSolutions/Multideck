-- Final member of the reviewed package. Apply only after all preceding charge
-- migrations pass the tenant compatibility and lifecycle release checks.
begin;
set local lock_timeout='5s';
create function public.booking_operational_charge_workspace(caller_auth_user_id uuid,requested_job_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select booking_api.operational_charge_workspace(caller_auth_user_id,requested_job_id)$$;
create function public.booking_operational_charges_save(caller_auth_user_id uuid,requested_job_id uuid,expected_updated_at timestamptz,requested_operations jsonb)
returns jsonb language sql security invoker set search_path='' as $$select booking_api.save_operational_charges(caller_auth_user_id,requested_job_id,expected_updated_at,requested_operations)$$;
create function public.booking_quote_charge_review(caller_auth_user_id uuid,requested_job_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select booking_api.quote_charge_review(caller_auth_user_id,requested_job_id)$$;
create function public.booking_quote_charge_review_apply(caller_auth_user_id uuid,requested_job_id uuid,requested_review_id uuid,expected_token text,requested_decisions jsonb,requested_reason text)
returns jsonb language sql security invoker set search_path='' as $$select booking_api.apply_quote_charge_review(caller_auth_user_id,requested_job_id,requested_review_id,expected_token,requested_decisions,requested_reason)$$;
revoke all on function public.booking_operational_charge_workspace(uuid,uuid),public.booking_operational_charges_save(uuid,uuid,timestamptz,jsonb),
 public.booking_quote_charge_review(uuid,uuid),public.booking_quote_charge_review_apply(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.booking_operational_charge_workspace(uuid,uuid),public.booking_operational_charges_save(uuid,uuid,timestamptz,jsonb),
 public.booking_quote_charge_review(uuid,uuid),public.booking_quote_charge_review_apply(uuid,uuid,uuid,text,jsonb,text),
 booking_api.operational_charge_workspace(uuid,uuid),booking_api.save_operational_charges(uuid,uuid,timestamptz,jsonb),
 booking_api.quote_charge_review(uuid,uuid),booking_api.apply_quote_charge_review(uuid,uuid,uuid,text,jsonb,text) to service_role;

do $$declare definition text; anchor text;begin
 definition:=pg_get_functiondef('public.booking_provisional_state(uuid,uuid)'::regprocedure);
 anchor:='''planningEditorSupported'',true';
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Booking capability contract changed.';end if;
 execute replace(definition,anchor,anchor||',''operationalEditorSupported'',true');
 -- Disable only the old bulk charge checkbox, retaining every other Quote field.
 definition:=pg_get_functiondef('booking_api.refreshed_cargo_review(uuid)'::regprocedure);
 anchor:='  token:=encode';
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Quote review token contract changed.';end if;
 execute replace(definition,anchor,$guard$
  select coalesce(jsonb_agg(case when d->>'key'='charges' then d||jsonb_build_object('blockedReason','Review individual Quote charge changes in the Booking Finance tab. Existing charges are preserved by default.') else d end order by d->>'key'),'[]')
  into differences from jsonb_array_elements(differences) d;
  token:=encode$guard$);

 definition:=pg_get_functiondef('booking_api.workspace_before_goods_value_20260905(uuid,text)'::regprocedure);
 anchor:=$anchor$'planningCurrency', case when charge."JobCostingLine_SourceTable"='booking_api.planning_charge_sets'$anchor$;
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Charge currency readback changed.';end if;
 execute replace(definition,anchor,$projection$'planningCurrency', case
  when charge."JobCostingLine_DomainCode"='freight' and charge."JobCostingLine_SourceMetadataJSON" ? 'bookingCharge' then jsonb_build_object(
   'cost',charge."JobCostingLine_SourceMetadataJSON"#>>'{bookingCharge,costCurrency}',
   'sell',charge."JobCostingLine_SourceMetadataJSON"#>>'{bookingCharge,sellCurrency}',
   'base',charge."JobCostingLine_SourceMetadataJSON"->>'baseCurrency')
  when charge."JobCostingLine_DomainCode"='freight' and charge."JobCostingLine_SourceMetadataJSON" ? 'quoteCharge' then jsonb_build_object(
   'cost',charge."JobCostingLine_SourceMetadataJSON"#>>'{quoteCharge,costCurrency}',
   'sell',charge."JobCostingLine_SourceMetadataJSON"#>>'{quoteCharge,sellCurrency}',
   'base',charge."JobCostingLine_SourceMetadataJSON"->>'baseCurrency')
  when charge."JobCostingLine_SourceTable"='booking_api.planning_charge_sets'$projection$);
end $$;

update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description"=coalesce("AIDexterDomain_Description",'')||
 ' Operational charge edits and individual Quote charge decisions require Booking Finance. Dexter must not perform them through generic Booking or Finance writes. Unknown historical source or currency values must not be inferred.'
 where "AIDexterDomain_Code" in ('bookings','booking_summary','finance');
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Description"=coalesce("AIDexterWatchCapability_Description",'')||
 ' Individual operational charge and Quote charge decision watches are unsupported; do not substitute a status or headline-value watch.'
 where "AIDexterWatchCapability_Code"='bookings';
commit;
