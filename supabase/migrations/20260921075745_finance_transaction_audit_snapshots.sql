-- Supplement actor-attributed lifecycle events with atomic before/after evidence.
-- Never retain provider payloads, delivery tokens or lease credentials.
create or replace function public._multideck_finance_audit_snapshot()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare previous jsonb; current_row jsonb; evidence jsonb; record_id uuid; entity_id uuid; record_type text;
begin
  if TG_OP<>'INSERT' then previous:=to_jsonb(OLD); end if;
  if TG_OP<>'DELETE' then current_row:=to_jsonb(NEW); end if;
  if TG_TABLE_NAME='FIN_Journals' then
    previous:=previous-array['mirror_payload','mirror_token','mirror_lease_until','mirror_connection_id'];
    current_row:=current_row-array['mirror_payload','mirror_token','mirror_lease_until','mirror_connection_id'];
    evidence:=coalesce(current_row,previous);
    record_id:=(evidence->>'id')::uuid; entity_id:=(evidence->>'legal_entity_id')::uuid; record_type:='journal';
  elsif TG_TABLE_NAME='FIN_PostingBatches' then
    evidence:=coalesce(current_row,previous);
    record_id:=(evidence->>'FINPostBatch_ID')::uuid; entity_id:=(evidence->>'FINPostBatch_LegalEntityID')::uuid; record_type:='finance_posting';
  else
    evidence:=coalesce(current_row,previous);
    record_id:=(evidence->>'FINPostLine_BatchID')::uuid; record_type:='finance_posting';
    select "FINPostBatch_LegalEntityID" into entity_id from public."FIN_PostingBatches" where "FINPostBatch_ID"=record_id;
    if entity_id is null then raise exception 'Cannot audit a posting line without its legal entity.'; end if;
  end if;
  if previous is not distinct from current_row then return null; end if;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule",
    "AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_MetadataJSON")
  values ('finance_lifecycle',entity_id,'multideck-app','finance','public',TG_TABLE_NAME,record_type,record_id,
    lower(TG_OP),'Finance record change',true,jsonb_build_object('before',previous,'after',current_row,'evidenceKind','row_snapshot'));
  return null;
end $$;
revoke all on function public._multideck_finance_audit_snapshot() from public,anon,authenticated;

create trigger "TR_FIN_Journals_audit_snapshot" after insert or update or delete on public."FIN_Journals"
for each row execute function public._multideck_finance_audit_snapshot();
create trigger "TR_FIN_PostingBatches_audit_snapshot" after insert or update or delete on public."FIN_PostingBatches"
for each row execute function public._multideck_finance_audit_snapshot();
create trigger "TR_FIN_PostingLines_audit_snapshot" after insert or update or delete on public."FIN_PostingLines"
for each row execute function public._multideck_finance_audit_snapshot();
