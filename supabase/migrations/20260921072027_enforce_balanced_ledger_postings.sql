-- A committed ledger posting must be a complete, balanced double-entry journal.
-- Deferred checks support both batch-first and draft-then-post workflows.
create or replace function public._multideck_assert_balanced_posting(p_batch uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare b public."FIN_PostingBatches"%rowtype; n bigint; d numeric; c numeric; invalid boolean;
begin
  select * into b from public."FIN_PostingBatches" where "FINPostBatch_ID"=p_batch;
  if not found or b."FINPostBatch_StatusCode" <> 'posted' then return; end if;
  select count(*), coalesce(sum("FINPostLine_DebitAmount"),0), coalesce(sum("FINPostLine_CreditAmount"),0),
    coalesce(bool_or(
      "FINPostLine_NominalAccountID" is null or
      not (("FINPostLine_DebitAmount">0 and "FINPostLine_CreditAmount"=0) or
           ("FINPostLine_CreditAmount">0 and "FINPostLine_DebitAmount"=0)) or
      "FINPostLine_DebitAmount"::text in ('NaN','Infinity','-Infinity') or
      "FINPostLine_CreditAmount"::text in ('NaN','Infinity','-Infinity')
    ),false)
  into n,d,c,invalid from public."FIN_PostingLines" where "FINPostLine_BatchID"=p_batch;
  if n<2 or invalid or d<=0 or d<>c or
     b."FINPostBatch_DebitTotal"<>d or b."FINPostBatch_CreditTotal"<>c then
    raise exception using errcode='23514',
      message='Journal must balance: each line needs a nominal account and either a debit or a credit; total debits must equal total credits.',
      detail=format('Posting batch %s: %s lines, debits %s, credits %s.',p_batch,n,d,c);
  end if;
end $$;

-- Writing the parent serialises competing line edits, including at stronger
-- isolation levels where a lock alone could leave a stale transaction snapshot.
create or replace function public._multideck_lock_posting_parent()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare old_id uuid; new_id uuid; batch_id uuid;
begin
  if TG_OP <> 'INSERT' then old_id := OLD."FINPostLine_BatchID"; end if;
  if TG_OP <> 'DELETE' then new_id := NEW."FINPostLine_BatchID"; end if;
  for batch_id in select distinct x from unnest(array[old_id,new_id]) x where x is not null order by x loop
    update public."FIN_PostingBatches"
      set "FINPostBatch_DebitTotal"="FINPostBatch_DebitTotal"
      where "FINPostBatch_ID"=batch_id;
  end loop;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end $$;

create or replace function public._multideck_check_posting_balance()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if TG_TABLE_NAME='FIN_PostingBatches' then
    perform public._multideck_assert_balanced_posting(NEW."FINPostBatch_ID");
  else
    if TG_OP <> 'INSERT' then perform public._multideck_assert_balanced_posting(OLD."FINPostLine_BatchID"); end if;
    if TG_OP <> 'DELETE' then perform public._multideck_assert_balanced_posting(NEW."FINPostLine_BatchID"); end if;
  end if;
  return null;
end $$;

create trigger "TR_FIN_PostingLines_balance_lock"
before insert or update or delete on public."FIN_PostingLines"
for each row execute function public._multideck_lock_posting_parent();
create constraint trigger "TR_FIN_PostingLines_balanced"
after insert or update or delete on public."FIN_PostingLines"
deferrable initially deferred for each row execute function public._multideck_check_posting_balance();
create constraint trigger "TR_FIN_PostingBatches_balanced"
after insert or update on public."FIN_PostingBatches"
deferrable initially deferred for each row execute function public._multideck_check_posting_balance();

revoke all on function public._multideck_assert_balanced_posting(uuid) from public;
revoke all on function public._multideck_lock_posting_parent() from public;
revoke all on function public._multideck_check_posting_balance() from public;

-- Never invent a balancing line for historical errors. Stop deployment for review.
do $$ declare b uuid; begin
  for b in select "FINPostBatch_ID" from public."FIN_PostingBatches" where "FINPostBatch_StatusCode"='posted'
  loop perform public._multideck_assert_balanced_posting(b); end loop;
end $$;
