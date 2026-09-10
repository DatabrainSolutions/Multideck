begin;
create function public._multideck_dexter_contact_employment_watch_value(p_row jsonb)
returns jsonb language sql immutable set search_path=pg_catalog,public as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p_row)
 where key in ('CRMContactOrg_ID','CRMContactOrg_ContactID','CRMContactOrg_JobTitle','CRMContactOrg_Department','CRMContactOrg_RoleCode','CRMContactOrg_StartedAt','CRMContactOrg_EndedAt','CRMContactOrg_IsCurrent')
$$;
create function public._multideck_dexter_contact_employment_watch_signal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare old_row jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 new_row jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 source record;before_value jsonb;after_value jsonb;
begin
 for source in select distinct value->>'CRMContactOrg_CompanyID' company_id,value->>'CRMContactOrg_OrgID' source_id
  from jsonb_array_elements(jsonb_build_array(old_row,new_row)) value where value->>'CRMContactOrg_OrgID' is not null
 loop
  before_value:=case when old_row->>'CRMContactOrg_CompanyID'=source.company_id and old_row->>'CRMContactOrg_OrgID'=source.source_id then public._multideck_dexter_contact_employment_watch_value(old_row) else '{}'::jsonb end;
  after_value:=case when new_row->>'CRMContactOrg_CompanyID'=source.company_id and new_row->>'CRMContactOrg_OrgID'=source.source_id then public._multideck_dexter_contact_employment_watch_value(new_row) else '{}'::jsonb end;
  if before_value is not distinct from after_value then continue;end if;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
  select distinct w."AIDexterWatch_CompanyID",'customers','CRM_ContactOrganisationAssignments',source.source_id::uuid,
   jsonb_build_object('contactEmployment',before_value),jsonb_build_object('contactEmployment',after_value)
  from public."AI_DexterWatches" w where w."AIDexterWatch_CompanyID"=source.company_id::uuid
   and w."AIDexterWatch_CapabilityCode"='customers' and w."AIDexterWatch_StatusCode"='active'
   and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=source.source_id::uuid)
   and exists(select 1 from public.multideck_crm_accessible_account_ids(w."AIDexterWatch_CompanyID") a where a.account_id=source.source_id::uuid);
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger if exists "TR_CRM_ContactOrganisationAssignments_customer_watch" on public."CRM_ContactOrganisationAssignments";
create trigger "TR_CRM_ContactOrganisationAssignments_customer_watch" after insert or update or delete on public."CRM_ContactOrganisationAssignments"
 for each row execute function public._multideck_dexter_contact_employment_watch_signal();
revoke all on function public._multideck_dexter_contact_employment_watch_value(jsonb) from public,anon,authenticated;
revoke all on function public._multideck_dexter_contact_employment_watch_signal() from public,anon,authenticated;
do $patch$
declare definition text;marker text:=$old$('Org_Addresses','Org_Master','CRM_AccountProfiles','CRM_AccountOfficeAssignments','Org_RelatedPartyDefaults')$old$;
begin
 definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>2 then raise exception 'Review contact employment watch guards';end if;
 definition:=replace(definition,marker,$new$('Org_Addresses','Org_Master','CRM_AccountProfiles','CRM_AccountOfficeAssignments','Org_RelatedPartyDefaults','CRM_ContactOrganisationAssignments')$new$);
 marker:='insert into public."AI_DexterWatchEvents" (';
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review contact employment watch notification';end if;
 definition:=replace(definition,marker,$body$
 if new."AIDexterWatchSignal_SourceTable"='CRM_ContactOrganisationAssignments' and v_field='contactEmployment' then
  v_event_body:=coalesce(watch."AIDexterWatch_TargetLabel",'A watched company')||': Contact employment updated.';
 end if;
 $body$||marker);
 execute definition;
end $patch$;
commit;
