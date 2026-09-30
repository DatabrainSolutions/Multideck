begin;

-- Existing writers may create a posted batch, add lines and finalise totals in
-- one transaction. Once that transaction commits, correction requires a new
-- linked reversal or replacement; the original journal cannot be rewritten.
create function public._multideck_finance_guard_committed_posting()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare posting_status text; stored_xid bigint; target uuid; current_xid bigint:=txid_current() % 4294967296;
begin
  if tg_table_name='FIN_PostingBatches' then
    select xmin::text::bigint into stored_xid from public."FIN_PostingBatches" where "FINPostBatch_ID"=old."FINPostBatch_ID";
    if old."FINPostBatch_StatusCode"='posted' and stored_xid<>current_xid then
      raise exception 'Committed native posting batches are immutable; post a linked correction.' using errcode='22023';
    end if;
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op<>'INSERT' then
    select "FINPostBatch_StatusCode",xmin::text::bigint into posting_status,stored_xid
      from public."FIN_PostingBatches" where "FINPostBatch_ID"=old."FINPostLine_BatchID";
    if found and posting_status='posted' and stored_xid<>current_xid then
      raise exception 'Committed native posting lines are immutable; post a linked correction.' using errcode='22023';
    end if;
  end if;
  if tg_op<>'DELETE' then
    target:=new."FINPostLine_BatchID";
    select "FINPostBatch_StatusCode",xmin::text::bigint into posting_status,stored_xid
      from public."FIN_PostingBatches" where "FINPostBatch_ID"=target;
    if found and posting_status='posted' and stored_xid<>current_xid then
      raise exception 'Committed native posting lines are immutable; post a linked correction.' using errcode='22023';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_guard_committed_posting() from public,anon,authenticated;
create trigger "AA_FIN_PostingBatches_committed_immutable"
before update or delete on public."FIN_PostingBatches"
for each row execute function public._multideck_finance_guard_committed_posting();
create trigger "AA_FIN_PostingLines_committed_immutable"
before insert or update or delete on public."FIN_PostingLines"
for each row execute function public._multideck_finance_guard_committed_posting();

commit;
