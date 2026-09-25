begin;

alter function public.multideck_dexter_domain_finance(uuid,text,integer)
  rename to _multideck_dexter_domain_finance_before_case_resolution;
revoke all on function public._multideck_dexter_domain_finance_before_case_resolution(uuid,text,integer) from public,anon,authenticated;
grant execute on function public._multideck_dexter_domain_finance_before_case_resolution(uuid,text,integer) to service_role;
create function public.multideck_dexter_domain_finance(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with records as (
    select value,coalesce((value->'evidence'->>'updatedAt')::timestamptz,'2000-01-01'::timestamptz) updated_at
      from jsonb_array_elements(public._multideck_dexter_domain_finance_before_case_resolution(p_company_id,p_search,p_take)) value
    union all
    select jsonb_build_object('recordId',r.id,'recordKind','charge_case_no_balance_resolution','status',r.status,
      'chargeId',r.charge_id,'queueRevision',r.queue_revision,'preparedReason',r.prepared_reason,
      'evidence',jsonb_build_object('sourceTable','FIN_ChargeCaseResolutions','sourceId',r.id,
        'legalEntityId',r.legal_entity_id,'updatedAt',coalesce(r.approved_at,r.prepared_at))),
      coalesce(r.approved_at,r.prepared_at)
    from public."FIN_ChargeCaseResolutions" r join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=r.legal_entity_id
    where entity."Company_ID"=p_company_id
      and (nullif(btrim(p_search),'') is null or concat_ws(' ',r.charge_id,r.status,r.prepared_reason) ilike '%'||btrim(p_search)||'%')
  ) select coalesce(jsonb_agg(value order by updated_at desc),'[]'::jsonb)
    from (select * from records order by updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) limited;
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_finance(uuid,text,integer) to service_role;

create function public._multideck_dexter_charge_case_resolution_watch()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_old jsonb; v_new jsonb;
begin
  v_old:=case when tg_op='INSERT' then null else jsonb_build_object('status',old.status,'queueRevision',old.queue_revision,'reviewId',old.id) end;
  v_new:=jsonb_build_object('status',new.status,'queueRevision',new.queue_revision,'reviewId',new.id);
  if v_old is not distinct from v_new then return new; end if;
  select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=new.legal_entity_id;
  if v_company is not null and exists(select 1 from public."AI_DexterWatches" w
    join public."cmp_Users" u on u."User_ID"=w."AIDexterWatch_OwnerUserID"
    where w."AIDexterWatch_CompanyID"=v_company and u."Company_ID"=v_company and u."User_AccessStatus"='active'
      and public._multideck_dexter_has_permission(u."User_ID",'Finance.Management.View')
      and w."AIDexterWatch_CapabilityCode"='finance' and w."AIDexterWatch_StatusCode"='active'
      and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=new.charge_id)) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
      values(v_company,'finance','FIN_ChargeCaseResolutions',new.charge_id,v_old,v_new);
  end if;
  return new;
end; $$;
revoke all on function public._multideck_dexter_charge_case_resolution_watch() from public,anon,authenticated;
create trigger charge_case_resolution_dexter_watch after insert or update on public."FIN_ChargeCaseResolutions"
  for each row execute function public._multideck_dexter_charge_case_resolution_watch();
update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_FieldsJSON"="AIDexterWatchCapability_FieldsJSON"||'["queueRevision"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt"=now() where "AIDexterWatchCapability_Code"='finance';

commit;
