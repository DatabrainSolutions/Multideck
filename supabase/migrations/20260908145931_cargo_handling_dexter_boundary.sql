begin;
set local lock_timeout='5s';
-- Explicit, temporary parity exception: these supplied safety requirements
-- cannot be inferred or declared resolved through the existing single-field AI
-- actions. Keep those actions and watches limited to their existing schemas.
update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description"="AIDexterDomain_Description" || ' Per-line handling details and TBC resolution are not supported by this Dexter read adapter; direct the operator to Quote Goods or Booking Cargo. Do not infer readiness from the hazard/temperature flags.'
where "AIDexterDomain_Code" in ('quote_cargo','booking_cargo');
update public."sys_AIDexterActions"
set "AIDexterAction_Description"="AIDexterAction_Description" || ' Per-line handling details/TBC changes are unsupported by this action. Tell the operator to use the cargo handling editor; never claim TBC is resolved or remove safety flags to bypass readiness.'
where "AIDexterAction_Code" in ('update_quote_cargo','update_booking_cargo');
update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description"="AIDexterWatchCapability_Description" || ' Watching per-line handling details or TBC resolution is currently unsupported. Explain this limitation; do not substitute a hazard/temperature flag watch for a readiness watch.'
where "AIDexterWatchCapability_Code" in ('quote_cargo','booking_cargo');

-- TBC written in a supplied notes field remains unresolved as well.
do $migration$
declare definition text:=pg_get_functiondef('quote_api.cargo_handling_missing(jsonb,boolean)'::regprocedure);
  anchor text:='    if absent then result:=array_append(result,kind); end if;';
begin
  if position(anchor in definition)=0 then raise exception 'Review handling validation before adding notes checks.'; end if;
  execute replace(definition,anchor,$patch$
    absent:=absent or exists(select 1 from jsonb_each_text(d) field where field.value ~* '\mTBC\M');
$patch$||anchor);
end $migration$;
commit;
