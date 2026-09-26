begin;

alter table public."FIN_Journals"
  add column reversal_of_id uuid unique references public."FIN_Journals"(id) on delete restrict,
  add column reversal_reason text;

create function public._multideck_finance_validate_linked_journal_reversal()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare source public."FIN_Journals"; expected_count integer; actual_count integer; mismatch boolean;
begin
  if tg_op='DELETE' then
    if old.reversal_of_id is not null or exists(select 1 from public."FIN_Journals" where reversal_of_id=old.id) then
      raise exception 'Linked journal reversals cannot be deleted.' using errcode='22023'; end if;
    return old;
  end if;
  if old.reversal_of_id is not null and (new.reversal_of_id is distinct from old.reversal_of_id
    or new.reversal_reason is distinct from old.reversal_reason) then
    raise exception 'Journal reversal link and reason are immutable.' using errcode='22023'; end if;
  if new.reversal_of_id is null then return new; end if;
  select * into source from public."FIN_Journals" where id=new.reversal_of_id and legal_entity_id=new.legal_entity_id for share;
  if not found or source.status<>'posted' or source.batch_id is null or source.id=new.id then
    raise exception 'A reversal must reference a posted journal in the same legal entity.' using errcode='22023'; end if;
  if coalesce(length(btrim(new.reversal_reason)),0)<3 or new.accounting_date<source.accounting_date or new.currency is distinct from source.currency then
    raise exception 'A linked reversal needs a reason, later accounting date and original currency.' using errcode='22023'; end if;
  select count(*) into expected_count from public."FIN_PostingLines" where "FINPostLine_BatchID"=source.batch_id;
  actual_count:=jsonb_array_length(new.lines);
  if expected_count<2 or actual_count<>expected_count then raise exception 'Reversal lines must exactly oppose the source posting.' using errcode='22023'; end if;
  select exists(
    select 1 from jsonb_array_elements(new.lines) with ordinality supplied(line,ord)
    full join (select * from public."FIN_PostingLines" where "FINPostLine_BatchID"=source.batch_id) original
      on original."FINPostLine_LineNo"=supplied.ord
    where original."FINPostLine_ID" is null or supplied.line is null
      or supplied.line->>'accountId' is distinct from original."FINPostLine_NominalAccountID"::text
      or (supplied.line->>'debit')::numeric is distinct from original."FINPostLine_CreditAmount"
      or (supplied.line->>'credit')::numeric is distinct from original."FINPostLine_DebitAmount"
  ) into mismatch;
  if mismatch then raise exception 'Reversal lines must exactly oppose the source posting.' using errcode='22023'; end if;
  return new;
end; $$;
create trigger journal_reversal_guard before update or delete on public."FIN_Journals"
for each row execute function public._multideck_finance_validate_linked_journal_reversal();
revoke all on function public._multideck_finance_validate_linked_journal_reversal() from public,anon,authenticated;

create function public.multideck_finance_prepare_journal_reversal(p_actor uuid,p_entity uuid,p_source uuid,p_reason text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare source public."FIN_Journals"; draft jsonb; target uuid:=gen_random_uuid(); reversal_lines jsonb; accounting_date date;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Prepare');
  if coalesce(length(btrim(p_reason)),0)<3 then raise exception 'Record why this journal is being reversed.' using errcode='22023'; end if;
  select * into source from public."FIN_Journals" where id=p_source and legal_entity_id=p_entity for update;
  if not found or source.status<>'posted' or source.batch_id is null then
    raise exception 'Choose a posted journal in this legal entity.' using errcode='22023'; end if;
  if exists(select 1 from public."FIN_Journals" where reversal_of_id=p_source) then
    raise exception 'This journal already has a linked reversal draft or posting.' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('accountId',"FINPostLine_NominalAccountID",'debit',"FINPostLine_CreditAmount"::text,
    'credit',"FINPostLine_DebitAmount"::text,'description',coalesce("FINPostLine_Description",'')) order by "FINPostLine_LineNo")
    into reversal_lines from public."FIN_PostingLines" where "FINPostLine_BatchID"=source.batch_id;
  if jsonb_array_length(reversal_lines) not between 2 and 200 then raise exception 'The source posting cannot be reversed as a journal.' using errcode='22023'; end if;
  accounting_date:=(date_trunc('month',source.accounting_date)+interval '1 month')::date;
  draft:=public.multideck_finance_journal(p_actor,p_entity,'save',jsonb_build_object('id',target,'accountingDate',accounting_date,
    'reference','Reversal of JN-'||source.number,'description',left('Reversal of JN-'||source.number||' · '||btrim(p_reason),500),'lines',reversal_lines));
  update public."FIN_Journals" set reversal_of_id=p_source,reversal_reason=left(btrim(p_reason),500)
    where id=target returning to_jsonb("FIN_Journals") into draft;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_Journals','journal',target,'prepare_reversal','Linked journal reversal prepared',true,1,jsonb_build_object('sourceJournalId',p_source,'sourceBatchId',source.batch_id,'reason',left(btrim(p_reason),500)));
  return draft;
end; $$;
revoke all on function public.multideck_finance_prepare_journal_reversal(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_prepare_journal_reversal(uuid,uuid,uuid,text) to service_role;

commit;
