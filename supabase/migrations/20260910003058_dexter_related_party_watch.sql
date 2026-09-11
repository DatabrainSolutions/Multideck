begin;
create function public._multideck_dexter_related_party_watch_value(p_row jsonb)
returns jsonb language sql immutable set search_path=pg_catalog,public as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p_row)
 where key in ('OrgRelatedDefault_ID','OrgRelatedDefault_PartyRoleCode','OrgRelatedDefault_DestinationCountryCode',
 'OrgRelatedDefault_DestinationUNLOCODE','OrgRelatedDefault_DestinationPostcode','OrgRelatedDefault_TargetOrgID',
 'OrgRelatedDefault_TargetAddressID','OrgRelatedDefault_TargetContactID','OrgRelatedDefault_Priority',
 'OrgRelatedDefault_EffectiveFrom','OrgRelatedDefault_EffectiveTo','OrgRelatedDefault_IsActive')
$$;
create function public._multideck_dexter_related_party_watch_signal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare old_row jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 new_row jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 source record;before_value jsonb;after_value jsonb;
begin
 for source in select distinct value->>'OrgRelatedDefault_CompanyID' company_id,value->>'OrgRelatedDefault_SourceOrgID' source_id
  from jsonb_array_elements(jsonb_build_array(old_row,new_row)) value where value->>'OrgRelatedDefault_SourceOrgID' is not null
 loop
  before_value:=case when old_row->>'OrgRelatedDefault_CompanyID'=source.company_id and old_row->>'OrgRelatedDefault_SourceOrgID'=source.source_id then public._multideck_dexter_related_party_watch_value(old_row) else '{}'::jsonb end;
  after_value:=case when new_row->>'OrgRelatedDefault_CompanyID'=source.company_id and new_row->>'OrgRelatedDefault_SourceOrgID'=source.source_id then public._multideck_dexter_related_party_watch_value(new_row) else '{}'::jsonb end;
  if before_value is not distinct from after_value then continue;end if;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
  select distinct w."AIDexterWatch_CompanyID",'customers','Org_RelatedPartyDefaults',source.source_id::uuid,
   jsonb_build_object('relatedPartyDefaults',before_value),jsonb_build_object('relatedPartyDefaults',after_value)
  from public."AI_DexterWatches" w where w."AIDexterWatch_CompanyID"=source.company_id::uuid
   and w."AIDexterWatch_CapabilityCode"='customers' and w."AIDexterWatch_StatusCode"='active'
   and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=source.source_id::uuid)
   and exists(select 1 from public.multideck_crm_accessible_account_ids(w."AIDexterWatch_CompanyID") a where a.account_id=source.source_id::uuid);
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger if exists "TR_Org_RelatedPartyDefaults_customer_watch" on public."Org_RelatedPartyDefaults";
create trigger "TR_Org_RelatedPartyDefaults_customer_watch" after insert or update or delete on public."Org_RelatedPartyDefaults"
 for each row execute function public._multideck_dexter_related_party_watch_signal();
revoke all on function public._multideck_dexter_related_party_watch_value(jsonb) from public,anon,authenticated;
revoke all on function public._multideck_dexter_related_party_watch_signal() from public,anon,authenticated;
do $patch$
declare definition text;marker text:=$old$('Org_Addresses','Org_Master','CRM_AccountProfiles','CRM_AccountOfficeAssignments')$old$;
begin
 definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>2 then raise exception 'Review related-party watch guards';end if;
 definition:=replace(definition,marker,$new$('Org_Addresses','Org_Master','CRM_AccountProfiles','CRM_AccountOfficeAssignments','Org_RelatedPartyDefaults')$new$);
 marker:='insert into public."AI_DexterWatchEvents" (';
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review related-party watch notification';end if;
 definition:=replace(definition,marker,$body$
 if new."AIDexterWatchSignal_SourceTable"='Org_RelatedPartyDefaults' and v_field='relatedPartyDefaults' then
  v_event_body:=coalesce(watch."AIDexterWatch_TargetLabel",'A watched company')||': Related-party defaults updated.';
 end if;
 $body$||marker);
 execute definition;
end $patch$;
commit;
