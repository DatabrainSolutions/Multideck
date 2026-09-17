begin;

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_FieldsJSON" = (
    select jsonb_agg(distinct value) from jsonb_array_elements(
      coalesce("AIDexterWatchCapability_FieldsJSON", '[]'::jsonb) || '["calculationEvent"]'::jsonb)
  ), "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'customs_declarations';

create function public._multideck_dexter_customs_calculation_watch_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare declaration public."Customs_Declarations"; company_id uuid; previous_id uuid;
begin
  select * into declaration from public."Customs_Declarations" where "CUST_id" = new.declaration_id;
  if not found or declaration."CUST_IsDeleted" then return new; end if;
  if declaration."CUST_JobID" is not null then
    select office."Company_ID" into company_id from public."Job_Header" job
      join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
      where job."Job_ID" = declaration."CUST_JobID";
  else
    select actor."Company_ID" into company_id from public."cmp_Users" actor
      where actor."Auth_User_ID" = declaration."CUST_CreatedBy" order by actor."User_ID" limit 1;
  end if;
  if company_id is null then return new; end if;
  perform public._multideck_dexter_pause_unauthorised_customs_watches(company_id, new.declaration_id);
  if not exists(select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = company_id
      and watch."AIDexterWatch_CapabilityCode" = 'customs_declarations'
      and watch."AIDexterWatch_TargetID" = new.declaration_id
      and watch."AIDexterWatch_StatusCode" = 'active') then return new; end if;
  select id into previous_id from public."Customs_CalculationAudit"
    where declaration_id = new.declaration_id and id <> new.id
    order by created_at desc, id desc limit 1;
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
  ) values (company_id, 'customs_declarations', 'Customs_CalculationAudit', new.declaration_id,
    jsonb_build_object('calculationEvent', previous_id),
    jsonb_build_object('calculationEvent', new.id, 'calculationKind', new.kind,
      'sourceType', case when declaration."CUST_JobID" is null then 'standalone' else 'job_related' end,
      'direction', 'import', 'reference', new.declaration_id, 'updatedAt', new.created_at));
  return new;
end;
$$;
revoke all on function public._multideck_dexter_customs_calculation_watch_change() from public, anon, authenticated;
create trigger customs_calculation_watch_event after insert on public."Customs_CalculationAudit"
  for each row execute function public._multideck_dexter_customs_calculation_watch_change();

-- Every new audit event matters, even if the previous event also matched.
-- Preserve other capabilities and fail migration if the evaluator has drifted.
do $patch$
declare definition text; marker text := 'if v_matches and (';
begin
  definition := pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  if (length(definition)-length(replace(definition, marker, '')))/length(marker) <> 1 then
    raise exception 'Review calculation watch repeat handling before applying';
  end if;
  definition := replace(definition, marker, marker || $repeat$
    (watch."AIDexterWatch_CapabilityCode" = 'customs_declarations'
      and watch."AIDexterWatch_RuleJSON"->>'field' = 'calculationEvent'
      and watch."AIDexterWatch_RuleJSON"->>'operator' = 'changed') or $repeat$);
  marker := 'and watch_row."AIDexterWatch_StatusCode" = ''active''';
  if (length(definition)-length(replace(definition, marker, '')))/length(marker) <> 1 then
    raise exception 'Review calculation watch access handling before applying';
  end if;
  definition := replace(definition, marker, marker || $access$
    and (new."AIDexterWatchSignal_SourceTable" <> 'Customs_CalculationAudit' or (
      watch_row."AIDexterWatch_TargetID" = new."AIDexterWatchSignal_SourceID"
      and exists (select 1 from public."cmp_Users" actor
        where actor."User_ID" = watch_row."AIDexterWatch_OwnerUserID"
          and actor."Company_ID" = watch_row."AIDexterWatch_CompanyID"
          and actor."User_AccessStatus" = 'active'
          and booking_api.customs_access(actor."Auth_User_ID", new."AIDexterWatchSignal_SourceID", false))
    ))$access$);
  marker := 'if watch."AIDexterWatch_CapabilityCode" = ''email'' then';
  if (length(definition)-length(replace(definition, marker, '')))/length(marker) <> 1 then
    raise exception 'Review calculation watch notification wording before applying';
  end if;
  definition := replace(definition, marker, $wording$
    if watch."AIDexterWatch_CapabilityCode" = 'customs_declarations'
      and v_field = 'calculationEvent' then
      v_event_body := coalesce(watch."AIDexterWatch_TargetLabel", 'Your declaration') || ': ' ||
        case when new."AIDexterWatchSignal_NewJSON"->>'calculationKind' = 'override'
          then 'a duty or VAT estimate override was recorded.'
          else 'a new duty and VAT calculation was recorded.' end;
      v_changed := jsonb_build_object('field', v_field,
        'sourceId', new."AIDexterWatchSignal_SourceID", 'calculationId', v_new);
    elsif watch."AIDexterWatch_CapabilityCode" = 'email' then $wording$);
  execute definition;
end $patch$;

commit;
