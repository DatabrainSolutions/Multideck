-- A reviewed initial baseline is not delivery success. The normal leased worker
-- must still write/read back the current CRM fields and accounting address.
create function public.multideck_accounting_review_party(
 p_job uuid,p_revision bigint,p_provider_id text,p_snapshot jsonb,p_actor uuid
) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare job public."ACCI_PartySyncQueue"%rowtype; company uuid;
begin
 select * into job from public."ACCI_PartySyncQueue" where id=p_job for update;
 if not found or job.revision<>p_revision or job.status='processing' or job.verified_payload is not null then
  raise exception 'The account check changed. Reload the identity review.' using errcode='40001';
 end if;
 select e."Company_ID" into company from public."ACCI_Connections" c
 join public."cmp_LegalEntities" e on e."LegalEntity_ID"=c."ACCIC_LegalEntityID" and e."LegalEntity_IsActive"
 join public."CRM_AccountProfiles" p on p."CRMAccount_CompanyID"=e."Company_ID" and p."CRMAccount_OrgID"=job.org_id and not p."CRMAccount_IsDeleted"
  and (p."CRMAccount_LegalEntityID" is null or p."CRMAccount_LegalEntityID"=e."LegalEntity_ID")
 where c."ACCIC_ID"=job.connection_id and c."ACCIC_StatusCode"='active' and c."ACCIC_ProviderCode"='erpnext';
 if company is null or not exists(select 1 from public."cmp_Users" where "User_ID"=p_actor and "Company_ID"=company and "User_AccessStatus"='active') then
  raise exception 'The accounting review is outside the active workspace.' using errcode='42501';
 end if;
 if not exists(select 1 from public."Org_Master_Type" x join public."Org_Types" t on t."OrgType_ID"=x."OrgType_ID" where x."Org_ID"=job.org_id and lower(t."OrgType_Name")=job.party_type)
 or (select count(*) from public."ACCI_PartyMappings" where "ACCIPM_ConnectionID"=job.connection_id and "ACCIPM_OrgID"=job.org_id and "ACCIPM_IsActive" and "ACCIPM_PartyType" in (job.party_type,'both'))<>1
 or not exists(select 1 from public."ACCI_PartyMappings" where "ACCIPM_ConnectionID"=job.connection_id and "ACCIPM_OrgID"=job.org_id and "ACCIPM_PartyType"=job.party_type and "ACCIPM_ProviderPartyID"=p_provider_id and "ACCIPM_IsActive") then
  raise exception 'The reviewed accounting mapping changed.' using errcode='40001';
 end if;
 if jsonb_typeof(p_snapshot)<>'object' or jsonb_typeof(p_snapshot->'party')<>'object'
 or coalesce(p_snapshot->'party'->>'custom_multideck_party_key','')!~'^[a-f0-9]{64}$' or octet_length(p_snapshot::text)>32000 then
  raise exception 'The reviewed identity evidence is invalid.' using errcode='22023';
 end if;
 perform public.multideck_accounting_address(job.org_id,job.party_type);
 update public."ACCI_PartySyncQueue" set verified_payload=p_snapshot,provider_id=p_provider_id,
  revision=revision+1,status='queued',attempts=0,next_attempt_at=now(),last_error=null,updated_at=now()
 where id=job.id;
 insert into public."ACCI_SyncEvents"("ACCISE_ConnectionID","ACCISE_Severity","ACCISE_EventCode","ACCISE_Message","ACCISE_LocalTable","ACCISE_LocalID","ACCISE_ExternalObjectType","ACCISE_ExternalID","ACCISE_ResponsePayloadJSON")
 values(job.connection_id,'info','party_identity_reviewed','Reviewed the existing provider identity; full account verification is queued.','Org_Master',job.org_id,
 case when job.party_type='customer' then 'Customer' else 'Supplier' end,p_provider_id,jsonb_build_object('actorId',p_actor,'scope','party_master','snapshot',p_snapshot));
end $$;
revoke all on function public.multideck_accounting_review_party(uuid,bigint,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.multideck_accounting_review_party(uuid,bigint,text,jsonb,uuid) to service_role;
