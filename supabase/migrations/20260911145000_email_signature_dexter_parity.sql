begin;
-- One eligibility boundary for Dexter reads and deterministic watch evaluation.
create function public.email_signature_available(p_user uuid,p_company uuid,p_template uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 with actor as (
  select u."User_ID",public._multideck_dexter_has_permission(p_user,'Email.Signatures.Manage') manager,
    coalesce(profile.allow_customisation,policy.allow_customisation,true) personal
  from public."cmp_Users" u
  left join public.email_signature_profiles profile on profile.user_id=u."User_ID" and profile.company_id=p_company
  left join public.email_signature_policies policy on policy.company_id=p_company
  where u."User_ID"=p_user and u."Company_ID"=p_company and u."Auth_User_ID" is not null and coalesce(u."User_AccessStatus",'active')='active'
   and (public._multideck_dexter_has_permission(p_user,'Email.Send') or public._multideck_dexter_has_permission(p_user,'Email.Signatures.Manage'))
 ), candidates as (
  select t.id,min(case a->>'kind' when 'user' then 1 when 'department' then 2 when 'everyone' then 3 end) rank
  from public.email_signature_templates t cross join lateral jsonb_array_elements(t.published_assignments) a
  where t.company_id=p_company and not t.archived and t.owner_user_id is null and t.published_revision is not null
   and (a->>'kind'='everyone' or a->>'kind'='user' and a->>'id'=p_user::text or a->>'kind'='department' and exists(
    select 1 from public."cmp_Users_Departments" m join public."cmp_Departments" d on d."Department_ID"=m."Department_ID"
    where m."User_ID"=p_user and d."Company_ID"=p_company and d."Department_IsActive" and d."Department_ID"::text=a->>'id'))
  group by t.id
 ) select exists(select 1 from actor u cross join public.email_signature_templates t where t.id=p_template and t.company_id=p_company and not t.archived and
  (t.owner_user_id=p_user and u.personal or t.owner_user_id is null and (u.manager or t.id in(select id from candidates where rank=(select min(rank) from candidates)))));
$$;
revoke all on function public.email_signature_available(uuid,uuid,uuid) from public,anon,authenticated;

create function public.multideck_dexter_domain_email_signatures(p_company_id uuid,p_search text,p_take integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare actor record; result jsonb; manager boolean;
begin
 select * into actor from public._multideck_dexter_context();
 if actor.company_id<>p_company_id then raise exception 'Signature workspace access denied' using errcode='42501';end if;
 manager:=public._multideck_dexter_has_permission(actor.user_id,'Email.Signatures.Manage');
 select coalesce(jsonb_agg(item),'[]') into result from (
  select jsonb_build_object('recordId',s.id,'name',s.name,'personal',s.owner_user_id is not null,'publishedRevision',s.published_revision,
   'assignments',case when manager then s.published_assignments else '[]'::jsonb end,'updatedAt',s.updated_at,
   'route',case when manager and s.owner_user_id is null then '/admin/email-signatures' else '/inbox/signatures' end,
   '_citation',jsonb_build_object('title',s.name,'url','/inbox/signatures','description','Saved Multideck signature; provider settings are separate')) item
  from public.email_signature_templates s where public.email_signature_available(actor.user_id,p_company_id,s.id)
   and (nullif(btrim(p_search),'') is null or s.name ilike '%'||btrim(p_search)||'%' or s.id::text=p_search)
  order by s.name limit greatest(1,least(coalesce(p_take,10),25))
 ) records;
 return result;
end $$;
revoke all on function public.multideck_dexter_domain_email_signatures(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_email_signatures(uuid,text,integer) to service_role;
insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_SortOrder")
values('email_signatures','Email signatures','Available Multideck signature names, published versions and authorised assignment evidence. Visual editing, publishing and policy changes require the signature builder; chat cannot perform those writes.','multideck_dexter_domain_email_signatures',62);
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_SortOrder")
values('email_signatures','Email signatures','Published version or assignment changes to one accessible signature. Notifications only; no automatic design or policy changes.','["publishedRevision","assignments"]',62);

create function public.email_signature_watch_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new."AIDexterWatch_CapabilityCode"='email_signatures' and new."AIDexterWatch_StatusCode"='active' and
  (new."AIDexterWatch_TargetID" is null or not public.email_signature_available(new."AIDexterWatch_OwnerUserID",new."AIDexterWatch_CompanyID",new."AIDexterWatch_TargetID")
   or (new."AIDexterWatch_RuleJSON"->>'field'='assignments' and not public._multideck_dexter_has_permission(new."AIDexterWatch_OwnerUserID",'Email.Signatures.Manage'))
   or new."AIDexterWatch_RuleJSON"->>'field' not in ('publishedRevision','assignments') or new."AIDexterWatch_RuleJSON"->>'operator'<>'changed' or new."AIDexterWatch_ActionJSON" is not null) then
   raise exception 'Choose one accessible signature and a published change to watch; automatic edits are unavailable.' using errcode='42501';
 end if;
 return new;
end $$;
create trigger email_signature_watch_guard before insert or update on public."AI_DexterWatches" for each row execute function public.email_signature_watch_guard();
revoke all on function public.email_signature_watch_guard() from public,anon,authenticated;

create function public.email_signature_watch_signal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.published_revision is not null and (old.published_revision is distinct from new.published_revision or old.published_assignments is distinct from new.published_assignments) then
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
  values(new.company_id,'email_signatures','email_signature_templates',new.id,jsonb_build_object('publishedRevision',old.published_revision,'assignments',old.published_assignments),jsonb_build_object('publishedRevision',new.published_revision,'assignments',new.published_assignments));
 end if;
 return new;
end $$;
create trigger email_signature_watch_signal after update on public.email_signature_templates for each row execute function public.email_signature_watch_signal();
revoke all on function public.email_signature_watch_signal() from public,anon,authenticated;

do $patch$
declare definition text; marker text;
begin
 definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
 marker:=E'      and watch_row."AIDexterWatch_StatusCode" = ''active''';
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review signature watch evaluator access marker';end if;
 definition:=replace(definition,marker,marker||$guard$
      and (watch_row."AIDexterWatch_CapabilityCode" <> 'email_signatures' or ((watch_row."AIDexterWatch_RuleJSON"->>'field'<>'assignments' or public._multideck_dexter_has_permission(watch_row."AIDexterWatch_OwnerUserID",'Email.Signatures.Manage')) and public.email_signature_available(watch_row."AIDexterWatch_OwnerUserID",watch_row."AIDexterWatch_CompanyID",new."AIDexterWatchSignal_SourceID")))$guard$);
 marker:='if v_matches and (';
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review signature watch evaluator repeat marker';end if;
 definition:=replace(definition,marker,marker||$repeat$
        (watch."AIDexterWatch_CapabilityCode"='email_signatures' and watch."AIDexterWatch_RuleJSON"->>'operator'='changed') or $repeat$);
 marker:='insert into public."AI_DexterWatchEvents" (';
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review signature watch notification marker';end if;
 definition:=replace(definition,marker,$body$
        if watch."AIDexterWatch_CapabilityCode"='email_signatures' then v_event_body:=coalesce(watch."AIDexterWatch_TargetLabel",'An email signature')||': '||case v_field when 'assignments' then 'Published assignments changed.' else 'A new signature version was applied.' end;end if;
        $body$||marker);
 execute definition;
end $patch$;
commit;
