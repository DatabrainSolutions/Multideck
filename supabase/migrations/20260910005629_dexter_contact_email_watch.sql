begin;
create table public."AI_DexterContactEmailWatchChanges"(transaction_id bigint not null,contact_id uuid not null,before_value jsonb not null,primary key(transaction_id,contact_id));
alter table public."AI_DexterContactEmailWatchChanges" enable row level security;
revoke all on public."AI_DexterContactEmailWatchChanges" from public,anon,authenticated;
create function public._multideck_dexter_contact_email_snapshot(p_contact_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce((select jsonb_build_object('companyId',p."CRMAccount_CompanyID",'organisationId',c."Org_ID",'emails',coalesce((
  select jsonb_agg(v.value order by v.value::text) from (
   select jsonb_build_object('emailFingerprint',md5(lower(btrim(e."OrgContactEmail_Email"))),'type',e."OrgContactEmail_Type",'active',e."OrgContactEmail_IsActive",'primary',e."OrgContactEmail_IsPrimary",'validFrom',e."OrgContactEmail_ValidFrom",'validTo',e."OrgContactEmail_ValidTo") value
   from public."OrgContact_Emails" e where e."OrgContact_ID"=p_contact_id
  ) v),'[]'::jsonb)) from public."Org_Contacts" c join public."CRM_AccountProfiles" p on p."CRMAccount_OrgID"=c."Org_ID" and not p."CRMAccount_IsDeleted" where c."OrgContact_ID"=p_contact_id order by p."CRMAccount_ID" limit 1),'{}'::jsonb)
$$;
create function public._multideck_dexter_capture_contact_email_watch()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_contact_id uuid;
begin
 for v_contact_id in select distinct v from unnest(array[case when tg_op<>'INSERT' then old."OrgContact_ID" end,case when tg_op<>'DELETE' then new."OrgContact_ID" end]) v where v is not null loop
  insert into public."AI_DexterContactEmailWatchChanges" values(txid_current(),v_contact_id,public._multideck_dexter_contact_email_snapshot(v_contact_id)) on conflict do nothing;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create function public._multideck_dexter_flush_contact_email_watch()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_contact_id uuid;before_snapshot jsonb;after_snapshot jsonb;before_value jsonb;after_value jsonb;source record;
begin
 for v_contact_id in select distinct v from unnest(array[case when tg_op<>'INSERT' then old."OrgContact_ID" end,case when tg_op<>'DELETE' then new."OrgContact_ID" end]) v where v is not null loop
  delete from public."AI_DexterContactEmailWatchChanges" q where q.transaction_id=txid_current() and q.contact_id=v_contact_id returning q.before_value into before_snapshot;
  if not found then continue;end if;
  after_snapshot:=public._multideck_dexter_contact_email_snapshot(v_contact_id);
  for source in select distinct (v->>'companyId')::uuid company_id,(v->>'organisationId')::uuid organisation_id from jsonb_array_elements(jsonb_build_array(before_snapshot,after_snapshot)) v where v->>'companyId' is not null loop
   before_value:=case when (before_snapshot->>'companyId')::uuid=source.company_id and (before_snapshot->>'organisationId')::uuid=source.organisation_id then before_snapshot->'emails' else '[]'::jsonb end;
   after_value:=case when (after_snapshot->>'companyId')::uuid=source.company_id and (after_snapshot->>'organisationId')::uuid=source.organisation_id then after_snapshot->'emails' else '[]'::jsonb end;
   if before_value is not distinct from after_value then continue;end if;
   insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
   select distinct w."AIDexterWatch_CompanyID",'customers','OrgContact_Emails',source.organisation_id,jsonb_build_object('contactEmails',before_value),jsonb_build_object('contactEmails',after_value)
   from public."AI_DexterWatches" w where w."AIDexterWatch_CompanyID"=source.company_id and w."AIDexterWatch_CapabilityCode"='customers' and w."AIDexterWatch_StatusCode"='active'
    and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=source.organisation_id)
    and exists(select 1 from public.multideck_crm_accessible_account_ids(source.company_id) a where a.account_id=source.organisation_id);
  end loop;
 end loop;
 return null;
end $$;
drop trigger if exists "TR_OrgContact_Emails_customer_watch" on public."OrgContact_Emails";
create trigger "TR_OrgContact_Emails_watch_capture" before insert or update or delete on public."OrgContact_Emails" for each row execute function public._multideck_dexter_capture_contact_email_watch();
create constraint trigger "TR_OrgContact_Emails_watch_flush" after insert or update or delete on public."OrgContact_Emails" deferrable initially deferred for each row execute function public._multideck_dexter_flush_contact_email_watch();
revoke all on function public._multideck_dexter_contact_email_snapshot(uuid) from public,anon,authenticated;
revoke all on function public._multideck_dexter_capture_contact_email_watch() from public,anon,authenticated;
revoke all on function public._multideck_dexter_flush_contact_email_watch() from public,anon,authenticated;
do $patch$
declare definition text;marker text:=$old$('Org_Addresses','Org_Master','CRM_AccountProfiles','CRM_AccountOfficeAssignments','Org_RelatedPartyDefaults','CRM_ContactOrganisationAssignments')$old$;
begin
 definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>2 then raise exception 'Review contact email watch guards';end if;
 definition:=replace(definition,marker,$new$('Org_Addresses','Org_Master','CRM_AccountProfiles','CRM_AccountOfficeAssignments','Org_RelatedPartyDefaults','CRM_ContactOrganisationAssignments','OrgContact_Emails')$new$);
 marker:='insert into public."AI_DexterWatchEvents" (';
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review contact email notification';end if;
 definition:=replace(definition,marker,$body$
 if new."AIDexterWatchSignal_SourceTable"='OrgContact_Emails' and v_field='contactEmails' then
  v_event_body:=coalesce(watch."AIDexterWatch_TargetLabel",'A watched company')||': Contact email details updated.';
 end if;
 $body$||marker);execute definition;
end $patch$;
commit;
