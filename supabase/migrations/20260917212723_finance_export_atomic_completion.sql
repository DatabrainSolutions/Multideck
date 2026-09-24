-- Private, fenced export attempts. Provider delivery and local ledger posting
-- remain separate; this transaction only finalises the external mirror evidence.
begin;
alter table public."FIN_IntegrationQueue"
 add column "FINIntQ_LeaseToken" uuid,
 add column "FINIntQ_LeaseUntil" timestamptz,
 add column "FINIntQ_LeaseContextJSON" jsonb;

create function public._multideck_finance_export_source(p_table text,p_id uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r jsonb; entity_id uuid; company_id uuid;
begin
 if p_table='FIN_Documents' then
  select to_jsonb(d) into r from public."FIN_Documents" d where "FINDoc_ID"=p_id for update;
  entity_id:=(r->>'FINDoc_LegalEntityID')::uuid;
 elsif p_table='FIN_CashTransactions' then
  select to_jsonb(c) into r from public."FIN_CashTransactions" c where "FINCash_ID"=p_id for update;
  entity_id:=(r->>'FINCash_LegalEntityID')::uuid;
 else raise exception 'Unsupported finance export record.' using errcode='22023'; end if;
 select "Company_ID" into company_id from public."cmp_LegalEntities" where "LegalEntity_ID"=entity_id and "LegalEntity_IsActive" for share;
 if r is null or company_id is null or not exists(select 1 from public."cmp_Users" where "User_ID"=p_actor and "Company_ID"=company_id and "User_AccessStatus"='active')
 or not (public._multideck_dexter_has_permission(p_actor,'Finance.Integration.Manage') or public._multideck_dexter_has_permission(p_actor,'Finance.ReviewAndPost')) then
  raise exception 'Finance export is outside the active authorised workspace.' using errcode='42501';
 end if;
 return jsonb_build_object('record',r,'entityId',entity_id,'companyId',company_id);
end $$;

create function public.multideck_finance_begin_export(p_queue uuid,p_actor uuid,p_connection uuid,p_canonical jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare q public."FIN_IntegrationQueue"; c public."ACCI_Connections"; source jsonb; token uuid:=gen_random_uuid(); batch_id uuid; item_id uuid; context jsonb;
begin
 select * into q from public."FIN_IntegrationQueue" where "FINIntQ_ID"=p_queue for update;
 if not found then raise exception 'Finance export item not found.' using errcode='P0002'; end if;
 source:=public._multideck_finance_export_source(q."FINIntQ_LocalTable",q."FINIntQ_LocalID",p_actor);
 if coalesce(source#>>'{record,FINDoc_StatusCode}',source#>>'{record,FINCash_StatusCode}')<>'approved' then
  raise exception 'Only an approved finance record can be exported.' using errcode='22023'; end if;
 if q."FINIntQ_StatusCode" not in ('queued','blocked','failed','processing') or
 (q."FINIntQ_StatusCode"='processing' and coalesce(q."FINIntQ_LeaseUntil",q."FINIntQ_LastAttemptAt"+interval '15 minutes','-infinity'::timestamptz)>now()) then
  raise exception 'This finance export is already processing or has completed.' using errcode='55000'; end if;
 select * into c from public."ACCI_Connections" where "ACCIC_ID"=p_connection for share;
 if not found or c."ACCIC_StatusCode"<>'active' or c."ACCIC_LegalEntityID"::text is distinct from source->>'entityId' then
  raise exception 'Accounting connection is outside the active finance entity.' using errcode='42501'; end if;
 if jsonb_typeof(p_canonical) is distinct from 'object' or octet_length(p_canonical::text)>262144
 or p_canonical->>'localId' is distinct from q."FINIntQ_LocalID"::text or p_canonical->>'localTable' is distinct from q."FINIntQ_LocalTable"
 or p_canonical->>'providerCode' is distinct from c."ACCIC_ProviderCode" or p_canonical->>'externalCompany' is distinct from c."ACCIC_ExternalTenantName"
 or p_canonical->>'typeCode' is distinct from coalesce(source#>>'{record,FINDoc_TypeCode}',source#>>'{record,FINCash_TypeCode}') then
  raise exception 'The prepared export identity changed.' using errcode='22023'; end if;
 -- A reclaimed worker cannot alter its old batch after this transaction.
 if q."FINIntQ_StatusCode"='processing' and q."FINIntQ_ExportBatchID" is not null then
  update public."ACCI_ExportItems" set "ACCIEI_StatusCode"='failed',"ACCIEI_LastErrorCode"='lease_expired',"ACCIEI_LastErrorMessage"='Interrupted delivery; a new attempt will recover the provider identity.' where "ACCIEI_BatchID"=q."FINIntQ_ExportBatchID" and "ACCIEI_StatusCode"='processing';
  update public."ACCI_ExportBatches" set "ACCIEB_StatusCode"='failed',"ACCIEB_ExportCompletedAt"=now() where "ACCIEB_ID"=q."FINIntQ_ExportBatchID" and "ACCIEB_StatusCode"='processing';
 end if;
 insert into public."ACCI_ExportBatches"("ACCIEB_ConnectionID","ACCIEB_StatusCode","ACCIEB_LegalEntityID","ACCIEB_DocumentCount","ACCIEB_GrossTotalLocal","ACCIEB_ApprovedAt","ACCIEB_ApprovedBy","ACCIEB_ExportStartedAt","ACCIEB_CreatedBy")
 values(p_connection,'processing',c."ACCIC_LegalEntityID",1,(p_canonical->>'localAmount')::numeric,now(),p_actor,now(),p_actor) returning "ACCIEB_ID" into batch_id;
 insert into public."ACCI_ExportItems"("ACCIEI_BatchID","ACCIEI_DocumentTypeCode","ACCIEI_LocalTable","ACCIEI_LocalID","ACCIEI_LocalNumber","ACCIEI_StatusCode","ACCIEI_AttemptCount","ACCIEI_LastAttemptAt")
 values(batch_id,p_canonical->>'typeCode',q."FINIntQ_LocalTable",q."FINIntQ_LocalID",p_canonical->>'localNumber','processing',q."FINIntQ_AttemptCount"+1,now()) returning "ACCIEI_ID" into item_id;
 context:=jsonb_build_object('actor',p_actor,'canonical',p_canonical,'source',source,'connection',jsonb_build_object('id',c."ACCIC_ID",'entity',c."ACCIC_LegalEntityID",'provider',c."ACCIC_ProviderCode",'company',c."ACCIC_ExternalTenantName",'settings',c."ACCIC_SettingsJSON"),'batch',batch_id,'item',item_id);
 update public."FIN_IntegrationQueue" set "FINIntQ_StatusCode"='processing',"FINIntQ_LastError"=null,"FINIntQ_LastAttemptAt"=now(),"FINIntQ_AttemptCount"="FINIntQ_AttemptCount"+1,"FINIntQ_ExportBatchID"=batch_id,"FINIntQ_LeaseToken"=token,"FINIntQ_LeaseUntil"=now()+interval '15 minutes',"FINIntQ_LeaseContextJSON"=context where "FINIntQ_ID"=p_queue;
 return jsonb_build_object('token',token,'batchId',batch_id,'itemId',item_id);
end $$;

create function public.multideck_finance_finish_export(p_queue uuid,p_token uuid,p_actor uuid,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare q public."FIN_IntegrationQueue"; c public."ACCI_Connections"; x jsonb; canonical jsonb; source jsonb; s text; message text; issue text; ref_id uuid; connection_id uuid; external_id text;
begin
 select * into q from public."FIN_IntegrationQueue" where "FINIntQ_ID"=p_queue for update;
 if not found or q."FINIntQ_StatusCode"<>'processing' or q."FINIntQ_LeaseToken" is distinct from p_token or q."FINIntQ_LeaseUntil"<=now() then return jsonb_build_object('completed',false); end if;
 x:=q."FINIntQ_LeaseContextJSON"; canonical:=x->'canonical';
 if x->>'actor' is distinct from p_actor::text then raise exception 'Export actor changed.' using errcode='42501'; end if;
 source:=public._multideck_finance_export_source(q."FINIntQ_LocalTable",q."FINIntQ_LocalID",p_actor);
 s:=p_result->>'status'; message:=left(p_result->>'message',500); issue:=p_result->>'issue';
 if jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text)>1048576 or s is null or s not in ('synced','blocked','failed') then raise exception 'Invalid export result.' using errcode='22023'; end if;
 connection_id:=(x#>>'{connection,id}')::uuid;
 select * into c from public."ACCI_Connections" where "ACCIC_ID"=connection_id for share;
 if not found then raise exception 'Accounting connection was removed.' using errcode='42501'; end if;
 if source is distinct from x->'source' or c."ACCIC_StatusCode"<>'active'
 or jsonb_build_object('id',c."ACCIC_ID",'entity',c."ACCIC_LegalEntityID",'provider',c."ACCIC_ProviderCode",'company',c."ACCIC_ExternalTenantName",'settings',c."ACCIC_SettingsJSON") is distinct from x->'connection' then
  s:='blocked'; message:='The approved record or accounting connection changed during delivery. Review the retained provider evidence.'; issue:='provider_delivery_mismatch';
 end if;
 external_id:=nullif(p_result->>'externalId','');
 if s='synced' and (external_id is null or nullif(p_result->>'externalObjectType','') is null) then raise exception 'Verified provider identity is required.' using errcode='22023'; end if;
 if s='synced' and c."ACCIC_ProviderCode"='erpnext' and ((p_result#>>'{responsePayload,multideckDeliveryVerification,status}') is distinct from 'matched'
 or (p_result#>'{responsePayload,multideckCanonicalExport}') is distinct from canonical) then raise exception 'Verified ERPNext comparison evidence is required.' using errcode='22023'; end if;
 if external_id is not null then
  -- Do not let a retry change an already retained provider identity.
  select "ACCIER_ID" into ref_id from public."ACCI_ExternalRefs" where "ACCIER_ConnectionID"=connection_id and "ACCIER_DocumentTypeCode"=canonical->>'typeCode' and "ACCIER_LocalTable"=q."FINIntQ_LocalTable" and "ACCIER_LocalID"=q."FINIntQ_LocalID" and ("ACCIER_ExternalID"<>external_id or "ACCIER_ExternalObjectType" is distinct from p_result->>'externalObjectType' or "ACCIER_SyncStatusCode"='synced') for update;
  if found then raise exception 'Retained provider identity requires reconciliation.' using errcode='23505'; end if;
  insert into public."ACCI_ExternalRefs"("ACCIER_ConnectionID","ACCIER_DocumentTypeCode","ACCIER_LocalTable","ACCIER_LocalID","ACCIER_LocalNumber","ACCIER_ExternalObjectType","ACCIER_ExternalID","ACCIER_ExternalNumber","ACCIER_ExternalURL","ACCIER_SyncStatusCode","ACCIER_LastSyncedAt","ACCIER_LastPayloadJSON")
  values(connection_id,canonical->>'typeCode',q."FINIntQ_LocalTable",q."FINIntQ_LocalID",canonical->>'localNumber',p_result->>'externalObjectType',external_id,p_result->>'externalNumber',p_result->>'externalUrl',s,case when s='synced' then now() end,coalesce(p_result->'responsePayload','{}'::jsonb))
  on conflict("ACCIER_ConnectionID","ACCIER_DocumentTypeCode","ACCIER_LocalTable","ACCIER_LocalID") do update set "ACCIER_SyncStatusCode"=excluded."ACCIER_SyncStatusCode","ACCIER_LastSyncedAt"=excluded."ACCIER_LastSyncedAt","ACCIER_LastPayloadJSON"=excluded."ACCIER_LastPayloadJSON","ACCIER_ExternalNumber"=excluded."ACCIER_ExternalNumber","ACCIER_ExternalURL"=excluded."ACCIER_ExternalURL" returning "ACCIER_ID" into ref_id;
 end if;
 update public."ACCI_ExportItems" set "ACCIEI_StatusCode"=s,"ACCIEI_ExternalRefID"=ref_id,"ACCIEI_LastErrorCode"=case when s<>'synced' then coalesce(issue,'provider_export_failed') end,"ACCIEI_LastErrorMessage"=case when s<>'synced' then message end,"ACCIEI_RequestPayloadJSON"=coalesce(p_result->'requestPayload','{}'::jsonb),"ACCIEI_ResponsePayloadJSON"=coalesce(p_result->'responsePayload','{}'::jsonb) where "ACCIEI_ID"=(x->>'item')::uuid;
 update public."ACCI_ExportBatches" set "ACCIEB_StatusCode"=s,"ACCIEB_ExportCompletedAt"=now() where "ACCIEB_ID"=(x->>'batch')::uuid;
 if q."FINIntQ_LocalTable"='FIN_Documents' then
  update public."FIN_Documents" set "FINDoc_StatusCode"=case when s='synced' then 'submitted' else "FINDoc_StatusCode" end,"FINDoc_ExportStatusCode"=s,"FINDoc_UpdatedAt"=now(),"FINDoc_UpdatedBy"=p_actor where "FINDoc_ID"=q."FINIntQ_LocalID";
 else
  update public."FIN_CashTransactions" set "FINCash_StatusCode"=case when s='synced' then 'submitted' else "FINCash_StatusCode" end,"FINCash_ExportStatusCode"=s,"FINCash_UpdatedAt"=now(),"FINCash_UpdatedBy"=p_actor where "FINCash_ID"=q."FINIntQ_LocalID";
 end if;
 if s='synced' then
  update public."ACCI_ReconciliationIssues" set "ACCIRI_StatusCode"='synced',"ACCIRI_ResolutionText"='Provider delivery verified on retry.',"ACCIRI_ResolvedAt"=now(),"ACCIRI_ResolvedBy"=p_actor where "ACCIRI_ConnectionID"=connection_id and "ACCIRI_LocalTable"=q."FINIntQ_LocalTable" and "ACCIRI_LocalID"=q."FINIntQ_LocalID" and "ACCIRI_IssueType" in ('mapping_required','provider_export_failed','provider_delivery_mismatch') and "ACCIRI_StatusCode" in ('queued','processing','blocked','failed');
 else
  insert into public."ACCI_ReconciliationIssues"("ACCIRI_ConnectionID","ACCIRI_ExternalRefID","ACCIRI_LocalTable","ACCIRI_LocalID","ACCIRI_IssueType","ACCIRI_Severity","ACCIRI_StatusCode","ACCIRI_Title","ACCIRI_DetailText") values(connection_id,ref_id,q."FINIntQ_LocalTable",q."FINIntQ_LocalID",coalesce(issue,'provider_export_failed'),'error','queued','Accounting delivery needs review',message);
 end if;
 insert into public."ACCI_SyncEvents"("ACCISE_ConnectionID","ACCISE_Severity","ACCISE_EventCode","ACCISE_Message","ACCISE_LocalTable","ACCISE_LocalID","ACCISE_ExternalObjectType","ACCISE_ExternalID","ACCISE_ResponsePayloadJSON") values(connection_id,case when s='synced' then 'info' else 'error' end,'finance_export_'||s,coalesce(message,'Provider delivery verified.'),q."FINIntQ_LocalTable",q."FINIntQ_LocalID",p_result->>'externalObjectType',external_id,jsonb_build_object('actor',p_actor,'queue',p_queue,'attempt',q."FINIntQ_AttemptCount",'batch',x->>'batch','scope','document_delivery','fullLedgerReconciled',false));
 update public."FIN_IntegrationQueue" set "FINIntQ_StatusCode"=s,"FINIntQ_LastError"=case when s<>'synced' then message end,"FINIntQ_LeaseToken"=null,"FINIntQ_LeaseUntil"=null where "FINIntQ_ID"=p_queue;
 return jsonb_build_object('completed',true,'status',s,'message',message);
end $$;
revoke all on function public._multideck_finance_export_source(text,uuid,uuid),public.multideck_finance_begin_export(uuid,uuid,uuid,jsonb),public.multideck_finance_finish_export(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public._multideck_finance_export_source(text,uuid,uuid),public.multideck_finance_begin_export(uuid,uuid,uuid,jsonb),public.multideck_finance_finish_export(uuid,uuid,uuid,jsonb) to service_role;
commit;
