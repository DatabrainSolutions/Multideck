begin;

alter function public.multideck_dexter_domain_finance(uuid,text,integer)
  rename to _multideck_dexter_domain_finance_before_charge_lifecycle;
revoke all on function public._multideck_dexter_domain_finance_before_charge_lifecycle(uuid,text,integer) from public,anon,authenticated;
grant execute on function public._multideck_dexter_domain_finance_before_charge_lifecycle(uuid,text,integer) to service_role;

create function public.multideck_dexter_domain_finance(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with records as (
    select value,coalesce((value->'evidence'->>'updatedAt')::timestamptz,'2000-01-01'::timestamptz) updated_at
      from jsonb_array_elements(public._multideck_dexter_domain_finance_before_charge_lifecycle(p_company_id,p_search,p_take)) value
    union all
    select jsonb_build_object('recordId',q.charge_id,'recordKind','charge_lifecycle_case','status',q.status,
      'sourceRevision',q.source_revision,'eventTypes',q.event_types,'amountLocal',q.amount_local,
      'reason',q.reason,'nextAction',q.next_action,
      'evidence',jsonb_build_object('sourceTable','FIN_ChargeLifecycleQueue','sourceId',q.charge_id,
        'legalEntityId',q.legal_entity_id,'updatedAt',q.last_queued_at)),q.last_queued_at
      from public."FIN_ChargeLifecycleQueue" q join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=q.legal_entity_id
      where entity."Company_ID"=p_company_id and q.status<>'settled'
        and (nullif(btrim(p_search),'') is null or concat_ws(' ',q.charge_id,q.status,q.reason,q.next_action) ilike '%'||btrim(p_search)||'%')
    union all
    select jsonb_build_object('recordId',c.id,'recordKind','charge_correction','status',c.status,
      'chargeId',c.charge_id,'kind',c.kind,'targetBalance',c.target_balance,'delta',c.delta,
      'periodId',c.period_id,'preparedAt',c.prepared_at,'approvedAt',c.approved_at,'postingBatchId',c.posting_batch_id,
      'evidence',jsonb_build_object('sourceTable','FIN_ChargeCorrections','sourceId',c.id,
        'legalEntityId',c.legal_entity_id,'updatedAt',coalesce(c.approved_at,c.prepared_at))),coalesce(c.approved_at,c.prepared_at)
      from public."FIN_ChargeCorrections" c join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=c.legal_entity_id
      where entity."Company_ID"=p_company_id
        and (nullif(btrim(p_search),'') is null or concat_ws(' ',c.charge_id,c.kind,c.status,c.prepared_reason) ilike '%'||btrim(p_search)||'%')
    union all
    select jsonb_build_object('recordId',m.id,'recordKind','recognition_mandate','status',m.status,
      'costEnabled',m.cost_enabled,'revenueEnabled',m.revenue_enabled,'effectiveDate',m.effective_date,
      'evidence',jsonb_build_object('sourceTable','FIN_RecognitionMandates','sourceId',m.id,
        'legalEntityId',m.legal_entity_id,'updatedAt',coalesce(m.paused_at,m.approved_at,m.prepared_at))),
      coalesce(m.paused_at,m.approved_at,m.prepared_at)
      from public."FIN_RecognitionMandates" m join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=m.legal_entity_id
      where entity."Company_ID"=p_company_id
        and (nullif(btrim(p_search),'') is null or concat_ws(' ',m.status,m.effective_date,m.revenue_service_rule) ilike '%'||btrim(p_search)||'%')
    union all
    select jsonb_build_object('recordId',r.id,'recordKind','accounting_close_review','status','prepared',
      'periodId',r.period_id,'sourceDigest',r.source_digest,'blockers',r.snapshot->'blockers',
      'evidence',jsonb_build_object('sourceTable','FIN_AccountingCloseReviews','sourceId',r.id,
        'legalEntityId',r.legal_entity_id,'updatedAt',r.prepared_at)),r.prepared_at
      from public."FIN_AccountingCloseReviews" r join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=r.legal_entity_id
      join public."FIN_Periods" p on p."FINPeriod_ID"=r.period_id
      where entity."Company_ID"=p_company_id
        and (nullif(btrim(p_search),'') is null or concat_ws(' ',p."FINPeriod_Code",p."FINPeriod_Name",r.id) ilike '%'||btrim(p_search)||'%')
    union all
    select jsonb_build_object('recordId',p.id,'recordKind','accounting_closed_pack','status','locked',
      'periodId',p.period_id,'sourceDigest',p.source_digest,'closedAt',p.closed_at,
      'evidence',jsonb_build_object('sourceTable','FIN_AccountingClosedPacks','sourceId',p.id,
        'legalEntityId',p.legal_entity_id,'updatedAt',p.closed_at)),p.closed_at
      from public."FIN_AccountingClosedPacks" p join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=p.legal_entity_id
      join public."FIN_Periods" period on period."FINPeriod_ID"=p.period_id
      where entity."Company_ID"=p_company_id
        and (nullif(btrim(p_search),'') is null or concat_ws(' ',period."FINPeriod_Code",period."FINPeriod_Name",p.id) ilike '%'||btrim(p_search)||'%')
  ) select coalesce(jsonb_agg(value order by updated_at desc),'[]'::jsonb)
    from (select * from records order by updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) limited;
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_finance(uuid,text,integer) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Tenant-safe finance source evidence, charge lifecycle cases, reviewed corrections, recognition mandates, accounting close packs and existing document, cash and ledger records.',
  "AIDexterDomain_UpdatedAt"=now()
  where "AIDexterDomain_Code"='finance';
update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Event-driven finance documents, charge lifecycle cases, reviewed corrections, accounting close packs, cash, provider status and management period changes.',
  "AIDexterWatchCapability_FieldsJSON"=(coalesce("AIDexterWatchCapability_FieldsJSON",'[]'::jsonb)||
    '["sourceRevision","reason","nextAction","amountLocal","delta","periodId"]'::jsonb),
  "AIDexterWatchCapability_UpdatedAt"=now()
  where "AIDexterWatchCapability_Code"='finance';

create function public._multideck_dexter_charge_lifecycle_watch_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_entity uuid; v_company uuid; v_source uuid; v_target uuid; v_old jsonb; v_new jsonb;
begin
  if tg_table_name='FIN_ChargeLifecycleQueue' then
    v_entity:=new.legal_entity_id; v_source:=new.charge_id; v_target:=v_source;
    v_old:=case when tg_op='INSERT' then null else jsonb_build_object('status',old.status,'revision',old.source_revision,
      'reason',old.reason,'amountLocal',old.amount_local) end;
    v_new:=jsonb_build_object('status',new.status,'revision',new.source_revision,'reason',new.reason,'amountLocal',new.amount_local);
  elsif tg_table_name='FIN_ChargeCorrections' then
    v_entity:=new.legal_entity_id; v_source:=new.charge_id; v_target:=v_source;
    v_old:=case when tg_op='INSERT' then null else jsonb_build_object('status',old.status,'delta',old.delta,'batchId',old.posting_batch_id,'reviewId',old.id) end;
    v_new:=jsonb_build_object('status',new.status,'delta',new.delta,'batchId',new.posting_batch_id,'reviewId',new.id);
  elsif tg_table_name='FIN_RecognitionMandates' then
    v_entity:=new.legal_entity_id; v_source:=new.id; v_target:=v_source;
    v_old:=case when tg_op='INSERT' then null else jsonb_build_object('status',old.status,'effectiveDate',old.effective_date) end;
    v_new:=jsonb_build_object('status',new.status,'effectiveDate',new.effective_date);
  elsif tg_table_name='FIN_AccountingCloseReviews' then
    v_entity:=new.legal_entity_id; v_source:=new.period_id; v_target:=v_source;
    v_old:=null; v_new:=jsonb_build_object('status','prepared','periodId',new.period_id,'sourceDigest',new.source_digest,'reviewId',new.id);
  else
    v_entity:=new.legal_entity_id; v_source:=new.period_id; v_target:=v_source;
    v_old:=null; v_new:=jsonb_build_object('status','locked','periodId',new.period_id,'closedAt',new.closed_at,'packId',new.id);
  end if;
  if v_old is not distinct from v_new then return new; end if;
  select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=v_entity;
  if v_company is not null and exists(select 1 from public."AI_DexterWatches" w
    join public."cmp_Users" u on u."User_ID"=w."AIDexterWatch_OwnerUserID"
    where w."AIDexterWatch_CompanyID"=v_company and u."Company_ID"=v_company
      and u."User_AccessStatus"='active'
      and public._multideck_dexter_has_permission(u."User_ID",'Finance.Management.View')
      and w."AIDexterWatch_CapabilityCode"='finance'
      and w."AIDexterWatch_StatusCode"='active'
      and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID" in (v_source,v_target))) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
      values(v_company,'finance',tg_table_name,v_source,v_old,v_new);
  end if;
  return new;
end; $$;
revoke all on function public._multideck_dexter_charge_lifecycle_watch_change() from public,anon,authenticated;
create trigger "TR_FIN_ChargeLifecycleQueue_dexter_watch" after insert or update on public."FIN_ChargeLifecycleQueue"
  for each row execute function public._multideck_dexter_charge_lifecycle_watch_change();
create trigger "TR_FIN_ChargeCorrections_dexter_watch" after insert or update on public."FIN_ChargeCorrections"
  for each row execute function public._multideck_dexter_charge_lifecycle_watch_change();
create trigger "TR_FIN_RecognitionMandates_dexter_watch" after insert or update on public."FIN_RecognitionMandates"
  for each row execute function public._multideck_dexter_charge_lifecycle_watch_change();
create trigger "TR_FIN_AccountingCloseReviews_dexter_watch" after insert on public."FIN_AccountingCloseReviews"
  for each row execute function public._multideck_dexter_charge_lifecycle_watch_change();
create trigger "TR_FIN_AccountingClosedPacks_dexter_watch" after insert on public."FIN_AccountingClosedPacks"
  for each row execute function public._multideck_dexter_charge_lifecycle_watch_change();

commit;
